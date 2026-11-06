"use client";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The "wallet core": a breathing particle sphere (your capital, which never moves) with three orbiting
 * strategy rings drawing light from it (credit line · backstop · AMM). SLAC made visible: one vessel,
 * many simultaneous jobs. `stress` (0..1) bleeds signal-orange into the core as a position approaches insolvency.
 */
function Core({ stress }: { stress: number }) {
  const pts = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 3200, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random();
      const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1), r = 1 + (Math.random() - 0.5) * 0.08;
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uStress: { value: 0 } },
    vertexShader: `
      uniform float uTime; uniform float uStress; attribute float seed; varying float vS; varying float vD;
      void main(){
        vec3 p = position;
        float w = sin(p.y * 4.0 + uTime * 1.3 + seed * 6.28) * 0.04 + sin(p.x * 3.0 - uTime) * 0.03;
        p *= 1.0 + w + uStress * 0.06 * sin(uTime * 9.0 + seed * 20.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.4 + seed * 2.6) * (3.2 / -mv.z);
        gl_Position = projectionMatrix * mv; vS = seed; vD = -mv.z;
      }`,
    fragmentShader: `
      uniform float uStress; varying float vS; varying float vD;
      void main(){
        float d = length(gl_PointCoord - .5); if (d > .5) discard;
        vec3 bone = vec3(.93,.92,.90), signal = vec3(1.0,.36,.14);
        vec3 c = mix(bone, signal, uStress * step(.35, vS));
        gl_FragColor = vec4(c, smoothstep(.5, .3, d) * (.6 + .4 * vS) * smoothstep(6.5, 3.4, vD));
      }`,
  }), []);
  useFrame((s) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    mat.uniforms.uStress.value += (stress - mat.uniforms.uStress.value) * 0.06;
    if (pts.current) { pts.current.rotation.y += 0.0025; pts.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.2) * 0.15; }
  });
  return <points ref={pts} geometry={geo} material={mat} />;
}

function Ring({ radius, tilt, speed, color, flow }: { radius: number; tilt: [number, number]; speed: number; color: string; flow: number }) {
  const grp = useRef<THREE.Group>(null);
  const bead = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0), [radius]);
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0)));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#EDEBE5", transparent: true, opacity: 0.3 }));
  }, [curve, color]);
  useFrame((s) => {
    const t = (s.clock.elapsedTime * speed * flow) % 1;
    const p = curve.getPoint(t);
    bead.current?.position.set(p.x, p.y, 0);
    if (grp.current) grp.current.rotation.z += 0.001 * speed;
  });
  return (
    <group ref={grp} rotation={[tilt[0], tilt[1], 0]}>
      <primitive object={line} />
      <mesh ref={bead}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!g.current) return;
    g.current.rotation.y += (s.pointer.x * 0.35 - g.current.rotation.y) * 0.04;
    g.current.rotation.x += (-s.pointer.y * 0.25 - g.current.rotation.x) * 0.04;
  });
  return <group ref={g}>{children}</group>;
}

/** CSS-only stand-in used when WebGL is unavailable (or crashes): same idea, zero GPU. */
function CssOrb({ stress }: { stress: number }) {
  return (
    <div className="relative h-full w-full">
      <div className={`absolute inset-[26%] rounded-full border ${stress > 0.5 ? "border-signal/60" : "border-fg/25"}`}
        style={{ backgroundImage: "radial-gradient(rgba(237,235,229,.35) 1px, transparent 1.2px)", backgroundSize: "7px 7px" }} />
      {[["inset-[14%]", "border-signal/50", "18s"], ["inset-[8%]", "border-fg/15", "26s"], ["inset-[2%]", "border-fg/10", "34s"]].map(([i, c, d]) => (
        <div key={i} className={`absolute ${i} rounded-full border ${c} [transform:rotateX(68deg)]`} style={{ animation: `spin ${d} linear infinite` }} />
      ))}
      <style>{`@keyframes spin{from{transform:rotateX(68deg) rotateZ(0)}to{transform:rotateX(68deg) rotateZ(360deg)}}`}</style>
    </div>
  );
}

class GlBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* WebGL unavailable — fallback rendered */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export default function LiquidityOrb({ stress = 0, rings = 3, className = "" }: { stress?: number; rings?: number; className?: string }) {
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => setGl(webglAvailable()), []);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const defs = [
    { radius: 1.55, tilt: [1.1, 0.2] as [number, number], speed: 0.22, color: "#FF5B24" },
    { radius: 1.85, tilt: [0.5, -0.9] as [number, number], speed: 0.16, color: "#EDEBE5" },
    { radius: 2.15, tilt: [1.9, 0.7] as [number, number], speed: 0.12, color: "#8C887F" },
  ];
  const fallback = <CssOrb stress={stress} />;
  return (
    <div className={className} aria-hidden>
      {gl === false ? fallback : gl && (
        <GlBoundary fallback={fallback}>
          <Canvas camera={{ position: [0, 0, 5.2], fov: 45 }} dpr={[1, 1.75]} frameloop={reduce ? "demand" : "always"} gl={{ antialias: true, alpha: true }}>
            <Rig>
              <Core stress={stress} />
              {defs.slice(0, rings).map((d) => <Ring key={d.color} {...d} flow={1 - stress * 0.7} />)}
            </Rig>
          </Canvas>
        </GlBoundary>
      )}
    </div>
  );
}
