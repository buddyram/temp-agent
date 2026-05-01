import { useEffect, useRef } from 'react';
import { useLucide } from '../hooks/useLucide.js';

export default function Header({ status, models, currentModel, onModelChange }) {
  const showPicker = models && models.length > 0;
  useLucide([showPicker]);
  return (
    <header>
      <div className="brand">
        <div className="logo"><i data-lucide="thermometer"></i></div>
        <div>
          <h1>temp-agent</h1>
          <div className="subtitle">live temperature log · open-meteo</div>
        </div>
      </div>
      <div className="header-right">
        <label className={`global-picker${showPicker ? ' shown' : ''}`}>
          <i data-lucide="cpu"></i>
          <span className="gp-label">model</span>
          <select value={currentModel} onChange={e => onModelChange(e.target.value)}>
            {(models || []).map(m => {
              const rmse = m.best_val_rmse_c != null ? ` · ${m.best_val_rmse_c.toFixed(2)}°C` : '';
              return <option key={m.name} value={m.name}>{m.name}{rmse}</option>;
            })}
          </select>
        </label>
        <div className="pill"><span className="pulse"></span><span>{status}</span></div>
      </div>
    </header>
  );
}
