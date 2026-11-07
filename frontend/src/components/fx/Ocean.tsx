"use client";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Waves } from "./Waves";

/**
 * Open water, rendered on the GPU: four Gerstner waves with analytic normals, sky reflection via Fresnel,
 * sun glitter, foam on the crests, haze toward the horizon, and a wake that follows the cursor.
 * `stress` (0..1) roughens the sea — used when a position is in trouble.
 */
const VERT = /* glsl */ `
uniform float uTime; uniform vec2 uMouse; uniform float uWake; uniform float uRough;
varying vec3 vWorld; varying vec3 vNormal; varying float vHeight;
vec3 gerstner(vec4 w, vec3 p, inout vec3 t, inout vec3 b) {
  float k = 6.28318 / w.w; float c = sqrt(9.8 / k); vec2 d = normalize(w.xy);
  float s = w.z * uRough; float f = k * (dot(d, p.xz) - c * uTime * .55); float a = s / k;
  t += vec3(-d.x * d.x * s * sin(f), d.x * s * cos(f), -d.x * d.y * s * sin(f));
  b += vec3(-d.x * d.y * s * sin(f), d.y * s * cos(f), -d.y * d.y * s * sin(f));
  return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
}
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.)).xyz;
  vec3 t = vec3(1., 0., 0.), b = vec3(0., 0., 1.), q = p;
  q += gerstner(vec4(1., .35, .20, 16.), p, t, b);
  q += gerstner(vec4(.6, 1., .16, 9.), p, t, b);
  q += gerstner(vec4(-.45, .9, .13, 5.), p, t, b);
  q += gerstner(vec4(.9, -.3, .09, 2.8), p, t, b);
  float dm = distance(p.xz, uMouse);
  q.y += uWake * .32 * sin(dm * 2.4 - uTime * 4.5) * exp(-dm * .42);
  vWorld = q; vNormal = normalize(cross(b, t)); vHeight = q.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.);
}`;

const FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uSky; uniform vec3 uHorizon; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSun;
varying vec3 vWorld; varying vec3 vNormal; varying float vHeight;
void main() {
  vec3 V = normalize(cameraPosition - vWorld), N = normalize(vNormal);
  float fres = pow(1. - max(dot(N, V), 0.), 4.);
  vec3 water = mix(uDeep, uShallow, smoothstep(-.5, .7, vHeight));
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uSky, clamp(R.y * 2.2, 0., 1.));
  vec3 col = mix(water, sky, clamp(fres * .85 + .08, 0., 1.));
  col += vec3(1.) * pow(max(dot(R, normalize(uSun)), 0.), 220.) * 1.8;
  float churn = .18 * sin(vWorld.x * 3.1 + uTime) * sin(vWorld.z * 2.7 - uTime * .8);
  col = mix(col, vec3(1.), smoothstep(.62, 1.05, vHeight + churn) * .9);
  float fog = smoothstep(16., 78., length(vWorld.xz - cameraPosition.xz));
  gl_FragColor = vec4(mix(col, uHorizon, fog), 1.);
}`;

function Sea({ stress }: { stress: number }) {
  const { camera, raycaster, pointer } = useThree();
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 }, uMouse: { value: new THREE.Vector2(0, -6) }, uWake: { value: 0 }, uRough: { value: 1 },
      uSky: { value: new THREE.Color("#8FD0FA") }, uHorizon: { value: new THREE.Color("#E3F4FF") },
      uDeep: { value: new THREE.Color("#0C5A9E") }, uShallow: { value: new THREE.Color("#34C3E6") },
      uSun: { value: new THREE.Vector3(.35, .55, -1) },
    },
  }), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const last = useRef({ x: 0, y: 0, moved: 0 });
  useFrame((s, dt) => {
    const u = mat.uniforms;
    u.uTime.value = s.clock.elapsedTime;
    u.uRough.value += (1 + stress * .9 - u.uRough.value) * .03;
    if (pointer.x !== last.current.x || pointer.y !== last.current.y) {
      last.current = { x: pointer.x, y: pointer.y, moved: s.clock.elapsedTime };
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) u.uMouse.value.lerp(new THREE.Vector2(hit.x, hit.z), .25);
    }
    const active = s.clock.elapsedTime - last.current.moved < 1.2 ? 1 : 0;
    u.uWake.value += (active - u.uWake.value) * Math.min(dt * 2.5, 1);
    camera.position.y = 2.3 + Math.sin(s.clock.elapsedTime * .5) * .08;
    camera.position.x += (pointer.x * .6 - camera.position.x) * .02;
    camera.lookAt(0, 4.0, -14);
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -38]} material={mat}>
      <planeGeometry args={[170, 120, 240, 180]} />
    </mesh>
  );
}

class GlBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* WebGL unavailable — fallback rendered */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const webglAvailable = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };

export default function Ocean({ stress = 0, className = "", eventSource }: { stress?: number; className?: string; eventSource?: RefObject<HTMLElement> }) {
  const [gl, setGl] = useState<boolean | null>(null);
  const [reduce, setReduce] = useState(false);
  useEffect(() => { setGl(webglAvailable()); setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  const fallback = <div className="absolute inset-x-0 bottom-0 h-[46%]"><Waves tone="deep" className="h-full" /></div>;
  return (
    <div className={`sky ${className}`} aria-hidden>
      {gl === false ? fallback : gl && (
        <GlBoundary fallback={fallback}>
          <Canvas camera={{ position: [0, 2.3, 9], fov: 48, near: .1, far: 200 }} dpr={[1, 1.6]}
            eventSource={eventSource as React.MutableRefObject<HTMLElement> | undefined} eventPrefix="client"
            frameloop={reduce ? "demand" : "always"} gl={{ antialias: true, alpha: true }}
            onCreated={({ gl: r }) => r.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setGl(false); }, { once: true })}>
            <Sea stress={stress} />
          </Canvas>
        </GlBoundary>
      )}
    </div>
  );
}
