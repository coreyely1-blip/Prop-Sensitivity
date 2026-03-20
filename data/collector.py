"""
Data collection module — pulls player game logs, team stats, and defensive
ratings from the NBA API for the configured seasons.
"""
import os
import time
import json
import hashlib
from pathlib import Path

import pandas as pd
from nba_api.stats.static import players, teams
from nba_api.stats.endpoints import (
    playergamelog,
    leaguedashteamstats,
    leaguedashplayerstats,
    commonplayerinfo,
    teamgamelog,
)

from config.settings import SEASONS, API_DELAY_SECONDS, CACHE_DIR


# ── Helpers ──────────────────────────────────────────────────────────

def _cache_path(key: str) -> Path:
    os.makedirs(CACHE_DIR, exist_ok=True)
    h = hashlib.md5(key.encode()).hexdigest()
    return Path(CACHE_DIR) / f"{h}.parquet"


def _from_cache(key: str) -> pd.DataFrame | None:
    p = _cache_path(key)
    if p.exists():
        return pd.read_parquet(p)
    return None


def _to_cache(key: str, df: pd.DataFrame) -> None:
    p = _cache_path(key)
    df.to_parquet(p, index=False)


def _api_delay():
    time.sleep(API_DELAY_SECONDS)


# ── Player look-up ──────────────────────────────────────────────────

def find_player(name: str) -> dict | None:
    """Return the nba_api player dict for *name* (case-insensitive partial match)."""
    matches = players.find_players_by_full_name(name)
    if not matches:
        return None
    # Prefer active players
    active = [p for p in matches if p["is_active"]]
    return active[0] if active else matches[0]


def find_team(name: str) -> dict | None:
    """Return the nba_api team dict for *name* (abbreviation, city, or nickname)."""
    for fn in (teams.find_teams_by_abbreviation,
               teams.find_teams_by_city,
               teams.find_teams_by_nickname,
               teams.find_teams_by_full_name):
        result = fn(name)
        if result:
            return result[0]
    return None


# ── Game logs ────────────────────────────────────────────────────────

def get_player_game_logs(player_id: int, seasons: list[str] | None = None) -> pd.DataFrame:
    """Fetch game-level box-score rows for a player across *seasons*."""
    seasons = seasons or SEASONS
    frames = []
    for season in seasons:
        cache_key = f"player_gamelog_{player_id}_{season}"
        cached = _from_cache(cache_key)
        if cached is not None:
            frames.append(cached)
            continue
        _api_delay()
        log = playergamelog.PlayerGameLog(
            player_id=player_id, season=season, season_type_all_star="Regular Season"
        )
        df = log.get_data_frames()[0]
        if not df.empty:
            df["SEASON"] = season
            _to_cache(cache_key, df)
            frames.append(df)
    if not frames:
        return pd.DataFrame()
    combined = pd.concat(frames, ignore_index=True)
    combined["GAME_DATE"] = pd.to_datetime(combined["GAME_DATE"])
    combined = combined.sort_values("GAME_DATE").reset_index(drop=True)
    return combined


def get_team_game_logs(team_id: int, seasons: list[str] | None = None) -> pd.DataFrame:
    """Fetch team-level game logs."""
    seasons = seasons or SEASONS
    frames = []
    for season in seasons:
        cache_key = f"team_gamelog_{team_id}_{season}"
        cached = _from_cache(cache_key)
        if cached is not None:
            frames.append(cached)
            continue
        _api_delay()
        log = teamgamelog.TeamGameLog(team_id=team_id, season=season)
        df = log.get_data_frames()[0]
        if not df.empty:
            df["SEASON"] = season
            _to_cache(cache_key, df)
            frames.append(df)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


# ── Team-level defensive / pace stats ───────────────────────────────

def get_team_defensive_stats(season: str) -> pd.DataFrame:
    """League-wide team defensive stats for a single season."""
    cache_key = f"team_def_stats_{season}"
    cached = _from_cache(cache_key)
    if cached is not None:
        return cached
    _api_delay()
    stats = leaguedashteamstats.LeagueDashTeamStats(
        season=season,
        measure_type_detailed_defense="Opponent",
        per_mode_detailed="PerGame",
    )
    df = stats.get_data_frames()[0]
    df["SEASON"] = season
    _to_cache(cache_key, df)
    return df


def get_team_pace_stats(season: str) -> pd.DataFrame:
    """League-wide team pace / advanced stats for a single season."""
    cache_key = f"team_pace_{season}"
    cached = _from_cache(cache_key)
    if cached is not None:
        return cached
    _api_delay()
    stats = leaguedashteamstats.LeagueDashTeamStats(
        season=season,
        measure_type_detailed_defense="Advanced",
        per_mode_detailed="PerGame",
    )
    df = stats.get_data_frames()[0]
    df["SEASON"] = season
    _to_cache(cache_key, df)
    return df


# ── Player info (position) ──────────────────────────────────────────

def get_player_position(player_id: int) -> str:
    """Return the listed position string for a player (e.g. 'Guard')."""
    cache_key = f"player_info_{player_id}"
    cached = _from_cache(cache_key)
    if cached is not None:
        return cached.iloc[0]["POSITION"]
    _api_delay()
    info = commonplayerinfo.CommonPlayerInfo(player_id=player_id)
    df = info.get_data_frames()[0]
    pos = df.iloc[0]["POSITION"] if "POSITION" in df.columns else "Unknown"
    _to_cache(cache_key, pd.DataFrame([{"POSITION": pos}]))
    return pos


# ── League average stats (for normalisation) ────────────────────────

def get_league_averages(season: str) -> pd.Series:
    """Return per-game league averages for key stats."""
    cache_key = f"league_avg_{season}"
    cached = _from_cache(cache_key)
    if cached is not None:
        return cached.iloc[0]
    _api_delay()
    stats = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season, per_mode_detailed="PerGame"
    )
    df = stats.get_data_frames()[0]
    avgs = df[["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M", "MIN"]].mean()
    out = pd.DataFrame([avgs])
    _to_cache(cache_key, out)
    return avgs
