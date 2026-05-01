"""Pick any point in the historical archive, predict the next 24h from it,
and compare against what actually happened.

Examples:
  python ml/compare.py                        # random pick from val period
  python ml/compare.py --date 2025-08-15      # specific date (uses 12:00 UTC)
  python ml/compare.py --date 2025-12-25T03:00
  python ml/compare.py --random-train         # random pick from training period
"""
import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from features import TEMP_IDX, add_time_features, to_feature_array
from predict import load_model_and_norm, predict_window
from windows import HISTORY, INPUT_LEN, OUTPUT_LEN, VAL_FRAC

ML_DIR = Path(__file__).resolve().parent
OUT_PLOT = ML_DIR / "compare.png"


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="Anchor datetime (UTC). The prediction starts AFTER this point.")
    ap.add_argument("--random-train", action="store_true", help="Random pick from training period instead of val.")
    ap.add_argument("--seed", type=int, default=None, help="Seed for random pick.")
    return ap.parse_args()


def pick_index(df: pd.DataFrame, args) -> int:
    """Return the index of the LAST hour of the input window. Prediction is the 24h after that."""
    n = len(df)
    needed_before = INPUT_LEN
    needed_after = OUTPUT_LEN

    if args.date:
        ts = pd.Timestamp(args.date)
        if ts.tz is None:
            ts = ts.tz_localize("UTC")
        # find nearest available hour
        idx = df.index.get_indexer([ts], method="nearest")[0]
    else:
        rng = np.random.default_rng(args.seed)
        split = int(n * (1 - VAL_FRAC))
        if args.random_train:
            lo, hi = needed_before, split - needed_after
        else:
            lo, hi = split + needed_before, n - needed_after - 1
        idx = int(rng.integers(lo, hi))

    if idx < needed_before or idx > n - needed_after - 1:
        raise SystemExit(f"index {idx} doesn't have {INPUT_LEN}h before and {OUTPUT_LEN}h after")
    return idx


def main():
    args = parse_args()

    df = pd.read_parquet(HISTORY)
    df_feat = add_time_features(df)
    arr = to_feature_array(df_feat)

    anchor = pick_index(df_feat, args)
    anchor_time = df_feat.index[anchor]

    input_window = arr[anchor - INPUT_LEN + 1 : anchor + 1]            # 48 hours up to and including anchor
    actual_temps = arr[anchor + 1 : anchor + 1 + OUTPUT_LEN, TEMP_IDX]  # next 24 hours
    input_times = df_feat.index[anchor - INPUT_LEN + 1 : anchor + 1]
    pred_times = df_feat.index[anchor + 1 : anchor + 1 + OUTPUT_LEN]

    model, norm = load_model_and_norm(n_features=arr.shape[1])
    pred_temps = predict_window(model, norm, input_window)

    err = pred_temps - actual_temps
    rmse = np.sqrt((err ** 2).mean())
    mae = np.abs(err).mean()
    bias = err.mean()
    split_idx = int(len(df_feat) * (1 - VAL_FRAC))
    period = "train" if anchor < split_idx else "val"

    print(f"anchor:    {anchor_time}  ({period} period, idx {anchor})")
    print(f"predicted next 24h: {np.round(pred_temps, 1)}")
    print(f"actual    next 24h: {np.round(actual_temps, 1)}")
    print(f"rmse {rmse:.2f}°C  mae {mae:.2f}°C  bias {bias:+.2f}°C")

    fig, ax = plt.subplots(figsize=(11, 5))
    ax.plot(input_times, input_window[:, TEMP_IDX], color="#5fa8ff", linewidth=2, label="input (48h history)")
    ax.plot(pred_times, pred_temps, color="#c084fc", linewidth=2.5, marker="o", markersize=4,
            linestyle="--", label="predicted")
    ax.plot(pred_times, actual_temps, color="#6ee7a7", linewidth=2, marker="o", markersize=4, label="actual")
    ax.axvline(anchor_time, color="gray", linestyle=":", alpha=0.6, label="prediction start")
    ax.set_xlabel("time (UTC)")
    ax.set_ylabel("temperature (°C)")
    ax.set_title(f"Compare — anchor {anchor_time:%Y-%m-%d %H:%M} UTC ({period}) · "
                 f"RMSE {rmse:.2f}°C  MAE {mae:.2f}°C")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(OUT_PLOT)
    plt.close(fig)
    print(f"saved -> {OUT_PLOT}")


if __name__ == "__main__":
    main()
