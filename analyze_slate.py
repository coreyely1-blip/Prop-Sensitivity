#!/usr/bin/env python3
"""
Batch slate analyzer — evaluate multiple players at once from a JSON file.

Usage:
  python analyze_slate.py slate.json

Example slate.json:
[
  {
    "player": "LeBron James",
    "opponent": "BOS",
    "home": true,
    "teammates_out": ["Anthony Davis"],
    "opponents_out": [],
    "lines": {"PTS": 25.5, "REB": 7.5, "AST": 7.5}
  },
  {
    "player": "Jayson Tatum",
    "opponent": "LAL",
    "home": false,
    "teammates_out": [],
    "opponents_out": ["Anthony Davis"],
    "lines": {"PTS": 27.5, "REB": 8.5, "AST": 4.5}
  }
]
"""
import json
import sys

from config.settings import CURRENT_SEASON
from data.collector import find_player, find_team
from models.predictor import PlayerPropsPredictor
from predict import print_predictions, print_edge_analysis


def analyze_slate(slate_path: str):
    with open(slate_path) as f:
        slate = json.load(f)

    print(f"\n  Analyzing {len(slate)} players from {slate_path}\n")

    best_edges = []

    for entry in slate:
        player = find_player(entry["player"])
        if not player:
            print(f"  SKIP: Could not find '{entry['player']}'")
            continue

        team = find_team(entry["opponent"])
        if not team:
            print(f"  SKIP: Could not find team '{entry['opponent']}'")
            continue

        is_home = entry.get("home", True)
        teammate_injuries = entry.get("teammates_out", [])
        opponent_injuries = entry.get("opponents_out", [])
        lines = entry.get("lines", {})

        predictor = PlayerPropsPredictor(player["id"], player["full_name"])
        predictor.train()

        predictions = predictor.predict(
            opponent_abbrev=team["abbreviation"],
            is_home=is_home,
            season=CURRENT_SEASON,
            teammate_injuries=teammate_injuries,
            opponent_injuries=opponent_injuries,
        )
        print_predictions(player["full_name"], team["abbreviation"], is_home, predictions)

        if lines:
            analysis = predictor.compare_to_line(
                opponent_abbrev=team["abbreviation"],
                is_home=is_home,
                season=CURRENT_SEASON,
                lines=lines,
                teammate_injuries=teammate_injuries,
                opponent_injuries=opponent_injuries,
            )
            print_edge_analysis(analysis)
            for a in analysis:
                a["player"] = player["full_name"]
                best_edges.append(a)

    if best_edges:
        best_edges.sort(key=lambda x: abs(x["edge_pct"]), reverse=True)
        print("\n" + "="*65)
        print("  TOP EDGES ACROSS SLATE")
        print("="*65)
        print(f"  {'Player':<20} {'Prop':<10} {'Line':>6} {'Pred':>6} {'Edge%':>7}  {'Dir':<6} {'Conf':<6}")
        print(f"  {'-'*62}")
        for e in best_edges[:15]:
            print(f"  {e['player']:<20} {e['prop']:<10} {e['line']:>6.1f} "
                  f"{e['prediction']:>6.1f} {e['edge_pct']:>+6.1f}%  {e['direction']:<6} {e['confidence']:<6}")
        print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze_slate.py <slate.json>")
        sys.exit(1)
    analyze_slate(sys.argv[1])
