"""Load the trained model and generate forecasts.

Two outputs:
  1. ml/predict_val.png   — sanity check on a held-out validation window
  2. ml/predict_live.png  — 24h forecast from the most recent live data

Run: python ml/predict.py
"""
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch

from features import (
    FEATURE_COLUMNS, RAW_REQUIRED_COLUMNS, TEMP_IDX,
    Normalizer, add_time_features, ensure_raw_columns, to_feature_array,
)
from model import build_model
from windows import HISTORY, INPUT_LEN, OUTPUT_LEN, prepare

ROOT = Path(__file__).resolve().parent.parent
ML_DIR = Path(__file__).resolve().parent
MODELS_DIR = ML_DIR / "models"
LIVE_JSON = ROOT / "outputs" / "weather.json"
FORECAST_JSON = ROOT / "outputs" / "forecast.json"
PRED_VAL_PLOT = ML_DIR / "predict_val.png"
PRED_LIVE_PLOT = ML_DIR / "predict_live.png"

DEFAULT_MODEL = "lstm"


def list_available_models():
    """Return [(name, config_dict)] for every trained model on disk."""
    if not MODELS_DIR.exists():
        return []
    out = []
    for sub in sorted(MODELS_DIR.iterdir()):
        cfg = sub / "config.json"
        if sub.is_dir() and cfg.exists() and (sub / "model.pt").exists():
            out.append((sub.name, json.loads(cfg.read_text())))
    return out


def load_model_and_norm(name: str = DEFAULT_MODEL, n_features: int = None):
    """Load a trained model + its normalizer from ml/models/<name>/."""
    model_dir = MODELS_DIR / name
    config = json.loads((model_dir / "config.json").read_text())
    n_feat = n_features or config["n_features"]
    model = build_model(
        name,
        n_features=n_feat,
        input_len=config["input_len"],
        output_len=config["output_len"],
    )
    model.load_state_dict(torch.load(model_dir / "model.pt", map_location="cpu", weights_only=True))
    model.eval()

    nz = np.load(model_dir / "norm.npz")
    norm = Normalizer()
    norm.mean = nz["mean"]
    norm.std = nz["std"]
    return model, norm


def predict_window(model, norm, window_unnorm: np.ndarray) -> np.ndarray:
    """window_unnorm: (input_len, n_features) in original units.
    Returns predicted next OUTPUT_LEN temperatures in °C."""
    x_n = norm.transform(window_unnorm).astype(np.float32)
    baseline_n = x_n[-1, TEMP_IDX]  # last input hour's normalized temp = persistence baseline
    x_t = torch.from_numpy(x_n).unsqueeze(0)  # add batch dim → (1, input_len, n_features)
    with torch.no_grad():
        residual_n = model(x_t).squeeze(0).numpy()  # (OUTPUT_LEN,) — predicted delta from baseline
    pred_n = baseline_n + residual_n
    return norm.inverse_temperature(pred_n)


def plot_forecast(history_times, history_temps, pred_times, pred_temps, actual_temps, title, path):
    fig, ax = plt.subplots(figsize=(11, 5))
    ax.plot(history_times, history_temps, color="#5fa8ff", linewidth=2, label="input (last 48h)")
    ax.plot(pred_times, pred_temps, color="#ff7a59", linewidth=2.5, marker="o", markersize=4, label="prediction")
    if actual_temps is not None:
        ax.plot(pred_times, actual_temps, color="#6ee7a7", linewidth=2, linestyle="--", label="actual")
    ax.axvline(history_times[-1], color="gray", linestyle=":", alpha=0.6)
    ax.set_xlabel("time (UTC)")
    ax.set_ylabel("temperature (°C)")
    ax.set_title(title)
    ax.legend()
    ax.grid(alpha=0.3)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
    print(f"saved -> {path}")


