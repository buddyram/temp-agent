import { useEffect, useState, useCallback } from 'react';
import ParticlesBg from './components/ParticlesBg.jsx';
import CursorLight from './components/CursorLight.jsx';
import Header from './components/Header.jsx';
import StatCards from './components/StatCards.jsx';
import ChartCard from './components/ChartCard.jsx';
import SceneCard from './components/SceneCard.jsx';
import LowerPanels from './components/LowerPanels.jsx';
import ComparePanel from './components/ComparePanel.jsx';
import ModelCard from './components/ModelCard.jsx';
import ShowdownPanel from './components/ShowdownPanel.jsx';
import Slideshow from './components/Slideshow.jsx';
import { useWeather } from './hooks/useWeather.js';
import { useLucide } from './hooks/useLucide.js';
import { API_BASE } from './config.js';

export default function App() {
  const { state, forecast, openMeteo, status, error, setForecast } = useWeather();
  const [models, setModels] = useState([]);
  const [currentModel, setCurrentModel] = useState('lstm');
  const [range, setRange] = useState(null);
  const [anchorIso, setAnchorIso] = useState(null);
  const [backendWarming, setBackendWarming] = useState(false);
  useLucide([state, currentModel, models, backendWarming]);

  // Fetch /api/models and /api/range with 10s retry — Cloud Run cold-starts
  // on free tier, so the first request after idle can hang or timeout.
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let attempts = 0;
    async function tryOnce() {
      attempts++;
      try {
        const [mr, rr] = await Promise.all([
          fetch(`${API_BASE}/api/models`),
          fetch(`${API_BASE}/api/range`),
        ]);
        if (!mr.ok || !rr.ok) throw new Error('bad status');
        const m = await mr.json();
        const j = await rr.json();
        if (cancelled) return;
        setModels(m.models || []);
        setCurrentModel(m.default || 'lstm');
        setRange(j);
        setBackendWarming(false);
      } catch {
        if (cancelled) return;
        if (attempts === 1) setBackendWarming(true);
        timer = setTimeout(tryOnce, 10000);
      }
    }
    tryOnce();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  // when model changes, re-fetch forecast against new model (if serve.py is running)
  const onModelChange = useCallback(async (name) => {
    setCurrentModel(name);
    if (!state || !state.history || !state.history.length) return;
    try {
      const lastT = state.history[state.history.length - 1].timestamp;
      const r = await fetch(`${API_BASE}/api/predict?datetime=${encodeURIComponent(lastT)}&model=${name}`);
      if (!r.ok) return;
      const d = await r.json();
      if (!d.error && d.predicted) {
        setForecast({
          generated_at: new Date().toISOString(),
          input_last_timestamp: lastT,
          predictions: d.predicted,
          model: name,
        });
      }
    } catch {}
  }, [state, setForecast]);

  const history = (state?.history || []).filter(e => typeof e?.data?.temperature === 'number');
  const latest = history[history.length - 1];
  const currentC = latest?.data?.temperature;
  const maxC = state?.max_temperature;
  const minC = state?.min_temperature;
  const samples = history.length;

  return (
    <>
      <ParticlesBg />
      <CursorLight />
      <div className="wrap">
        <Header status={status} models={models} currentModel={currentModel} onModelChange={onModelChange} />
        {backendWarming && (
          <div className="warming-banner">
            <span className="warming-spinner" /> warming up backend… <span className="warming-sub">(cold-start can take a few seconds)</span>
          </div>
        )}
        {error ? (
          <div className="err">Failed to load <code>outputs/weather.json</code>: {error}</div>
        ) : !state ? (
          <div className="loading">Loading weather data…</div>
        ) : (
          <>
            <StatCards
              history={history}
              latest={latest}
              currentC={currentC}
              maxC={maxC}
              minC={minC}
              samples={samples}
              startTime={state.start_time}
            />
            <ChartCard
              history={history}
              maxC={maxC}
              minC={minC}
              forecast={forecast}
              openMeteo={openMeteo}
              currentModel={currentModel}
            />
            <SceneCard latest={latest} />
            <LowerPanels
              history={history}
              latest={latest}
              maxC={maxC}
              minC={minC}
              samples={samples}
              startTime={state.start_time}
            />
          </>
        )}

        {range && (
          <ComparePanel
            currentModel={currentModel}
            anchorIso={anchorIso}
            setAnchorIso={setAnchorIso}
          />
        )}

        <ModelCard currentModel={currentModel} models={models} />

        {models.length > 0 && range && (
          <ShowdownPanel
            models={models}
            currentModel={currentModel}
            onModelChange={onModelChange}
            range={range}
          />
        )}

        <Slideshow currentModel={currentModel} models={models} />

        <footer>
          Data: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> ·
          Source: <a href="https://github.com/buddyram/temp-agent" target="_blank" rel="noopener">github.com/buddyram/temp-agent</a>
          <div className="made-by">made by <a href="https://www.buddyram.com" target="_blank" rel="noopener">Ram Stewart</a></div>
        </footer>
      </div>
    </>
  );
}
