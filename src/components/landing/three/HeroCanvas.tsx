"use client";

// Particle backdrop for the hero: a field of emerald/neutral dots that idles
// in slow Brownian drift, coalesces into a rising sparkline on load, and is
// gently repelled by the cursor. Rendered only when the WebGL gate passes —
// the CSS orb backdrop underneath remains the fallback.

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useWebGLGate } from "./support";

const COUNT = 2600;
const LINE_SHARE = 0.62;

// Deterministic PRNG so SSR/CSR and re-mounts agree.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sparkY(t: number): number {
  return -1.7 + t * 3.1 + Math.sin(t * 9.2) * 0.55 + Math.sin(t * 23.7) * 0.2;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

type ParticleData = {
  start: Float32Array;
  target: Float32Array;
  phase: Float32Array;
  freq: Float32Array;
  amp: Float32Array;
  delay: Float32Array;
  colors: Float32Array;
};

function buildParticles(): ParticleData {
  const rand = mulberry32(20260707);
  const start = new Float32Array(COUNT * 3);
  const target = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT);
  const freq = new Float32Array(COUNT);
  const amp = new Float32Array(COUNT);
  const delay = new Float32Array(COUNT);
  const colors = new Float32Array(COUNT * 3);

  const line = new THREE.Color("#6fb98e");
  const lineBright = new THREE.Color("#d8efe2");
  const dust = new THREE.Color("#3d9a6b");
  const dustDim = new THREE.Color("#1f5a3f");
  const c = new THREE.Color();

  const lineCount = Math.floor(COUNT * LINE_SHARE);

  for (let i = 0; i < COUNT; i++) {
    const isLine = i < lineCount;
    let tx = 0;
    if (isLine) {
      const t = rand();
      tx = t;
      const gaussianish = (rand() + rand() + rand() - 1.5) / 1.5;
      target[i * 3] = -10.5 + t * 21;
      target[i * 3 + 1] = sparkY(t) + gaussianish * 0.18 - 0.4;
      target[i * 3 + 2] = (rand() - 0.5) * 1.0;
      c.copy(line).lerp(lineBright, Math.pow(rand(), 2));
      amp[i] = 0.05 + rand() * 0.04;
    } else {
      target[i * 3] = (rand() - 0.5) * 22;
      target[i * 3 + 1] = (rand() - 0.5) * 9.5;
      target[i * 3 + 2] = -2.5 + rand() * 3;
      c.copy(dustDim).lerp(dust, rand());
      amp[i] = 0.1 + rand() * 0.12;
    }

    // Scatter start positions on a loose sphere around the target.
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const r = 4 + rand() * 7;
    start[i * 3] = target[i * 3] + Math.sin(phi) * Math.cos(theta) * r;
    start[i * 3 + 1] = target[i * 3 + 1] + Math.sin(phi) * Math.sin(theta) * r;
    start[i * 3 + 2] = target[i * 3 + 2] + Math.cos(phi) * r * 0.6;

    phase[i] = rand() * Math.PI * 2;
    freq[i] = 0.35 + rand() * 0.6;
    // The line "draws" left to right; dust fades in randomly.
    delay[i] = isLine ? tx * 1.3 + rand() * 0.25 : rand() * 1.6;

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  return { start, target, phase, freq, amp, delay, colors };
}

function ParticleField() {
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const pointer = useRef({ x: 0, y: 0, active: false });
  const { camera, gl, size } = useThree();

  const data = useMemo(buildParticles, []);
  const positions = useMemo(() => data.start.slice(), [data]);

  useMemo(() => {
    const el = gl.domElement;
    function onMove(e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      pointer.current.active =
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [gl]);

  useFrame(({ clock }) => {
    const geo = geoRef.current;
    if (!geo) return;
    const pos = geo.attributes.position.array as Float32Array;
    const t = clock.elapsedTime;

    // Cursor in world space on the z=0 plane.
    const persp = camera as THREE.PerspectiveCamera;
    const halfH = Math.tan((persp.fov * Math.PI) / 360) * persp.position.z;
    const halfW = halfH * (size.width / size.height);
    const px = pointer.current.x * halfW;
    const py = pointer.current.y * halfH;
    const repel = pointer.current.active;
    const R = 2.4;

    const { start, target, phase, freq, amp, delay } = data;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const p = easeOutCubic(Math.min(1, Math.max(0, (t - delay[i]) / 1.25)));
      const wob = Math.sin(t * freq[i] + phase[i]) * amp[i];
      const wob2 = Math.cos(t * freq[i] * 0.83 + phase[i] * 1.7) * amp[i];

      let x = start[i3] + (target[i3] - start[i3]) * p + wob;
      let y = start[i3 + 1] + (target[i3 + 1] - start[i3 + 1]) * p + wob2;
      const z = start[i3 + 2] + (target[i3 + 2] - start[i3 + 2]) * p;

      if (repel && p > 0.9) {
        const dx = x - px;
        const dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const f = Math.pow(1 - d / R, 2) * 0.9;
          x += (dx / d) * f;
          y += (dy / d) * f;
        }
      }

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function HeroCanvas() {
  const ok = useWebGLGate();
  if (!ok) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 10], fov: 50 }}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      >
        <ParticleField />
      </Canvas>
    </div>
  );
}
