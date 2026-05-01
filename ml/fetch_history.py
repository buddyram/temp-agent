"""Fetch ~2 years of hourly historical weather from Open-Meteo's archive API.

Run: python ml/fetch_history.py
Output: ml/history.parquet  (gitignored)
"""
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
OUT = Path(__file__).resolve().parent / "history.parquet"

YEARS_BACK = 2
ARCHIVE_LAG_DAYS = 5  # archive is ~2-3 days behind; pad to be safe
HOURLY_VARS = [
    "temperature_2m", "windspeed_10m", "winddirection_10m", "weathercode", "is_day",
    "pressure_msl", "relative_humidity_2m", "cloud_cover",
]


def load_env():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def main():
    load_env()
    try:
        lat = os.environ["LATITUDE"]
        lon = os.environ["LONGITUDE"]
    except KeyError:
        print("Set LATITUDE and LONGITUDE in .env.local", file=sys.stderr)
        sys.exit(1)

    end = date.today() - timedelta(days=ARCHIVE_LAG_DAYS)
    start = end - timedelta(days=365 * YEARS_BACK)
    print(f"Fetching {start} -> {end}  ({(end - start).days} days)")
    print(f"Location: {lat}, {lon}")

    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "hourly": ",".join(HOURLY_VARS),
        "timezone": "UTC",
    }
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()

    hourly = data["hourly"]
    df = pd.DataFrame(hourly)
    df = df.rename(
        columns={
            "time": "timestamp",
            "temperature_2m": "temperature",
            "windspeed_10m": "windspeed",
            "winddirection_10m": "winddirection",
            "pressure_msl": "pressure",
            "relative_humidity_2m": "humidity",
        }
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.set_index("timestamp").sort_index()
    before = len(df)
    df = df.dropna()
    print(f"Rows fetched: {before}, after dropping NaN: {len(df)}")
    print(f"Span: {df.index[0]} -> {df.index[-1]}")
    print()
    print("Summary:")
    print(df.describe())
    print()

    df.to_parquet(OUT)
    print(f"Saved -> {OUT}  ({OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
