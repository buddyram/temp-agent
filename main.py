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
INTERVAL = 1800
ITERATIONS = 48


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


def send_record_email(kind, new_temp, prev_temp):
    addr = os.environ.get("EMAIL_ADDRESS")
    pw = os.environ.get("EMAIL_PASSWORD")
    if not addr or not pw:
        print("Email creds missing, skipping notification")
        return
    msg = EmailMessage()
    msg["Subject"] = f"New {kind} temperature record: {new_temp}°C"
    msg["From"] = addr
    msg["To"] = addr
    msg.set_content(f"New {kind} record: {new_temp}°C (previous {kind}: {prev_temp}°C)")
    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.mail.me.com", 465, context=ctx) as s:
            s.login(addr, pw)
            s.send_message(msg)
        print(f"Record email sent ({kind}): {new_temp}°C vs {prev_temp}°C")
    except Exception as e:
        print(f"Failed to send email: {e}")


def tick(state, url):
    data = requests.get(url).json()
    current = data.get("current_weather", data)
    temp = current.get("temperature")
    prev_max = state.get("max_temperature")
    prev_min = state.get("min_temperature")
    state["history"].append({"data": current, "timestamp": now()})
    update_extremes(state)
    if isinstance(temp, (int, float)):
        if isinstance(prev_max, (int, float)) and temp > prev_max:
            send_record_email("max", temp, prev_max)
        if isinstance(prev_min, (int, float)) and temp < prev_min:
            send_record_email("min", temp, prev_min)
    save(state)


def main():
    load_env()
    lat = os.environ["LATITUDE"]
    lon = os.environ["LONGITUDE"]
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"

    state = load()
    update_extremes(state)
    save(state)

    if os.environ.get("FORCE") == "1":
        tick(state, url)
    else:
        start = datetime.fromisoformat(state["start_time"])
        for k in range(len(state["history"]), ITERATIONS):
            target = start + timedelta(seconds=k * INTERVAL)
            if target > datetime.now(timezone.utc):
                break
            tick(state, url)

    plot(state)


if __name__ == "__main__":
    main()
