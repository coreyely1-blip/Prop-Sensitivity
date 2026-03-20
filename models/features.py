"""
Feature engineering for NBA prop predictions.

Takes raw game logs and contextual information (opponent, venue, injuries,
rest days) and produces a rich feature vector for each prediction target.
"""
import numpy as np
import pandas as pd

from config.settings import PROP_CATEGORIES, POSITION_MAP
from data.collector import (
    get_player_game_logs,
    get_team_defensive_stats,
    get_team_pace_stats,
    get_player_position,
    get_league_averages,
    find_team,
)

# Core box-score columns we work with
STAT_COLS = ["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M",
             "FGA", "FGM", "FG3A", "FTA", "FTM", "MIN",
             "OREB", "DREB", "PF", "PLUS_MINUS"]


def _safe_mean(series: pd.Series) -> float:
    return series.mean() if len(series) > 0 else 0.0


def _safe_std(series: pd.Series) -> float:
    return series.std() if len(series) > 1 else 0.0


def _add_combo_cols(df: pd.DataFrame) -> pd.DataFrame:
    """Add combo prop columns in-place."""
    df = df.copy()
    df["PTS+REB"] = df["PTS"] + df["REB"]
    df["PTS+AST"] = df["PTS"] + df["AST"]
    df["PTS+REB+AST"] = df["PTS"] + df["REB"] + df["AST"]
    df["STL+BLK"] = df["STL"] + df["BLK"]
    return df


def _parse_matchup(matchup_str: str) -> tuple[str, bool]:
    """Return (opponent_abbrev, is_home) from a MATCHUP string like 'LAL vs. BOS'."""
    if " vs. " in matchup_str:
        parts = matchup_str.split(" vs. ")
        return parts[1].strip(), True
    elif " @ " in matchup_str:
        parts = matchup_str.split(" @ ")
        return parts[1].strip(), False
    return "UNK", True


# ─────────────────────────────────────────────────────────────────────
# Feature builders
# ─────────────────────────────────────────────────────────────────────

def compute_recent_form(game_logs: pd.DataFrame, n_games: int = 10) -> dict:
    """Rolling averages and trends over the last *n_games*."""
    logs = _add_combo_cols(game_logs)
    recent = logs.tail(n_games)
    features = {}
    for col in PROP_CATEGORIES:
        if col not in recent.columns:
            continue
        features[f"recent_{n_games}_{col}_mean"] = _safe_mean(recent[col])
        features[f"recent_{n_games}_{col}_std"] = _safe_std(recent[col])
        features[f"recent_{n_games}_{col}_median"] = recent[col].median() if len(recent) > 0 else 0.0
        # Trend: slope of linear fit over the window
        if len(recent) >= 3:
            x = np.arange(len(recent))
            slope = np.polyfit(x, recent[col].values, 1)[0]
            features[f"recent_{n_games}_{col}_trend"] = slope
        else:
            features[f"recent_{n_games}_{col}_trend"] = 0.0
    # Minutes trend matters — if minutes are dropping, props drop too
    features[f"recent_{n_games}_MIN_mean"] = _safe_mean(recent["MIN"])
    features[f"recent_{n_games}_MIN_std"] = _safe_std(recent["MIN"])
    # Usage proxies
    if _safe_mean(recent["MIN"]) > 0:
        features["recent_pts_per_min"] = _safe_mean(recent["PTS"]) / _safe_mean(recent["MIN"])
        features["recent_usage_proxy"] = _safe_mean(recent["FGA"]) / _safe_mean(recent["MIN"])
    else:
        features["recent_pts_per_min"] = 0.0
        features["recent_usage_proxy"] = 0.0
    return features


def compute_season_averages(game_logs: pd.DataFrame) -> dict:
    """Full-season per-game averages."""
    logs = _add_combo_cols(game_logs)
    features = {}
    for col in PROP_CATEGORIES:
        if col not in logs.columns:
            continue
        features[f"season_{col}_mean"] = _safe_mean(logs[col])
        features[f"season_{col}_std"] = _safe_std(logs[col])
    features["season_MIN_mean"] = _safe_mean(logs["MIN"])
    features["season_GP"] = len(logs)
    return features


