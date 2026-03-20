#!/usr/bin/env python3
"""
Flask backend for the NBA Player Props PWA.
Wraps the existing prediction engine with a JSON API.
"""
import threading

import traceback

from flask import Flask, jsonify, request, send_from_directory

from config.settings import CURRENT_SEASON, PROP_CATEGORIES
from data.collector import find_player, find_team
from models.predictor import PlayerPropsPredictor
from nba_api.stats.static import players, teams

app = Flask(__name__, static_folder="static")


@app.errorhandler(Exception)
def handle_exception(e):
    """Return JSON instead of HTML for all errors."""
    traceback.print_exc()
    return jsonify({"error": str(e)}), 500


# Simple in-memory cache for trained predictors to avoid retraining
_predictor_cache: dict[int, PlayerPropsPredictor] = {}
_cache_lock = threading.Lock()


def _get_predictor(player_id: int, player_name: str) -> PlayerPropsPredictor:
    """Return a trained predictor, using cache if available."""
    with _cache_lock:
        if player_id in _predictor_cache:
            return _predictor_cache[player_id]
    predictor = PlayerPropsPredictor(player_id, player_name)
    predictor.train()
    with _cache_lock:
        _predictor_cache[player_id] = predictor
    return predictor


# ── Static / PWA routes ──────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json")


@app.route("/sw.js")
def service_worker():
    return send_from_directory("static", "sw.js")


# ── API routes ────────────────────────────────────────────────────────

@app.route("/api/search/players")
def search_players():
    """Search for players by partial name."""
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])
    matches = players.find_players_by_full_name(q)
    active = [p for p in matches if p.get("is_active")]
    results = active[:10] if active else matches[:10]
    return jsonify([{"id": p["id"], "name": p["full_name"]} for p in results])


@app.route("/api/teams")
def list_teams():
    """Return all NBA teams."""
    all_teams = teams.get_teams()
    return jsonify([
        {"id": t["id"], "abbreviation": t["abbreviation"],
         "name": t["full_name"], "city": t["city"], "nickname": t["nickname"]}
        for t in sorted(all_teams, key=lambda t: t["full_name"])
    ])


@app.route("/api/predict", methods=["POST"])
def predict():
    """Run prediction for a player matchup."""
    data = request.get_json(force=True)
    player_name = data.get("player", "")
    opponent = data.get("opponent", "")
    is_home = data.get("home", True)
    teammates_out = data.get("teammates_out", [])
    opponents_out = data.get("opponents_out", [])
    lines = data.get("lines", {})

    # Validate player
    player = find_player(player_name)
    if not player:
        return jsonify({"error": f"Could not find player '{player_name}'"}), 400

    # Validate team
    team = find_team(opponent)
    if not team:
        return jsonify({"error": f"Could not find team '{opponent}'"}), 400

    opp_abbrev = team["abbreviation"]

    # Train / load model
    predictor = _get_predictor(player["id"], player["full_name"])

    # Predictions
    predictions = predictor.predict(
        opponent_abbrev=opp_abbrev,
        is_home=is_home,
        season=CURRENT_SEASON,
        teammate_injuries=teammates_out,
        opponent_injuries=opponents_out,
    )

    # Edge analysis (if lines provided)
    edges = []
    if lines:
        edges = predictor.compare_to_line(
            opponent_abbrev=opp_abbrev,
            is_home=is_home,
            season=CURRENT_SEASON,
            lines=lines,
            teammate_injuries=teammates_out,
            opponent_injuries=opponents_out,
        )

    return jsonify({
        "player": player["full_name"],
        "opponent": team["full_name"],
        "opponent_abbrev": opp_abbrev,
        "home": is_home,
        "predictions": predictions,
        "edges": edges,
    })


@app.route("/api/props")
def prop_categories():
    """Return the list of supported prop categories."""
    return jsonify(PROP_CATEGORIES)


if __name__ == "__main__":
    print("\n  NBA Props PWA running at http://localhost:5000\n")
    app.run(debug=True, port=5000)
