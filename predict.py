#!/usr/bin/env python3
"""
NBA Player Props Prediction CLI

Usage examples:
  # Train + predict (interactive prompts)
  python predict.py

  # Quick prediction
  python predict.py --player "LeBron James" --opponent BOS --home

  # With injuries and sportsbook lines
  python predict.py --player "Jayson Tatum" --opponent LAL --away \
      --teammates-out "Derrick White,Jrue Holiday" \
      --opponents-out "Anthony Davis" \
      --lines "PTS=26.5,REB=8.5,AST=4.5"
"""
import argparse
import sys
from datetime import datetime

import pandas as pd

from config.settings import CURRENT_SEASON, PROP_CATEGORIES
from data.collector import find_player, find_team
from models.predictor import PlayerPropsPredictor


def parse_lines(lines_str: str) -> dict[str, float]:
    """Parse 'PTS=24.5,REB=8.5' into a dict."""
    lines = {}
    for pair in lines_str.split(","):
        pair = pair.strip()
        if "=" in pair:
            k, v = pair.split("=", 1)
            lines[k.strip().upper()] = float(v.strip())
    return lines


def print_predictions(player_name: str, opponent: str, is_home: bool,
                      predictions: list[dict]):
    """Pretty-print prediction results."""
    venue = "HOME" if is_home else "AWAY"
    print(f"\n{'='*65}")
    print(f"  {player_name} vs {opponent} ({venue})")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*65}")
    print(f"  {'Prop':<14} {'Pred':>7} {'Low':>7} {'High':>7}  {'Spread':>7}")
    print(f"  {'-'*50}")
    for p in predictions:
        if "error" in p:
            continue
        print(f"  {p['prop']:<14} {p['prediction']:>7.1f} {p.get('low',0):>7.1f} "
              f"{p.get('high',0):>7.1f}  {p.get('model_spread',0):>7.2f}")
    print()


def print_edge_analysis(analysis: list[dict]):
    """Pretty-print edge analysis against sportsbook lines."""
    if not analysis:
        print("  No lines provided for comparison.")
        return
    print(f"\n  {'Prop':<14} {'Line':>7} {'Pred':>7} {'Edge':>7} {'Edge%':>7}  {'Dir':<6} {'Conf':<6}")
    print(f"  {'-'*62}")
    for a in analysis:
        print(f"  {a['prop']:<14} {a['line']:>7.1f} {a['prediction']:>7.1f} "
              f"{a['edge']:>+7.1f} {a['edge_pct']:>+6.1f}%  {a['direction']:<6} {a['confidence']:<6}")
    print()


def interactive_mode():
    """Run the tool interactively — prompt the user for inputs."""
    print("\n" + "="*65)
    print("  NBA Player Props Prediction Model")
    print("="*65)

    # Player
    while True:
        name = input("\n  Player name: ").strip()
        player = find_player(name)
        if player:
            print(f"  Found: {player['full_name']} (ID: {player['id']})")
            break
        print(f"  Could not find '{name}'. Try again.")

    # Opponent
    while True:
        opp = input("  Opponent (team abbrev, e.g. BOS): ").strip()
        team = find_team(opp)
        if team:
            print(f"  Opponent: {team['full_name']} ({team['abbreviation']})")
            opp_abbrev = team["abbreviation"]
            break
        print(f"  Could not find team '{opp}'. Try again.")

    # Venue
    venue = input("  Home or Away? [H/A]: ").strip().upper()
    is_home = venue.startswith("H")

    # Injuries
    tm_inj_str = input("  Teammates OUT (comma-separated, or Enter for none): ").strip()
    teammate_injuries = [x.strip() for x in tm_inj_str.split(",") if x.strip()] if tm_inj_str else []

    opp_inj_str = input("  Opponents OUT (comma-separated, or Enter for none): ").strip()
    opponent_injuries = [x.strip() for x in opp_inj_str.split(",") if x.strip()] if opp_inj_str else []

    # Train + predict
    predictor = PlayerPropsPredictor(player["id"], player["full_name"])
    print(f"\n  Training models for {player['full_name']}...")
    predictor.train()

    predictions = predictor.predict(
        opponent_abbrev=opp_abbrev,
        is_home=is_home,
        season=CURRENT_SEASON,
        teammate_injuries=teammate_injuries,
        opponent_injuries=opponent_injuries,
    )
    print_predictions(player["full_name"], opp_abbrev, is_home, predictions)

    # Optional: compare to lines
    lines_str = input("  Enter sportsbook lines (e.g. PTS=24.5,REB=8.5) or Enter to skip: ").strip()
    if lines_str:
        lines = parse_lines(lines_str)
        analysis = predictor.compare_to_line(
            opponent_abbrev=opp_abbrev,
            is_home=is_home,
            season=CURRENT_SEASON,
            lines=lines,
            teammate_injuries=teammate_injuries,
            opponent_injuries=opponent_injuries,
        )
        print_edge_analysis(analysis)


def cli_mode(args):
    """Run from command-line arguments (non-interactive)."""
    player = find_player(args.player)
    if not player:
        print(f"Error: Could not find player '{args.player}'")
        sys.exit(1)

    team = find_team(args.opponent)
    if not team:
        print(f"Error: Could not find team '{args.opponent}'")
        sys.exit(1)

    is_home = args.home
    opp_abbrev = team["abbreviation"]
    teammate_injuries = [x.strip() for x in args.teammates_out.split(",") if x.strip()] if args.teammates_out else []
    opponent_injuries = [x.strip() for x in args.opponents_out.split(",") if x.strip()] if args.opponents_out else []

    predictor = PlayerPropsPredictor(player["id"], player["full_name"])
    print(f"\n  Training models for {player['full_name']}...")
    predictor.train()

    predictions = predictor.predict(
        opponent_abbrev=opp_abbrev,
        is_home=is_home,
        season=CURRENT_SEASON,
        teammate_injuries=teammate_injuries,
        opponent_injuries=opponent_injuries,
    )
    print_predictions(player["full_name"], opp_abbrev, is_home, predictions)

    if args.lines:
        lines = parse_lines(args.lines)
        analysis = predictor.compare_to_line(
            opponent_abbrev=opp_abbrev,
            is_home=is_home,
            season=CURRENT_SEASON,
            lines=lines,
            teammate_injuries=teammate_injuries,
            opponent_injuries=opponent_injuries,
        )
        print_edge_analysis(analysis)


def main():
    parser = argparse.ArgumentParser(description="NBA Player Props Prediction Model")
    parser.add_argument("--player", type=str, help="Player full name")
    parser.add_argument("--opponent", type=str, help="Opponent team abbreviation")
    parser.add_argument("--home", action="store_true", default=False, help="Player is at home")
    parser.add_argument("--away", action="store_true", default=False, help="Player is away")
    parser.add_argument("--teammates-out", type=str, default="", help="Comma-separated list of injured teammates")
    parser.add_argument("--opponents-out", type=str, default="", help="Comma-separated list of injured opponents")
    parser.add_argument("--lines", type=str, default="", help="Sportsbook lines, e.g. PTS=24.5,REB=8.5")
    parser.add_argument("--season", type=str, default=CURRENT_SEASON, help="Season string")

    args = parser.parse_args()

    if args.away:
        args.home = False

    if args.player and args.opponent:
        cli_mode(args)
    else:
        interactive_mode()


if __name__ == "__main__":
    main()
