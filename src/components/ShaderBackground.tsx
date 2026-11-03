"use client";

import { useEffect, useRef } from "react";

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
void main(){
  vec2 p=(gl_FragCoord.xy-0.5*u_res)/u_res.y;
  float t=u_time*0.1;
  vec2 m=(u_pointer-0.5)*vec2(0.3,0.15);
  float c1=-0.15+0.22*sin(p.x*1.4+t*0.9+m.x*2.0)+0.08*sin(p.x*3.1-t*0.6);
  float c2=0.35+0.18*sin(p.x*1.1-t*0.7+m.x*1.5)+0.06*sin(p.x*2.7+t*0.8);
  float d1=(p.y-c1)*5.0;
  float d2=(p.y-c2)*6.5;
  float r1=exp(-d1*d1);
  float r2=exp(-d2*d2);
  float shimmer=0.75+0.25*sin(p.x*4.0+t*1.7);
  vec3 base=vec3(0.008,0.023,0.066);
  vec3 teal=vec3(0.06,0.55,0.52);
  vec3 cyan=vec3(0.35,0.95,1.0);
  vec3 col=base;
  col+=teal*r1*0.55*shimmer;
  col+=cyan*pow(r1,3.0)*0.75;
  col+=teal*r2*0.4*(1.0-shimmer*0.3);
  col+=cyan*pow(r2,3.0)*0.6;
  col+=teal*0.10*exp(-1.5*length(p*vec2(0.8,1.0)));
  vec2 uv=gl_FragCoord.xy/u_res;
  col+=teal*0.18*exp(-3.5*length(uv-vec2(0.5,0.12)));
  gl_FragColor=vec4(col,1.0);
}`;

/**
 * Animated aurora background for the home page only. Raw WebGL, one
 * fullscreen fragment shader; falls back to a static CSS gradient when
 * WebGL is unavailable, the shader fails, or reduced motion is set.
 */
export default function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      return;
    }
    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) {
        return null;
      }
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const program = vs && fs ? gl.createProgram() : null;
    if (!program || !vs || !fs) {
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uPointer = gl.getUniformLocation(program, "u_pointer");

    let raf = 0;
    let running = true;
    // Backing store at reduced resolution; CSS upscales (smooth for gradients).
    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.7;
      const w = Math.max(1, Math.floor(canvas.clientWidth * scale));
      const h = Math.max(1, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    window.addEventListener("resize", resize);
    const pointer = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4 };
    const onMove = (event: PointerEvent) => {
      pointer.tx = event.clientX / window.innerWidth;
      pointer.ty = event.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onMove);
    // If the context dies, fall back to the CSS gradient behind the canvas.
    const onLost = (event: Event) => {
      event.preventDefault();
      canvas.style.visibility = "hidden";
      running = false;
    };
    canvas.addEventListener("webglcontextlost", onLost);
    let last = performance.now();
    let elapsed = 0;
    let queued = false;
    const frame = (now: number) => {
      queued = false;
      if (!running) {
        return;
      }
      // Clamp dt so a backgrounded tab doesn't jump the animation.
      elapsed += Math.min((now - last) / 1000, 0.1);
      last = now;
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uPointer, pointer.x, 1 - pointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Reveal only after a real frame: a dead context must never white out.
      if (canvas.style.visibility !== "visible") {
        canvas.style.visibility = "visible";
      }
      queued = true;
      raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (running && !queued) {
        last = performance.now();
        queued = true;
        raf = requestAnimationFrame(frame);
      }
    };
    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting && !document.hidden;
      kick();
    });
    io.observe(canvas);
    const onVis = () => {
      running = !document.hidden;
      kick();
    };
    document.addEventListener("visibilitychange", onVis);
    kick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      io.disconnect();
      // NOTE: never force-lose the context here. The canvas element is
      // discarded on unmount (the browser reclaims it), and an effect
      // re-run on the same canvas would inherit a dead context.
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 bg-slate-950"
    >
      {/* Static fallback: shows when WebGL is off, fails, or reduced motion. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 50% 0%, rgba(20,184,166,0.22), transparent 60%), radial-gradient(90% 55% at 85% 35%, rgba(34,211,238,0.14), transparent 60%), radial-gradient(90% 55% at 12% 60%, rgba(45,212,191,0.10), transparent 60%), #020617",
        }}
      />
      <canvas
        ref={canvasRef}
        className="invisible absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-0 bg-slate-950/55" />
    </div>
  );
}
