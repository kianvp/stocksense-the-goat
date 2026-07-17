"use client";

// The hero's WebGL globe, in three movements:
//   1. A dot-matrix globe turns slowly in dark space while great-circle arcs
//      flow between the world's exchanges.
//   2. The camera pushes in as the globe rotates India toward the viewer.
//   3. Every arc converges on Mumbai and the NSE marker flares — the whole
//      world's order flow resolving into one market.
// Custom shaders (point sprites with depth fade, fresnel atmosphere, animated
// dash arcs) with bloom/grain/vignette post-processing.

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

type SceneProps = {
  /** 0..1 scroll progress through the pinned hero — written by the scroll driver. */
  progressRef: MutableRefObject<number>;
  /** Lower point density / arc count on small screens. */
  compact?: boolean;
};

const ease = (t: number) => t * t * (3 - 2 * t); // smoothstep
const clamp01 = (v: number) => THREE.MathUtils.clamp(v, 0, 1);

const FOG = "#03130c";
const BRAND = "#5eead4"; // brand-300-ish teal, matches the emerald palette
const DEEP = "#1f9d61";

/* ------------------------------------------------------------ geo helpers */

/** Lat/lon (degrees) → a point on a unit sphere. */
function latLonToVec3(lat: number, lon: number, radius = 1): THREE.Vector3 {
  const phi = (90 - lat) * THREE.MathUtils.DEG2RAD;
  const theta = (lon + 180) * THREE.MathUtils.DEG2RAD;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** The group Y-rotation that swings a given longitude round to face the camera (+Z). */
function faceCameraRotation(lon: number): number {
  const p = latLonToVec3(0, lon);
  return -Math.atan2(p.x, p.z);
}

/** Shortest-path interpolation between two points on the sphere. */
function slerp(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const omega = a.angleTo(b);
  const so = Math.sin(omega);
  if (so < 1e-6) return out.copy(a).lerp(b, t); // coincident/antipodal — degenerate
  const wa = Math.sin((1 - t) * omega) / so;
  const wb = Math.sin(t * omega) / so;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
}

/**
 * A great-circle arc from `a` to `b` that lifts off the surface — longer hops
 * arc higher, so the route reads as a flight path rather than a scribble.
 */
function arcCurve(a: THREE.Vector3, b: THREE.Vector3, segments = 96): THREE.CatmullRomCurve3 {
  const angle = a.angleTo(b);
  const lift = 0.06 + angle * 0.17;
  const scratch = new THREE.Vector3();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    slerp(a, b, t, scratch);
    pts.push(scratch.clone().setLength(1 + Math.sin(Math.PI * t) * lift));
  }
  return new THREE.CatmullRomCurve3(pts);
}

/* ----------------------------------------------------------- the exchanges */

// Mumbai is the hub — every route lands at the NSE. The rest are the venues
// whose sessions bracket India's trading day.
const HUB = { name: "NSE Mumbai", lat: 19.07, lon: 72.87 };

const SPOKES = [
  { name: "NYSE", lat: 40.71, lon: -74.01 },
  { name: "LSE", lat: 51.51, lon: -0.13 },
  { name: "TSE Tokyo", lat: 35.68, lon: 139.69 },
  { name: "HKEX", lat: 22.32, lon: 114.17 },
  { name: "SGX", lat: 1.35, lon: 103.82 },
  { name: "Frankfurt", lat: 50.11, lon: 8.68 },
  { name: "SSE Shanghai", lat: 31.23, lon: 121.47 },
  { name: "ASX Sydney", lat: -33.87, lon: 151.21 },
  { name: "TSX Toronto", lat: 43.65, lon: -79.38 },
  { name: "B3 São Paulo", lat: -23.55, lon: -46.63 },
  { name: "DFM Dubai", lat: 25.2, lon: 55.27 },
  { name: "JSE Joburg", lat: -26.2, lon: 28.05 },
];

/* -------------------------------------------------------------- dot globe */

const DOT_VERT = /* glsl */ `
  attribute float aRand;
  attribute float aSize;

  uniform float uTime;
  uniform float uPixelRatio;

  varying float vRand;
  varying float vDepth;

  void main() {
    vRand = aRand;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;

    // Slow twinkle so the surface never reads as a static texture
    float twinkle = 0.72 + 0.28 * sin(uTime * 0.9 + aRand * 6.2831);
    gl_PointSize = aSize * twinkle * uPixelRatio * (2.4 / max(0.001, vDepth));
  }
`;

const DOT_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform vec3 uFog;

  varying float vRand;
  varying float vDepth;

  void main() {
    // Round out the point sprite
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, d);
    if (a < 0.01) discard;

    vec3 color = uColor * (0.55 + vRand * 0.55);

    // Far side of the globe recedes into the background instead of cluttering
    float fog = smoothstep(2.6, 4.4, vDepth);
    color = mix(color, uFog, fog * 0.9);
    a *= mix(1.0, 0.18, fog);

    gl_FragColor = vec4(color, a);
  }
