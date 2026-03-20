#!/usr/bin/env python3
"""
Sensitivity analyzer — shows how each factor (home/away, injuries, opponent)
shifts the predicted props for a player.

Usage:
  python sensitivity.py --player "LeBron James" --opponent BOS
"""
import argparse
import sys
from copy import deepcopy

import pandas as pd

from config.settings import CURRENT_SEASON, PROP_CATEGORIES
from data.collector import find_player, find_team
from models.predictor import PlayerPropsPredictor


def run_sensitivity(player_name: str, opponent_abbrev: str,
                    teammate_injuries: list[str] | None = None):
    """Run predictions under multiple scenarios and compare."""
    player = find_player(player_name)
    if not player:
        print(f"Error: Could not find player '{player_name}'")
        return
    team = find_team(opponent_abbrev)
    if not team:
        print(f"Error: Could not find team '{opponent_abbrev}'")
        return

    opp = team["abbreviation"]
    predictor = PlayerPropsPredictor(player["id"], player["full_name"])
    predictor.train()

    scenarios = {
        "HOME (no injuries)": {"is_home": True, "tm_inj": [], "opp_inj": []},
        "AWAY (no injuries)": {"is_home": False, "tm_inj": [], "opp_inj": []},
    }
    if teammate_injuries:
        scenarios["HOME (teammates out)"] = {"is_home": True, "tm_inj": teammate_injuries, "opp_inj": []}
        scenarios["AWAY (teammates out)"] = {"is_home": False, "tm_inj": teammate_injuries, "opp_inj": []}

    results = {}
    for label, params in scenarios.items():
        preds = predictor.predict(
            opponent_abbrev=opp,
            is_home=params["is_home"],
            season=CURRENT_SEASON,
            teammate_injuries=params["tm_inj"],
            opponent_injuries=params["opp_inj"],
        )
        results[label] = {p["prop"]: p["prediction"] for p in preds if "prediction" in p}

    # Display comparison table
    props_to_show = ["PTS", "REB", "AST", "FG3M", "PTS+REB+AST"]
    scenario_labels = list(results.keys())

    print(f"\n{'='*70}")
    print(f"  Sensitivity Analysis: {player['full_name']} vs {opp}")
    print(f"{'='*70}")

    header = f"  {'Prop':<14}" + "".join(f"{s:>18}" for s in scenario_labels)
    print(header)
    print(f"  {'-'*(14 + 18*len(scenario_labels))}")

    for prop in props_to_show:
        row = f"  {prop:<14}"
        base_val = None
        for label in scenario_labels:
            val = results[label].get(prop, 0)
            if base_val is None:
                base_val = val
                row += f"{val:>18.1f}"
            else:
                diff = val - base_val
                row += f"{val:>11.1f} ({diff:+.1f})"
        print(row)
    print()


def main():
    parser = argparse.ArgumentParser(description="Props Sensitivity Analyzer")
    parser.add_argument("--player", required=True, help="Player name")
    parser.add_argument("--opponent", required=True, help="Opponent abbreviation")
    parser.add_argument("--teammates-out", type=str, default="", help="Comma-separated injured teammates")
    args = parser.parse_args()

    tm_inj = [x.strip() for x in args.teammates_out.split(",") if x.strip()] if args.teammates_out else []
    run_sensitivity(args.player, args.opponent, tm_inj)


if __name__ == "__main__":
    main()
