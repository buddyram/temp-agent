"""Tiny local server: serves the dashboard AND a /api/predict endpoint
that runs the LSTM on demand against our live recorded weather.

Run from repo root:
  python ml/serve.py
Then open http://localhost:8000
"""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import (  # noqa: E402
    FEATURE_COLUMNS, RAW_REQUIRED_COLUMNS, TEMP_IDX,
    add_time_features, ensure_raw_columns, to_feature_array,
)
from predict import (  # noqa: E402
    DEFAULT_MODEL, MODELS_DIR, list_available_models, load_model_and_norm, predict_window,
)
from windows import INPUT_LEN, OUTPUT_LEN  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LIVE_JSON = ROOT / "outputs" / "weather.json"
PORT = 8000


def load_live_hourly_raw() -> pd.DataFrame:
    """Read outputs/weather.json into a raw hourly DataFrame (no fill yet)."""
    state = json.loads(LIVE_JSON.read_text())
    rows = []
    for e in state["history"]:
        d = e["data"]
        row = {"timestamp": e["timestamp"]}
        for col in RAW_REQUIRED_COLUMNS:
            row[col] = d.get(col)
        rows.append(row)
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.set_index("timestamp").sort_index()
    df = df.resample("1h").mean(numeric_only=True)
    return df


# Models load once. Live data reloads on every request — it's tiny.
print("loading models...")
N_FEATURES = len(FEATURE_COLUMNS)

# {name: {"model": ..., "norm": ..., "config": {...}}}
LOADED = {}
for _name, _cfg in list_available_models():
    _m, _n = load_model_and_norm(_name, n_features=N_FEATURES)
    LOADED[_name] = {"model": _m, "norm": _n, "config": _cfg}
    print(f"  loaded '{_name}'  val_rmse {_cfg.get('best_val_rmse_c', '?'):.2f}°C  params {_cfg.get('n_params'):,}")

if not LOADED:
    raise SystemExit("no trained models found in ml/models/ — run `python ml/train.py --all` first")

DEFAULT = DEFAULT_MODEL if DEFAULT_MODEL in LOADED else next(iter(LOADED))
# Use the default model's normalizer for fill_means (all share the same training set)
_default_norm = LOADED[DEFAULT]["norm"]
FILL_MEANS = {col: float(_default_norm.mean[FEATURE_COLUMNS.index(col)])
              for col in RAW_REQUIRED_COLUMNS if col in FEATURE_COLUMNS}


def load_live_hourly() -> pd.DataFrame:
    """Live hourly DataFrame with missing fields filled from training-set means."""
    df = load_live_hourly_raw()
    df = ensure_raw_columns(df, FILL_MEANS).dropna()
    return df


_df0 = load_live_hourly()
print(f"ready. {len(_df0)} hours of live data  ({_df0.index[0]} -> {_df0.index[-1]})")


def get_state():
    """Reload live data + recompute feature array. Cheap; happens per-request."""
    df = load_live_hourly()
    df_feat = add_time_features(df)
    arr = to_feature_array(df_feat)
    return df_feat, arr


BASE_MODELS = ("lstm", "gru", "mlp", "tcn")


def _ensemble_predict(input_window):
    """Mean of all base models that are loaded."""
    members = [LOADED[n] for n in BASE_MODELS if n in LOADED]
    preds = [predict_window(b["model"], b["norm"], input_window) for b in members]
    return np.mean(preds, axis=0)