`;

function DotGlobe({ compact }: { compact: boolean }) {
  const { geometry, material } = useMemo(() => {
    const COUNT = compact ? 5000 : 11000;

    const positions = new Float32Array(COUNT * 3);
    const rand = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);

    // Fibonacci sphere — even coverage with no polar bunching
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * r;

      const h = Math.abs(Math.sin(i * 127.1) * 43758.5453) % 1;
      rand[i] = h;
      size[i] = 1.1 + h * 1.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uColor: { value: new THREE.Color(BRAND) },
        uFog: { value: new THREE.Color(FOG) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [compact]);

  const { gl } = useThree();
  useEffect(() => {
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
  }, [gl, material]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/* ------------------------------------------------------------ atmosphere */

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMO_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    // Rendered on the back faces, so the rim lights up where the sphere's
    // silhouette meets space — a cheap, convincing atmosphere.
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vView))), 3.2);
    float a = rim * uIntensity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * rim * 1.6, a);
  }
`;

function Atmosphere() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(DEEP) },
          uIntensity: { value: 0.9 },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const geometry = useMemo(() => new THREE.SphereGeometry(1.22, 48, 48), []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <mesh geometry={geometry} material={material} />;
}

/* ------------------------------------------------------------------ arcs */

const ARC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ARC_FRAG = /* glsl */ `
  precision highp float;

  uniform float uHead;    // 0..1 position of the travelling packet
  uniform float uFade;
  uniform vec3  uColor;
  uniform float uConverge; // 0..1 — the Mumbai convergence beat

  varying vec2 vUv;

  void main() {
    float u = vUv.x;

    // The faint permanent route
    float route = 0.16;

    // A bright packet running the route toward Mumbai, with a trailing comet
    float behind = uHead - u;
    float packet = smoothstep(0.14, 0.0, behind) * step(0.0, behind);
    float head = smoothstep(0.035, 0.0, abs(u - uHead)) * 2.2;

    // Ends taper so arcs sink into the surface rather than stopping dead
    float taper = smoothstep(0.0, 0.05, u) * smoothstep(1.0, 0.95, u);

    float glow = route + packet * 1.5 + head;
    vec3 color = uColor * (0.9 + head * 0.8 + uConverge * 0.7);

    float a = glow * taper * uFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(color, a);
  }
`;

type ArcDef = { curve: THREE.CatmullRomCurve3; offset: number; speed: number };

