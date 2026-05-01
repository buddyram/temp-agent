import { useRef } from 'react';
import NeuralViz from './NeuralViz.jsx';
import { useCardHover } from '../hooks/useCardHover.js';
import { useLucide } from '../hooks/useLucide.js';
import { MODEL_INFO } from '../utils/models.js';

export default function ModelCard({ currentModel, models }) {
  const ref = useRef(null);
  useCardHover(ref);
  useLucide([currentModel]);
  const info = MODEL_INFO[currentModel] || MODEL_INFO.lstm;
  const m = (models || []).find(x => x.name === currentModel);
  const rmseTag = m && m.best_val_rmse_c != null ? `· val RMSE ${m.best_val_rmse_c.toFixed(2)}°C` : '';

  return (
    <div ref={ref} className="card model-card">
      <h3>
        <i data-lucide="brain-circuit"></i> Model architecture
        <span style={{fontSize:12, color:'var(--text-dim)', fontFamily:"'JetBrains Mono', monospace", fontWeight:500, marginLeft:8}}>
          {rmseTag}
        </span>
      </h3>
      <div className="model-sub">{info.label} · predicts residual over next 24h</div>
      <div className="model-canvas-wrap">
        <NeuralViz modelName={currentModel} />
        <div className="model-labels">
          {info.nodeLabels.map(([n, t]) => (
            <span key={n}><b>{n}</b>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