def compute_home_away_splits(game_logs: pd.DataFrame, is_home: bool) -> dict:
    """Split averages by venue."""
    logs = _add_combo_cols(game_logs)
    # Determine home/away from MATCHUP column
    if "MATCHUP" not in logs.columns:
        return {}
    venue_mask = logs["MATCHUP"].str.contains(" vs. ") if is_home else logs["MATCHUP"].str.contains(" @ ")
    venue_games = logs[venue_mask]
    features = {}
    for col in PROP_CATEGORIES:
        if col not in venue_games.columns:
            continue
        features[f"venue_{col}_mean"] = _safe_mean(venue_games[col])
        features[f"venue_{col}_std"] = _safe_std(venue_games[col])
    features["venue_GP"] = len(venue_games)
    features["is_home"] = int(is_home)
    return features


def compute_head_to_head(game_logs: pd.DataFrame, opponent_abbrev: str) -> dict:
    """Historical performance vs. a specific opponent."""
    logs = _add_combo_cols(game_logs)
    if "MATCHUP" not in logs.columns:
        return {}
    h2h = logs[logs["MATCHUP"].str.contains(opponent_abbrev, case=False, na=False)]
    features = {}
    for col in PROP_CATEGORIES:
        if col not in h2h.columns:
            continue
        features[f"h2h_{col}_mean"] = _safe_mean(h2h[col])
        features[f"h2h_{col}_std"] = _safe_std(h2h[col])
    features["h2h_GP"] = len(h2h)
    features["h2h_MIN_mean"] = _safe_mean(h2h["MIN"]) if len(h2h) > 0 else 0.0
    return features


def compute_opponent_defense(opponent_abbrev: str, player_position: str,
                             season: str) -> dict:
    """How good/bad the opponent's defense is vs. this player's position."""
    features = {}
    try:
        def_stats = get_team_defensive_stats(season)
        team_info = find_team(opponent_abbrev)
        if team_info is None or def_stats.empty:
            return features
        team_id = team_info["id"]
        row = def_stats[def_stats["TEAM_ID"] == team_id]
        if row.empty:
            return features
        row = row.iloc[0]
        # Opponent stats allowed per game
        for col in ["OPP_PTS", "OPP_REB", "OPP_AST", "OPP_STL", "OPP_BLK",
                     "OPP_TOV", "OPP_FG3M", "OPP_FGA", "OPP_FG_PCT"]:
            if col in def_stats.columns:
                features[f"opp_def_{col}"] = row[col]
        # Rank among all teams (higher = worse defense = more opportunity)
        for col in ["OPP_PTS", "OPP_REB", "OPP_AST"]:
            if col in def_stats.columns:
                features[f"opp_def_{col}_rank"] = (
                    def_stats[col].rank(ascending=False).loc[row.name]
                )
    except Exception:
        pass
    return features


def compute_pace_factor(opponent_abbrev: str, season: str) -> dict:
    """Opponent pace — faster pace → more possessions → more stats."""
    features = {}
    try:
        pace_df = get_team_pace_stats(season)
        team_info = find_team(opponent_abbrev)
        if team_info is None or pace_df.empty:
            return features
        team_id = team_info["id"]
        row = pace_df[pace_df["TEAM_ID"] == team_id]
        if row.empty:
            return features
        row = row.iloc[0]
        if "PACE" in pace_df.columns:
            league_avg_pace = pace_df["PACE"].mean()
            features["opp_pace"] = row["PACE"]
            features["opp_pace_diff"] = row["PACE"] - league_avg_pace
        if "OFF_RATING" in pace_df.columns:
            features["opp_off_rating"] = row["OFF_RATING"]
        if "DEF_RATING" in pace_df.columns:
            features["opp_def_rating"] = row["DEF_RATING"]
    except Exception:
        pass
    return features


def compute_rest_days(game_logs: pd.DataFrame, game_date: pd.Timestamp | None = None) -> dict:
    """Days of rest before the upcoming game."""
    features = {"rest_days": 2}  # Default to 2 if unknown
    if game_logs.empty or "GAME_DATE" not in game_logs.columns:
        return features
    logs = game_logs.sort_values("GAME_DATE")
    last_game = pd.to_datetime(logs["GAME_DATE"].iloc[-1])
    if game_date is None:
        game_date = pd.Timestamp.now()
    delta = (game_date - last_game).days
    features["rest_days"] = max(0, min(delta, 7))  # Cap at 7
    features["is_back_to_back"] = int(delta <= 1)
    features["is_3_in_4"] = int(len(logs.tail(3)) >= 3 and
                                  (pd.to_datetime(logs["GAME_DATE"].iloc[-1]) -
                                   pd.to_datetime(logs["GAME_DATE"].iloc[-3])).days <= 3)
    return features


