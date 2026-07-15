"use client";

// The hero's WebGL scene, in three movements:
//   1. A glowing dashed line floats in dark space, drawing itself forward
//      while the camera follows through along its path.
//   2. The camera drops off the line as ~2,500 instanced candlesticks rise
//      from the floor — the market city grows around you.
//   3. Every candle collapses onto the real NIFTY price curve as one bright
//      emerald line: from chaos, clarity.
// Custom shaders (instanced morph targets, fresnel, fog, animated dash) with
// bloom/grain/vignette post-processing.

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

const ease = (t: number) => t * t * (3 - 2 * t); // smoothstep
const clamp01 = (v: number) => THREE.MathUtils.clamp(v, 0, 1);

/* -------------------------------------------------------- the guide dash */

// The floating path the camera follows through the opening — a gentle weave
// that descends toward the candle field.
const GUIDE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-30, 7.5, 16),
  new THREE.Vector3(-16, 5.6, 9),
  new THREE.Vector3(-5, 7.8, 3),
  new THREE.Vector3(6, 4.8, -2),
  new THREE.Vector3(15, 6.6, -7),
  new THREE.Vector3(26, 5.2, -13),
]);

const DASH_VERT = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.y += sin(uTime * 0.5 + uv.x * 8.0) * 0.12; // gentle float
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const DASH_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uDraw;
  uniform float uFade;
  uniform vec3 uColor;

  void main() {
    float u = vUv.x;
    // Animated dashes flowing forward along the line
    float dash = step(0.42, fract(u * 90.0 - uTime * 0.45));
    // Draw-in mask: the line only exists up to uDraw
    float drawn = 1.0 - step(uDraw, u);
    // Bright comet head at the drawing tip
    float tip = smoothstep(uDraw - 0.045, uDraw - 0.004, u) * 2.6;
    // Soften the tail behind the camera
    float tail = smoothstep(0.0, 0.06, u);

    vec3 color = uColor * (1.2 + tip);
    float alpha = max(dash, tip * 0.5) * drawn * tail * uFade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function GuideDash({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(GUIDE, 400, 0.07, 8, false), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: DASH_VERT,
        fragmentShader: DASH_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uDraw: { value: 0.16 },
          uFade: { value: 1 },
          uColor: { value: new THREE.Color("#5eead4") },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const p = clamp01(progressRef.current);
    material.uniforms.uTime.value = clock.elapsedTime;
    // A short dash floats ahead at rest, then draws itself in as you scroll
    material.uniforms.uDraw.value = 0.16 + 0.84 * ease(clamp01(p / 0.34));
    // The line dissolves once the field has taken over
    material.uniforms.uFade.value = 1 - ease(clamp01((p - 0.42) / 0.12));
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

/* ----------------------------------------------------- candle field shader */

const VERT = /* glsl */ `
  attribute vec3 iPos0;
  attribute vec3 iPos1;
  attribute float iH0;
  attribute float iH1;
  attribute float iUp;
  attribute float iRand;

  uniform float uMorph;
  uniform float uTime;
  uniform float uFieldIn;

  varying float vUp;
  varying float vMorph;
  varying float vH;
  varying float vRand;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    float m = uMorph;
    vec3 base = mix(iPos0, iPos1, m);

    // Staggered rise: candles grow out of the floor as uFieldIn sweeps 0→1
    float grow = smoothstep(iRand * 0.55, iRand * 0.55 + 0.45, uFieldIn);

    // Idle breathing — fades out as the field becomes the line
    float wob = sin(uTime * (0.5 + iRand * 0.9) + iRand * 6.2831) * 0.09 * (1.0 - m);
    float h = mix(iH0 * max(grow, 0.015), iH1, m) * (1.0 + wob);

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

// After leaving the guide line, the camera lands inside the field, then pulls
// back to reveal the morphed NIFTY line.
const CAM_FIELD = { pos: new THREE.Vector3(-2.5, 1.3, 7), look: new THREE.Vector3(0.5, 1.6, -8) };
const CAM_REVEAL = { pos: new THREE.Vector3(0, 4.2, 16.5), look: new THREE.Vector3(0, 2.6, 0) };

const FOLLOW_OFFSET = new THREE.Vector3(0, 1.5, 5.4);

const scratch = {
  pos: new THREE.Vector3(),
  look: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
};

function sampleCamera(p: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }) {
  if (p < 0.4) {
    // 1 — follow through along the floating dash
    const t = ease(clamp01(p / 0.4));
    const tc = THREE.MathUtils.lerp(0.03, 0.8, t);
    GUIDE.getPointAt(tc, out.pos).add(FOLLOW_OFFSET);
    GUIDE.getPointAt(Math.min(1, tc + 0.07), out.look);
  } else if (p < 0.54) {
    // 2 — peel off the line, drop into the rising field
    const t = ease(clamp01((p - 0.4) / 0.14));
    GUIDE.getPointAt(0.8, scratch.a).add(FOLLOW_OFFSET);
    out.pos.lerpVectors(scratch.a, CAM_FIELD.pos, t);
    GUIDE.getPointAt(0.87, scratch.b);
    out.look.lerpVectors(scratch.b, CAM_FIELD.look, t);
  } else {
    // 3 — pull back for the morph reveal
    const t = ease(clamp01((p - 0.54) / 0.36));
    out.pos.lerpVectors(CAM_FIELD.pos, CAM_REVEAL.pos, t);
    out.look.lerpVectors(CAM_FIELD.look, CAM_REVEAL.look, t);
  }
}

/* ------------------------------------------------------------------- field */

function Field({ progressRef, curve, compact }: SceneProps) {
  const pointer = useRef({ x: 0, y: 0 });
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
          uFieldIn: { value: 0 },
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
    const p = clamp01(progressRef.current);
    const t = clock.elapsedTime;

    material.uniforms.uTime.value = t;
    // The city rises as the camera comes off the line…
    material.uniforms.uFieldIn.value = ease(clamp01((p - 0.28) / 0.2));
    // …then collapses into one clear line: the wow beat
    material.uniforms.uMorph.value = ease(clamp01((p - 0.58) / 0.28));

    sampleCamera(p, scratch);
    const px = pointer.current.x;
    const py = pointer.current.y;
    camera.position.set(
      scratch.pos.x + px * 0.8 + Math.sin(t * 0.35) * 0.12,
      scratch.pos.y + -py * 0.45 + Math.cos(t * 0.28) * 0.09,
      scratch.pos.z,
    );
    camera.lookAt(scratch.look);
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ canvas */

export default function CandleScene(props: SceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 55, near: 0.1, far: 120, position: [-28, 9, 22] }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <color attach="background" args={["#03130c"]} />
      <GuideDash progressRef={props.progressRef} />
      <Field {...props} />
      <EffectComposer>
        <Bloom intensity={1.05} luminanceThreshold={0.32} luminanceSmoothing={0.25} mipmapBlur />
        <Noise opacity={0.055} />
        <Vignette eskil={false} offset={0.18} darkness={0.72} />
      </EffectComposer>
    </Canvas>
  );
}