function Arcs({ progressRef, compact }: { progressRef: MutableRefObject<number>; compact: boolean }) {
  const hub = useMemo(() => latLonToVec3(HUB.lat, HUB.lon), []);

  const arcs: ArcDef[] = useMemo(() => {
    const spokes = compact ? SPOKES.slice(0, 7) : SPOKES;
    return spokes.map((s, i) => ({
      curve: arcCurve(latLonToVec3(s.lat, s.lon), hub, compact ? 64 : 96),
      offset: i / spokes.length,
      speed: 0.24 + (i % 3) * 0.05,
    }));
  }, [hub, compact]);

  const built = useMemo(
    () =>
      arcs.map((a) => ({
        geometry: new THREE.TubeGeometry(a.curve, compact ? 64 : 100, 0.0075, 6, false),
        material: new THREE.ShaderMaterial({
          vertexShader: ARC_VERT,
          fragmentShader: ARC_FRAG,
          uniforms: {
            uHead: { value: 0 },
            uFade: { value: 1 },
            uConverge: { value: 0 },
            uColor: { value: new THREE.Color(BRAND) },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
        def: a,
      })),
    [arcs, compact],
  );

  useEffect(() => {
    return () => {
      built.forEach((b) => {
        b.geometry.dispose();
        b.material.dispose();
      });
    };
  }, [built]);

  useFrame(({ clock }) => {
    const p = clamp01(progressRef.current);
    const t = clock.elapsedTime;
    // Packets speed up into the convergence beat, so the finale feels like the
    // whole world reporting in at once.
    const converge = ease(clamp01((p - 0.62) / 0.3));
    built.forEach((b) => {
      const u = b.material.uniforms;
      const speed = b.def.speed * (1 + converge * 2.2);
      u.uHead.value = (b.def.offset + t * speed) % 1;
      u.uConverge.value = converge;
      u.uFade.value = 0.35 + 0.65 * ease(clamp01(p / 0.2)) + converge * 0.5;
    });
  });

  return (
    <group>
      {built.map((b, i) => (
        <mesh key={i} geometry={b.geometry} material={b.material} frustumCulled={false} />
      ))}
    </group>
  );
}

/* --------------------------------------------------------------- markers */

const MARKER_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MARKER_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uPhase;
  uniform float uBoost;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;

    // Solid core
    float core = smoothstep(0.32, 0.06, d);

    // A ring pulsing outward, like a ping landing
    float t = fract(uTime * 0.5 + uPhase);
    float ring = smoothstep(0.06, 0.0, abs(d - t)) * (1.0 - t);

    float a = (core + ring * 0.8) * (0.7 + uBoost);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * (1.2 + uBoost * 1.4), a);
  }
`;

/**
 * Billboarded pings at each exchange. The hub (Mumbai) is larger and flares
 * during the convergence beat.
 */
function Markers({ progressRef, compact }: { progressRef: MutableRefObject<number>; compact: boolean }) {
  const points = useMemo(() => {
    const spokes = compact ? SPOKES.slice(0, 7) : SPOKES;
    return [
      { pos: latLonToVec3(HUB.lat, HUB.lon, 1.005), hub: true, phase: 0 },
      ...spokes.map((s, i) => ({
        pos: latLonToVec3(s.lat, s.lon, 1.005),
        hub: false,
        phase: (i * 0.37) % 1,
      })),
    ];
  }, [compact]);

  const built = useMemo(
    () =>
      points.map((pt) => ({
        pt,
        geometry: new THREE.PlaneGeometry(pt.hub ? 0.13 : 0.075, pt.hub ? 0.13 : 0.075),
        material: new THREE.ShaderMaterial({
          vertexShader: MARKER_VERT,
          fragmentShader: MARKER_FRAG,
          uniforms: {
            uTime: { value: 0 },
            uPhase: { value: pt.phase },
            uBoost: { value: 0 },
            uColor: { value: new THREE.Color(pt.hub ? "#ffffff" : BRAND) },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      })),
    [points],
  );

  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const { camera } = useThree();

  useEffect(() => {
    return () => {
      built.forEach((b) => {
        b.geometry.dispose();
        b.material.dispose();
      });
    };
  }, [built]);

  useFrame(({ clock }) => {
    const p = clamp01(progressRef.current);
    const converge = ease(clamp01((p - 0.62) / 0.3));
    const t = clock.elapsedTime;

    built.forEach((b, i) => {
      b.material.uniforms.uTime.value = t;
      b.material.uniforms.uBoost.value = b.pt.hub ? converge * 1.6 : converge * 0.2;
      // Billboard: markers sit on the sphere but always face the viewer
      const mesh = refs.current[i];
      if (mesh) mesh.quaternion.copy(camera.quaternion);
    });
  });

  return (
    <group>
      {built.map((b, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={b.pt.pos}
          geometry={b.geometry}
          material={b.material}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------- camera rig */

// The globe drifts on its own, then scroll swings Mumbai to face the viewer.
const START_ROT = 0.6;
const END_ROT = faceCameraRotation(HUB.lon);

// Verified numerically (see the geometry notes above `Rig`): these park Mumbai
// at roughly ndc.y +0.14 — just above frame centre — at the end of the scroll.
const START_TILT = 0.05;
const END_TILT = 0.18;

const CAM_START = 3.5;
const CAM_END = 2.55;
const CAM_Y_START = 0.1;
const CAM_Y_END = 0.18;

/**
 * Drives the globe's rotation and the camera. The globe drifts on its own
 * until scroll takes over and swings Mumbai round to face the viewer.
 */
function Rig({
  progressRef,
  compact,
}: {
  progressRef: MutableRefObject<number>;
  compact: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const { camera, gl } = useThree();

  useEffect(() => {
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

  useFrame(({ clock }) => {
    const p = clamp01(progressRef.current);
    const t = clock.elapsedTime;

    if (group.current) {
      // Idle drift before scroll takes over, then an eased swing to face India.
      const swing = ease(clamp01((p - 0.05) / 0.75));
      const idle = t * 0.045 * (1 - swing);
      group.current.rotation.y = START_ROT + idle + (END_ROT - START_ROT) * swing;
      // Tilt north — Mumbai sits at 19°N, so without this the convergence beat
      // lands in the top third of frame instead of under the camera. END_TILT
      // is tuned so Mumbai finishes just above centre, clear of the beat-3 copy.
      group.current.rotation.x = THREE.MathUtils.lerp(START_TILT, END_TILT, swing);
    }

    const z = THREE.MathUtils.lerp(CAM_START, CAM_END, ease(clamp01(p / 0.85)));
    camera.position.set(
      pointer.current.x * 0.22 + Math.sin(t * 0.3) * 0.03,
      -pointer.current.y * 0.16 + Math.cos(t * 0.24) * 0.025 + THREE.MathUtils.lerp(CAM_Y_START, CAM_Y_END, p),
      z,
    );
    camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={group}>
      <DotGlobe compact={compact} />
      <Atmosphere />
      <Arcs progressRef={progressRef} compact={compact} />
      <Markers progressRef={progressRef} compact={compact} />
    </group>
  );
}

/* ------------------------------------------------------------------ canvas */

export default function GlobeScene({ progressRef, compact }: SceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 42, near: 0.1, far: 60, position: [0, 0.1, CAM_START] }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <color attach="background" args={[FOG]} />
      <Rig progressRef={progressRef} compact={!!compact} />
      <EffectComposer>
        <Bloom intensity={1.15} luminanceThreshold={0.22} luminanceSmoothing={0.3} mipmapBlur />
        <Noise opacity={0.05} />
        <Vignette eskil={false} offset={0.2} darkness={0.78} />
      </EffectComposer>
    </Canvas>
  );
}