def predict_on_val(model, norm):
    """Use the most recent val window (after preparing the same way as training)."""
    df = pd.read_parquet(HISTORY)
    df_feat = add_time_features(df)
    arr = to_feature_array(df_feat)

    # last INPUT_LEN+OUTPUT_LEN hours (so we have a target to compare against)
    needed = INPUT_LEN + OUTPUT_LEN
    arr_tail = arr[-needed:]
    times = df_feat.index[-needed:]

    input_window = arr_tail[:INPUT_LEN]                            # unnormalized features
    actual_temps = arr_tail[INPUT_LEN:, TEMP_IDX]                  # unnormalized °C

    pred_temps = predict_window(model, norm, input_window)

    # error in °C
    err = pred_temps - actual_temps
    rmse = np.sqrt((err ** 2).mean())
    mae = np.abs(err).mean()
    print(f"[val sanity check] rmse {rmse:.2f}°C  mae {mae:.2f}°C")

    plot_forecast(
        history_times=times[:INPUT_LEN],
        history_temps=input_window[:, TEMP_IDX],
        pred_times=times[INPUT_LEN:],
        pred_temps=pred_temps,
        actual_temps=actual_temps,
        title=f"Val sanity check — last 24h held out (RMSE {rmse:.2f}°C)",
        path=PRED_VAL_PLOT,
    )


def predict_on_live(model, norm):
    """Forecast 24h forward from the latest live data in outputs/weather.json."""
    if not LIVE_JSON.exists():
        print(f"no live data at {LIVE_JSON} — skipping live forecast")
        return

    state = json.loads(LIVE_JSON.read_text())
    rows = []
    for entry in state["history"]:
        d = entry["data"]
        row = {"timestamp": entry["timestamp"]}
        for col in RAW_REQUIRED_COLUMNS:
            row[col] = d.get(col)
        rows.append(row)
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.set_index("timestamp").sort_index()
    df = df.resample("1h").mean(numeric_only=True)
    # fill NaNs (from missing legacy fields) with training-set means
    fill_means = {col: float(norm.mean[FEATURE_COLUMNS.index(col)])
                  for col in RAW_REQUIRED_COLUMNS if col in FEATURE_COLUMNS}
    df = ensure_raw_columns(df, fill_means).dropna()

    if len(df) < INPUT_LEN:
        print(f"need {INPUT_LEN} live hours, only have {len(df)} — skipping live forecast")
        return

    df_feat = add_time_features(df)
    arr = to_feature_array(df_feat)
    input_window = arr[-INPUT_LEN:]
    input_times = df_feat.index[-INPUT_LEN:]

    pred_temps = predict_window(model, norm, input_window)
    last_time = input_times[-1]
    pred_times = pd.date_range(last_time + pd.Timedelta(hours=1), periods=OUTPUT_LEN, freq="1h")

    print(f"[live forecast] starting from {last_time}")
    print(f"  next 24h: {np.round(pred_temps, 1)}")

    # write JSON for the dashboard to consume
    forecast = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "input_last_timestamp": last_time.isoformat(),
        "predictions": [
            {"timestamp": t.isoformat(), "temperature": float(temp)}
            for t, temp in zip(pred_times, pred_temps)
        ],
    }
    FORECAST_JSON.write_text(json.dumps(forecast, indent=2))
    print(f"saved -> {FORECAST_JSON}")

    plot_forecast(
        history_times=input_times,
        history_temps=input_window[:, TEMP_IDX],
        pred_times=pred_times,
        pred_temps=pred_temps,
        actual_temps=None,
        title=f"Live forecast — next 24h from {last_time:%Y-%m-%d %H:%M} UTC",
        path=PRED_LIVE_PLOT,
    )


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--live-only", action="store_true",
                        help="skip val sanity check (no history.parquet required)")
    args = parser.parse_args()

    if args.live_only:
        model, norm = load_model_and_norm(args.model)
        print(f"using model '{args.model}' (live-only mode)")
        predict_on_live(model, norm)
        return

    df = pd.read_parquet(HISTORY)
    p = prepare(df)
    model, norm = load_model_and_norm(args.model, n_features=p.n_features)
    print(f"using model '{args.model}'")

    predict_on_val(model, norm)
    predict_on_live(model, norm)


if __name__ == "__main__":
    main()
