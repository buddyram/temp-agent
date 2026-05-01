import { useEffect, useState, useCallback } from 'react';

async function fetchOpenMeteo(loc) {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m&forecast_days=2`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const t = j.hourly?.time || [];
    const v = j.hourly?.temperature_2m || [];
    const now = Date.now();
    const cutoff = now + 24 * 3600 * 1000;
    return t.map((ts, i) => ({ x: new Date(ts + 'Z'), y: v[i] }))
            .filter(p => typeof p.y === 'number' && p.x.getTime() >= now && p.x.getTime() <= cutoff);
  } catch { return null; }
}

export function useWeather() {
  const [state, setState] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [openMeteo, setOpenMeteo] = useState(null);
  const [status, setStatus] = useState('loading…');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [stateRes, fcstRes] = await Promise.all([
        fetch(`outputs/weather.json?t=${Date.now()}`),
        fetch(`outputs/forecast.json?t=${Date.now()}`).catch(() => null),
      ]);
      if (!stateRes.ok) throw new Error(`HTTP ${stateRes.status}`);
      const s = await stateRes.json();
      let f = null;
      if (fcstRes && fcstRes.ok) {
        try { f = await fcstRes.json(); } catch {}
      }
      const om = await fetchOpenMeteo(s.location);
      setState(s);
      setForecast(f);
      setOpenMeteo(om);
      setStatus('live');
      setError(null);
    } catch (e) {
      setError(e.message);
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  return { state, forecast, openMeteo, status, error, setForecast };
}
