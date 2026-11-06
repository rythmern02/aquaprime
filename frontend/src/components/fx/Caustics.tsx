"use client";
import { useEffect, useRef } from "react";

/**
 * Full-bleed WebGL "underwater caustics" — light refracting through moving liquid.
 * Raw WebGL (no library), cursor bends the light, pauses when hidden / reduced motion.
 */
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uIntensity;
#define TAU 6.28318530718
float caustic(vec2 p, float t){
  vec2 i = p; float c = 1.0; float inten = .005;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - (3.5 / float(n+1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / min(uRes.x, uRes.y);
  vec2 m = (uMouse - .5) * vec2(uRes.x / min(uRes.x, uRes.y), uRes.y / min(uRes.x, uRes.y));
  float d = length(p - m);
  p += (p - m) * .12 * exp(-d * 3.0);               // cursor lens
  float t = uTime * .18;
  float c = caustic(mod(p * 2.2 * TAU, TAU) - 250.0, t);
  vec3 deep = vec3(.012, .02, .04);
  vec3 tide = vec3(.36, .95, .90);
  vec3 pulse = vec3(.55, .36, 1.0);
  vec3 col = mix(tide, pulse, smoothstep(-.6, .9, p.x + .3 * sin(t + p.y)));
  float vign = smoothstep(1.35, .15, length(uv - vec2(.5, .62)));
  float glow = exp(-d * 2.2) * .18;
  vec3 outc = deep + col * c * .55 * vign * uIntensity + col * glow * uIntensity;
  outc *= smoothstep(0.0, .35, uv.y);               // fade into the abyss at the bottom
  gl_FragColor = vec4(outc, 1.0);
}`;
const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

export function Caustics({ className = "", intensity = 1 }: { className?: string; intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse"), uInt = gl.getUniformLocation(prog, "uIntensity");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: 0.5, y: 0.6, tx: 0.5, ty: 0.6 };
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr * 0.6));   // render at 60% res — it's a blur-friendly effect
      canvas.height = Math.max(1, Math.floor(r.height * dpr * 0.6));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width;
      mouse.ty = 1 - (e.clientY - r.top) / r.height;
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);
    const start = performance.now();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduce ? 12 : (performance.now() - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uInt, intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (reduce) cancelAnimationFrame(raf);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf); io.disconnect();
      window.removeEventListener("resize", resize); window.removeEventListener("pointermove", onMove);
    };
  }, [intensity]);
  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
