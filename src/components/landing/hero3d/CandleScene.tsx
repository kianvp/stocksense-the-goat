"use client";

// The hero's WebGL scene: ~2,500 instanced candlesticks breathing in a grid
// ("the market as a city"), a camera that dives down and flies through the
// field, and a scroll-driven morph where every candle collapses onto the real
// NIFTY price curve as a single glowing emerald line. Custom shader (instanced
// morph targets, fresnel rim, depth fog) + bloom/grain/vignette post.

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

type SceneProps = {
  /** 0..1 scroll progress through the pinned hero — written by the scroll driver. */
  progressRef: MutableRefObject<number>;
  /** Normalised (0..1) close series that shapes the final line. */
  curve: number[];
  /** Lower instance density for small screens. */
  compact?: boolean;
};

/* ------------------------------------------------------------------ shader */

const VERT = /* glsl */ `
  attribute vec3 iPos0;
  attribute vec3 iPos1;
  attribute float iH0;
  attribute float iH1;
  attribute float iUp;
  attribute float iRand;

  uniform float uMorph;
  uniform float uTime;

  varying float vUp;
  varying float vMorph;
  varying float vH;
  varying float vRand;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    float m = uMorph;
    vec3 base = mix(iPos0, iPos1, m);

    // Idle breathing — fades out as the field becomes the line
    float wob = sin(uTime * (0.5 + iRand * 0.9) + iRand * 6.2831) * 0.09 * (1.0 - m);
    float h = mix(iH0, iH1, m) * (1.0 + wob);

    vec3 p = position;
    float thin = mix(1.0, 0.6, m);
    p.x *= thin;
    p.z *= thin;
    p.y *= h;

    vec4 mv = modelViewMatrix * vec4(base + p, 1.0);
    gl_Position = projectionMatrix * mv;

    vNormal = normalize(normalMatrix * normal);
    vViewPos = mv.xyz;
    vUp = iUp;
    vMorph = m;
    vH = h;
    vRand = iRand;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uUpColor;
  uniform vec3 uDownColor;
  uniform vec3 uLineColor;
  uniform vec3 uFogColor;

  varying float vUp;
  varying float vMorph;
  varying float vH;
  varying float vRand;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 base = mix(uDownColor, uUpColor, vUp);
    vec3 color = mix(base, uLineColor, vMorph);

    // Height gradient — taller candles glow brighter
    color *= 0.5 + 0.5 * smoothstep(0.0, 4.0, vH) + vRand * 0.08;

    // Fresnel rim for the "expensive" edge glow
    vec3 V = normalize(-vViewPos);
    float rim = pow(1.0 - max(dot(normalize(vNormal), V), 0.0), 2.2);
    color += rim * mix(base, uLineColor, vMorph) * (0.55 + vMorph * 0.9);

    // Push the morphed line into HDR so bloom picks it up hard
    color *= 1.0 + vMorph * 1.1;

    // Depth fog into the page background
    float depth = length(vViewPos);
    float fog = smoothstep(14.0, 55.0, depth);
    color = mix(color, uFogColor, fog);

    gl_FragColor = vec4(color, 1.0);
  }
`;

/* ---------------------------------------------------------------- geometry */

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function fieldNoise(x: number, z: number): number {
  return (
    0.5 +
    0.5 * Math.sin(x * 0.35 + Math.cos(z * 0.42) * 1.6) * Math.cos(z * 0.31 + Math.sin(x * 0.27) * 1.3)
  );
}