def predict_at(anchor_time: pd.Timestamp, model_name: str = None) -> dict:
    """Find the nearest hour to `anchor_time`, return input/prediction/actual JSON.
    If there aren't OUTPUT_LEN hours of actual after the anchor (anchor is near
    the most-recent end), return a forecast with no actual to compare against."""
    name = model_name or DEFAULT
    if name != "ensemble" and name not in LOADED:
        return {"error": f"unknown model '{name}'. available: {list(LOADED)}"}

    df_feat, arr = get_state()
    n_hours = len(df_feat)
    idx = df_feat.index.get_indexer([anchor_time], method="nearest")[0]
    if idx < INPUT_LEN - 1:
        return {"error": f"need {INPUT_LEN}h before anchor; only {idx + 1}h available"}

    input_window = arr[idx - INPUT_LEN + 1 : idx + 1]
    input_times = df_feat.index[idx - INPUT_LEN + 1 : idx + 1]
    if name == "ensemble":
        pred = _ensemble_predict(input_window)
    else:
        bundle = LOADED[name]
        pred = predict_window(bundle["model"], bundle["norm"], input_window)

    # actual continuation if we have the future, else extrapolate timestamps an hour apart
    actual_available = idx + OUTPUT_LEN < n_hours
    if actual_available:
        actual = arr[idx + 1 : idx + 1 + OUTPUT_LEN, TEMP_IDX]
        pred_times = df_feat.index[idx + 1 : idx + 1 + OUTPUT_LEN]
        err = pred - actual
        metrics = {
            "rmse": float(np.sqrt((err ** 2).mean())),
            "mae": float(np.abs(err).mean()),
        }
        actual_payload = [
            {"timestamp": t.isoformat(), "temperature": float(v)}
            for t, v in zip(pred_times, actual)
        ]
    else:
        last_t = df_feat.index[idx]
        pred_times = pd.date_range(last_t + pd.Timedelta(hours=1), periods=OUTPUT_LEN, freq="1h")
        actual_payload = None
        metrics = None

    return {
        "model": name,
        "anchor": df_feat.index[idx].isoformat(),
        "input": [{"timestamp": t.isoformat(), "temperature": float(v)}
                  for t, v in zip(input_times, input_window[:, TEMP_IDX])],
        "predicted": [{"timestamp": t.isoformat(), "temperature": float(v)}
                      for t, v in zip(pred_times, pred)],
        "actual": actual_payload,
        "metrics": metrics,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/predict":
            self.handle_predict(parse_qs(parsed.query))
        elif parsed.path == "/api/predict_all":
            self.handle_predict_all(parse_qs(parsed.query))
        elif parsed.path == "/api/range":
            self.handle_range()
        elif parsed.path == "/api/history":
            self.handle_history(parse_qs(parsed.query))
        elif parsed.path == "/api/models":
            self.handle_models()
        else:
            super().do_GET()

    def handle_predict(self, qs):
        try:
            dt = qs.get("datetime", [None])[0]
            if not dt:
                return self.json({"error": "missing ?datetime=..."}, status=400)
            ts = pd.Timestamp(dt)
            if ts.tz is None:
                ts = ts.tz_localize("UTC")
            model_name = qs.get("model", [None])[0]
            result = predict_at(ts, model_name=model_name)
            self.json(result)
        except Exception as e:
            self.json({"error": str(e)}, status=500)

    def handle_predict_all(self, qs):
        try:
            dt = qs.get("datetime", [None])[0]
            if not dt:
                return self.json({"error": "missing ?datetime=..."}, status=400)
            ts = pd.Timestamp(dt)
            if ts.tz is None:
                ts = ts.tz_localize("UTC")
            df_feat, arr = get_state()
            n_hours = len(df_feat)
            idx = df_feat.index.get_indexer([ts], method="nearest")[0]
            if idx < INPUT_LEN - 1:
                return self.json({"error": f"need {INPUT_LEN}h before anchor"}, status=400)

            input_window = arr[idx - INPUT_LEN + 1 : idx + 1]
            input_times = df_feat.index[idx - INPUT_LEN + 1 : idx + 1]
            actual_available = idx + OUTPUT_LEN < n_hours
            if actual_available:
                actual = arr[idx + 1 : idx + 1 + OUTPUT_LEN, TEMP_IDX]
                pred_times = df_feat.index[idx + 1 : idx + 1 + OUTPUT_LEN]
                actual_payload = [
                    {"timestamp": t.isoformat(), "temperature": float(v)}
                    for t, v in zip(pred_times, actual)
                ]
            else:
                last_t = df_feat.index[idx]
                pred_times = pd.date_range(last_t + pd.Timedelta(hours=1), periods=OUTPUT_LEN, freq="1h")
                actual_payload = None
                actual = None

            results = {}
            base_preds = {}
            for name, bundle in LOADED.items():
                pred = predict_window(bundle["model"], bundle["norm"], input_window)
                base_preds[name] = pred
                metrics = None
                if actual is not None:
                    err = pred - actual
                    metrics = {
                        "rmse": float(np.sqrt((err ** 2).mean())),
                        "mae": float(np.abs(err).mean()),
                    }
                results[name] = {
                    "predicted": [
                        {"timestamp": t.isoformat(), "temperature": float(v)}
                        for t, v in zip(pred_times, pred)
                    ],
                    "metrics": metrics,
                }

            # ensemble = mean of base models
            members = [base_preds[n] for n in BASE_MODELS if n in base_preds]
            if members:
                ens_pred = np.mean(members, axis=0)
                ens_metrics = None
                if actual is not None:
                    err = ens_pred - actual
                    ens_metrics = {
                        "rmse": float(np.sqrt((err ** 2).mean())),
                        "mae": float(np.abs(err).mean()),
                    }
                results["ensemble"] = {
                    "predicted": [
                        {"timestamp": t.isoformat(), "temperature": float(v)}
                        for t, v in zip(pred_times, ens_pred)
                    ],
                    "metrics": ens_metrics,
                }

            self.json({
                "anchor": df_feat.index[idx].isoformat(),
                "input": [
                    {"timestamp": t.isoformat(), "temperature": float(v)}
                    for t, v in zip(input_times, input_window[:, TEMP_IDX])
                ],
                "actual": actual_payload,
                "models": results,
            })
        except Exception as e:
            self.json({"error": str(e)}, status=500)

    def handle_models(self):
        models = [
            {
                "name": name,
                "n_params": bundle["config"].get("n_params"),
                "best_epoch": bundle["config"].get("best_epoch"),
                "best_val_rmse_c": bundle["config"].get("best_val_rmse_c"),
                "val_rmse_c": bundle["config"].get("val_rmse_c"),
                "val_mae_c": bundle["config"].get("val_mae_c"),
                "train_rmse_c": bundle["config"].get("train_rmse_c"),
                "train_mae_c": bundle["config"].get("train_mae_c"),
                "overfit_ratio": bundle["config"].get("overfit_ratio"),
            }
            for name, bundle in LOADED.items()
        ]
        # ensemble — virtual model, config written by benchmark.py
        ens_cfg_path = MODELS_DIR / "ensemble" / "config.json"
        if ens_cfg_path.exists():
            ec = json.loads(ens_cfg_path.read_text())
            models.append({"name": "ensemble", **{k: ec.get(k) for k in
                ["n_params","best_epoch","best_val_rmse_c","val_rmse_c","val_mae_c",
                 "train_rmse_c","train_mae_c","overfit_ratio"]}})
        self.json({"default": DEFAULT, "models": models})

    def handle_range(self):
        df_feat, _ = get_state()
        # the earliest anchor that has INPUT_LEN hours behind it
        earliest_anchor = df_feat.index[INPUT_LEN - 1] if len(df_feat) >= INPUT_LEN else None
        self.json({
            "first": df_feat.index[0].isoformat(),
            "last": df_feat.index[-1].isoformat(),
            "earliest_anchor": earliest_anchor.isoformat() if earliest_anchor is not None else None,
            "input_len": INPUT_LEN,
            "output_len": OUTPUT_LEN,
            "n_hours": len(df_feat),
        })

    def handle_history(self, qs):
        df_feat, arr = get_state()
        self.json({
            "points": [
                {"timestamp": t.isoformat(), "temperature": float(v)}
                for t, v in zip(df_feat.index, arr[:, TEMP_IDX])
            ],
        })

    def json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # less noisy logs
        if "/api/" in args[0]:
            super().log_message(fmt, *args)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"serving on http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
