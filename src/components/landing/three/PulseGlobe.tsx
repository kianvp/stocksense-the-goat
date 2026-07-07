"use client";

// The Market Pulse centerpiece: a particle-dot globe weighted toward the
// Indian exchanges, with a pulsing Mumbai (NSE/BSE) marker and faint trade
// arcs to global markets. Slow auto-rotation; drag to orbit.

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWebGLGate } from "./support";

const R = 3.05;
const BASE_DOTS = 3600;
const INDIA_DOTS = 950;

const MUMBAI = { lat: 19.076, lon: 72.877 };
const ARC_TARGETS = [
  { lat: 1.352, lon: 103.82 }, // Singapore
  { lat: 25.205, lon: 55.271 }, // Dubai
  { lat: 51.507, lon: -0.128 }, // London
  { lat: 40.713, lon: -74.006 }, // New York
  { lat: 35.676, lon: 139.65 }, // Tokyo
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function latLonToVec3(lat: number, lon: number, radius = R): THREE.Vector3 {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.cos(lambda),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(lambda),
  );
}

function buildDots() {
  const rand = mulberry32(91);
  const count = BASE_DOTS + INDIA_DOTS;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const neutral = new THREE.Color("#9db8ab");
  const neutralDim = new THREE.Color("#41564b");
  const emerald = new THREE.Color("#4ade80");
  const emeraldSoft = new THREE.Color("#6fb98e");
  const c = new THREE.Color();

  // Uniform shell via fibonacci sphere.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < BASE_DOTS; i++) {
    const y = 1 - (i / (BASE_DOTS - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const theta = golden * i;
    positions[i * 3] = Math.cos(theta) * rad * R;
    positions[i * 3 + 1] = y * R;
    positions[i * 3 + 2] = Math.sin(theta) * rad * R;
    c.copy(neutralDim).lerp(neutral, Math.pow(rand(), 1.6) * 0.8);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  // Gaussian cluster over the subcontinent.
  for (let i = 0; i < INDIA_DOTS; i++) {
    const j = BASE_DOTS + i;
    const g1 = (rand() + rand() + rand() - 1.5) / 1.5;
    const g2 = (rand() + rand() + rand() - 1.5) / 1.5;
    const v = latLonToVec3(21 + g1 * 9, 78 + g2 * 10, R * 1.002);
    positions[j * 3] = v.x;
    positions[j * 3 + 1] = v.y;
    positions[j * 3 + 2] = v.z;
    c.copy(emeraldSoft).lerp(emerald, rand());
    colors[j * 3] = c.r;
    colors[j * 3 + 1] = c.g;
    colors[j * 3 + 2] = c.b;
  }

  return { positions, colors };
}

function buildArcs(): THREE.Vector3[][] {
  const from = latLonToVec3(MUMBAI.lat, MUMBAI.lon, R * 1.01);
  return ARC_TARGETS.map((t) => {
    const to = latLonToVec3(t.lat, t.lon, R * 1.01);
    const mid = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.45);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    return curve.getPoints(48);
  });
}

function Globe() {
  const group = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const drag = useRef({ down: false, lastX: 0, lastY: 0, velY: 0.0022, rotX: -0.12 });

  const dots = useMemo(buildDots, []);
  const arcs = useMemo(buildArcs, []);
  const mumbai = useMemo(() => latLonToVec3(MUMBAI.lat, MUMBAI.lon, R * 1.012), []);
  // Start with India facing the camera.
  const initialY = useMemo(() => {
    const v = latLonToVec3(MUMBAI.lat, MUMBAI.lon);
    return -Math.atan2(v.x, v.z) + Math.PI;
  }, []);

  useFrame(({ clock, gl }) => {
    const g = group.current;
    if (!g) return;
    const d = drag.current;
    if (!d.down) {
      d.velY += (0.0022 - d.velY) * 0.02; // ease back to idle spin
    }
    g.rotation.y += d.velY;
    g.rotation.x += (d.rotX - g.rotation.x) * 0.08;

    // Pulse ring at Mumbai.
    const t = (clock.elapsedTime % 2.4) / 2.4;
    if (ringRef.current && ringMat.current) {
      const s = 1 + t * 2.6;
      ringRef.current.scale.setScalar(s);
      ringMat.current.opacity = 0.55 * (1 - t);
    }
    gl.domElement.style.cursor = d.down ? "grabbing" : "grab";
  });

  function onDown(e: React.PointerEvent) {
    drag.current.down = true;
    drag.current.lastX = e.clientX;
    drag.current.lastY = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.down) return;
    d.velY = (e.clientX - d.lastX) * 0.00042;
    d.rotX = Math.min(0.5, Math.max(-0.5, d.rotX + (e.clientY - d.lastY) * 0.002));
    d.lastX = e.clientX;
    d.lastY = e.clientY;
  }
  function onUp() {
    drag.current.down = false;
  }

  return (
    <group
      ref={group}
      rotation={[drag.current.rotX, initialY, 0]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      {/* Invisible sphere to catch drags anywhere on the globe */}
      <mesh>
        <sphereGeometry args={[R * 1.05, 24, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dots.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[dots.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.045}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {arcs.map((pts, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z])), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color="#6fb98e"
            transparent
            opacity={0.28}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </line>
      ))}

      {/* Mumbai marker + pulse */}
      <mesh position={mumbai}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#4ade80" />
      </mesh>
      <mesh ref={ringRef} position={mumbai} onUpdate={(m) => m.lookAt(0, 0, 0)}>
        <ringGeometry args={[0.09, 0.11, 32]} />
        <meshBasicMaterial
          ref={ringMat}
          color="#4ade80"
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export default function PulseGlobe() {
  const ok = useWebGLGate();
  if (!ok) {
    return (
      <div className="particle-dust h-full w-full rounded-[32px] border border-white/10 bg-white/[0.03]" aria-hidden="true" />
    );
  }
  return (
    <div className="h-full w-full touch-pan-y" aria-hidden="true">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 7.4], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <Globe />
      </Canvas>
    </div>
  );
}
