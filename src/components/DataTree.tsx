"use client";

import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import {
  FOV,
  CAMERA_Z_OFFSET,
  SCENE_SCALE_FACTOR,
  PROGRESS_LERP,
  SCROLL_SENSITIVITY,
  DRAG_SENSITIVITY,
  AUTO_ROTATE_SPEED,
  DRAG_ROTATE_SPEED,
  DRAG_TILT_SPEED,
  MAX_TILT_X,
  ROT_LERP,
  PROX_R,
  LINE_MIN_DIST,
  LINE_MAX_DIST,
  MAX_LINE_ALPHA,
  MAX_LINES,
  GRID_CELL,
  BG_COLOR,
  DIGIT_TRUNK,
  DIGIT_BRANCH,
  DIGIT_MID,
} from "./data-tree/constants";
import type { RawPoint, ParticleCPU } from "./data-tree/types";
import { generateSDFAtlas } from "./data-tree/sdf-atlas";
import { RainLayer } from "./data-tree/rain-layer";
import { updateTurbulencePhysics } from "./data-tree/spring-physics";
import {
  augmentPoints,
  buildParticleSystem,
  redistributeScatter,
  createParticleMaterial,
  createLineMaterial,
  type ParticleBuffers,
} from "./data-tree/particle-system";

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function assignDigit(darkness: number): number {
  const r = Math.floor(Math.random() * 0x7fffffff) >>> 0;
  if (darkness > DIGIT_TRUNK) return r % 3;
  if (darkness > DIGIT_BRANCH) return 3 + (r % 3);
  if (darkness > DIGIT_MID) return 6 + (r % 2);
  return 8 + (r % 2);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DataTree() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rainCanvasRef = useRef<HTMLCanvasElement>(null);
  const treeCanvasRef = useRef<HTMLCanvasElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const rainCanvas = rainCanvasRef.current!;
    const treeCanvas = treeCanvasRef.current!;
    const hintEl = hintRef.current!;
    const bottomEl = bottomRef.current!;
    const dotEl = dotRef.current;

    // ── Mutable state ────────────────────────────────────────────────────────
    let W = 0,
      H = 0,
      DPR = 1;
    let progress = 0,
      targetProgress = 0;
    let rotY = Math.PI * 0.75,
      targetRotY = Math.PI * 0.75;
    let rotX = -0.17,       // ~10° slight downward look — tree silhouette reads as tree
      targetRotX = -0.17;
    let mouseX = -9999,
      mouseY = -9999;
    let isDragging = false;
    let lastDragX = 0,
      lastDragY = 0;
    let interacted = false;
    let time = 0;
    let dataLoaded = false;
    let rafId = 0;

    // Particle buffers (set after data load)
    let pb: ParticleBuffers | null = null;

    // ── Three.js setup ───────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      canvas: treeCanvas,
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
    });
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();

    // Dummy camera — shaders handle projection
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // SDF atlas
    const atlas = generateSDFAtlas();

    // Materials
    const particleMat = createParticleMaterial(atlas);
    const lineMat = createLineMaterial();

    // Points (added to scene after data load)
    let points: THREE.Points | null = null;

    // Smart proximity lines
    const linePosBuf = new Float32Array(MAX_LINES * 6);
    const lineGeometry = new THREE.BufferGeometry();
    const linePosAttr = new THREE.BufferAttribute(linePosBuf, 3);
    linePosAttr.setUsage(THREE.DynamicDrawUsage);
    lineGeometry.setAttribute("position", linePosAttr);
    lineGeometry.setDrawRange(0, 0);
    const lineSegments = new THREE.LineSegments(lineGeometry, lineMat);
    scene.add(lineSegments);

    // Rain
    const rain = new RainLayer();
    let rainCtx: CanvasRenderingContext2D | null = null;

    // ── Resize ───────────────────────────────────────────────────────────────
    function resize() {
      const rect = container.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      DPR = Math.min(window.devicePixelRatio || 1, 2);

      // Three.js renderer
      renderer.setSize(W, H);
      renderer.setPixelRatio(DPR);

      // Uniforms
      particleMat.uniforms.uResolution.value.set(W, H);
      particleMat.uniforms.uSceneScale.value = Math.min(W, H) * SCENE_SCALE_FACTOR;
      particleMat.uniforms.uDPR.value = DPR;
      lineMat.uniforms.uResolution.value.set(W, H);

      // Rain canvas
      rainCanvas.width = Math.round(W * DPR);
      rainCanvas.height = Math.round(H * DPR);
      rainCanvas.style.width = W + "px";
      rainCanvas.style.height = H + "px";
      rainCtx = rainCanvas.getContext("2d")!;
      rainCtx.setTransform(1, 0, 0, 1, 0, 0);
      rainCtx.scale(DPR, DPR);
      rain.init(W, H);

      // Redistribute scatter positions
      if (pb) {
        const scatterAttr = pb.geometry.getAttribute(
          "aScatterPos"
        ) as THREE.BufferAttribute;
        redistributeScatter(pb.scatterBuf, scatterAttr, W, H);
      }
    }

    // ── Data load ────────────────────────────────────────────────────────────
    fetch("/tree-pts.json")
      .then((r) => r.json())
      .then((raw: RawPoint[]) => {
        const augmented = augmentPoints(raw);
        initParticles(augmented);
      })
      .catch(() => {
        // Fallback: procedural tree
        const fb: RawPoint[] = [];
        for (let i = 0; i < 4000; i++) {
          const y = Math.random();
          const isTrunk = y < 0.22;
          const maxR = isTrunk
            ? 0.06 + (1 - y / 0.22) * 0.02
            : (1 - y) * 0.55;
          const r = maxR * Math.sqrt(Math.random());
          const a = Math.random() * Math.PI * 2;
          const darkness = isTrunk
            ? 0.82 + Math.random() * 0.15
            : 0.15 + Math.random() * 0.35;
          fb.push([Math.cos(a) * r, y, Math.sin(a) * r, darkness]);
        }
        const augmented = augmentPoints(fb);
        initParticles(augmented);
      });

    function initParticles(pts: RawPoint[]) {
      pb = buildParticleSystem(pts, W || 1280, H || 800);
      points = new THREE.Points(pb.geometry, particleMat);
      scene.add(points);
      dataLoaded = true;

      if (W > 0) {
        const scatterAttr = pb.geometry.getAttribute(
          "aScatterPos"
        ) as THREE.BufferAttribute;
        redistributeScatter(pb.scatterBuf, scatterAttr, W, H);
      }
    }

    // ── Resize observer ──────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    // ── Events ───────────────────────────────────────────────────────────────
    function markInteracted() {
      if (!interacted) {
        interacted = true;
        if (hintEl) {
          hintEl.style.transition = "opacity 1s ease";
          hintEl.style.opacity = "0";
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      markInteracted();
      targetProgress = clamp(
        targetProgress + Math.abs(e.deltaY) * SCROLL_SENSITIVITY,
        0,
        1
      );
      // Scroll-rotate only after fully formed, and with much less sensitivity
      if (progress > 0.95) {
        targetRotY += e.deltaY * 0.0004;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      if (!isDragging) return;
      markInteracted();
      const dx = e.clientX - lastDragX;
      const dy = e.clientY - lastDragY;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      targetProgress = clamp(
        targetProgress + Math.sqrt(dx * dx + dy * dy) * DRAG_SENSITIVITY,
        0,
        1
      );
      if (progress > 0.75) {
        targetRotY += dx * DRAG_ROTATE_SPEED;
        targetRotX = clamp(targetRotX - dy * DRAG_TILT_SPEED, -MAX_TILT_X, MAX_TILT_X);
      }
    };

    const onPointerUp = () => {
      isDragging = false;
    };
    const onPointerLeave = () => {
      mouseX = -9999;
      mouseY = -9999;
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointerleave", onPointerLeave);

    // ── CPU per-frame work ───────────────────────────────────────────────────

    function updateCPU() {
      if (!pb) return;

      const SCENE_SCALE = Math.min(W, H) * SCENE_SCALE_FACTOR;
      const cosR = Math.cos(rotY);
      const sinR = Math.sin(rotY);
      const cosT = Math.cos(rotX);
      const sinT = Math.sin(rotX);
      const n = pb.count;
      const cpu = pb.cpuParticles;

      for (let i = 0; i < n; i++) {
        const p = cpu[i];

        // Compute formation ease (mirroring vertex shader)
        const localP = clamp(
          (progress - p.delay) / (1 - p.delay * 0.5),
          0,
          1
        );
        p.ep = easeInOutCubic(localP);

        // Compute screen position (needed for spring physics + proximity)
        const wx = pb.geometry.getAttribute("position").array[i * 3] * SCENE_SCALE;
        const wy = pb.geometry.getAttribute("position").array[i * 3 + 1] * SCENE_SCALE;
        const wz = pb.geometry.getAttribute("position").array[i * 3 + 2] * SCENE_SCALE;

        const rx = wx * cosR - wz * sinR;
        const ry = wy;
        const rz = wx * sinR + wz * cosR;

        // X-axis tilt
        const ry_t = ry * cosT - rz * sinT;
        const rz_t = ry * sinT + rz * cosT;

        const d = FOV / (FOV + rz_t + CAMERA_Z_OFFSET);

        p.depthFactor = clamp((d - 0.5) / 0.6, 0, 1);

        const ryFinal = ry_t * 1.15;
        const tx = rx * d + W * 0.58;
        const ty = -ryFinal * d + H * 0.85;

        // Scatter + brownian
        const scatterX = pb.scatterBuf[i * 2] + pb.brownianBuf[i * 2];
        const scatterY = pb.scatterBuf[i * 2 + 1] + pb.brownianBuf[i * 2 + 1];

        // Lerp
        const cx = scatterX + (tx - scatterX) * p.ep;
        const cy = scatterY + (ty - scatterY) * p.ep;

        // Wind
        let windX = 0,
          windY = 0;
        if (p.ep > 0.5) {
          const wf = pb.geometry.getAttribute("aWindFreq").array[i] as number;
          const wpx = pb.geometry.getAttribute("aWindPhase").array[i * 2] as number;
          const wpy = pb.geometry.getAttribute("aWindPhase").array[i * 2 + 1] as number;
          windX = Math.sin(time * wf + wpx) * wf * 12 * p.ep;
          windY = Math.cos(time * wf * 0.7 + wpy) * wf * 5 * p.ep;
        }

        p.screenX = cx + windX;
        p.screenY = cy + windY;

        // Brownian motion (scatter state)
        if (p.ep < 0.98) {
          p.bvx += (Math.random() - 0.5) * 0.3;
          p.bvy += (Math.random() - 0.5) * 0.3;
          p.bvx *= 0.92;
          p.bvy *= 0.92;
          pb.brownianBuf[i * 2] += p.bvx;
          pb.brownianBuf[i * 2 + 1] += p.bvy;
        }

        // Digit flicker — rapid glitch when disturbed by cursor
        const isDisturbed = Math.abs(p.velX) > 0.8 || Math.abs(p.velY) > 0.8;
        if (isDisturbed) {
          // Glitch: flicker every 2-4 frames, any digit
          if (Math.random() > 0.4) {
            p.digit = Math.floor(Math.random() * 10);
            pb.digitBuf[i] = p.digit;
          }
        } else {
          p.flickerTimer++;
          if (p.flickerTimer >= p.flickerInterval) {
            p.flickerTimer = 0;
            p.flickerInterval = 18 + Math.floor(Math.random() * 72);
            p.digit = assignDigit(p.darkness);
            pb.digitBuf[i] = p.digit;
          }
        }
      }

      // Turbulence physics
      updateTurbulencePhysics(cpu, mouseX, mouseY, time, pb.displacementBuf);

      // Mark dynamic attributes for upload
      (pb.geometry.getAttribute("aBrownian") as THREE.BufferAttribute).needsUpdate = true;
      (pb.geometry.getAttribute("aDisplacement") as THREE.BufferAttribute).needsUpdate = true;
      (pb.geometry.getAttribute("aDigitIndex") as THREE.BufferAttribute).needsUpdate = true;
    }

    // ── Smart proximity lines (1 connection per particle, no clusters) ────────

    function updateSmartLines() {
      if (!pb || progress < 0.7 || mouseX < -100) {
        lineGeometry.setDrawRange(0, 0);
        return;
      }

      const cpu = pb.cpuParticles;
      const n = pb.count;

      // Collect disturbed particles near cursor
      const near: number[] = [];
      const proxR2 = PROX_R * PROX_R;
      for (let i = 0; i < n; i++) {
        const p = cpu[i];
        if (p.ep < 0.5 || p.depthFactor < 0.3) continue;
        const sx = p.screenX + p.dispX;
        const sy = p.screenY + p.dispY;
        const dx = sx - mouseX;
        const dy = sy - mouseY;
        if (dx * dx + dy * dy < proxR2 * 2.5) near.push(i);
      }

      // Track which particles already have a connection (max 1 per particle)
      const connected = new Set<number>();
      let lineCount = 0;
      const minD2 = LINE_MIN_DIST * LINE_MIN_DIST;
      const maxD2 = LINE_MAX_DIST * LINE_MAX_DIST;

      for (let a = 0; a < near.length && lineCount < MAX_LINES; a++) {
        const idxA = near[a];
        if (connected.has(idxA)) continue;
        const pA = cpu[idxA];
        const ax = pA.screenX + pA.dispX;
        const ay = pA.screenY + pA.dispY;

        // Find ONE partner in the sweet spot (30-85px away)
        for (let b = a + 1; b < near.length; b++) {
          const idxB = near[b];
          if (connected.has(idxB)) continue;
          const pB = cpu[idxB];
          const bx = pB.screenX + pB.dispX;
          const by = pB.screenY + pB.dispY;
          const d2 = (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

          if (d2 > minD2 && d2 < maxD2) {
            // Connect this pair
            const off = lineCount * 6;
            linePosBuf[off] = ax;
            linePosBuf[off + 1] = ay;
            linePosBuf[off + 2] = 0;
            linePosBuf[off + 3] = bx;
            linePosBuf[off + 4] = by;
            linePosBuf[off + 5] = 0;
            lineCount++;
            connected.add(idxA);
            connected.add(idxB);
            break; // move to next particle
          }
        }
      }

      linePosAttr.needsUpdate = true;
      lineGeometry.setDrawRange(0, lineCount * 2);
      lineMat.uniforms.uResolution.value.set(W, H);
      const formAlpha = clamp((progress - 0.7) / 0.15, 0, 1);
      lineMat.uniforms.uLineAlpha.value = MAX_LINE_ALPHA * formAlpha;
    }

    // ── Overlay updates ──────────────────────────────────────────────────────

    function updateOverlays() {
      if (!interacted && hintEl) {
        hintEl.style.opacity = String(0.38 + 0.37 * Math.sin(time * 1.8));
        if (dotEl)
          dotEl.style.opacity = String(0.5 + 0.5 * Math.sin(time * 3.2));
      }
      if (bottomEl) {
        bottomEl.style.opacity = String(clamp((progress - 0.82) / 0.1, 0, 1));
      }
    }

    // ── RAF loop ─────────────────────────────────────────────────────────────

    function frame() {
      time += 0.016;

      // Smooth progress
      progress += (targetProgress - progress) * PROGRESS_LERP;

      if (progress > 0.85) targetRotY += AUTO_ROTATE_SPEED;
      rotY += (targetRotY - rotY) * ROT_LERP;
      rotX += (targetRotX - rotX) * ROT_LERP;

      // CPU work
      updateCPU();

      // Uniforms
      particleMat.uniforms.uProgress.value = progress;
      particleMat.uniforms.uRotY.value = rotY;
      particleMat.uniforms.uRotX.value = rotX;
      particleMat.uniforms.uTime.value = time;
      lineMat.uniforms.uTime.value = time;

      // Smart lines
      updateSmartLines();

      // Render Three.js scene
      renderer.render(scene, camera);

      // Rain (Canvas 2D)
      if (rainCtx) rain.draw(rainCtx, W, H, progress);

      // Overlays
      updateOverlays();

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointerleave", onPointerLeave);

      // Dispose Three.js resources
      if (points) {
        scene.remove(points);
      }
      scene.remove(lineSegments);
      pb?.geometry.dispose();
      lineGeometry.dispose();
      particleMat.dispose();
      lineMat.dispose();
      atlas.dispose();
      renderer.dispose();
    };
  }, []);

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        background: BG_COLOR,
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        cursor: "default",
      }}
    >
      {/* Rain layer (Canvas 2D) */}
      <canvas
        ref={rainCanvasRef}
        style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}
      />

      {/* Tree layer (Three.js WebGL) */}
      <canvas
        ref={treeCanvasRef}
        style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}
      />

      {/* Top-left signature */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 2,
          fontFamily: '"Courier New", monospace',
          fontSize: 8,
          letterSpacing: "0.18em",
          color: "rgba(10,10,10,0.18)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        AB&nbsp;&nbsp;&nbsp;2025
      </div>

      {/* Centre scroll/drag hint */}
      <div
        ref={hintRef}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          pointerEvents: "none",
          opacity: 0.75,
        }}
      >
        <span
          ref={dotRef}
          style={{
            display: "block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "rgba(10,10,10,0.5)",
          }}
        />
        <span
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 9,
            letterSpacing: "0.22em",
            color: "rgba(10,10,10,0.20)",
            whiteSpace: "nowrap",
          }}
        >
          SCROLL OR DRAG TO REVEAL
        </span>
      </div>

      {/* Bottom-left identity */}
      <div
        ref={bottomRef}
        style={{
          position: "absolute",
          bottom: 32,
          left: 24,
          zIndex: 2,
          pointerEvents: "none",
          opacity: 0,
        }}
      >
        <div
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 8.5,
            letterSpacing: "0.18em",
            color: "#0A0A0A",
            opacity: 0.28,
            marginBottom: 10,
            textTransform: "uppercase",
          }}
        >
          Visual Designer&nbsp;&middot;&nbsp;Bangalore
        </div>
        <div
          style={{
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: 900,
            fontSize: "clamp(20px, 3.8vw, 46px)",
            lineHeight: 0.86,
            letterSpacing: "-0.03em",
            color: "#0A0A0A",
          }}
        >
          ASHUTOSH
          <br />
          BHARDWAJ
        </div>
      </div>
    </div>
  );
}
