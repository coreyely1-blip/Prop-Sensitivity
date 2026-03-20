"""
Ensemble prediction model for NBA player props.

Architecture:
  - Per-prop XGBoost regressor
  - Per-prop LightGBM regressor
  - Per-prop Ridge regressor (stable baseline)
  - Weighted ensemble of all three

Training:
  build_training_rows() produces leakage-free feature rows from historical
  game logs.  The model trains on those rows and predicts the next game.
"""
import os
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from sklearn.linear_model import Ridge
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

from config.settings import MODEL_PARAMS, MODEL_DIR, PROP_CATEGORIES
from models.features import build_feature_vector, build_training_rows

warnings.filterwarnings("ignore", category=UserWarning)


class PropModel:
    """One PropModel instance handles a single stat category (e.g. PTS)."""

    def __init__(self, prop: str):
        self.prop = prop
        self.target_col = f"target_{prop}"
        self.scaler = StandardScaler()
        self.xgb = XGBRegressor(**MODEL_PARAMS["xgb"])
        self.lgbm = LGBMRegressor(**MODEL_PARAMS["lgbm"])
        self.ridge = Ridge(**MODEL_PARAMS["ridge"])
        self.feature_cols: list[str] = []
        self.is_trained = False

    def _feature_cols_from(self, df: pd.DataFrame) -> list[str]:
        return [c for c in df.columns if not c.startswith("target_")]

    def train(self, df: pd.DataFrame) -> dict:
        """Train the ensemble on a training DataFrame (from build_training_rows)."""
        if self.target_col not in df.columns:
            return {"error": f"{self.target_col} not in data"}

        df = df.dropna(subset=[self.target_col])
        if len(df) < 20:
            return {"error": "Not enough data"}

        self.feature_cols = self._feature_cols_from(df)
        X = df[self.feature_cols].fillna(0).values
        y = df[self.target_col].values

        X_scaled = self.scaler.fit_transform(X)

        # Time-series cross-validation for evaluation
        tscv = TimeSeriesSplit(n_splits=3)
        mae_scores = []
        for train_idx, val_idx in tscv.split(X):
            X_tr, X_val = X[train_idx], X[val_idx]
            y_tr, y_val = y[train_idx], y[val_idx]
            X_tr_s = self.scaler.fit_transform(X_tr)
            X_val_s = self.scaler.transform(X_val)

            self.xgb.fit(X_tr, y_tr)
            self.lgbm.fit(X_tr, y_tr)
            self.ridge.fit(X_tr_s, y_tr)

            w = MODEL_PARAMS["ensemble_weights"]
            preds = (
                w["xgb"] * self.xgb.predict(X_val) +
                w["lgbm"] * self.lgbm.predict(X_val) +
                w["ridge"] * self.ridge.predict(X_val_s)
            )
            mae_scores.append(mean_absolute_error(y_val, preds))

        # Final fit on all data
        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X)
        self.xgb.fit(X, y)
        self.lgbm.fit(X, y)
        self.ridge.fit(X_scaled, y)
        self.is_trained = True

        return {
            "prop": self.prop,
            "n_samples": len(df),
            "cv_mae": np.mean(mae_scores),
            "cv_mae_std": np.std(mae_scores),
        }

    def predict(self, features: dict) -> dict:
        """Predict from a feature dict. Returns point estimate + confidence interval."""
        if not self.is_trained:
            return {"error": "Model not trained"}

        x = np.array([[features.get(c, 0) for c in self.feature_cols]])
        x_scaled = self.scaler.transform(x)

        w = MODEL_PARAMS["ensemble_weights"]
        pred_xgb = self.xgb.predict(x)[0]
        pred_lgbm = self.lgbm.predict(x)[0]
        pred_ridge = self.ridge.predict(x_scaled)[0]

        ensemble = w["xgb"] * pred_xgb + w["lgbm"] * pred_lgbm + w["ridge"] * pred_ridge

        # Rough confidence interval from model disagreement
        preds = [pred_xgb, pred_lgbm, pred_ridge]
        spread = np.std(preds)

        return {
            "prop": self.prop,
            "prediction": round(float(ensemble), 2),
            "xgb": round(float(pred_xgb), 2),
            "lgbm": round(float(pred_lgbm), 2),
            "ridge": round(float(pred_ridge), 2),
            "low": round(float(ensemble - 1.5 * spread), 2),
            "high": round(float(ensemble + 1.5 * spread), 2),
            "model_spread": round(float(spread), 2),
        }

    def save(self) -> None:
        os.makedirs(MODEL_DIR, exist_ok=True)
        path = Path(MODEL_DIR) / f"prop_{self.prop}.joblib"
        joblib.dump({
            "scaler": self.scaler,
            "xgb": self.xgb,
            "lgbm": self.lgbm,
            "ridge": self.ridge,
            "feature_cols": self.feature_cols,
            "prop": self.prop,
        }, path)

    def load(self) -> bool:
        path = Path(MODEL_DIR) / f"prop_{self.prop}.joblib"
        if not path.exists():
            return False
        data = joblib.load(path)
        self.scaler = data["scaler"]
        self.xgb = data["xgb"]
        self.lgbm = data["lgbm"]
        self.ridge = data["ridge"]
        self.feature_cols = data["feature_cols"]
        self.is_trained = True
        return True


