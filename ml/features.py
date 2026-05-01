"""Feature engineering: turn an hourly DataFrame into a clean numeric array
suitable for the LSTM, plus a Normalizer that handles scaling and unscaling.

Run: python ml/features.py   (smoke test on history.parquet)
"""
from pathlib import Path

import numpy as np
import pandas as pd

HISTORY = Path(__file__).resolve().parent / "history.parquet"

# Order matters: this is the order of columns in the feature array.
FEATURE_COLUMNS = [
    "temperature",
    "windspeed",
    "wd_sin",
    "wd_cos",
    "weathercode",
    "is_day",
    "pressure",
    "humidity",
    "cloud_cover",
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
]

# Index of `temperature` in FEATURE_COLUMNS — we need it later to extract just
# the temperature column for the prediction target.
TEMP_IDX = FEATURE_COLUMNS.index("temperature")

# Raw columns we expect on the input DataFrame (before time features are derived).
RAW_REQUIRED_COLUMNS = [
    "temperature", "windspeed", "winddirection",
    "weathercode", "is_day",
    "pressure", "humidity", "cloud_cover",
]


def ensure_raw_columns(df: pd.DataFrame, fill_means: dict) -> pd.DataFrame:
    """Make sure all required raw columns exist; fill missing with training-set means.

    Used at predict-time so the model still works on legacy live data that
    predates the richer feature set.
    """
    df = df.copy()
    for col in RAW_REQUIRED_COLUMNS:
        if col not in df.columns:
            df[col] = np.nan
    df = df.ffill().bfill()
    for col in RAW_REQUIRED_COLUMNS:
        if df[col].isna().any() and col in fill_means:
            df[col] = df[col].fillna(fill_means[col])
    return df


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add sin/cos encodings for wind direction, hour-of-day, day-of-year."""
    df = df.copy()

    # wind direction: 0-360 degrees, period = 360
    rad = np.deg2rad(df["winddirection"])
    df["wd_sin"] = np.sin(rad)
    df["wd_cos"] = np.cos(rad)

    # hour-of-day: 0-23, period = 24
    hour = df.index.hour
    df["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * hour / 24)

    # day-of-year: 1-366, period = 366
    doy = df.index.dayofyear
    df["doy_sin"] = np.sin(2 * np.pi * doy / 366)
    df["doy_cos"] = np.cos(2 * np.pi * doy / 366)

    return df


def to_feature_array(df: pd.DataFrame) -> np.ndarray:
    """Select FEATURE_COLUMNS in the right order, return as float32 array of
    shape (n_hours, n_features)."""
    return df[FEATURE_COLUMNS].to_numpy(dtype=np.float32)


class Normalizer:
    """Standardize features to mean=0, std=1. Fit on training data only."""

    def __init__(self):
        self.mean = None
        self.std = None

    def fit(self, x: np.ndarray):
        # x shape: (n_hours, n_features). Compute per-feature mean/std.
        self.mean = x.mean(axis=0)
        self.std = x.std(axis=0)
        # avoid divide-by-zero on constant columns
        self.std = np.where(self.std < 1e-8, 1.0, self.std)
        return self

    def transform(self, x: np.ndarray) -> np.ndarray:
        return (x - self.mean) / self.std

    def inverse(self, x: np.ndarray) -> np.ndarray:
        return x * self.std + self.mean

    def inverse_temperature(self, t: np.ndarray) -> np.ndarray:
        """Un-normalize a temperature-only array (e.g. model predictions)."""
        return t * self.std[TEMP_IDX] + self.mean[TEMP_IDX]


def main():
    """Smoke test: load history, build features, fit normalizer, print shapes."""
    df = pd.read_parquet(HISTORY)
    print(f"loaded history: {df.shape}")

    df = add_time_features(df)
    print(f"after time features: {df.shape}")
    print(f"columns: {list(df.columns)}")

    x = to_feature_array(df)
    print(f"feature array: {x.shape}, dtype={x.dtype}")

    norm = Normalizer().fit(x)
    print(f"per-feature mean: {np.round(norm.mean, 2)}")
    print(f"per-feature std:  {np.round(norm.std, 2)}")

    x_n = norm.transform(x)
    print(f"normalized mean: {np.round(x_n.mean(axis=0), 4)}  (should be ~0)")
    print(f"normalized std:  {np.round(x_n.std(axis=0), 4)}  (should be ~1)")

    # round-trip check
    recovered = norm.inverse(x_n)
    print(f"max round-trip error: {np.abs(recovered - x).max():.2e}  (should be tiny)")


if __name__ == "__main__":
    main()
