import { useEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js';
import { useCardHover } from '../hooks/useCardHover.js';
import { useLucide } from '../hooks/useLucide.js';
import { fmtTime } from '../utils/format.js';
import { MODEL_COLORS } from '../utils/models.js';

export default function ShowdownPanel({ models, currentModel, onModelChange, range }) {
  const cardRef = useRef(null);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [anchorIso, setAnchorIso] = useState(null);
  const [anchorHtml, setAnchorHtml] = useState('');
  const [legend, setLegend] = useState([]);
  const [sort, setSort] = useState({ key: 'val_rmse_c', asc: true });
  useCardHover(cardRef);
  useLucide([models, legend]);

  // Initialize anchor to latest when range loads
  useEffect(() => {
    if (range && range.last && !anchorIso) setAnchorIso(range.last);
  }, [range, anchorIso]);

  // Build the empty chart once
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (chartRef.current) chartRef.current.destroy();

    const glow = {
      id: 'showdownGlow',
      beforeDatasetDraw(chart, args) {
        const c = chart.ctx;
        const ds = chart.data.datasets[args.index];
        c.save();
        c.shadowColor = ds.borderColor;
        c.shadowBlur = ds.borderDash ? 10 : 14;
      },
      afterDatasetDraw(chart) { chart.ctx.restore(); }
    };

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        animation: { duration: 500, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(13,16,24,0.96)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, padding: 12,
            titleColor: '#e9edf5', bodyColor: '#e9edf5',
            callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}°C` }
          }
        },
        scales: {
          x: { type: 'time',
               time: { tooltipFormat: 'PP HH:mm', displayFormats: { hour: 'HH:mm', day: 'MMM d' } },
               grid: { color: 'rgba(255,255,255,0.04)' },
               ticks: { color: '#8b94a8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
               border: { color: 'rgba(255,255,255,0.08)' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' },
               ticks: { color: '#8b94a8', callback: v => v + '°C' },
               border: { color: 'rgba(255,255,255,0.08)' } }
        }
      },
      plugins: [glow]
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, []);

  // Run prediction whenever anchor changes
  useEffect(() => {
    if (!anchorIso) return;
    let cancelled = false;
    setAnchorHtml('predicting…');
    (async () => {
      try {
        const res = await fetch(`/api/predict_all?datetime=${encodeURIComponent(anchorIso)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) { setAnchorHtml(`error: ${data.error}`); return; }
        const inputData = data.input.map(p => ({ x: new Date(p.timestamp), y: p.temperature }));
        const lastInput = data.input[data.input.length - 1];
        const anchorPoint = { x: new Date(lastInput.timestamp), y: lastInput.temperature };

        const datasets = [{
          label: 'history (input 48h)', data: inputData,
          borderColor: '#5fa8ff', backgroundColor: 'rgba(95,168,255,0.06)',
          borderWidth: 1.5, tension: 0.25, pointRadius: 0, pointHoverRadius: 3, fill: true,
        }];

        const sw = [{ kind: 'history' }];
        Object.entries(data.models).forEach(([name, mres]) => {
          const color = MODEL_COLORS[name] || '#c084fc';
          const predData = [anchorPoint, ...mres.predicted.map(p => ({ x: new Date(p.timestamp), y: p.temperature }))];
          datasets.push({
            label: name + (mres.metrics ? ` (RMSE ${mres.metrics.rmse.toFixed(2)})` : ''),
            data: predData, borderColor: color, borderWidth: 2.2, borderDash: [6, 4],
            tension: 0.3, pointRadius: 2, pointHoverRadius: 5, pointBackgroundColor: color, fill: false,
          });
          const tag = mres.metrics
            ? `${name} · RMSE ${mres.metrics.rmse.toFixed(2)}°C · MAE ${mres.metrics.mae.toFixed(2)}°C`
            : name;
          sw.push({ kind: 'model', color, tag });
        });
        if (data.actual) {
          const actData = [anchorPoint, ...data.actual.map(p => ({ x: new Date(p.timestamp), y: p.temperature }))];
          datasets.push({
            label: 'actual', data: actData, borderColor: '#6ee7a7', borderWidth: 2.8,
            tension: 0.3, pointRadius: 2.5, pointHoverRadius: 5, pointBackgroundColor: '#6ee7a7', fill: false,
          });
          sw.push({ kind: 'actual' });
        }
        if (chartRef.current) {
          chartRef.current.data.datasets = datasets;
          chartRef.current.update();
        }
        setLegend(sw);
        const isLive = !data.actual;
        setAnchorHtml(`anchor: <b>${fmtTime(data.anchor)}</b>` + (isLive ? ` · <span style="color:var(--text-dim)">forecast only (no actual yet)</span>` : ''));
      } catch (e) {
        if (!cancelled) setAnchorHtml(`request failed: ${e.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [anchorIso]);

  if (!models || !models.length || !range) return null;

  function onRandom() {
    if (!range.earliest_anchor) return;
    const lo = new Date(range.earliest_anchor).getTime();
    const hi = new Date(range.last).getTime();
    setAnchorIso(new Date(lo + Math.random() * (hi - lo)).toISOString());
  }
  function onLatest() { setAnchorIso(range.last); }

  // leaderboard sort
  const sorted = [...models].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    if (typeof av === 'string') return sort.asc ? av.localeCompare(bv) : bv.localeCompare(av);
    if (av == null) return 1;
    if (bv == null) return -1;
    return sort.asc ? (av - bv) : (bv - av);
  });
  const numericKeys = ['val_rmse_c','val_mae_c','train_rmse_c','overfit_ratio','n_params','best_epoch'];
  const bests = {}, worsts = {};
  numericKeys.forEach(k => {
    const vals = models.map(m => m[k]).filter(v => v != null);
    if (!vals.length) return;
    bests[k] = Math.min(...vals);
    worsts[k] = Math.max(...vals);
  });
  const ofVals = models.map(m => m.overfit_ratio).filter(v => v != null);
  if (ofVals.length) {
    bests.overfit_ratio = ofVals.reduce((a, b) => Math.abs(b - 1) < Math.abs(a - 1) ? b : a);
    worsts.overfit_ratio = ofVals.reduce((a, b) => Math.abs(b - 1) > Math.abs(a - 1) ? b : a);
  }
  function fmtCell(v, k) {
    if (v == null) return '—';
    if (k === 'n_params') return v.toLocaleString();
    if (k === 'best_epoch') return v;
    return v.toFixed(k === 'overfit_ratio' ? 2 : 3);
  }
  function cellClass(v, k) {
    if (v == null) return '';
    if (v === bests[k]) return 'best';
    if (v === worsts[k]) return 'worst';
    return '';
  }
  const bestRmseModel = models.reduce(
    (a, b) => (a.val_rmse_c == null ? b : (b.val_rmse_c != null && b.val_rmse_c < a.val_rmse_c ? b : a)),
    models[0],
  ).name;

  function clickHeader(k) {
    setSort(s => s.key === k ? { key: k, asc: !s.asc } : { key: k, asc: true });
  }

  const ths = [
    { key: 'name', label: 'model', num: false },
    { key: 'val_rmse_c', label: 'val\u00a0RMSE', num: true },
    { key: 'val_mae_c', label: 'val\u00a0MAE', num: true },
    { key: 'train_rmse_c', label: 'train\u00a0RMSE', num: true },
    { key: 'overfit_ratio', label: 'overfit', num: true },
    { key: 'n_params', label: 'params', num: true },
    { key: 'best_epoch', label: 'epochs', num: true },
  ];

  return (
    <div ref={cardRef} className="card showdown-card">
      <div className="showdown-head">
        <h3><i data-lucide="trophy"></i> Model showdown</h3>
        <div className="showdown-sub">Every model on the same anchor — overlaid forecast lines plus a leaderboard ranking by error and overfit.</div>
      </div>
      <div className="showdown-grid">
        <div className="showdown-chart-wrap">
          <div className="showdown-controls">
            <button onClick={onRandom} className="secondary"><i data-lucide="shuffle"></i> Random anchor</button>
            <button onClick={onLatest} className="secondary"><i data-lucide="clock-3"></i> Latest live</button>
            <span className="showdown-anchor" dangerouslySetInnerHTML={{__html: anchorHtml}} />
          </div>
          <div className="chart-wrap" style={{height: 380}}><canvas ref={canvasRef} /></div>
          <div className="showdown-legend">
            {legend.map((l, i) => {
              if (l.kind === 'history') return <span key={i} className="swatch history">history</span>;
              if (l.kind === 'actual') return <span key={i} className="swatch actual">actual</span>;
              return <span key={i} className="swatch" style={{'--c': l.color}}>{l.tag}</span>;
            })}
          </div>
        </div>
        <div className="leaderboard-wrap">
          <div className="leaderboard-title"><i data-lucide="list-ordered"></i> Leaderboard</div>
          <div className="leaderboard-hint">click a column to sort · lower is better for error · ratio near 1.0 = no overfit</div>
          <table className="leaderboard">
            <thead>
              <tr>
                {ths.map(th => (
                  <th key={th.key}
                      className={(th.num ? 'num ' : '') + (sort.key === th.key ? 'sorted ' : '') + (sort.asc ? 'asc' : '')}
                      onClick={() => clickHeader(th.key)}>{th.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => {
                const color = MODEL_COLORS[m.name] || '#5fa8ff';
                const rank = m.name === bestRmseModel ? 'rank-1' : '';
                const isCurrent = m.name === currentModel ? 'row-current' : '';
                return (
                  <tr key={m.name} className={`${rank} ${isCurrent}`}>
                    <td className="model-cell" style={{'--c': color}} onClick={() => onModelChange(m.name)}>
                      <span className="dot"></span>{m.name}
                    </td>
                    <td className={'num ' + cellClass(m.val_rmse_c, 'val_rmse_c')}>{fmtCell(m.val_rmse_c, 'val_rmse_c')}°C</td>
                    <td className={'num ' + cellClass(m.val_mae_c, 'val_mae_c')}>{fmtCell(m.val_mae_c, 'val_mae_c')}°C</td>
                    <td className={'num ' + cellClass(m.train_rmse_c, 'train_rmse_c')}>{fmtCell(m.train_rmse_c, 'train_rmse_c')}°C</td>
                    <td className={'num ' + cellClass(m.overfit_ratio, 'overfit_ratio')}>{fmtCell(m.overfit_ratio, 'overfit_ratio')}</td>
                    <td className="num">{fmtCell(m.n_params, 'n_params')}</td>
                    <td className="num">{fmtCell(m.best_epoch, 'best_epoch')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
