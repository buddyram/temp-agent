"""Compute full train/val metrics for every trained model and write them back
into each model's config.json. Run after train.py to populate the leaderboard.

Run: python ml/benchmark.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader, TensorDataset

from features import TEMP_IDX
from predict import MODELS_DIR, list_available_models, load_model_and_norm
from windows import HISTORY, prepare


@torch.no_grad()
def metrics_on(model, X, y, norm) -> dict:
    """Compute RMSE/MAE in real °C on a windowed split.

    The model predicts a *residual* in normalized space. To get the temperature
    error we add the persistence baseline (last input temp), then un-normalize.
    """
    if len(X) == 0:
        return {"rmse_c": None, "mae_c": None, "n": 0}
    model.eval()
    ds = TensorDataset(torch.from_numpy(X), torch.from_numpy(y))
    loader = DataLoader(ds, batch_size=256, shuffle=False)
    sq_err_sum = 0.0
    abs_err_sum = 0.0
    n = 0
    temp_std = norm.std[TEMP_IDX]
    for xb, yb in loader:
        pred = model(xb).numpy()  # (B, output_len) — normalized residuals
        actual = yb.numpy()       # (B, output_len) — same space
        # error in *normalized* temperature units; multiply by std to get °C
        err_c = (pred - actual) * temp_std
        sq_err_sum += float((err_c ** 2).sum())
        abs_err_sum += float(np.abs(err_c).sum())
        n += err_c.size
    return {
        "rmse_c": float(np.sqrt(sq_err_sum / n)),
        "mae_c": float(abs_err_sum / n),
        "n": n,
    }


BASE_MODELS = ("lstm", "gru", "mlp", "tcn")


@torch.no_grad()
def ensemble_metrics(loaded, X, y, norm) -> dict:
    """Mean of base-model predictions on a windowed split."""
    if len(X) == 0:
        return {"rmse_c": None, "mae_c": None, "n": 0}
    ds = TensorDataset(torch.from_numpy(X), torch.from_numpy(y))
    loader = DataLoader(ds, batch_size=256, shuffle=False)
    sq_err_sum = 0.0
    abs_err_sum = 0.0
    n = 0
    temp_std = norm.std[TEMP_IDX]
    members = [loaded[name] for name in BASE_MODELS if name in loaded]
    for xb, yb in loader:
        preds = np.mean([m["model"](xb).numpy() for m in members], axis=0)
        err_c = (preds - yb.numpy()) * temp_std
        sq_err_sum += float((err_c ** 2).sum())
        abs_err_sum += float(np.abs(err_c).sum())
        n += err_c.size
    return {
        "rmse_c": float(np.sqrt(sq_err_sum / n)),
        "mae_c": float(abs_err_sum / n),
        "n": n,
    }


def main():
    df = pd.read_parquet(HISTORY)
    p = prepare(df)
    print(f"train windows: {len(p.X_train)},  val windows: {len(p.X_val)}")

    available = list_available_models()
    if not available:
        print("no trained models found; run python ml/train.py --all first")
        return

    loaded = {}
    for name, cfg in available:
        print(f"\n--- {name} ---")
        model, norm = load_model_and_norm(name, n_features=p.n_features)
        loaded[name] = {"model": model, "norm": norm, "config": cfg}
        train_m = metrics_on(model, p.X_train, p.y_train, norm)
        val_m = metrics_on(model, p.X_val, p.y_val, norm)

        overfit = (val_m["rmse_c"] / train_m["rmse_c"]) if train_m["rmse_c"] else None

        cfg["train_rmse_c"] = train_m["rmse_c"]
        cfg["train_mae_c"] = train_m["mae_c"]
        cfg["val_rmse_c"] = val_m["rmse_c"]
        cfg["val_mae_c"] = val_m["mae_c"]
        cfg["overfit_ratio"] = overfit
        cfg["best_val_rmse_c"] = val_m["rmse_c"]

        (MODELS_DIR / name / "config.json").write_text(json.dumps(cfg, indent=2))
        print(f"  train  RMSE {train_m['rmse_c']:.3f}°C   MAE {train_m['mae_c']:.3f}°C")
        print(f"  val    RMSE {val_m['rmse_c']:.3f}°C   MAE {val_m['mae_c']:.3f}°C")
        if overfit is not None:
            print(f"  overfit ratio (val/train RMSE) = {overfit:.2f}")

    # ensemble — averaged predictions across base models
    members_present = [n for n in BASE_MODELS if n in loaded]
    if len(members_present) >= 2:
        print(f"\n--- ensemble ({'+'.join(members_present)}) ---")
        # use any member's normalizer (they share the same training set)
        ref_norm = loaded[members_present[0]]["norm"]
        train_m = ensemble_metrics(loaded, p.X_train, p.y_train, ref_norm)
        val_m = ensemble_metrics(loaded, p.X_val, p.y_val, ref_norm)
        overfit = (val_m["rmse_c"] / train_m["rmse_c"]) if train_m["rmse_c"] else None
        n_params_sum = sum(loaded[n]["config"].get("n_params", 0) for n in members_present)

        ens_cfg = {
            "name": "ensemble",
            "members": members_present,
            "n_features": p.n_features,
            "input_len": p.input_len,
            "output_len": p.output_len,
            "n_params": n_params_sum,
            "best_epoch": None,
            "train_rmse_c": train_m["rmse_c"],
            "train_mae_c": train_m["mae_c"],
            "val_rmse_c": val_m["rmse_c"],
            "val_mae_c": val_m["mae_c"],
            "best_val_rmse_c": val_m["rmse_c"],
            "overfit_ratio": overfit,
        }
        ens_dir = MODELS_DIR / "ensemble"
        ens_dir.mkdir(parents=True, exist_ok=True)
        (ens_dir / "config.json").write_text(json.dumps(ens_cfg, indent=2))
        print(f"  train  RMSE {train_m['rmse_c']:.3f}°C   MAE {train_m['mae_c']:.3f}°C")
        print(f"  val    RMSE {val_m['rmse_c']:.3f}°C   MAE {val_m['mae_c']:.3f}°C")
        print(f"  overfit ratio (val/train RMSE) = {overfit:.2f}")


if __name__ == "__main__":
    main()
