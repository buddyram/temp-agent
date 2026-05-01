import { useEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js';
import { useCardHover } from '../hooks/useCardHover.js';
import { useLucide } from '../hooks/useLucide.js';
import { fmtTime } from '../utils/format.js';
import { API_BASE } from '../config.js';

export default function ComparePanel({ currentModel, anchorIso, setAnchorIso }) {
  const cardRef = useRef(null);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [range, setRange] = useState(null);
  const [history, setHistory] = useState(null);
  const [metricsHtml, setMetricsHtml] = useState('');
  useCardHover(cardRef);
  useLucide([range]);

  // Load range + history once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rangeRes, histRes] = await Promise.all([
          fetch(`${API_BASE}/api/range`),
          fetch(`${API_BASE}/api/history?step=3`),
        ]);
        if (!rangeRes.ok || !histRes.ok) return;
        const r = await rangeRes.json();
        const h = await histRes.json();
        if (cancelled) return;
        setRange(r);
        setHistory(h.points.map(p => ({ x: new Date(p.timestamp), y: p.temperature })));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Build base chart whenever history loads
  useEffect(() => {
    if (!history || !range || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (chartRef.current) chartRef.current.destroy();

    const lastT = new Date(range.last).getTime();
    const xMax = lastT + 24 * 3600 * 1000;

    const invalidShade = {
      id: 'invalidShade',
      beforeDatasetsDraw(chart) {
        if (!range.earliest_anchor) return;
        const xLeft = chart.scales.x.left;
        const xCutoff = chart.scales.x.getPixelForValue(new Date(range.earliest_anchor).getTime());
        const top = chart.chartArea.top;
        const bottom = chart.chartArea.bottom;
        if (xCutoff <= xLeft) return;
        const c = chart.ctx;
        c.save();
        c.fillStyle = 'rgba(255,255,255,0.04)';
        c.fillRect(xLeft, top, xCutoff - xLeft, bottom - top);
        c.strokeStyle = 'rgba(255,255,255,0.18)'; c.setLineDash([4, 4]);
        c.beginPath(); c.moveTo(xCutoff, top); c.lineTo(xCutoff, bottom); c.stroke();
        c.fillStyle = '#8b94a8'; c.font = '11px Inter'; c.setLineDash([]);
        c.fillText('not enough history yet', xLeft + 8, top + 16);
        c.fillText('clickable range →', xCutoff + 8, top + 16);
        c.restore();
      }
    };
    const crosshair = {
      id: 'crosshair2',
      afterDraw(chart) {
        if (!chart._mouse) return;
        const { ctx, chartArea: { top, bottom, left, right } } = chart;
        const x = chart._mouse.x;
        if (x < left || x > right) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.restore();
      }
    };
    const glow = {
      id: 'glow2',
      beforeDatasetDraw(chart, args) {
        const c = chart.ctx;
        const ds = chart.data.datasets[args.index];
        c.save();
        c.shadowColor = ds.borderColor;
        c.shadowBlur = ds.borderDash ? 12 : 14;
      },
      afterDatasetDraw(chart) { chart.ctx.restore(); }
    };

    const chart = new Chart(ctx, {
      type: 'line',
      data: { datasets: [{
        label: 'History', data: history,
        borderColor: '#5fa8ff', backgroundColor: 'rgba(95,168,255,0.08)',
        borderWidth: 1.4, tension: 0.2,
        pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12, fill: true,
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        animation: { duration: 600, easing: 'easeOutQuart' },
        onClick: (evt, _els, c) => {
          const x = c.scales.x.getValueForPixel(evt.x);
          if (x == null) return;
          const earliest = range.earliest_anchor ? new Date(range.earliest_anchor).getTime() : -Infinity;
          const latest = new Date(range.last).getTime();
          const clamped = Math.min(Math.max(x, earliest), latest);
          setAnchorIso(new Date(clamped).toISOString());
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(13,16,24,0.96)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, padding: 12,
            titleColor: '#e9edf5', bodyColor: '#e9edf5',
            callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}°C` }
          }
        },
        scales: {
          x: { type: 'time', max: xMax,
               time: { tooltipFormat: 'PP HH:mm', displayFormats: { hour: 'MMM d', day: 'MMM d', month: 'MMM yyyy' } },
               grid: { color: 'rgba(255,255,255,0.04)' },
               ticks: { color: '#8b94a8', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
               border: { color: 'rgba(255,255,255,0.08)' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' },
               ticks: { color: '#8b94a8', callback: v => v + '°C' },
               border: { color: 'rgba(255,255,255,0.08)' } }
        }
      },
      plugins: [glow, invalidShade, crosshair]
    });
    chartRef.current = chart;

    let cmpRAF = null;
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      chart._mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (!cmpRAF) cmpRAF = requestAnimationFrame(() => { chart.draw(); cmpRAF = null; });
    }
    function onLeave() { chart._mouse = null; chart.draw(); }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.style.cursor = 'crosshair';

    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      chart.destroy();
      chartRef.current = null;
    };
  }, [history, range, setAnchorIso]);

  // Run prediction whenever anchor or model changes
  useEffect(() => {
    if (!anchorIso || !chartRef.current) return;
    let cancelled = false;
    setMetricsHtml('predicting…');
    (async () => {
      try {
        const url = `${API_BASE}/api/predict?datetime=${encodeURIComponent(anchorIso)}` + (currentModel ? `&model=${currentModel}` : '');
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) { setMetricsHtml(`error: ${data.error}`); return; }
        const chart = chartRef.current;
        if (!chart) return;
        const lastInput = data.input[data.input.length - 1];
        const anchorPoint = { x: new Date(lastInput.timestamp), y: lastInput.temperature };
        const predData = [anchorPoint, ...data.predicted.map(p => ({ x: new Date(p.timestamp), y: p.temperature }))];
        chart.data.datasets = chart.data.datasets.slice(0, 1);
        chart.data.datasets.push({
          label: 'Predicted', data: predData, borderColor: '#c084fc', borderWidth: 2.5, borderDash: [6, 4],
          tension: 0.3, pointRadius: 2.5, pointHoverRadius: 5, pointBackgroundColor: '#c084fc', fill: false,
        });
        if (data.actual) {
          const actData = [anchorPoint, ...data.actual.map(p => ({ x: new Date(p.timestamp), y: p.temperature }))];
          chart.data.datasets.push({
            label: 'Actual', data: actData, borderColor: '#6ee7a7', borderWidth: 2.5, tension: 0.3,
            pointRadius: 2.5, pointHoverRadius: 5, pointBackgroundColor: '#6ee7a7', fill: false,
          });
        }
        chart.update();
        const modelTag = data.model ? ` &nbsp;·&nbsp; model <b>${data.model}</b>` : '';
        if (data.metrics) {
          const m = data.metrics;
          setMetricsHtml(`anchor: <b>${fmtTime(data.anchor)}</b>${modelTag} &nbsp;·&nbsp; RMSE <b>${m.rmse.toFixed(2)}°C</b> &nbsp;·&nbsp; MAE <b>${m.mae.toFixed(2)}°C</b>`);
        } else {
          setMetricsHtml(`anchor: <b>${fmtTime(data.anchor)}</b>${modelTag} &nbsp;·&nbsp; <span style="color:var(--text-dim)">future not yet observed — forecast only</span>`);
        }
      } catch (e) {
        if (!cancelled) setMetricsHtml(`request failed: ${e.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [anchorIso, currentModel]);

  if (!range || !history) return null;

  function onRandom() {
    if (!range.earliest_anchor) return;
    const lo = new Date(range.earliest_anchor).getTime();
    const hi = new Date(range.last).getTime();
    setAnchorIso(new Date(lo + Math.random() * (hi - lo)).toISOString());
  }
  function onClear() {
    if (chartRef.current) {
      chartRef.current.data.datasets = chartRef.current.data.datasets.slice(0, 1);
      chartRef.current.update();
    }
    setMetricsHtml('');
    setAnchorIso(null);
  }

  return (
    <div ref={cardRef} className="card chart-card compare-card">
      <div className="chart-head">
        <div className="chart-title"><i data-lucide="sparkles"></i> Click any point in recorded history to predict from there</div>
        <div className="legend">
          <span className="ln">history</span>
          <span className="fcst">predicted (24h)</span>
          <span style={{color:'var(--good)'}}>actual</span>
        </div>
      </div>
      <div className="compare-controls">
        <button onClick={onRandom} className="secondary"><i data-lucide="shuffle"></i> Random point</button>
        <button onClick={onClear} className="secondary"><i data-lucide="x"></i> Clear strands</button>
        <span className="hint"><i data-lucide="mouse-pointer-click"></i> click anywhere on the chart · model picker is in the top-right</span>
      </div>
      <div className="chart-wrap" style={{height: 480}}><canvas ref={canvasRef} /></div>
      <div className="compare-metrics" dangerouslySetInnerHTML={{__html: metricsHtml}} />
    </div>
  );
}
