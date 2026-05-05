import json
import os
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import requests

OUT = "outputs/weather.json"
PLOT = "outputs/image.png"
ENV_FILE = ".env.local"
INTERVAL = 1500


def load_env(path=ENV_FILE):
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def now():
    return datetime.now(timezone.utc).isoformat()


def load():
    if os.path.exists(OUT):
        with open(OUT) as f:
            state = json.load(f)
        if isinstance(state, dict) and "history" in state and "start_time" in state:
            return state
    return {"start_time": now(), "history": []}


def save(state):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(state, f, indent=2)


def plot(state):
    rows = [
        {"timestamp": e["timestamp"], "temperature": e["data"].get("temperature")}
        for e in state["history"]
        if isinstance(e["data"].get("temperature"), (int, float))
    ]
    if not rows:
        return
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    os.makedirs(os.path.dirname(PLOT), exist_ok=True)
    fig, ax = plt.subplots(figsize=(10, 5))
    df.plot(x="timestamp", y="temperature", ax=ax, marker="o", legend=False)
    ax.set_xlabel("time (UTC)")
    ax.set_ylabel("temperature (°C)")
    ax.set_title("Temperature vs time")
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(PLOT)
    plt.close(fig)


def update_extremes(state):
    temps = [e["data"].get("temperature") for e in state["history"]]
    temps = [t for t in temps if isinstance(t, (int, float))]
    if temps:
        state["max_temperature"] = max(temps)
        state["min_temperature"] = min(temps)


def c_to_f(c):
    return c * 9 / 5 + 32


def send_record_email(kind, new_temp, prev_temp, current, state):
    addr = os.environ.get("EMAIL_ADDRESS")
    pw = os.environ.get("EMAIL_PASSWORD")
    if not addr or not pw:
        print("Email creds missing, skipping notification")
        return
    new_f = c_to_f(new_temp)
    prev_f = c_to_f(prev_temp)
    delta_c = new_temp - prev_temp
    delta_f = new_f - prev_f
    other_kind = "min" if kind == "max" else "max"
    other_temp = state.get(f"{other_kind}_temperature")
    other_line = (
        f"Current {other_kind} on record: {other_temp}°C ({c_to_f(other_temp):.1f}°F)"
        if isinstance(other_temp, (int, float))
        else f"Current {other_kind} on record: n/a"
    )
    samples = len(state.get("history", []))
    start_time = state.get("start_time", "unknown")
    arrow = "🔥" if kind == "max" else "🥶"
    wind = current.get("windspeed")
    wdir = current.get("winddirection")
    wcode = current.get("weathercode")
    obs_time = current.get("time", "unknown")
    lines = [
        f"Hello,",
        "",
        f"{arrow} A new {kind.upper()} temperature record has been set!",
        "",
        f"  New {kind}: {new_temp}°C ({new_f:.1f}°F)",
        f"  Previous {kind}: {prev_temp}°C ({prev_f:.1f}°F)",
        f"  Change: {delta_c:+.2f}°C ({delta_f:+.2f}°F)",
        "",
        "Current conditions at observation:",
        f"  Observation time: {obs_time}",
        f"  Wind speed: {wind} km/h" if wind is not None else "  Wind speed: n/a",
        f"  Wind direction: {wdir}°" if wdir is not None else "  Wind direction: n/a",
        f"  Weather code: {wcode}" if wcode is not None else "  Weather code: n/a",
        "",
        "Dataset stats:",
        f"  {other_line}",
        f"  Total samples recorded: {samples}",
        f"  Tracking since: {start_time}",
        "",
        "— temp-agent 🌡️",
    ]
    msg = EmailMessage()
    msg["Subject"] = f"{arrow} New {kind} record: {new_temp}°C ({new_f:.1f}°F)"
    msg["From"] = addr
    msg["To"] = addr
    msg.set_content("\n".join(lines))
    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.mail.me.com", 465, context=ctx, timeout=10) as s:
            s.login(addr, pw)
            s.send_message(msg)
        print(f"Record email sent ({kind}): {new_temp}°C vs {prev_temp}°C")
    except Exception as e:
        print(f"Failed to send email: {e}")


CURRENT_FIELDS = [
    "temperature_2m", "windspeed_10m", "winddirection_10m", "weathercode", "is_day",
    "pressure_msl", "relative_humidity_2m", "cloud_cover",
]
FIELD_RENAME = {
    "temperature_2m": "temperature",
    "windspeed_10m": "windspeed",
    "winddirection_10m": "winddirection",
    "pressure_msl": "pressure",
    "relative_humidity_2m": "humidity",
}


def tick(state, url):
    try:
        data = requests.get(url, timeout=15).json()
    except requests.RequestException as e:
        print(f"Fetch failed, skipping tick: {e}")
        return False
    raw = data.get("current") or data.get("current_weather") or data
    # normalize field names to match weather.json's existing schema
    current = {}
    for k, v in raw.items():
        current[FIELD_RENAME.get(k, k)] = v
    temp = current.get("temperature")
    prev_max = state.get("max_temperature")
    prev_min = state.get("min_temperature")
    state["history"].append({"data": current, "timestamp": now()})
    update_extremes(state)
    if isinstance(temp, (int, float)):
        if isinstance(prev_max, (int, float)) and temp > prev_max:
            send_record_email("max", temp, prev_max, current, state)
        if isinstance(prev_min, (int, float)) and temp < prev_min:
            send_record_email("min", temp, prev_min, current, state)
    save(state)
    return True


def main():
    load_env()
    lat = os.environ["LATITUDE"]
    lon = os.environ["LONGITUDE"]
    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
        f"&current={','.join(CURRENT_FIELDS)}"
    )

    state = load()
    state["location"] = {"lat": float(lat), "lon": float(lon)}
    update_extremes(state)
    save(state)

    if os.environ.get("FORCE") == "1":
        tick(state, url)
    else:
        last_ts = None
        if state["history"]:
            last_ts = datetime.fromisoformat(state["history"][-1]["timestamp"])
        if last_ts is None or (datetime.now(timezone.utc) - last_ts).total_seconds() >= INTERVAL:
            tick(state, url)

    plot(state)


if __name__ == "__main__":
    main()
