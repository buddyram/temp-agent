import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MODEL_INFO } from '../utils/models.js';

export default function NeuralViz({ modelName }) {
  const canvasRef = useRef(null);
  const buildRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvas.parentElement;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 22);

    function resize() {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    const root = new THREE.Group();
    scene.add(root);

    let nodes = [], nodeMeshes = [], nodeWeights = [], nodePhases = [], pulses = [];

    function hash01(i, salt) {
      const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
      return x - Math.floor(x);
    }
    function disposeChildren(group) {
      while (group.children.length) {
        const c = group.children[0];
        group.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      }
    }

    function build(name) {
      const info = MODEL_INFO[name] || MODEL_INFO.lstm;
      const layers = info.layers;
      disposeChildren(root);
      nodes = []; nodeMeshes = []; nodeWeights = []; nodePhases = []; pulses = [];

      layers.forEach((layer, li) => {
        const positions = [], meshes = [], weights = [], phases = [];
        const geom = new THREE.SphereGeometry(0.07, 10, 10);
        for (let i = 0; i < layer.count; i++) {
          const angle = (i / layer.count) * Math.PI * 2;
          const y = Math.cos(angle) * layer.radius;
          const z = Math.sin(angle) * layer.radius;
          const p = new THREE.Vector3(layer.x, y, z);
          positions.push(p);
          const r = hash01(i, li * 7 + 1);
          const w = 0.15 + Math.pow(r, 2.2) * 0.85;
          weights.push(w);
          phases.push(hash01(i, li * 11 + 3) * Math.PI * 2);
          const mat = new THREE.MeshBasicMaterial({ color: layer.color, transparent: true, opacity: w });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.copy(p);
          mesh.scale.setScalar(0.6 + w * 0.9);
          root.add(mesh);
          meshes.push(mesh);
        }
        nodes.push(positions);
        nodeMeshes.push(meshes);
        nodeWeights.push(weights);
        nodePhases.push(phases);
      });

      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 });
      const linePts = [];
      const sampleK = info.sampleK || [6, 4, 6];
      for (let li = 0; li < nodes.length - 1; li++) {
        const from = nodes[li], to = nodes[li + 1];
        const k = Math.min(sampleK[li] ?? 3, to.length);
        for (const fp of from) {
          for (let j = 0; j < k; j++) {
            const tp = to[Math.floor(Math.random() * to.length)];
            linePts.push(fp.x, fp.y, fp.z, tp.x, tp.y, tp.z);
          }
        }
      }
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
      root.add(new THREE.LineSegments(lineGeom, lineMat));

      if (info.recurrent && info.recurrent.length) {
        const recurrentMat = new THREE.LineBasicMaterial({ color: 0x5fa8ff, transparent: true, opacity: 0.18 });
        info.recurrent.forEach(li => {
          if (!nodes[li]) return;
          const ringGeom = new THREE.BufferGeometry();
          const segs = 12, rr = 0.18;
          const pts = [];
          nodes[li].forEach(p => {
            for (let s = 0; s < segs; s++) {
              const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
              pts.push(p.x + Math.cos(a0) * rr, p.y + Math.sin(a0) * rr, p.z);
              pts.push(p.x + Math.cos(a1) * rr, p.y + Math.sin(a1) * rr, p.z);
            }
          });
          ringGeom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          root.add(new THREE.LineSegments(ringGeom, recurrentMat));
        });
      }

      if (info.dilatedArcs) {
        const arcMat = new THREE.LineBasicMaterial({ color: 0xffa37a, transparent: true, opacity: 0.22 });
        info.dilatedArcs.forEach(li => {
          if (!nodes[li]) return;
          const arcGeom = new THREE.BufferGeometry();
          const pts = [];
          const layerNodes = nodes[li];
          for (let i = 0; i < layerNodes.length; i++) {
            for (const dilation of [2, 4, 8]) {
              const j = (i + dilation) % layerNodes.length;
              const a = layerNodes[i], b = layerNodes[j];
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2 + 0.6;
              const mz = (a.z + b.z) / 2 + 0.6;
              pts.push(a.x, a.y, a.z, mx, my, mz);
              pts.push(mx, my, mz, b.x, b.y, b.z);
            }
          }
          arcGeom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          root.add(new THREE.LineSegments(arcGeom, arcMat));
        });
      }

      const pulseGeom = new THREE.SphereGeometry(0.04, 8, 8);
      function newPulsePath() {
        const li = Math.floor(Math.random() * (nodes.length - 1));
        const from = nodes[li][Math.floor(Math.random() * nodes[li].length)];
        const to   = nodes[li + 1][Math.floor(Math.random() * nodes[li + 1].length)];
        return { from, to };
      }
      pulses._newPath = newPulsePath;
      for (let i = 0; i < 32; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });
        const m = new THREE.Mesh(pulseGeom, mat);
        root.add(m);
        pulses.push({ mesh: m, t: Math.random(), speed: 0.004 + Math.random() * 0.012, ...newPulsePath() });
      }
    }
    buildRef.current = build;
    build(modelName || 'lstm');

    let raf;
    function animate() {
      const t = Date.now() * 0.001;
      root.rotation.y += 0.0022;
      root.rotation.x = Math.sin(t * 0.18) * 0.16;
      for (let li = 0; li < nodeMeshes.length; li++) {
        const meshes = nodeMeshes[li], weights = nodeWeights[li], phases = nodePhases[li];
        for (let i = 0; i < meshes.length; i++) {
          const w = weights[i];
          const osc = 0.75 + 0.25 * Math.sin(t * 0.9 + phases[i]);
          meshes[i].material.opacity = w * osc;
        }
      }
      pulses.forEach(p => {
        p.t += p.speed;
        if (p.t >= 1) { Object.assign(p, pulses._newPath()); p.t = 0; }
        p.mesh.position.lerpVectors(p.from, p.to, p.t);
        p.mesh.material.opacity = Math.sin(p.t * Math.PI) * 0.85;
      });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      disposeChildren(root);
      renderer.dispose();
    };
  }, []);

  // Rebuild when model changes (without recreating renderer)
  useEffect(() => {
    if (buildRef.current && modelName) buildRef.current(modelName);
  }, [modelName]);

  return <canvas id="neural-bg" ref={canvasRef} />;
}
