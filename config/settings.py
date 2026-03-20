"""
Configuration settings for the NBA Props Prediction Model.
"""
from datetime import datetime

# ─── Seasons to pull ────────────────────────────────────────────────
CURRENT_SEASON = "2025-26"
SEASONS = ["2024-25", "2025-26"]

# ─── Prop categories we predict ────────────────────────────────────
PROP_CATEGORIES = [
    "PTS",       # Points
    "REB",       # Rebounds
    "AST",       # Assists
    "STL",       # Steals
    "BLK",       # Blocks
    "TOV",       # Turnovers
    "FG3M",      # Three-pointers made
    "PTS+REB",   # Points + Rebounds combo
    "PTS+AST",   # Points + Assists combo
    "PTS+REB+AST",  # PRA combo
    "STL+BLK",   # Stocks combo
]

# ─── Feature weights (used in blending) ────────────────────────────
FEATURE_WEIGHTS = {
    "recent_form": 0.30,       # Last 10 games
    "season_avg": 0.20,        # Full season average
    "matchup_history": 0.15,   # H2H vs this opponent
    "venue": 0.10,             # Home/away split
    "rest_days": 0.05,         # Days of rest
    "opponent_defense": 0.15,  # Opponent defensive rating vs position
    "pace": 0.05,              # Opponent pace factor
}

# ─── Model parameters ──────────────────────────────────────────────
MODEL_PARAMS = {
    "xgb": {
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "reg_alpha": 0.1,
        "reg_lambda": 1.0,
    },
    "lgbm": {
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "reg_alpha": 0.1,
        "reg_lambda": 1.0,
        "verbose": -1,
    },
    "ridge": {
        "alpha": 1.0,
    },
    "ensemble_weights": {
        "xgb": 0.45,
        "lgbm": 0.40,
        "ridge": 0.15,
    },
}

# ─── NBA API rate limiting ─────────────────────────────────────────
API_DELAY_SECONDS = 0.6  # Be kind to nba.com

# ─── Positions for defensive matchup analysis ─────────────────────
POSITION_MAP = {
    "Guard": ["PG", "SG"],
    "Forward": ["SF", "PF"],
    "Center": ["C"],
}

# ─── Cache settings ────────────────────────────────────────────────
CACHE_DIR = "data/cache"
MODEL_DIR = "models/saved"
