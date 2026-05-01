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

export default function App() {
  const { state, forecast, openMeteo, status, error, setForecast } = useWeather();
  const [models, setModels] = useState([]);
  const [currentModel, setCurrentModel] = useState('lstm');
  const [range, setRange] = useState(null);
  const [anchorIso, setAnchorIso] = useState(null);
  useLucide([state, currentModel, models]);

  // initial fetch of /api/models — if it fails, serve.py isn't running
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/models');
        if (!r.ok) throw new Error();
        const m = await r.json();
        if (cancelled) return;
        setModels(m.models || []);
        setCurrentModel(m.default || 'lstm');
      } catch {}
    })();
    (async () => {
      try {
        const r = await fetch('/api/range');
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setRange(j);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // when model changes, re-fetch forecast against new model (if serve.py is running)
  const onModelChange = useCallback(async (name) => {
    setCurrentModel(name);
    if (!state || !state.history || !state.history.length) return;
    try {
      const lastT = state.history[state.history.length - 1].timestamp;
      const r = await fetch(`/api/predict?datetime=${encodeURIComponent(lastT)}&model=${name}`);
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
        </footer>
      </div>
    </>
  );
}
