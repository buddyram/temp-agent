import json
import os
import time
from datetime import datetime, timezone

import requests

URL = "https://api.open-meteo.com/v1/forecast?latitude=37.5&longitude=-122.0&current_weather=true"
OUT = "weather.json"
INTERVAL = 3600


def now():
    return datetime.now(timezone.utc).isoformat()


def load():
    if os.path.exists(OUT):
        with open(OUT) as f:
            return json.load(f)
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
    while True:
        tick(state)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
