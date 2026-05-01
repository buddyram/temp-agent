"""Load weather.json, inspect, and resample to a clean hourly grid.

Run: python ml/data.py
"""
import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

WEATHER_JSON = Path(__file__).resolve().parent.parent / "outputs" / "weather.json"
RESAMPLED_PLOT = Path(__file__).resolve().parent / "resampled.png"


def load_raw():
    with open(WEATHER_JSON) as f:
        state = json.load(f)
    return state


def to_dataframe(state):
    rows = []
    for entry in state["history"]:
        d = entry["data"]
        rows.append(
            {
                "timestamp": entry["timestamp"],
                "temperature": d.get("temperature"),
                "windspeed": d.get("windspeed"),
                "winddirection": d.get("winddirection"),
                "weathercode": d.get("weathercode"),
                "is_day": d.get("is_day"),
            }
        )
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def resample_hourly(df):
    """Bucket samples into 1-hour bins (averaging duplicates within each bin),
    then linearly interpolate any empty hours."""
    s = df.set_index("timestamp").sort_index()
    hourly = s.resample("1h").mean(numeric_only=True)
    hourly = hourly.interpolate(method="linear")
    hourly = hourly.dropna()  # drop any leading/trailing NaNs interpolation couldn't fill
    return hourly


def main():
    state = load_raw()
    df = to_dataframe(state)

    print(f"start_time:        {state.get('start_time')}")
    print(f"max_temperature:   {state.get('max_temperature')}")
    print(f"min_temperature:   {state.get('min_temperature')}")
    print(f"total samples:     {len(df)}")
    print(f"first timestamp:   {df['timestamp'].iloc[0]}")
    print(f"last timestamp:    {df['timestamp'].iloc[-1]}")
    print(f"span:              {df['timestamp'].iloc[-1] - df['timestamp'].iloc[0]}")
    print()
    print("column summary:")
    print(df.describe(include="all"))
    print()
    print("first 5 rows:")
    print(df.head())
    print()
    print("gaps between consecutive samples (top 10 longest):")
    gaps = df["timestamp"].diff().dropna().sort_values(ascending=False)
    print(gaps.head(10).to_string())

    print()
    print("=" * 60)
    print("RESAMPLED TO HOURLY GRID")
    print("=" * 60)
    hourly = resample_hourly(df)
    print(f"hourly rows:       {len(hourly)}")
    print(f"first hour:        {hourly.index[0]}")
    print(f"last hour:         {hourly.index[-1]}")
    print(f"any NaN left?      {hourly.isna().any().any()}")
    print()
    print("first 5 hourly rows:")
    print(hourly.head())
    print()
    print("hourly summary:")
    print(hourly.describe())

    # quick visual check: raw points vs hourly resampled line
    fig, ax = plt.subplots(figsize=(11, 5))
    ax.scatter(df["timestamp"], df["temperature"], s=10, alpha=0.4, label="raw samples")
    ax.plot(hourly.index, hourly["temperature"], color="orange", linewidth=2, label="hourly resampled")
    ax.set_xlabel("time (UTC)")
    ax.set_ylabel("temperature (°C)")
    ax.set_title("Raw samples vs. hourly resampled")
    ax.legend()
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(RESAMPLED_PLOT)
    plt.close(fig)
    print()
    print(f"plot saved -> {RESAMPLED_PLOT}")


if __name__ == "__main__":
    main()
