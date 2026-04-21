# temp-agent

A tiny weather-logging bot that runs in GitHub Actions. Every 30 minutes an external cron (cron-job.org) pings the `fetch-weather` workflow, which fetches the current temperature from [Open-Meteo](https://open-meteo.com) for a fixed lat/lon, appends it to `outputs/weather.json`, regenerates a temperature-vs-time chart (`outputs/image.png`), and commits the changes back to the repo. When the temperature breaks a stored max or min record it also sends a record-notification email via iCloud SMTP.

## How it works

1. `main.py` runs inside the `fetch-weather` workflow. It loads `outputs/weather.json` (or initializes fresh state if absent), computes the next scheduled tick as `start_time + k * INTERVAL`, and appends new samples for any targets whose time has passed.
2. Each tick records `{data: <current_weather>, timestamp: <now UTC>}`, recomputes `max_temperature` / `min_temperature`, and — if the new reading beats the previous max or min — sends a record email.
3. After ticking, it regenerates a pandas + matplotlib plot of temperature vs time.
4. The workflow commits `outputs/weather.json` and `outputs/image.png` back to `main` if either changed.

The `archive-weather` workflow is a manual button: it snapshots `outputs/weather.json` and `outputs/image.png` into `outputs/archives/weather<UTC_TIMESTAMP>/` and clears the active pair so the next `fetch-weather` run starts with a fresh `start_time`.

## Layout

```
.
├── main.py                          # fetch, record, plot
├── requirements.txt                 # requests, pandas, matplotlib
├── .github/workflows/
│   ├── fetch-weather.yml            # triggered by cron-job.org (workflow_dispatch)
│   └── archive-weather.yml          # manual snapshot + reset
└── outputs/
    ├── weather.json                 # current active dataset
    ├── image.png                    # current plot
    └── archives/
        └── weather<TIMESTAMP>/
            ├── weather.json
            └── image.png
```

## Configuration

Locally, create `.env.local` (gitignored) with:

```
LATITUDE=<float>
LONGITUDE=<float>
EMAIL_ADDRESS=<icloud address>
EMAIL_PASSWORD=<icloud app-specific password>
```

For Actions, set the same four as GitHub repository secrets. The workflow injects them as env vars for `main.py`.

## Triggering

- **Scheduled runs**: cron-job.org hits the `fetch-weather.yml` `workflow_dispatch` endpoint every 30 min. GitHub's own cron scheduler is too unreliable for sub-hourly cadence, which is why triggering is offloaded.
- **Manual runs**: use the Actions UI to run `fetch-weather` (with optional `force` input to tick regardless of schedule) or `archive-weather` (to snapshot + reset).

## Notes

- `INTERVAL = 1800` (30 min) in `main.py` determines the spacing between scheduled ticks; `start_time` in `weather.json` is the anchor. Change one and you may want to align the cron-job.org schedule with it.
- The script catches up any slots missed since `start_time`, so occasional scheduler gaps don't lose data — they just compress timestamps of the recovered samples.
- Open-Meteo's `current_weather` only refreshes every 15 minutes, so polling faster than that yields duplicates.
