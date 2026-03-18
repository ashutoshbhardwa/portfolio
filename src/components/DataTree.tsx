"use client";

import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import {
  FOV,
  CAMERA_Z_OFFSET,
  SCENE_SCALE_FACTOR,
  PROGRESS_LERP,
  SCROLL_SENSITIVITY,
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
  DIGIT_TRUNK,
  DIGIT_BRANCH,
  DIGIT_MID,
} from "./data-tree/constants";
import type { RawPoint, ParticleCPU } from "./data-tree/types";
import { generateSDFAtlas } from "./data-tree/sdf-atlas";

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
  // Pool: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" (36 chars)
  const r = Math.floor(Math.random() * 0x7fffffff) >>> 0;
  if (darkness > DIGIT_TRUNK) return r % 9;            // A–I (indices 0–8)
  if (darkness > DIGIT_BRANCH) return 6 + (r % 13);    // G–S (indices 6–18)
  if (darkness > DIGIT_MID) return 12 + (r % 17);      // M–2 (indices 12–28)
  return 20 + (r % 16);                                 // U–9 (indices 20–35)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DataTree() {
  const containerRef = useRef<HTMLDivElement>(null);

  const treeCanvasRef = useRef<HTMLCanvasElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const watermarkRef = useRef<HTMLDivElement>(null);
  const watermarkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zonesRef = useRef<HTMLDivElement>(null);
  const starScreenRef = useRef<HTMLDivElement>(null);

  function showWatermark(word: string) {
    const el = watermarkRef.current;
    if (!el) return;
    el.textContent = word;
    el.style.opacity = '1';
    if (watermarkTimeoutRef.current) clearTimeout(watermarkTimeoutRef.current);
  }

  function hideWatermark() {
    const el = watermarkRef.current;
    if (!el) return;
    watermarkTimeoutRef.current = setTimeout(() => {
      el.style.opacity = '0';
    }, 200);
  }

  useEffect(() => {
    const container = containerRef.current!;
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
    let densityScale = 1.0; // user-controlled font size multiplier
    let treeFormedAt: number | null = null;
    let scrollUnlocked = false;
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

    // ── Resize ───────────────────────────────────────────────────────────────
    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      // Physical screen DPR — locked to hardware, never changes with browser zoom
      const physicalDPR = window.devicePixelRatio >= 1.5 ? 2 : 1;

      // Three.js renderer
      renderer.setSize(W, H);
      renderer.setPixelRatio(DPR);

      // Uniforms
      const uniformScale = Math.min(W / 1920, H / 1080);

      // Scene scale stays responsive to actual viewport — do NOT lock this to 1920
      particleMat.uniforms.uSceneScale.value = Math.min(W, H) * SCENE_SCALE_FACTOR;

      // Only use uniformScale for point size and interaction radii
      particleMat.uniforms.uUniformScale.value = uniformScale;
      particleMat.uniforms.uResolution.value.set(W, H);
      particleMat.uniforms.uDPR.value = physicalDPR;
      lineMat.uniforms.uResolution.value.set(W, H);

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
      // Force resize to current viewport before redistributing scatter
      W = window.innerWidth;
      H = window.innerHeight;
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      particleMat.uniforms.uResolution.value.set(W, H);
      particleMat.uniforms.uSceneScale.value = Math.min(W, H) * SCENE_SCALE_FACTOR;
      lineMat.uniforms.uResolution.value.set(W, H);
      const scatterAttr = pb.geometry.getAttribute('aScatterPos') as THREE.BufferAttribute;
      redistributeScatter(pb.scatterBuf, scatterAttr, W, H);
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

      // SCROLL UP — always works regardless of state
      if (e.deltaY < 0) {
        targetProgress = clamp(
          targetProgress + e.deltaY * SCROLL_SENSITIVITY,
          0,
          1.7
        );
        return;
      }

      // SCROLL DOWN phase 1: building tree
      // Hard cap at 0.88 — progress lerps toward 0.88 but check at 0.86
      if (progress < 0.86) {
        targetProgress = clamp(
          targetProgress + e.deltaY * SCROLL_SENSITIVITY,
          0,
          0.88
        );
        return;
      }

      // SCROLL DOWN phase 2+3: tree formed — scroll disintegrates
      targetProgress = clamp(
        targetProgress + e.deltaY * SCROLL_SENSITIVITY * 0.4,
        0,
        1.7
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      // Gentle mouse-follow tilt — tree leans toward cursor
      if (progress > 0.85) {
        const normX = (mouseX / W - 0.5) * 2; // -1 to 1
        const normY = (mouseY / H - 0.5) * 2; // -1 to 1
        targetRotY += normX * 0.0003;
        targetRotX = clamp(targetRotX + normY * -0.0002, -MAX_TILT_X, MAX_TILT_X);
      }

      if (!isDragging) return;
      markInteracted();
      const dx = e.clientX - lastDragX;
      const dy = e.clientY - lastDragY;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      if (isDragging && progress > 0.85 && progress < 1.4) {
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
          // Glitch: flicker every 2-4 frames, any character
          if (Math.random() > 0.4) {
            p.digit = Math.floor(Math.random() * 36);
            pb.digitBuf[i] = p.digit;
            p.fadeOpacity = 1;
            p.fadeState = 'visible';
            p.fadeTimer = 0;
          }
        } else {
          // Fade state machine for smooth character transitions
          if (p.fadeState === 'fading-out') {
            p.fadeTimer++;
            p.fadeOpacity = 1 - p.fadeTimer / 8;
            if (p.fadeTimer >= 8) {
              // At opacity 0, swap the character
              p.fadeOpacity = 0;
              p.digit = assignDigit(p.darkness);
              pb.digitBuf[i] = p.digit;
              p.fadeState = 'fading-in';
              p.fadeTimer = 0;
            }
          } else if (p.fadeState === 'fading-in') {
            p.fadeTimer++;
            p.fadeOpacity = p.fadeTimer / 8;
            if (p.fadeTimer >= 8) {
              p.fadeOpacity = 1;
              p.fadeState = 'visible';
              p.fadeTimer = 0;
            }
          } else {
            // visible state — normal flicker timer
            p.flickerTimer++;
            if (p.flickerTimer >= p.flickerInterval) {
              p.flickerTimer = 0;
              p.flickerInterval = 18 + Math.floor(Math.random() * 72);
              p.fadeState = 'fading-out';
              p.fadeTimer = 0;
            }
          }
        }
        pb.opacityBuf[i] = p.fadeOpacity;
      }

      // Turbulence physics
      const uScale = Math.min(W / 1920, H / 1080);
      updateTurbulencePhysics(cpu, mouseX, mouseY, time, pb.displacementBuf, uScale);

      // Mark dynamic attributes for upload
      (pb.geometry.getAttribute("aBrownian") as THREE.BufferAttribute).needsUpdate = true;
      (pb.geometry.getAttribute("aDisplacement") as THREE.BufferAttribute).needsUpdate = true;
      (pb.geometry.getAttribute("aDigitIndex") as THREE.BufferAttribute).needsUpdate = true;
      (pb.geometry.getAttribute("aFadeOpacity") as THREE.BufferAttribute).needsUpdate = true;
    }

    // ── Smart proximity lines (1 connection per particle, no clusters) ────────

    function updateSmartLines() {
      if (!pb || progress < 0.7 || mouseX < -100) {
        lineGeometry.setDrawRange(0, 0);
        return;
      }

      const cpu = pb.cpuParticles;
      const n = pb.count;
      const scale = Math.min(W / 1920, H / 1080);
      const scaledProxR = PROX_R * scale;
      const scaledLineMin = LINE_MIN_DIST * scale;
      const scaledLineMax = LINE_MAX_DIST * scale;

      // Collect disturbed particles near cursor
      const near: number[] = [];
      const proxR2 = scaledProxR * scaledProxR;
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
      const connectionPartners = new Map<number, number>();
      let lineCount = 0;
      const minD2 = scaledLineMin * scaledLineMin;
      const maxD2 = scaledLineMax * scaledLineMax;

      for (let a = 0; a < near.length && lineCount < MAX_LINES; a++) {
        const idxA = near[a];
        if (connected.has(idxA)) continue;
        const pA = cpu[idxA];
        const ax = pA.screenX + pA.dispX;
        const ay = pA.screenY + pA.dispY;

        // Find ONE partner in the sweet spot (45-90px away)
        for (let b = a + 1; b < near.length; b++) {
          const idxB = near[b];
          if (connected.has(idxB)) continue;

          // Reject if would form triangle with existing connections
          const partnerOfA = connectionPartners.get(idxA);
          const partnerOfB = connectionPartners.get(idxB);
          if (partnerOfA !== undefined && connectionPartners.get(partnerOfA) === idxB) continue;
          if (partnerOfB !== undefined && connectionPartners.get(partnerOfB) === idxA) continue;

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
            connectionPartners.set(idxA, idxB);
            connectionPartners.set(idxB, idxA);
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
      if (hintEl) {
        if (progress >= 1.0) {
          hintEl.style.opacity = '0';
        } else if (progress >= 0.85 && scrollUnlocked) {
          // Unlocked — show scroll to explore with pulsing
          hintEl.style.opacity = String(0.4 + 0.3 * Math.sin(time * 2.0));
          const hintText = hintEl.querySelector('span:first-child') as HTMLElement;
          if (hintText) hintText.textContent = 'scroll to explore';
        } else if (progress >= 0.85 && !scrollUnlocked) {
          // Still in lock period — hide the nudge, let user explore
          hintEl.style.opacity = '0';
        } else if (!interacted) {
          // Pre-interaction — show scroll to reveal
          hintEl.style.opacity = String(0.38 + 0.37 * Math.sin(time * 1.8));
        }
        if (dotEl)
          dotEl.style.transform = `scaleY(${0.5 + 0.5 * Math.sin(time * 3.2)})`;
      }
      if (nameRef.current) {
        nameRef.current.style.opacity = String(clamp((progress - 0.82) / 0.12, 0, 1));
      }
      if (zonesRef.current) {
        const zonesVisible = progress > 0.85 && progress < 1.0;
        zonesRef.current.style.opacity = zonesVisible ? '1' : '0';
        zonesRef.current.style.pointerEvents = zonesVisible ? 'auto' : 'none';
      }
      if (starScreenRef.current) {
        const starOpacity = clamp((progress - 1.4) / 0.3, 0, 1);
        starScreenRef.current.style.opacity = String(starOpacity);
        starScreenRef.current.style.pointerEvents = starOpacity > 0.1 ? 'auto' : 'none';
      }
    }

    // ── Density keyboard control ──────────────────────────────────────────────

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        densityScale = Math.min(densityScale + 0.15, 2.5);
        particleMat.uniforms.uDensityScale.value = densityScale;
        updateDensityHint();
      }
      if (e.key === '-') {
        e.preventDefault();
        densityScale = Math.max(densityScale - 0.15, 0.3);
        particleMat.uniforms.uDensityScale.value = densityScale;
        updateDensityHint();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Show hint label briefly when density changes
    function updateDensityHint() {
      const el = document.getElementById('density-hint');
      if (!el) return;
      el.style.opacity = '1';
      clearTimeout((el as any)._t);
      (el as any)._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
    }

    // ── RAF loop ─────────────────────────────────────────────────────────────

    function frame() {
      time += 0.016;

      // Smooth progress
      progress += (targetProgress - progress) * PROGRESS_LERP;

      // Detect when tree first fully forms
      if (progress >= 0.85 && treeFormedAt === null) {
        treeFormedAt = time;
      }
      // Unlock scroll-to-disintegrate after 5 seconds
      if (treeFormedAt !== null && !scrollUnlocked) {
        scrollUnlocked = (time - treeFormedAt) >= 5.0;
      }

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
      const disint = clamp((progress - 0.86) / 0.8, 0, 1);
      particleMat.uniforms.uDisintegration.value = disint;
      if (progress >= 1.65) targetProgress = 1.65;
      lineMat.uniforms.uTime.value = time;

      // Smart lines
      updateSmartLines();

      // Render Three.js scene
      renderer.render(scene, camera);

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
      window.removeEventListener('keydown', onKeyDown);

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
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: '#F9F8F4',
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        cursor: "default",
      }}
    >
      {/* Tree layer (Three.js WebGL) */}
      <canvas
        ref={treeCanvasRef}
        style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}
      />

      {/* Top-left signature */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 5,
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

      {/* Bottom-center scroll nudge */}
      <div
        ref={hintRef}
        style={{
          position: 'absolute',
          bottom: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'none',
          opacity: 0.75,
        }}
      >
        <span
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 8,
            letterSpacing: '0.22em',
            color: 'rgba(10,10,10,0.22)',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}
        >
          scroll to reveal
        </span>
        <span
          ref={dotRef}
          style={{
            display: 'block',
            width: 1,
            height: 14,
            background: 'rgba(10,10,10,0.18)',
          }}
        />
      </div>

      {/* Top-left identity */}
      <div
        ref={nameRef}
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          zIndex: 0,
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 0.8s ease',
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
            fontSize: 'clamp(28px, 5.5vw, 72px)',
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

      {/* Density change hint (shown briefly on ⌘+/⌘−) */}
      <div
        id="density-hint"
        style={{
          position: 'absolute',
          bottom: 32,
          right: 28,
          zIndex: 5,
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 0.4s ease',
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          letterSpacing: '0.18em',
          color: 'rgba(10,10,10,0.35)',
          textTransform: 'uppercase',
        }}
      >
        ⌘ + / ⌘ − &nbsp; density
      </div>

      {/* Permanent density control hint */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 24,
          zIndex: 5,
          pointerEvents: 'none',
          fontFamily: '"Courier New", monospace',
          fontSize: 8,
          letterSpacing: '0.18em',
          color: 'rgba(10,10,10,0.13)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        ⌘ + / ⌘ − &nbsp; density
      </div>

      {/* Watermark overlay for easter egg hover zones */}
      <div
        ref={watermarkRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(80px, 16vw, 220px)',
          letterSpacing: '-0.04em',
          color: 'rgba(10,10,10,0.22)',
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 0.5s ease',
          userSelect: 'none',
          textAlign: 'center',
          lineHeight: 1,
        }}
      />

      {/* Starry night second screen */}
      <div
        ref={starScreenRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 6,
          background: 'transparent',
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 0.4s ease',
          overflow: 'hidden',
        }}
      >
        {[
          { text: 'Visual Designer', x: '12%',  y: '18%' },
          { text: '2019 — 2025',     x: '72%',  y: '9%'  },
          { text: 'CDC',             x: '38%',  y: '32%' },
          { text: 'Motion',          x: '61%',  y: '55%' },
          { text: 'Bangalore',       x: '22%',  y: '71%' },
          { text: 'Stable Money',    x: '78%',  y: '38%' },
          { text: 'Daily Objects',   x: '48%',  y: '78%' },
          { text: 'System Design',   x: '8%',   y: '48%' },
          { text: 'Probo',           x: '85%',  y: '72%' },
          { text: '3D',              x: '55%',  y: '22%' },
          { text: 'Brand',           x: '30%',  y: '88%' },
          { text: 'Strategy',        x: '66%',  y: '88%' },
        ].map((node, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: node.x,
              top: node.y,
              fontFamily: '"Courier New", monospace',
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(10,10,10,0.22)',
              whiteSpace: 'nowrap',
              animation: `starFade ${3 + (i % 4)}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          >
            {node.text}
          </div>
        ))}
      </div>

      {/* starFade keyframes */}
      <style>{`
        @keyframes starFade {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.55; }
        }
      `}</style>

      {/* Hidden easter egg hover zones — only active once tree is formed */}
      <div ref={zonesRef} style={{ opacity: 0, pointerEvents: 'none', transition: 'opacity 0.6s ease' }}>
        {[
          { top: '8%',  left: '28%', w: '22%', h: '20%', word: 'CDC 3D' },
          { top: '10%', left: '50%', w: '24%', h: '22%', word: 'STABLE MONEY' },
          { top: '28%', left: '32%', w: '20%', h: '18%', word: 'SYSTEM DESIGN' },
          { top: '26%', left: '54%', w: '20%', h: '18%', word: 'DAILY OBJECTS' },
          { top: '44%', left: '40%', w: '18%', h: '16%', word: 'PROBO' },
          { top: '48%', left: '30%', w: '16%', h: '14%', word: 'STRATEGIC THINKING' },
          { top: '55%', left: '50%', w: '18%', h: '14%', word: 'MOTION' },
        ].map((z, i) => (
          <div
            key={i}
            onMouseEnter={() => showWatermark(z.word)}
            onMouseLeave={() => hideWatermark()}
            style={{
              position: 'absolute',
              top: z.top,
              left: z.left,
              width: z.w,
              height: z.h,
              zIndex: 4,
              cursor: 'default',
              background: 'transparent',
            }}
          />
        ))}
      </div>
    </div>
  );
}
