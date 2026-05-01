import { useEffect, useRef, useState } from 'react';
import { useCardHover } from '../hooks/useCardHover.js';
import { useLucide } from '../hooks/useLucide.js';
import { MODEL_INFO } from '../utils/models.js';

const SLIDE_MS = 7000;

export default function Slideshow({ currentModel, models }) {
  const cardRef = useRef(null);
  const stageRef = useRef(null);
  const progRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const autoRef = useRef(true);
  const elapsedRef = useRef(0);
  useCardHover(cardRef);
  const info = MODEL_INFO[currentModel] || MODEL_INFO.lstm;
  const m = (models || []).find(x => x.name === currentModel);
  const trainRmse = m && m.best_val_rmse_c != null ? `~${m.best_val_rmse_c.toFixed(2)}°C RMSE` : '~1.94°C RMSE';
  useLucide([idx, currentModel]);

  // auto-advance + key/hover handling
  useEffect(() => {
    let raf, last = performance.now();
    function tick(now) {
      const dt = now - last;
      last = now;
      if (autoRef.current) {
        elapsedRef.current += dt;
        if (progRef.current) progRef.current.style.width = Math.min(100, (elapsedRef.current / SLIDE_MS) * 100) + '%';
        if (elapsedRef.current >= SLIDE_MS) {
          elapsedRef.current = 0;
          setIdx(i => (i + 1) % 7);
        }
      } else if (progRef.current) {
        progRef.current.style.width = '0%';
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    function onKey(e) {
      if (!stageRef.current) return;
      const r = stageRef.current.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      if (e.key === 'ArrowRight') goTo(idx + 1, true);
      else if (e.key === 'ArrowLeft') goTo(idx - 1, true);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  function goTo(i, fromUser) {
    setIdx(((i % 7) + 7) % 7);
    elapsedRef.current = 0;
    if (fromUser) autoRef.current = false;
  }
  function onEnter() { autoRef.current = false; }
  function onLeave() { autoRef.current = true; elapsedRef.current = 0; }

  return (
    <div ref={cardRef} className="card pipeline-card">
      <h3><i data-lucide="sparkles"></i> How it works</h3>
      <div className="pipeline-sub">end-to-end pipeline · click dots, arrows, or use ← / → keys · auto-advances</div>
      <div className="pipeline-stage" ref={stageRef} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        <Slide active={idx === 0} i={0} />
        <Slide active={idx === 1} i={1} />
        <Slide active={idx === 2} i={2} info={info} trainRmse={trainRmse} />
        <Slide active={idx === 3} i={3} />
        <Slide active={idx === 4} i={4} />
        <Slide active={idx === 5} i={5} />
        <Slide active={idx === 6} i={6} info={info} />
        <div className="pipeline-progress" ref={progRef} />
      </div>
      <div className="pipeline-controls">
        <button className="pipeline-btn" aria-label="prev" onClick={() => goTo(idx - 1, true)}><i data-lucide="chevron-left"></i></button>
        <div className="pipeline-dots">
          {Array.from({ length: 7 }, (_, i) => (
            <button key={i} className={'pipeline-dot' + (i === idx ? ' active' : '')}
                    aria-label={`slide ${i + 1}`} onClick={() => goTo(i, true)} />
          ))}
        </div>
        <button className="pipeline-btn" aria-label="next" onClick={() => goTo(idx + 1, true)}><i data-lucide="chevron-right"></i></button>
      </div>
    </div>
  );
}

function Slide({ active, i, info, trainRmse }) {
  const cls = 'pipeline-slide' + (active ? ' active' : '');
  if (i === 0) return (
    <div className={cls}>
      <div className="slide-viz">
        <svg viewBox="0 0 400 280" preserveAspectRatio="xMidYMid meet">
          <g className="ng-cy">
            <path className="nl" stroke="#5fa8ff" strokeWidth="2" d="M60,90 Q40,90 40,72 Q40,52 62,55 Q66,38 86,42 Q98,28 118,38 Q138,32 142,55 Q160,55 160,72 Q160,90 140,90 Z"/>
            <text x="100" y="108" textAnchor="middle" fill="#5fa8ff" fontFamily="JetBrains Mono" fontSize="10" opacity="0.8">open-meteo</text>
          </g>
          <path className="nl pl-flow ng-or" stroke="#ff7a59" strokeWidth="2" d="M160,72 Q220,72 240,140 Q260,200 320,200"/>
          <g className="ng-or">
            <circle className="pl-drop" cx="200" cy="72" r="3.5" fill="#ff7a59"/>
            <circle className="pl-drop" cx="200" cy="72" r="3.5" fill="#ff7a59"/>
            <circle className="pl-drop" cx="200" cy="72" r="3.5" fill="#ff7a59"/>
            <circle className="pl-drop" cx="200" cy="72" r="3.5" fill="#ff7a59"/>
          </g>
          <g className="ng-pu">
            <rect className="nl" x="290" y="180" width="90" height="80" rx="8" stroke="#c084fc" strokeWidth="2"/>
            <text x="335" y="206" textAnchor="middle" fill="#c084fc" fontFamily="JetBrains Mono" fontSize="11">weather</text>
            <text x="335" y="222" textAnchor="middle" fill="#c084fc" fontFamily="JetBrains Mono" fontSize="11">.json</text>
            <text x="335" y="246" textAnchor="middle" fill="#9aa8ff" fontFamily="JetBrains Mono" fontSize="9" opacity="0.7">append</text>
          </g>
        </svg>
      </div>
      <div className="slide-text">
        <div className="slide-num">step 01 · ingest</div>
        <div className="slide-title"><span className="ac">Fetch</span> live weather</div>
        <div className="slide-body">A GitHub Action runs <code>main.py</code>, which polls the Open-Meteo API and appends a sample to <code>outputs/weather.json</code> every 30 minutes (backfilling any missed slots since last run). Temperature, humidity, pressure, wind, cloud cover, weathercode all bundled with a UTC timestamp.</div>
        <div className="slide-tags"><span className="slide-tag">main.py</span><span className="slide-tag">30-min ticks</span><span className="slide-tag">open-meteo</span></div>
      </div>
    </div>
  );
  if (i === 1) return (
    <div className={cls}>
      <div className="slide-viz">
        <svg viewBox="0 0 400 280">
          <g className="ng-pu">
            <line className="nl" stroke="#c084fc" strokeWidth="1.5" x1="40" y1="220" x2="360" y2="220"/>
            <line className="nl" stroke="#c084fc" strokeWidth="1.5" x1="40" y1="60" x2="40" y2="220" opacity="0.5"/>
          </g>
          <g className="ng-or">
            {[ [60,120,100,0], [92,100,120,0.15], [124,80,140,0.3], [156,110,110,0.45], [188,70,150,0.6], [220,90,130,0.75], [252,105,115,0.9], [284,85,135,1.05], [316,115,105,1.2] ].map(([x,y,h,d],k)=>(
              <rect key={k} className="pl-bar" x={x} y={y} width="22" height={h} fill="#ff7a59" opacity="0.85" style={{animationDelay: d+'s'}}/>
            ))}
          </g>
          <text x="200" y="248" textAnchor="middle" fill="#9aa8ff" fontFamily="JetBrains Mono" fontSize="11">~2 years · 17,000+ hourly samples</text>
        </svg>
      </div>
      <div className="slide-text">
        <div className="slide-num">step 02 · archive</div>
        <div className="slide-title">Build the <span className="ac">training set</span></div>
        <div className="slide-body">A separate script pulls years of hourly history from Open-Meteo's archive endpoint into <code>history.parquet</code>. The model learns from the long tail across multiple seasons, daily cycles, weather fronts.</div>
        <div className="slide-tags"><span className="slide-tag">fetch_history.py</span><span className="slide-tag">ERA5</span><span className="slide-tag">parquet</span></div>
      </div>
    </div>
  );
  if (i === 2) return (
    <div className={cls}>
      <div className="slide-viz">
        <svg viewBox="0 0 400 280">
          <g className="ng-cy">
            <g stroke="#5fa8ff" strokeWidth="1" className="pl-conn">
              <line x1="60" y1="80" x2="150" y2="60"/><line x1="60" y1="80" x2="150" y2="100"/><line x1="60" y1="120" x2="150" y2="60"/><line x1="60" y1="120" x2="150" y2="180"/>
              <line x1="60" y1="160" x2="150" y2="100"/><line x1="60" y1="160" x2="150" y2="220"/><line x1="60" y1="200" x2="150" y2="180"/><line x1="60" y1="200" x2="150" y2="220"/>
              <line x1="150" y1="60" x2="250" y2="60"/><line x1="150" y1="100" x2="250" y2="100"/><line x1="150" y1="140" x2="250" y2="140"/><line x1="150" y1="180" x2="250" y2="180"/><line x1="150" y1="220" x2="250" y2="220"/>
              <line x1="250" y1="60" x2="340" y2="100"/><line x1="250" y1="100" x2="340" y2="100"/><line x1="250" y1="140" x2="340" y2="140"/><line x1="250" y1="180" x2="340" y2="180"/><line x1="250" y1="220" x2="340" y2="180"/>
            </g>
            <g fill="#5fa8ff">
              {[80,120,160,200].map((cy,k)=>(<circle key={k} className="pl-node" cx="60" cy={cy} r="6" style={{animationDelay: (k*0.2)+'s'}}/>))}
            </g>
            <g fill="#c084fc" className="ng-pu">
              {[60,100,140,180,220].map((cy,k)=>(<circle key={'a'+k} className="pl-node" cx="150" cy={cy} r="7" style={{animationDelay: (0.3 + k*0.2)+'s'}}/>))}
              {[60,100,140,180,220].map((cy,k)=>(<circle key={'b'+k} className="pl-node" cx="250" cy={cy} r="7" style={{animationDelay: (0.4 + k*0.2)+'s'}}/>))}
            </g>
            <g fill="#ff7a59" className="ng-or">
              {[100,140,180].map((cy,k)=>(<circle key={k} className="pl-node" cx="340" cy={cy} r="6" style={{animationDelay: (0.7 + k*0.2)+'s'}}/>))}
            </g>
          </g>
          <text x="60"  y="250" textAnchor="middle" fill="#5fa8ff" fontFamily="JetBrains Mono" fontSize="9">in 13×48</text>
          <text x="200" y="250" textAnchor="middle" fill="#c084fc" fontFamily="JetBrains Mono" fontSize="9">{info?.midTag || '2× LSTM 128'}</text>
          <text x="340" y="250" textAnchor="middle" fill="#ff7a59" fontFamily="JetBrains Mono" fontSize="9">out 24h</text>
        </svg>
      </div>
      <div className="slide-text">
        <div className="slide-num">step 03 · learn</div>
        <div className="slide-title">Train the <span className="ac">{info?.fullName || 'LSTM'}</span></div>
        <div className="slide-body">{info?.bodyText || ''}</div>
        <div className="slide-tags"><span className="slide-tag">PyTorch</span><span className="slide-tag">{trainRmse}</span><span className="slide-tag">residual target</span></div>
      </div>
    </div>
  );
  if (i === 3) return (
    <div className={cls}>
      <div className="slide-viz">
        <svg viewBox="0 0 400 280">
          <line className="nl" stroke="#5fa8ff" strokeWidth="1.5" x1="20" y1="200" x2="380" y2="200" opacity="0.4"/>
          <g stroke="#5fa8ff" strokeWidth="1" opacity="0.4">
            {[60,140,220,300].map((x,k)=>(<line key={k} x1={x} y1="195" x2={x} y2="205"/>))}
          </g>
          <g className="pl-win">
            <rect className="nl ng-cy" x="60" y="80" width="160" height="120" rx="6" fill="rgba(95,168,255,0.08)" stroke="#5fa8ff" strokeWidth="2"/>
            <text x="140" y="72" textAnchor="middle" fill="#5fa8ff" fontFamily="JetBrains Mono" fontSize="11" className="ng-cy">input · 48h</text>
            <rect className="nl ng-or" x="220" y="100" width="80" height="100" rx="6" fill="rgba(255,122,89,0.08)" stroke="#ff7a59" strokeWidth="2"/>
            <text x="260" y="92" textAnchor="middle" fill="#ff7a59" fontFamily="JetBrains Mono" fontSize="11" className="ng-or">target · 24h</text>
          </g>
          <text x="200" y="240" textAnchor="middle" fill="#9aa8ff" fontFamily="JetBrains Mono" fontSize="11">slide one hour, repeat → thousands of training windows</text>
        </svg>
      </div>
      <div className="slide-text">
        <div className="slide-num">step 04 · window</div>
        <div className="slide-title">Slide a <span className="ac">window</span> across history</div>
        <div className="slide-body">For every hour in the archive we cut a 48h input + 24h target pair, then chronologically split train/val (no leakage). The target is a <em>residual</em>, future temp minus the last input temp, so the model learns deltas, not absolute values.</div>
        <div className="slide-tags"><span className="slide-tag">windows.py</span><span className="slide-tag">input=48</span><span className="slide-tag">output=24</span></div>
      </div>
    </div>
  );
  if (i === 4) return (
    <div className={cls}>
      <div className="slide-viz">
        <svg viewBox="0 0 400 280">
          <line className="nl" stroke="#5fa8ff" strokeWidth="1" x1="200" y1="40" x2="200" y2="240" strokeDasharray="3 4" opacity="0.6"/>
          <text x="200" y="32" textAnchor="middle" fill="#9aa8ff" fontFamily="JetBrains Mono" fontSize="10">now</text>
          <path className="nl pl-actual ng-cy" stroke="#5fa8ff" strokeWidth="2.5" d="M20,180 Q60,160 90,165 T140,150 Q170,140 200,148"/>
          <path className="nl pl-pred ng-or" stroke="#ff7a59" strokeWidth="2.5" strokeDasharray="4 5" d="M200,148 Q230,135 260,128 T320,122 Q360,118 380,128"/>
          <circle cx="200" cy="148" r="5" fill="#ffd866" className="ng-yl"/>
          <text x="100" y="218" textAnchor="middle" fill="#5fa8ff" fontFamily="JetBrains Mono" fontSize="11" className="ng-cy">past 48h</text>
          <text x="290" y="218" textAnchor="middle" fill="#ff7a59" fontFamily="JetBrains Mono" fontSize="11" className="ng-or">forecast 24h</text>
        </svg>
      </div>
      <div className="slide-text">
        <div className="slide-num">step 05 · predict</div>
        <div className="slide-title">Forecast the <span className="ac">next 24 hours</span></div>
        <div className="slide-body">At inference: feed the last 48h of live samples through the trained model, get back 24 residual values, add the persistence baseline. Result is dumped to <code>forecast.json</code> for the dashboard to render.</div>
        <div className="slide-tags"><span className="slide-tag">predict.py</span><span className="slide-tag">baseline + δ</span><span className="slide-tag">json out</span></div>
      </div>
    </div>
  );
  if (i === 5) return (
    <div className={cls}>
      <div className="slide-viz">
        <svg viewBox="0 0 400 280">
          <g className="pl-env">
            <g className="ng-pi" stroke="#ff5d8a" fill="rgba(255,93,138,0.08)" strokeWidth="2">
              <rect className="nl" x="0" y="0" width="80" height="55" rx="4"/>
              <path className="nl" d="M0,2 L40,32 L80,2"/>
            </g>
            <text x="40" y="78" textAnchor="middle" fill="#ff5d8a" fontFamily="JetBrains Mono" fontSize="10" className="ng-pi">daily summary</text>
          </g>
          <g className="ng-pu" transform="translate(280,180)">
            <rect className="nl" x="0" y="0" width="80" height="60" rx="6" stroke="#c084fc" strokeWidth="2"/>
            <line className="nl" x1="0" y1="18" x2="80" y2="18" stroke="#c084fc" strokeWidth="1.5" opacity="0.6"/>
            <line className="nl" x1="0" y1="32" x2="80" y2="32" stroke="#c084fc" strokeWidth="1" opacity="0.4"/>
            <line className="nl" x1="0" y1="46" x2="80" y2="46" stroke="#c084fc" strokeWidth="1" opacity="0.4"/>
            <text x="40" y="76" textAnchor="middle" fill="#c084fc" fontFamily="JetBrains Mono" fontSize="10">inbox</text>
          </g>
        </svg>
      </div>
      <div className="slide-text">
        <div className="slide-num">step 06 · notify</div>
        <div className="slide-title">Email on <span className="ac">new records</span></div>
        <div className="slide-body">Each tick compares the new sample to the running max and min. Whenever a fresh high or low is set, <code>main.py</code> assembles a record-break summary (delta, current conditions, dataset stats) and sends it via SMTP. No daily noise. Only the moments that actually matter.</div>
        <div className="slide-tags"><span className="slide-tag">smtplib</span><span className="slide-tag">SSL · iCloud</span><span className="slide-tag">record-only</span></div>
      </div>
    </div>
  );
  // i === 6
  return (
    <div className={cls}>
      <div className="slide-viz">
        <svg viewBox="0 0 400 280">
          <g transform="translate(200,140)">
            <g className="pl-orbit">
              <circle r="105" fill="none" stroke="#5fa8ff" strokeWidth="0.8" strokeDasharray="2 6" opacity="0.4" className="ng-cy"/>
              <circle cx="105" cy="0" r="9" fill="#ff7a59" className="ng-or"/>
              <circle cx="-105" cy="0" r="9" fill="#c084fc" className="ng-pu"/>
              <circle cx="0" cy="105" r="9" fill="#5fa8ff" className="ng-cy"/>
              <circle cx="0" cy="-105" r="9" fill="#6ee7a7" className="ng-gr"/>
            </g>
            <g className="pl-orbit-rev">
              <circle r="55" fill="none" stroke="#c084fc" strokeWidth="0.8" strokeDasharray="2 5" opacity="0.5" className="ng-pu"/>
              <circle cx="55" cy="0" r="6" fill="#ffd866" className="ng-yl"/>
              <circle cx="-55" cy="0" r="6" fill="#ff5d8a" className="ng-pi"/>
            </g>
            <circle r="22" fill="rgba(255,122,89,0.15)" stroke="#ff7a59" strokeWidth="2" className="ng-or"/>
            <text y="5" textAnchor="middle" fill="#ff7a59" fontFamily="JetBrains Mono" fontSize="11" fontWeight="bold">live</text>
          </g>
        </svg>
      </div>
      <div className="slide-text">
        <div className="slide-num">step 07 · visualize</div>
        <div className="slide-title">Render <span className="ac">everything</span></div>
        <div className="slide-body">{`A static HTML page on GitHub Pages reads the JSON outputs and paints: live stats, max/min records, the rolling chart, the ${info?.fullName || 'LSTM'} forecast, the neon weather scene, the 3D model viewer, and this slideshow.`}</div>
        <div className="slide-tags"><span className="slide-tag">Chart.js</span><span className="slide-tag">three.js</span><span className="slide-tag">SVG + CSS</span></div>
      </div>
    </div>
  );
}