function buildGeometry(curve: number[], compact: boolean): THREE.InstancedBufferGeometry {
  const COLS = compact ? 48 : 80;
  const ROWS = compact ? 22 : 32;
  const COUNT = COLS * ROWS;
  const SPACING = 0.55;
  const WIDTH = COLS * SPACING;

  const box = new THREE.BoxGeometry(0.3, 1, 0.3);
  box.translate(0, 0.5, 0); // grow upward from the floor

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = box.index;
  geo.attributes.position = box.attributes.position;
  geo.attributes.normal = box.attributes.normal;
  geo.instanceCount = COUNT;

  const pos0 = new Float32Array(COUNT * 3);
  const pos1 = new Float32Array(COUNT * 3);
  const h0 = new Float32Array(COUNT);
  const h1 = new Float32Array(COUNT);
  const up = new Float32Array(COUNT);
  const rand = new Float32Array(COUNT);

  const N = curve.length;

  for (let i = 0; i < COUNT; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = (col - (COLS - 1) / 2) * SPACING;
    const z = (row - (ROWS - 1) / 2) * SPACING;
    const r = hash(i * 1.618 + 7);

    // Layout A — the candle city
    pos0[i * 3] = x;
    pos0[i * 3 + 1] = 0;
    pos0[i * 3 + 2] = z;
    h0[i] = 0.35 + fieldNoise(x, z) * 3.2 + r * 0.7;

    // Layout B — everyone collapses onto the price curve (a glowing ribbon)
    const t = col / (COLS - 1);
    const ci = Math.min(N - 1, Math.floor(t * (N - 1)));
    const y = curve[ci] * 5.4 + 0.6;
    pos1[i * 3] = (t - 0.5) * WIDTH * 0.92;
    pos1[i * 3 + 1] = y + (hash(i * 3.7 + 1) - 0.5) * 0.14;
    pos1[i * 3 + 2] = (row - (ROWS - 1) / 2) * 0.045;
    h1[i] = 0.16 + r * 0.1;

    // Grid phase colours: trend of the curve decides the red/green mix bias
    const trendUp = ci > 0 ? curve[ci] >= curve[Math.max(0, ci - 2)] : true;
    up[i] = r > (trendUp ? 0.32 : 0.6) ? 1 : 0;
    rand[i] = r;
  }

  geo.setAttribute("iPos0", new THREE.InstancedBufferAttribute(pos0, 3));
  geo.setAttribute("iPos1", new THREE.InstancedBufferAttribute(pos1, 3));
  geo.setAttribute("iH0", new THREE.InstancedBufferAttribute(h0, 1));
  geo.setAttribute("iH1", new THREE.InstancedBufferAttribute(h1, 1));
  geo.setAttribute("iUp", new THREE.InstancedBufferAttribute(up, 1));
  geo.setAttribute("iRand", new THREE.InstancedBufferAttribute(rand, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 60);
  return geo;
}

/* ------------------------------------------------------------- camera path */

const CAM = [
  { pos: new THREE.Vector3(0, 11.5, 21), look: new THREE.Vector3(0, 1.2, -2) }, // overview
  { pos: new THREE.Vector3(-2.5, 1.1, 7), look: new THREE.Vector3(0.5, 1.4, -8) }, // inside the field
  { pos: new THREE.Vector3(0, 4.2, 16.5), look: new THREE.Vector3(0, 2.6, 0) }, // the line, revealed
];

const ease = (t: number) => t * t * (3 - 2 * t); // smoothstep

function sampleCamera(p: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }) {
  if (p < 0.45) {
    const t = ease(THREE.MathUtils.clamp(p / 0.45, 0, 1));
    out.pos.lerpVectors(CAM[0].pos, CAM[1].pos, t);
    out.look.lerpVectors(CAM[0].look, CAM[1].look, t);
  } else {
    const t = ease(THREE.MathUtils.clamp((p - 0.45) / 0.45, 0, 1));
    out.pos.lerpVectors(CAM[1].pos, CAM[2].pos, t);
    out.look.lerpVectors(CAM[1].look, CAM[2].look, t);
  }
}

/* ------------------------------------------------------------------- field */

function Field({ progressRef, curve, compact }: SceneProps) {
  const pointer = useRef({ x: 0, y: 0 });
  const camState = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() });
  const { camera, gl } = useThree();

  const geometry = useMemo(() => buildGeometry(curve, !!compact), [curve, compact]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uMorph: { value: 0 },
          uTime: { value: 0 },
          uUpColor: { value: new THREE.Color("#1f9d61") },
          uDownColor: { value: new THREE.Color("#a63a22") },
          uLineColor: { value: new THREE.Color("#5eead4") },
          uFogColor: { value: new THREE.Color("#03130c") },
        },
      }),
    [],
  );

  // Pointer parallax (window-level so it works while the section is pinned)
  useMemo(() => {
    const el = gl.domElement;
    function onMove(e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [gl]);

  // Dispose GPU resources when the hero unmounts
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const p = THREE.MathUtils.clamp(progressRef.current, 0, 1);
    const t = clock.elapsedTime;

    material.uniforms.uTime.value = t;
    // The morph is the wow beat: chaos → one clear line
    material.uniforms.uMorph.value = ease(THREE.MathUtils.clamp((p - 0.55) / 0.3, 0, 1));

    sampleCamera(p, camState.current);
    const px = pointer.current.x;
    const py = pointer.current.y;
    camera.position.set(
      camState.current.pos.x + px * 0.9 + Math.sin(t * 0.35) * 0.15,
      camState.current.pos.y + -py * 0.5 + Math.cos(t * 0.28) * 0.1,
      camState.current.pos.z,
    );
    camera.lookAt(camState.current.look);
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ canvas */

export default function CandleScene(props: SceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 55, near: 0.1, far: 120, position: [0, 15, 27] }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <color attach="background" args={["#03130c"]} />
      <Field {...props} />
      <EffectComposer>
        <Bloom intensity={1.05} luminanceThreshold={0.32} luminanceSmoothing={0.25} mipmapBlur />
        <Noise opacity={0.055} />
        <Vignette eskil={false} offset={0.18} darkness={0.72} />
      </EffectComposer>
    </Canvas>
  );
}
