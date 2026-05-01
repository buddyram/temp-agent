import { useRef } from 'react';
import { useAnimateNumber } from '../hooks/useAnimateNumber.js';
import { useCardHover } from '../hooks/useCardHover.js';
import { useLucide } from '../hooks/useLucide.js';
import { cToF, fmt, fmtTime, fmtRel } from '../utils/format.js';

function Card({ tone, children }) {
  const ref = useRef(null);
  useCardHover(ref);
  return <div ref={ref} className={`card ${tone} fade-in`}>{children}</div>;
}

export default function StatCards({ history, latest, currentC, maxC, minC, samples, startTime }) {
  const curRef = useAnimateNumber(currentC, 1);
  const maxRef = useAnimateNumber(maxC, 1);
  const minRef = useAnimateNumber(minC, 1);
  const sampRef = useAnimateNumber(samples, 0);
  useLucide([currentC, maxC, minC, samples]);

  return (
    <div className="grid cards">
      <Card tone="neutral">
        <div className="icon"><i data-lucide="thermometer"></i></div>
        <div className="label">Current</div>
        <div className="value"><span ref={curRef}>{fmt(currentC)}</span>°<span style={{fontSize:24,color:'var(--text-dim)'}}>C</span></div>
        <div className="sub">{fmt(cToF(currentC))}°F · {fmtRel(latest?.timestamp)}</div>
      </Card>
      <Card tone="hot">
        <div className="icon"><i data-lucide="flame"></i></div>
        <div className="label">Record High</div>
        <div className="value"><span ref={maxRef}>{fmt(maxC)}</span>°<span style={{fontSize:24,opacity:0.6}}>C</span></div>
        <div className="sub">{fmt(cToF(maxC))}°F</div>
      </Card>
      <Card tone="cold">
        <div className="icon"><i data-lucide="snowflake"></i></div>
        <div className="label">Record Low</div>
        <div className="value"><span ref={minRef}>{fmt(minC)}</span>°<span style={{fontSize:24,opacity:0.6}}>C</span></div>
        <div className="sub">{fmt(cToF(minC))}°F</div>
      </Card>
      <Card tone="stats">
        <div className="icon"><i data-lucide="bar-chart-3"></i></div>
        <div className="label">Samples</div>
        <div className="value"><span ref={sampRef}>{samples}</span></div>
        <div className="sub">since {fmtTime(startTime)}</div>
      </Card>
    </div>
  );
}
