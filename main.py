import requests, json

URL = "https://api.open-meteo.com/v1/forecast?latitude=37.5&longitude=-122.0&current_weather=true"

data = requests.get(URL).json()
with open("weather.json", "w") as f:
    json.dump(data, f, indent=2)