def compute_injury_impact(teammate_injuries: list[str], opponent_injuries: list[str],
                          game_logs: pd.DataFrame) -> dict:
    """
    Estimate stat boosts/drops when key teammates or opponents are out.

    *teammate_injuries*: list of teammate names who are OUT.
    *opponent_injuries*: list of opponent player names who are OUT.

    When a high-usage teammate is out, the player often sees a usage bump.
    When a key opponent defender is out, scoring may increase.
    """
    features = {
        "n_teammates_out": len(teammate_injuries),
        "n_opponents_out": len(opponent_injuries),
        "teammate_injury_boost": 0.0,
    }
    # Simple heuristic: each missing teammate → small usage bump
    # In a full production model you'd look up the missing players' usage rates
    if len(teammate_injuries) > 0:
        features["teammate_injury_boost"] = min(len(teammate_injuries) * 0.03, 0.15)
    return features


# ─────────────────────────────────────────────────────────────────────
# Master feature builder
# ─────────────────────────────────────────────────────────────────────

def build_feature_vector(
    player_id: int,
    opponent_abbrev: str,
    is_home: bool,
    season: str,
    teammate_injuries: list[str] | None = None,
    opponent_injuries: list[str] | None = None,
    game_date: pd.Timestamp | None = None,
) -> dict:
    """
    Build a complete feature dictionary for a single prediction.

    This is the function the model consumes — it merges all sub-features
    into one flat dict.
    """
    teammate_injuries = teammate_injuries or []
    opponent_injuries = opponent_injuries or []

    game_logs = get_player_game_logs(player_id)
    position = get_player_position(player_id)

    feats: dict = {}
    feats.update(compute_recent_form(game_logs, n_games=10))
    feats.update(compute_recent_form(game_logs, n_games=5))   # Extra short window
    feats.update(compute_season_averages(game_logs))
    feats.update(compute_home_away_splits(game_logs, is_home))
    feats.update(compute_head_to_head(game_logs, opponent_abbrev))
    feats.update(compute_opponent_defense(opponent_abbrev, position, season))
    feats.update(compute_pace_factor(opponent_abbrev, season))
    feats.update(compute_rest_days(game_logs, game_date))
    feats.update(compute_injury_impact(teammate_injuries, opponent_injuries, game_logs))

    return feats


def build_training_rows(player_id: int) -> pd.DataFrame:
    """
    Build a training dataset from historical game logs.

    For each game *i*, features are computed from games *0 .. i-1* and the
    target is the actual stat line of game *i*.  This prevents data leakage.
    """
    game_logs = get_player_game_logs(player_id)
    if game_logs.empty or len(game_logs) < 15:
        return pd.DataFrame()

    game_logs = _add_combo_cols(game_logs)
    position = get_player_position(player_id)

    rows = []
    # Start from game 15 so we have enough history
    for i in range(15, len(game_logs)):
        past = game_logs.iloc[:i]
        current = game_logs.iloc[i]

        opponent, is_home = _parse_matchup(current.get("MATCHUP", ""))
        season = current.get("SEASON", "")

        feats = {}
        feats.update(compute_recent_form(past, n_games=10))
        feats.update(compute_recent_form(past, n_games=5))
        feats.update(compute_season_averages(past))
        feats.update(compute_home_away_splits(past, is_home))
        feats.update(compute_head_to_head(past, opponent))
        # Skip API-heavy features in bulk training to avoid rate limits
        feats.update(compute_rest_days(past, pd.to_datetime(current["GAME_DATE"])))
        feats.update(compute_injury_impact([], [], past))

        # Targets
        for col in PROP_CATEGORIES:
            if col in current.index:
                feats[f"target_{col}"] = current[col]
        feats["target_MIN"] = current.get("MIN", 0)

        rows.append(feats)

    return pd.DataFrame(rows)
