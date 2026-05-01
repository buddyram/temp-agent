import { useRef } from 'react';
import { useCardHover } from '../hooks/useCardHover.js';
import { useLucide } from '../hooks/useLucide.js';
import { cToF, fmt, fmtTime } from '../utils/format.js';

export default function LowerPanels({ history, latest, maxC, minC, samples, startTime }) {
  const recentRef = useRef(null);
  const statsRef = useRef(null);
  useCardHover(recentRef);
  useCardHover(statsRef);
  useLucide([history, latest]);

  return (
    <div className="lower">
      <div ref={recentRef} className="card meta-card fade-in">
        <h3><i data-lucide="list"></i> Recent samples</h3>
        <div className="recent">
          {history.slice(-50).reverse().map((e, i) => {
            const t = e.data.temperature;
            const isMax = t === maxC;
            const isMin = t === minC;
            const cls = isMax ? 'is-max' : isMin ? 'is-min' : '';
            return (
              <div key={e.timestamp + ':' + i} className={`row ${cls}`}>
                <span className="t">{fmtTime(e.timestamp)}</span>
                <span className="temp">
                  {isMax && <i data-lucide="flame"></i>}
                  {isMin && <i data-lucide="snowflake"></i>}
                  {fmt(t)}°C / {fmt(cToF(t))}°F
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div ref={statsRef} className="card meta-card fade-in">
        <h3><i data-lucide="info"></i> Stats</h3>
        <div className="kv"><span className="k"><i data-lucide="clock"></i>Tracking since</span><span className="v">{fmtTime(startTime)}</span></div>
        <div className="kv"><span className="k"><i data-lucide="hash"></i>Total samples</span><span className="v">{samples}</span></div>
        <div className="kv"><span className="k"><i data-lucide="radio"></i>Latest reading</span><span className="v">{fmtTime(latest?.timestamp)}</span></div>
        <div className="kv"><span className="k"><i data-lucide="wind"></i>Wind speed</span><span className="v">{latest?.data?.windspeed ?? '—'} km/h</span></div>
        <div className="kv"><span className="k"><i data-lucide="compass"></i>Wind direction</span><span className="v">{latest?.data?.winddirection ?? '—'}°</span></div>
        <div className="kv"><span className="k"><i data-lucide="cloud"></i>Weather code</span><span className="v">{latest?.data?.weathercode ?? '—'}</span></div>
        <div className="kv"><span className="k"><i data-lucide="thermometer"></i>Range (°C)</span><span className="v">{fmt(minC)} → {fmt(maxC)}</span></div>
        <div className="kv"><span className="k"><i data-lucide="thermometer"></i>Range (°F)</span><span className="v">{fmt(cToF(minC))} → {fmt(cToF(maxC))}</span></div>
      </div>
    </div>
  );
}