# ─────────────────────────────────────────────────────────────────────
# Orchestrator: trains/loads all prop models for a player
# ─────────────────────────────────────────────────────────────────────

class PlayerPropsPredictor:
    """High-level API: train models for a player, then predict props."""

    def __init__(self, player_id: int, player_name: str):
        self.player_id = player_id
        self.player_name = player_name
        self.models: dict[str, PropModel] = {}
        for prop in PROP_CATEGORIES:
            self.models[prop] = PropModel(prop)

    def train(self, force: bool = False) -> list[dict]:
        """Train (or load cached) models for every prop category."""
        results = []
        # Try loading first
        if not force:
            all_loaded = all(m.load() for m in self.models.values())
            if all_loaded:
                print(f"  Loaded cached models for {self.player_name}")
                return [{"prop": p, "status": "loaded"} for p in PROP_CATEGORIES]

        print(f"  Building training data for {self.player_name}...")
        df = build_training_rows(self.player_id)
        if df.empty:
            return [{"prop": p, "error": "No training data"} for p in PROP_CATEGORIES]

        for prop, model in self.models.items():
            result = model.train(df)
            model.save()
            results.append(result)
            status = f"MAE={result.get('cv_mae', '?'):.2f}" if "cv_mae" in result else result.get("error", "?")
            print(f"    {prop:>12s}: {status}")
        return results

    def predict(
        self,
        opponent_abbrev: str,
        is_home: bool,
        season: str,
        teammate_injuries: list[str] | None = None,
        opponent_injuries: list[str] | None = None,
        game_date: pd.Timestamp | None = None,
    ) -> list[dict]:
        """Generate predictions for all prop categories."""
        features = build_feature_vector(
            player_id=self.player_id,
            opponent_abbrev=opponent_abbrev,
            is_home=is_home,
            season=season,
            teammate_injuries=teammate_injuries,
            opponent_injuries=opponent_injuries,
            game_date=game_date,
        )
        results = []
        for prop, model in self.models.items():
            pred = model.predict(features)
            results.append(pred)
        return results

    def compare_to_line(
        self,
        opponent_abbrev: str,
        is_home: bool,
        season: str,
        lines: dict[str, float],
        teammate_injuries: list[str] | None = None,
        opponent_injuries: list[str] | None = None,
    ) -> list[dict]:
        """
        Compare model predictions to sportsbook lines.

        *lines*: e.g. {"PTS": 24.5, "REB": 8.5, "AST": 6.5}

        Returns edge analysis for each prop.
        """
        predictions = self.predict(
            opponent_abbrev=opponent_abbrev,
            is_home=is_home,
            season=season,
            teammate_injuries=teammate_injuries,
            opponent_injuries=opponent_injuries,
        )
        analysis = []
        for pred in predictions:
            prop = pred.get("prop", "")
            if prop not in lines or "prediction" not in pred:
                continue
            line = lines[prop]
            model_pred = pred["prediction"]
            edge = model_pred - line
            edge_pct = (edge / line * 100) if line != 0 else 0

            # Confidence based on model agreement + distance from line
            confidence = "LOW"
            if abs(edge_pct) > 10 and pred.get("model_spread", 99) < 2:
                confidence = "HIGH"
            elif abs(edge_pct) > 5:
                confidence = "MEDIUM"

            analysis.append({
                "prop": prop,
                "line": line,
                "prediction": model_pred,
                "edge": round(edge, 2),
                "edge_pct": round(edge_pct, 1),
                "direction": "OVER" if edge > 0 else "UNDER",
                "confidence": confidence,
                "low": pred.get("low"),
                "high": pred.get("high"),
            })

        # Sort by absolute edge
        analysis.sort(key=lambda x: abs(x["edge_pct"]), reverse=True)
        return analysis
