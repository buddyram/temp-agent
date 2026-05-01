"""Train a forecaster on the historical archive.

Usage:
  python ml/train.py                 # trains default (lstm)
  python ml/train.py --model gru
  python ml/train.py --model mlp
  python ml/train.py --model tcn
  python ml/train.py --all           # trains every registered model

Outputs go to ml/models/<name>/{model.pt, norm.npz, config.json, loss_curve.png}.
"""
import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from model import MODELS, build_model
from windows import HISTORY, prepare

MODELS_DIR = Path(__file__).resolve().parent / "models"

BATCH_SIZE = 64
EPOCHS = 200
LR = 1e-4
SEED = 42
PATIENCE = 15


def make_loader(X, y, batch_size, shuffle):
    ds = TensorDataset(torch.from_numpy(X), torch.from_numpy(y))
    return DataLoader(ds, batch_size=batch_size, shuffle=shuffle)


def run_epoch(model, loader, loss_fn, optimizer, device, train: bool):
    model.train(train)
    total_loss, total_count = 0.0, 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        pred = model(x)
        loss = loss_fn(pred, y)
        if train:
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        total_loss += loss.item() * x.size(0)
        total_count += x.size(0)
    return total_loss / total_count


def train_one(name: str, p, device):
    out_dir = MODELS_DIR / name
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / "model.pt"
    norm_path = out_dir / "norm.npz"
    config_path = out_dir / "config.json"
    loss_plot = out_dir / "loss_curve.png"

    print(f"\n=== training '{name}' ===")
    train_loader = make_loader(p.X_train, p.y_train, BATCH_SIZE, shuffle=True)
    val_loader = make_loader(p.X_val, p.y_val, BATCH_SIZE, shuffle=False)

    model = build_model(name, n_features=p.n_features, input_len=p.input_len, output_len=p.output_len).to(device)
    n_params = sum(pp.numel() for pp in model.parameters())
    print(f"params: {n_params:,}")

    loss_fn = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)

    train_losses, val_losses = [], []
    best_val = float("inf")
    best_epoch = 0
    epochs_since_improve = 0

    for epoch in range(1, EPOCHS + 1):
        train_loss = run_epoch(model, train_loader, loss_fn, optimizer, device, train=True)
        with torch.no_grad():
            val_loss = run_epoch(model, val_loader, loss_fn, optimizer, device, train=False)
        train_losses.append(train_loss)
        val_losses.append(val_loss)

        val_rmse_c = np.sqrt(val_loss) * p.normalizer.std[0]
        marker = ""
        if val_loss < best_val:
            best_val = val_loss
            best_epoch = epoch
            epochs_since_improve = 0
            torch.save(model.state_dict(), model_path)
            marker = "  ← saved"
        else:
            epochs_since_improve += 1
        print(f"epoch {epoch:>3}  train {train_loss:.4f}  val {val_loss:.4f}  val_rmse {val_rmse_c:.2f}°C{marker}")

        if epochs_since_improve >= PATIENCE:
            print(f"early stop at epoch {epoch} (best epoch {best_epoch})")
            break

    np.savez(norm_path, mean=p.normalizer.mean, std=p.normalizer.std)
    best_val_rmse_c = float(np.sqrt(best_val) * p.normalizer.std[0])
    config = {
        "name": name,
        "n_features": p.n_features,
        "input_len": p.input_len,
        "output_len": p.output_len,
        "n_params": int(n_params),
        "best_epoch": best_epoch,
        "best_val_loss": float(best_val),
        "best_val_rmse_c": best_val_rmse_c,
    }
    config_path.write_text(json.dumps(config, indent=2))
    print(f"saved -> {out_dir}/  (best val RMSE {best_val_rmse_c:.2f}°C)")

    epochs_ran = len(train_losses)
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.plot(range(1, epochs_ran + 1), train_losses, label="train", marker="o")
    ax.plot(range(1, epochs_ran + 1), val_losses, label="val", marker="o")
    ax.axvline(best_epoch, color="green", linestyle="--", alpha=0.5, label=f"best (epoch {best_epoch})")
    ax.set_xlabel("epoch")
    ax.set_ylabel("MSE loss (normalized)")
    ax.set_title(f"Training curve — {name}")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(loss_plot)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="lstm", choices=list(MODELS.keys()))
    parser.add_argument("--all", action="store_true", help="train every registered model")
    args = parser.parse_args()

    torch.manual_seed(SEED)
    np.random.seed(SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")

    df = pd.read_parquet(HISTORY)
    p = prepare(df)
    print(f"train windows: {len(p.X_train)},  val windows: {len(p.X_val)}")

    names = list(MODELS.keys()) if args.all else [args.model]
    for name in names:
        train_one(name, p, device)


if __name__ == "__main__":
    main()
