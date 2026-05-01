import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { useCardHover } from '../hooks/useCardHover.js';
import { useLucide } from '../hooks/useLucide.js';
import { cToF, fmtTime } from '../utils/format.js';
import { MODEL_INFO } from '../utils/models.js';

Chart.register(...registerables);

export default function ChartCard({ history, maxC, minC, forecast, openMeteo, currentModel }) {
  const cardRef = useRef(null);
  const canvasRef = useRef(null);
  useCardHover(cardRef);
  useLucide([forecast, openMeteo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const GAP_MS = 60 * 60 * 1000;
    const raw = history.map(e => ({ x: new Date(e.timestamp), y: e.data.temperature }));
    const data = [];
    for (let i = 0; i < raw.length; i++) {
      if (i > 0 && raw[i].x - raw[i - 1].x > GAP_MS) data.push({ x: new Date(raw[i - 1].x.getTime() + 1), y: NaN });
      data.push(raw[i]);
    }
    const grad = ctx.createLinearGradient(0, 0, 0, 420);
    grad.addColorStop(0, 'rgba(255,122,89,0.45)');
    grad.addColorStop(1, 'rgba(255,122,89,0)');

    const glow = {
      id: 'glow',
      beforeDatasetDraw(chart, args) {
        const c = chart.ctx;
        const ds = chart.data.datasets[args.index];
        c.save();
        c.shadowColor = ds.borderColor;
        c.shadowBlur = ds.borderDash ? 12 : 16;
      },
      afterDatasetDraw(chart) { chart.ctx.restore(); }
    };

    const recordLines = {
      id: 'recordLines',
      afterDraw(chart) {
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        if (typeof maxC === 'number') {
          const yMax = y.getPixelForValue(maxC);
          ctx.strokeStyle = 'rgba(255,93,93,0.6)';
          ctx.shadowColor = 'rgba(255,93,93,0.8)'; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.moveTo(left, yMax); ctx.lineTo(right, yMax); ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ff5d5d'; ctx.font = '11px Inter';
          ctx.fillText(`max ${maxC}°C`, left + 6, yMax - 4);
        }
        if (typeof minC === 'number') {
          const yMin = y.getPixelForValue(minC);
          ctx.strokeStyle = 'rgba(95,182,255,0.6)';
          ctx.shadowColor = 'rgba(95,182,255,0.8)'; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.moveTo(left, yMin); ctx.lineTo(right, yMin); ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#5fb6ff'; ctx.font = '11px Inter';
          ctx.fillText(`min ${minC}°C`, left + 6, yMin + 14);
        }
        ctx.restore();
      }
    };

    const crosshair = {
      id: 'crosshair',
      afterDraw(chart) {
        if (!chart._mouse) return;
        const { ctx, chartArea: { top, bottom, left, right } } = chart;
        const x = chart._mouse.x;
        if (x < left || x > right) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.restore();
      }
    };

    const datasets = [{
      label: 'Temp °C', data,
      borderColor: '#ff7a59', backgroundColor: grad,
      borderWidth: 2.5, tension: 0.35,
      pointRadius: 0, pointHoverRadius: 6,
      pointHoverBackgroundColor: '#ff7a59', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
      fill: true, spanGaps: false,
    }];

    if (forecast && forecast.predictions?.length) {
      const lastActual = data[data.length - 1];
      const fcData = forecast.predictions.map(p => ({ x: new Date(p.timestamp), y: p.temperature }));
      if (lastActual) fcData.unshift(lastActual);
      datasets.push({
        label: 'Forecast', data: fcData,
        borderColor: '#c084fc', backgroundColor: 'rgba(192,132,252,0.08)',
        borderWidth: 2, borderDash: [6, 4], tension: 0.3,
        pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: '#c084fc', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        fill: false,
      });
    }
    if (openMeteo && openMeteo.length) {
      datasets.push({
        label: 'Open-Meteo', data: openMeteo,
        borderColor: '#5fb6ff', backgroundColor: 'rgba(95,182,255,0.06)',
        borderWidth: 2, borderDash: [2, 4], tension: 0.3,
        pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: '#5fb6ff', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
        fill: false,
      });
    }

    const chart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(13,16,24,0.96)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, padding: 12,
            titleColor: '#e9edf5', bodyColor: '#e9edf5', titleFont: { weight: 600 },
            callbacks: { label: c => `${c.parsed.y.toFixed(1)}°C / ${cToF(c.parsed.y).toFixed(1)}°F` }
          },
        },
        scales: {
          x: { type: 'time',
               time: { tooltipFormat: 'PP HH:mm', displayFormats: { hour: 'MMM d HH:mm', day: 'MMM d' } },
               grid: { color: 'rgba(255,255,255,0.04)' },
               ticks: { color: '#8b94a8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
               border: { color: 'rgba(255,255,255,0.08)' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' },
               ticks: { color: '#8b94a8', callback: v => v + '°C' },
               border: { color: 'rgba(255,255,255,0.08)' } }
        }
      },
      plugins: [glow, recordLines, crosshair]
    });

    let chartRAF = null;
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      chart._mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (!chartRAF) chartRAF = requestAnimationFrame(() => { chart.draw(); chartRAF = null; });
    }
    function onLeave() { chart._mouse = null; chart.draw(); }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.style.cursor = 'crosshair';

    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      chart.destroy();
    };
  }, [history, maxC, minC, forecast, openMeteo]);

  const fcModel = MODEL_INFO[currentModel]?.fullName || 'LSTM';

  return (
    <div ref={cardRef} className="card chart-card fade-in">
      <div className="chart-head">
        <div className="chart-title"><i data-lucide="activity"></i> Temperature over time</div>
        <div className="legend">
          <span className="ln">temp</span>
          <span className="max">record high</span>
          <span className="min">record low</span>
          {forecast && <span className="fcst">forecast (24h)</span>}
          {openMeteo && <span className="om">Open-Meteo forecast</span>}
        </div>
      </div>
      <div className="chart-wrap"><canvas ref={canvasRef} /></div>
      {forecast && (
        <div className="forecast-note">
          forecast generated {fmtTime(forecast.generated_at)} · {fcModel} trained on 2y of history
        </div>
      )}
    </div>
  );
}
