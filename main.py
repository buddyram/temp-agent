import json
import os
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import requests

OUT = "weather.json"
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
    with open(OUT, "w") as f:
        json.dump(state, f, indent=2)


def update_max(state):
    temps = [e["data"].get("temperature") for e in state["history"]]
    temps = [t for t in temps if isinstance(t, (int, float))]
    if temps:
        state["max_temperature"] = max(temps)


def send_record_email(new_temp, prev_max):
    addr = os.environ.get("EMAIL_ADDRESS")
    pw = os.environ.get("EMAIL_PASSWORD")
    if not addr or not pw:
        print("Email creds missing, skipping notification")
        return
    msg = EmailMessage()
    msg["Subject"] = f"New max temperature record: {new_temp}°C"
    msg["From"] = addr
    msg["To"] = addr
    msg.set_content(f"New record: {new_temp}°C (previous max: {prev_max}°C)")
    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.mail.me.com", 465, context=ctx) as s:
            s.login(addr, pw)
            s.send_message(msg)
        print(f"Record email sent: {new_temp}°C > {prev_max}°C")
    except Exception as e:
        print(f"Failed to send email: {e}")


def tick(state, url):
    data = requests.get(url).json()
    current = data.get("current_weather", data)
    temp = current.get("temperature")
    prev_max = state.get("max_temperature")
    state["history"].append({"data": current, "timestamp": now()})
    update_max(state)
    if isinstance(temp, (int, float)) and isinstance(prev_max, (int, float)) and temp > prev_max:
        send_record_email(temp, prev_max)
    save(state)


def main():
    load_env()
    lat = os.environ["LATITUDE"]
    lon = os.environ["LONGITUDE"]
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"

    state = load()
    update_max(state)
    save(state)

    start = datetime.fromisoformat(state["start_time"])
    for k in range(len(state["history"]), ITERATIONS):
        target = start + timedelta(seconds=k * INTERVAL)
        if target > datetime.now(timezone.utc):
            break
        tick(state, url)


if __name__ == "__main__":
    main()
