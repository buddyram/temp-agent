"""Windowing + chronological train/val split + normalization.

Run: python ml/windows.py   (smoke test)
"""
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from features import (
    FEATURE_COLUMNS,
    TEMP_IDX,
    Normalizer,
    add_time_features,
    to_feature_array,
)

HISTORY = Path(__file__).resolve().parent / "history.parquet"

INPUT_LEN = 48   # hours of history fed into the model
OUTPUT_LEN = 24  # hours of temperature we predict
VAL_FRAC = 0.15  # fraction of windows held out for validation


@dataclass
class Prepared:
    """Everything downstream code needs to train and predict."""
    X_train: np.ndarray  # (n_train, INPUT_LEN, n_features)
    y_train: np.ndarray  # (n_train, OUTPUT_LEN)
    X_val: np.ndarray
    y_val: np.ndarray
    normalizer: Normalizer
    input_len: int
    output_len: int
    n_features: int


def make_windows(arr: np.ndarray, input_len: int, output_len: int):
    """Slide a (input_len + output_len)-sized window across `arr`, one step at a time.

    arr shape: (n_hours, n_features), already normalized.
    Returns:
        X shape: (n_windows, input_len, n_features)
        y shape: (n_windows, output_len)   — temperature only
    """
    n_hours, n_features = arr.shape
    n_windows = n_hours - input_len - output_len + 1
    if n_windows <= 0:
        raise ValueError(f"Not enough hours ({n_hours}) for input={input_len} + output={output_len}")

    X = np.empty((n_windows, input_len, n_features), dtype=np.float32)
    y = np.empty((n_windows, output_len), dtype=np.float32)
    for i in range(n_windows):
        X[i] = arr[i : i + input_len]
        # residual target: future temp minus the last known input temp (the "persistence baseline")
        baseline = arr[i + input_len - 1, TEMP_IDX]
        y[i] = arr[i + input_len : i + input_len + output_len, TEMP_IDX] - baseline
    return X, y


def prepare(
    df: pd.DataFrame,
    input_len: int = INPUT_LEN,
    output_len: int = OUTPUT_LEN,
    val_frac: float = VAL_FRAC,
) -> Prepared:
    """Take a raw hourly DataFrame and produce normalized, windowed train/val arrays."""
    # 1. add sin/cos time features and convert to a flat (n_hours, 10) array
    df = add_time_features(df)
    arr = to_feature_array(df)

    # 2. chronological split BEFORE normalization (no leakage)
    n_hours = len(arr)
    split_idx = int(n_hours * (1 - val_frac))
    train_arr = arr[:split_idx]
    val_arr = arr[split_idx:]

    # 3. fit normalizer on train ONLY, then transform both
    norm = Normalizer().fit(train_arr)
    train_arr = norm.transform(train_arr)
    val_arr = norm.transform(val_arr)

    # 4. window each split independently
    X_train, y_train = make_windows(train_arr, input_len, output_len)
    X_val, y_val = make_windows(val_arr, input_len, output_len)

    return Prepared(
        X_train=X_train,
        y_train=y_train,
        X_val=X_val,
        y_val=y_val,
        normalizer=norm,
        input_len=input_len,
        output_len=output_len,
        n_features=arr.shape[1],
    )


def main():
    df = pd.read_parquet(HISTORY)
    print(f"hourly rows: {len(df)}")

    p = prepare(df)
    print(f"input_len={p.input_len}, output_len={p.output_len}, n_features={p.n_features}")
    print()
    print(f"X_train: {p.X_train.shape}")
    print(f"y_train: {p.y_train.shape}")
    print(f"X_val:   {p.X_val.shape}")
    print(f"y_val:   {p.y_val.shape}")
    print()
    print(f"X_train mean (per feature): {np.round(p.X_train.mean(axis=(0, 1)), 3)}")
    print(f"X_train std  (per feature): {np.round(p.X_train.std(axis=(0, 1)), 3)}")
    print(f"y_train mean: {p.y_train.mean():.3f}, std: {p.y_train.std():.3f}")
    print()
    print(f"feature columns: {FEATURE_COLUMNS}")


if __name__ == "__main__":
    main()
