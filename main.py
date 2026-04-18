import json
import os
from datetime import datetime, timedelta, timezone

import requests

URL = "https://api.open-meteo.com/v1/forecast?latitude=37.5&longitude=-122.0&current_weather=true"
OUT = "weather.json"
INTERVAL = 3600
ITERATIONS = 24


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


def tick(state):
    data = requests.get(URL).json()
    state["history"].append({"data": data.get("current_weather", data), "timestamp": now()})
    save(state)


def main():
    state = load()
    start = datetime.fromisoformat(state["start_time"])
    for k in range(len(state["history"]), ITERATIONS):
        target = start + timedelta(seconds=k * INTERVAL)
        if target > datetime.now(timezone.utc):
            break
        tick(state)


if __name__ == "__main__":
    main()
