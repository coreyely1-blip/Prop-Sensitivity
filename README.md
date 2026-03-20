# NBA Player Props Prediction Model

An advanced, dynamic NBA player props prediction system that uses two years of historical data and an ensemble ML model (XGBoost + LightGBM + Ridge) to predict player stat lines adjusted for matchup context.

## Features

- **Ensemble ML Model**: Weighted combination of XGBoost (45%), LightGBM (40%), and Ridge regression (15%) for robust predictions
- **Dynamic Matchup Analysis**: Adjusts predictions based on opponent defensive ratings, pace, and position-specific matchup data
- **Home/Away Splits**: Separate feature engineering for home vs. away performance
- **Head-to-Head History**: Analyzes how a player historically performs against specific opponents
- **Injury Impact**: Accounts for missing teammates (usage boost) and missing opponents (defensive impact)
- **Rest Days**: Detects back-to-backs, 3-in-4 nights, and extended rest
- **Recent Form**: Weighted rolling averages (5-game and 10-game windows) with trend detection
- **Confidence Intervals**: Model disagreement between sub-models produces uncertainty bands
- **Edge Detection**: Compare model predictions to sportsbook lines to find value

## Prop Categories

Points, Rebounds, Assists, Steals, Blocks, Turnovers, 3-Pointers Made, and combo props (PTS+REB, PTS+AST, PTS+REB+AST, STL+BLK).

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Interactive Mode
```bash
python predict.py
```
You'll be prompted for player name, opponent, venue, injuries, and optional sportsbook lines.

### Command-Line Mode
```bash
# Basic prediction
python predict.py --player "LeBron James" --opponent BOS --home

# With injuries and lines
python predict.py --player "Jayson Tatum" --opponent LAL --away \
    --teammates-out "Derrick White,Jrue Holiday" \
    --opponents-out "Anthony Davis" \
    --lines "PTS=26.5,REB=8.5,AST=4.5"
```

### Batch Slate Analysis
```bash
python analyze_slate.py example_slate.json
```

### Sensitivity Analysis
See how home/away and injuries shift predictions:
```bash
python sensitivity.py --player "LeBron James" --opponent BOS \
    --teammates-out "Anthony Davis"
```

## Architecture

```
Prop-Sensitivity/
├── config/
│   └── settings.py          # Seasons, model params, feature weights
├── data/
│   └── collector.py          # NBA API data collection + caching
├── models/
│   ├── features.py           # Feature engineering (50+ features)
│   └── predictor.py          # Ensemble model training + prediction
├── predict.py                # Main CLI entry point
├── analyze_slate.py          # Batch multi-player analysis
├── sensitivity.py            # Factor sensitivity analysis
└── example_slate.json        # Example slate file
```

## How It Works

1. **Data Collection**: Pulls player game logs from the NBA API for the last 2 seasons, plus team defensive/pace stats. Results are cached to avoid repeated API calls.

2. **Feature Engineering** (50+ features per prediction):
   - Rolling averages (5 and 10 game windows) with trend slopes
   - Season-long averages and standard deviations
   - Home/away performance splits
   - Head-to-head stats vs. specific opponent
   - Opponent defensive rating and ranking vs. position
   - Opponent pace (faster pace = more possessions = more stats)
   - Rest days, back-to-back detection
   - Injury-adjusted usage estimates
   - Per-minute production rates

3. **Model Training**: Uses walk-forward validation (no data leakage) with TimeSeriesSplit cross-validation. Each prop category gets its own trained ensemble.

4. **Prediction**: Builds a live feature vector for the current matchup context, runs it through all three models, and produces a weighted ensemble prediction with confidence bounds.

5. **Edge Analysis**: Compares predictions to sportsbook lines and flags over/under edges with confidence ratings (LOW/MEDIUM/HIGH) based on edge size and model agreement.
