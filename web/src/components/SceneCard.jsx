import { useEffect, useRef } from 'react';
import { useCardHover } from '../hooks/useCardHover.js';
import { useLucide } from '../hooks/useLucide.js';

function buildScene(scene, metaEl, latest) {
  if (!latest?.data) return;
  const d = latest.data;
  const time = new Date(latest.timestamp);
  const h = time.getHours() + time.getMinutes() / 60;
  const isDay = d.is_day === 1 || d.is_day === true;
  const cloudCover = Math.max(0, Math.min(100, d.cloud_cover ?? 0));
  const wind = d.windspeed ?? 0;
  const wcode = d.weathercode ?? 0;

  let from, to, celestColor, celestCore, horizon, mountainStroke, cloudStroke, starsOpacity;
  if (!isDay && (h < 5.5 || h > 19)) {
    from = '#06081a'; to = '#1a0f3a'; starsOpacity = 1;
    celestColor = '#9aa8ff'; celestCore = 'rgba(154,168,255,0.18)';
    horizon = '#c084fc'; mountainStroke = '#5fa8ff'; cloudStroke = '#9aa8ff';
  } else if (h >= 5.5 && h < 7.5) {
    from = '#1a0a3a'; to = '#ff7a59'; starsOpacity = 0.25;
    celestColor = '#ff7a59'; celestCore = 'rgba(255,122,89,0.22)';
    horizon = '#ffd866'; mountainStroke = '#ff5d8a'; cloudStroke = '#ffae72';
  } else if (h >= 7.5 && h < 16) {
    from = '#0a3a7a'; to = '#5fc8ff'; starsOpacity = 0;
    celestColor = '#ffd866'; celestCore = 'rgba(255,216,102,0.22)';
    horizon = '#5fa8ff'; mountainStroke = '#5fa8ff'; cloudStroke = '#c084fc';
  } else if (h >= 16 && h < 18.5) {
    from = '#3a0a3a'; to = '#ff5d5d'; starsOpacity = 0.1;
    celestColor = '#ff5d5d'; celestCore = 'rgba(255,93,93,0.22)';
    horizon = '#ff7a59'; mountainStroke = '#c084fc'; cloudStroke = '#ff7a59';
  } else {
    from = '#0a0420'; to = '#5d2a8f'; starsOpacity = 0.55;
    celestColor = '#c084fc'; celestCore = 'rgba(192,132,252,0.22)';
    horizon = '#ff5d8a'; mountainStroke = '#c084fc'; cloudStroke = '#5fa8ff';
  }

  let frac;
  if (isDay) frac = (h - 5) / 14;
  else { let nh = h < 7 ? h + 24 : h; frac = (nh - 18) / 13; }
  const sunX = 5 + Math.max(-0.05, Math.min(1.05, frac)) * 90;
  const sunY = 72 - Math.sin(frac * Math.PI) * 62;
  let celestOpacity = sunY > 72 ? 0 : 1;
  const gloom = Math.min(0.6, (cloudCover / 100) * 0.65);
  celestOpacity *= (1 - gloom * 0.7);

  scene.style.setProperty('--sky-from', from);
  scene.style.setProperty('--sky-to', to);
  scene.style.setProperty('--celestial-color', celestColor);
  scene.style.setProperty('--celestial-core', celestCore);
  scene.style.setProperty('--horizon', horizon);
  scene.style.setProperty('--mountain-stroke', mountainStroke);
  scene.style.setProperty('--cloud-stroke', cloudStroke);
  scene.style.setProperty('--sun-x', sunX + '%');
  scene.style.setProperty('--sun-y', sunY + '%');
  scene.style.setProperty('--stars-opacity', starsOpacity);
  scene.style.setProperty('--celestial-opacity', celestOpacity.toFixed(2));
  scene.style.setProperty('--gloom', gloom.toFixed(2));

  const stars = Array.from({length: 36}, (_, i) => {
    const x = (i * 137 + 23) % 100;
    const y = (i * 53 + 11) % 65;
    const delay = (i % 7) * 0.4;
    return `<div class="star" style="left:${x}%; top:${y}%; animation-delay:${delay}s;"></div>`;
  }).join('');

  const mountains = `<svg class="mountains" viewBox="0 0 1000 200" preserveAspectRatio="none">
    <path class="back" d="M0,200 L0,150 L100,90 L210,130 L320,70 L450,125 L580,85 L700,120 L840,65 L940,100 L1000,85 L1000,200 Z" />
    <path d="M0,200 L0,170 L120,130 L240,160 L380,115 L520,150 L660,110 L800,140 L920,115 L1000,130 L1000,200 Z" />
  </svg>`;

  const cloudCount = Math.round(Math.pow(cloudCover / 100, 0.75) * 18);
  const cloudPath = "M5,18 Q5,6 18,8 Q22,2 32,5 Q44,1 50,10 Q62,8 62,18 Q62,24 52,24 L14,24 Q5,24 5,18 Z";
  const cloudBaseSpeed = Math.max(6, 65 - wind * 0.8);
  const clouds = Array.from({length: cloudCount}, (_, i) => {
    const top = 5 + ((i * 9 + 7) % 35);
    const w = 70 + ((i * 31) % 70);
    const speed = (cloudBaseSpeed + ((i * 17) % 25)).toFixed(1);
    const delay = -((i * 7) % 60);
    return `<div class="cloud" style="--top:${top}%; --w:${w}px; --h:${Math.max(20, w/3)}px; --speed:${speed}s; --delay:${delay}s;">
      <svg viewBox="0 0 65 30" preserveAspectRatio="none"><path d="${cloudPath}"/></svg>
    </div>`;
  }).join('');

  const swayDeg = Math.min(22, 1 + Math.pow(wind, 0.85) * 0.9);
  const baseSpeed = Math.max(0.55, 4.2 - wind * 0.07);
  const treeXs = [10, 28, 46, 64, 82];
  const snowCodesForTrees = [71,73,75,77,85,86];
  const treeSnowy = snowCodesForTrees.includes(wcode);
  const trees = treeXs.map((x, i) => {
    const scale = 0.75 + (i % 3) * 0.18;
    const speed = (baseSpeed + (i % 3) * 0.25).toFixed(2);
    const delay = (-((i * 0.37) % 1) * baseSpeed).toFixed(2);
    const frost = treeSnowy
      ? `<path class="frost" d="M5,40 L13,40 M22,40 L32,40 M9,52 L18,52 M19,52 L28,52 M14,30 L22,30" />`
      : '';
    return `<div class="tree ${treeSnowy ? 'snowy' : ''}" style="--x:${x}%; --sway-deg:${swayDeg}deg; --sway-speed:${speed}s; --sway-delay:${delay}s; --scale:${scale};">
      <div class="bend">
        <svg viewBox="0 0 36 80">
          <path class="trunk-line" d="M18,80 L18,42 M18,60 L11,52 M18,55 L25,46" />
          <g class="crown">
            <path class="leaves-line" d="M18,8 L4,40 L13,40 L8,52 L18,52 L18,42 L18,52 L28,52 L23,40 L32,40 Z" />
            ${frost}
          </g>
        </svg>
      </div>
    </div>`;
  }).join('');

  let effects = '';
  let storm = '';
  const rainCodes = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99];
  const snowCodes = [71,73,75,77,85,86];
  const heavyRainCodes = [65,67,82,95,96,99];
  const heavySnowCodes = [75,77,86];
  const stormCodes = [95,96,99];
  if (rainCodes.includes(wcode)) {
    const heavy = heavyRainCodes.includes(wcode);
    const count = heavy ? 240 : 80;
    effects = Array.from({length: count}, (_, i) => {
      const left = (i * 13.7 + 5) % 100;
      const dur = ((heavy ? 0.25 : 0.4) + ((i * 7) % 50) / 100).toFixed(2);
      const delay = (-((i * 3) % 100) / 100).toFixed(2);
      return `<div class="rain" style="left:${left}%; animation-duration:${dur}s; animation-delay:${delay}s;"></div>`;
    }).join('');
  } else if (snowCodes.includes(wcode)) {
    const heavy = heavySnowCodes.includes(wcode);
    const count = heavy ? 220 : 80;
    effects = Array.from({length: count}, (_, i) => {
      const left = (i * 7.3 + 3) % 100;
      const dur = ((heavy ? 1.6 : 3) + ((i * 11) % 30) / 10).toFixed(2);
      const delay = (-((i * 5) % 60) / 10).toFixed(2);
      return `<div class="snow" style="left:${left}%; animation-duration:${dur}s; animation-delay:${delay}s;"></div>`;
    }).join('');
  }
  let fog = '';
  if (wcode === 45 || wcode === 48) {
    const bands = 7;
    fog = Array.from({length: bands}, (_, i) => {
      const top = 38 + i * 7 + ((i * 13) % 5);
      const speed = 22 + ((i * 11) % 18);
      const delay = -((i * 5) % 20);
      const dir = i % 2 === 0 ? 1 : -1;
      return `<div class="fog" style="--fog-top:${top}%; --fog-speed:${speed}s; --fog-delay:${delay}s; transform:scaleX(${dir});"></div>`;
    }).join('');
  }
  if (stormCodes.includes(wcode)) {
    const boltX = 30 + ((wcode * 7) % 40);
    storm = `
      <div class="lightning" style="--bolt-x:${boltX}%;"></div>
      <svg class="bolt" style="--bolt-x:${boltX}%;" viewBox="0 0 36 100" preserveAspectRatio="none">
        <path d="M20,0 L8,40 L18,42 L6,100 L26,52 L14,50 L24,12 Z" />
      </svg>
    `;
  }

  scene.innerHTML = `
    <div class="stars">${stars}</div>
    <div class="celestial"></div>
    ${clouds}
    <div class="gloom"></div>
    ${mountains}
    ${effects}
    ${fog}
    ${storm}
    ${trees}
    <div class="grid-floor"></div>
  `;

  const phase = !isDay ? 'night' :
                h < 7.5 ? 'sunrise' :
                h < 16 ? 'day' :
                h < 18.5 ? 'late afternoon' : 'sunset';
  const wcLabel = rainCodes.includes(wcode) ? 'rain' :
                  snowCodes.includes(wcode) ? 'snow' :
                  (wcode === 45 || wcode === 48) ? 'fog' :
                  cloudCover < 10 ? 'clear' :
                  cloudCover < 30 ? 'mostly clear' :
                  cloudCover < 70 ? 'partly cloudy' : 'overcast';
  if (metaEl) {
    metaEl.innerHTML = `
      <span><i data-lucide="sun"></i> ${phase}</span>
      <span><i data-lucide="cloud"></i> ${cloudCover}% cloud</span>
      <span><i data-lucide="wind"></i> ${wind} km/h</span>
      <span><i data-lucide="cloud-rain"></i> ${wcLabel}</span>
    `;
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }
}

export default function SceneCard({ latest }) {
  const cardRef = useRef(null);
  const sceneRef = useRef(null);
  const metaRef = useRef(null);
  useCardHover(cardRef);
  useLucide([latest]);

  useEffect(() => {
    if (sceneRef.current) buildScene(sceneRef.current, metaRef.current, latest);
  }, [latest]);

  return (
    <div ref={cardRef} className="card scene-card fade-in">
      <div className="chart-head">
        <div className="chart-title"><i data-lucide="cloud-sun"></i> Live scene</div>
      </div>
      <div className="scene" ref={sceneRef} />
      <div className="scene-meta" ref={metaRef} />
    </div>
  );
}
