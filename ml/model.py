"""Forecaster architectures + a registry so train/serve can pick by name.

Each model takes (batch, input_len, n_features) and returns (batch, output_len)
predicting the residual-from-persistence temperature target.

Run: python ml/model.py   (smoke test)
"""
import torch
import torch.nn as nn


class WeatherLSTM(nn.Module):
    def __init__(
        self,
        n_features: int = 10,
        hidden_size: int = 128,
        num_layers: int = 2,
        output_len: int = 24,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=n_features,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.head = nn.Linear(hidden_size, output_len)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        _, (h_n, _) = self.lstm(x)
        return self.head(h_n[-1])


class WeatherGRU(nn.Module):
    def __init__(
        self,
        n_features: int = 10,
        hidden_size: int = 128,
        num_layers: int = 2,
        output_len: int = 24,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.gru = nn.GRU(
            input_size=n_features,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.head = nn.Linear(hidden_size, output_len)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        _, h_n = self.gru(x)
        return self.head(h_n[-1])


class WeatherMLP(nn.Module):
    """Flatten window and feed through a small MLP. Strong baseline."""

    def __init__(
        self,
        n_features: int = 10,
        input_len: int = 48,
        hidden_size: int = 256,
        output_len: int = 24,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.net = nn.Sequential(
            nn.Flatten(),
            nn.Linear(n_features * input_len, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, output_len),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class WeatherTCN(nn.Module):
    """Stacked dilated 1D convolutions. Captures multi-scale temporal patterns."""

    def __init__(
        self,
        n_features: int = 10,
        input_len: int = 48,
        channels: int = 64,
        output_len: int = 24,
        dropout: float = 0.2,
    ):
        super().__init__()
        layers = []
        in_ch = n_features
        for dilation in (1, 2, 4, 8):
            layers += [
                nn.Conv1d(in_ch, channels, kernel_size=3, padding=dilation, dilation=dilation),
                nn.ReLU(),
                nn.Dropout(dropout),
            ]
            in_ch = channels
        self.conv = nn.Sequential(*layers)
        self.head = nn.Linear(channels * input_len, output_len)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, input_len, n_features) -> conv1d wants (batch, n_features, input_len)
        h = self.conv(x.transpose(1, 2))
        return self.head(h.flatten(1))


# Registry: name -> (class, default kwargs). Train/serve use this to instantiate.
MODELS = {
    "lstm": (WeatherLSTM, {"hidden_size": 128, "num_layers": 2, "dropout": 0.2}),
    "gru":  (WeatherGRU,  {"hidden_size": 128, "num_layers": 2, "dropout": 0.2}),
    "mlp":  (WeatherMLP,  {"hidden_size": 256, "dropout": 0.2}),
    "tcn":  (WeatherTCN,  {"channels": 64, "dropout": 0.2}),
}


def build_model(name: str, n_features: int, input_len: int, output_len: int, **overrides):
    cls, kwargs = MODELS[name]
    kwargs = {**kwargs, **overrides}
    # Pass input_len only to models that need it
    if name in ("mlp", "tcn"):
        kwargs["input_len"] = input_len
    return cls(n_features=n_features, output_len=output_len, **kwargs)


def main():
    batch, input_len, n_features = 4, 48, 10
    fake = torch.randn(batch, input_len, n_features)
    for name in MODELS:
        model = build_model(name, n_features=n_features, input_len=input_len, output_len=24)
        out = model(fake)
        n_params = sum(p.numel() for p in model.parameters())
        print(f"{name:>5}  out {tuple(out.shape)}  params {n_params:>8,}")


if __name__ == "__main__":
    main()
