"use client";

import React, { useRef, useEffect, useState } from "react";
import WorkPage from "./WorkPage";
import TextScramble from "./TextScramble";
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
  BG_COLOR,
  COLOR_LERP_SPEED,
  ZONE_COLORS,
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
import { getCDCScatterPositions, getBentoPoints } from "./data-tree/logo-sampler";

// ── PillButton ──────────────────────────────────────────────────────────────

function PillButton({ children, onClick, onMouseEnter, onMouseLeave, style }: {
  children: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  style?: React.CSSProperties;
}) {
  const [displayText, setDisplayText] = React.useState(children);
  const [scale, setScale] = React.useState(1);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const iRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const scramble30 = () => {
    if (iRef.current) clearInterval(iRef.current);
    let ticks = 0;
    iRef.current = setInterval(() => {
      let out = '';
      for (let i = 0; i < children.length; i++) {
        if (children[i] === ' ') { out += ' '; continue; }
        out += Math.random() < 0.3
          ? chars[Math.floor(Math.random() * chars.length)]
          : children[i];
      }
      setDisplayText(out);
      ticks++;
      if (ticks > 8) { clearInterval(iRef.current!); setDisplayText(children); }
    }, 40);
  };

  const scrambleFull = () => {
    if (iRef.current) clearInterval(iRef.current);
    let step = 0;
    const steps = 12;
    iRef.current = setInterval(() => {
      const progress = step / steps;
      let out = '';
      for (let i = 0; i < children.length; i++) {
        if (children[i] === ' ') { out += ' '; continue; }
        out += progress * children.length > i
          ? children[i]
          : chars[Math.floor(Math.random() * chars.length)];
      }
      setDisplayText(out);
      step++;
      if (step > steps) { clearInterval(iRef.current!); setDisplayText(children); }
    }, 35);
  };

  const handleMouseEnter = () => { scramble30(); onMouseEnter?.(); };
  const handleMouseLeave = () => {
    if (iRef.current) clearInterval(iRef.current);
    setDisplayText(children);
    onMouseLeave?.();
  };
  const handleClick = () => {
    setScale(0.92);
    setTimeout(() => setScale(1.04), 80);
    setTimeout(() => setScale(1), 180);
    scrambleFull();
    onClick?.();
  };

  React.useEffect(() => () => {
    if (iRef.current) clearInterval(iRef.current);
  }, []);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        ...style,
        transform: `scale(${scale})`,
        transition: 'transform 0.1s cubic-bezier(0.22, 1, 0.36, 1)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {displayText}
    </div>
  );
}

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

// ── Ambient copy ─────────────────────────────────────────────────────────────

const AMBIENT_COPY: Record<string, string> = {
  'DAILYOBJECTS': "Brand + Product Designer, 2022\u20132024. Crafting brand systems and product design for India\u2019s leading accessories company.",
  'CREPDOGCREW': "Visual Designer, 2021\u20132022. Building the visual language for India\u2019s sneaker culture. Drops, campaigns, community.",
  'PROBO': "Product Designer, 2023\u20132024. Designing for a prediction market at scale. Speed, clarity, trust.",
  'STABLE MONEY': "Lead Designer, 2024\u2013Present. Making fixed income feel modern. Systematic design for a complex financial product.",
  'OTHER': "Freelance, 2019\u2013Present. Independent work, passion projects, and things that don\u2019t fit a box.",
  'MOTION DESIGN': "Motion as a language. Transitions, interactions, and things that feel alive.",
  'SYSTEMS': "Design systems that scale. Tokens, components, documentation.",
  '3D': "Dimensional work. Objects, environments, and spatial thinking.",
  'BRAND': "Identity at its core. Marks, systems, and how things present themselves.",
  'GLITCH': "Controlled chaos. Distortion as aesthetic, noise as signal.",
};
const DEFAULT_AMBIENT = "VISUAL DESIGNER \u00B7 BANGALORE \u00B7 MULTI-DISCIPLINARY DESIGNER \u00B7 VISUAL DESIGNER \u00B7 BANGALORE";

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
  const workPillRef = useRef<HTMLDivElement>(null);
  const paraRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const densityPillRef = useRef<HTMLDivElement>(null);
  const blurRectRef = useRef<HTMLDivElement>(null);

  // Work page state
  const [workVisible, setWorkVisible] = useState(false);
  const workVisibleRef = useRef(false);
  const targetProgressRef = useRef(0);
  const resetProgressRef = useRef<() => void>(() => {});

  // Ambient text state
  const [ambientText, setAmbientText] = useState(DEFAULT_AMBIENT);
  const [ambientKey, setAmbientKey] = useState('default');

  // Homepage reveal — triggers scramble + pill expansion when overlays first become visible
  const [homepageRevealed, setHomepageRevealed] = useState(false);
  const homepageRevealedRef = useRef(false);
  const workPageRef = useRef<HTMLDivElement>(null);

  // Logo morph state (legacy CDC)
  const logoModeRef = useRef(false);
  const savedScatterRef = useRef<Float32Array | null>(null);
  const setLogoModeRef = useRef<(active: boolean) => void>(() => {});
  const logoLockedRef = useRef<string | null>(null);

  // Bento thumbnail formation state
  const bentoModeRef = useRef(false);
  const bentoSavedScatterRef = useRef<Float32Array | null>(null);
  const bentoTargetRef = useRef<Float32Array | null>(null); // target positions to lerp toward
  const bentoSavedZRef = useRef<Float32Array | null>(null); // saved Z positions
  const setBentoModeRef = useRef<(active: boolean, key: string) => void>(() => {});

  // ── Color state (lerped in render loop) ──────────────────────────────────
  const colorStateRef = useRef({
    // Current interpolated color (0-1 range)
    r: 0, g: 0, b: 0,
    // Target color
    tr: 0, tg: 0, tb: 0,
    // Current tint strength (0 = no tint, 1 = full tint)
    strength: 0,
    targetStrength: 0,
    // Active zone key (for type lookup)
    activeZone: null as string | null,
    // Zone type: 'experience' = bg flood, 'skill' = bg stays white
    zoneType: null as 'experience' | 'skill' | null,
  });

  function showWatermark(word: string, colorKey: string) {
    const el = watermarkRef.current;
    if (!el) return;
    el.textContent = word;
    el.style.opacity = '1';
    if (watermarkTimeoutRef.current) clearTimeout(watermarkTimeoutRef.current);

    // Set target color from registry
    const zone = ZONE_COLORS[colorKey];
    if (zone) {
      const cs = colorStateRef.current;
      cs.tr = zone.r;
      cs.tg = zone.g;
      cs.tb = zone.b;
      cs.targetStrength = 1.0; // always full strength
      cs.activeZone = colorKey;
      cs.zoneType = zone.type;
    }

    // Update ambient text
    setAmbientText(AMBIENT_COPY[colorKey] ?? DEFAULT_AMBIENT);
    setAmbientKey(colorKey + Date.now());
  }

  function hideWatermark() {
    const el = watermarkRef.current;
    if (!el) return;
    watermarkTimeoutRef.current = setTimeout(() => {
      el.style.opacity = '0';
    }, 200);

    // Lerp back to default — keep activeZone/zoneType set during fade-out
    // so the correct branch handles the transition. They reset in the else block.
    const cs = colorStateRef.current;
    cs.targetStrength = 0;

    // Reset ambient text
    setAmbientText(DEFAULT_AMBIENT);
    setAmbientKey('default');
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

    // ── Logo morph function ────────────────────────────────────────────────
    setLogoModeRef.current = (active: boolean) => {
      if (!pb) return;
      const scatterAttr = pb.geometry.getAttribute('aScatterPos') as THREE.BufferAttribute;
      const brownianAttr = pb.geometry.getAttribute('aBrownian') as THREE.BufferAttribute;
      if (active && !logoModeRef.current) {
        // Save current scatter positions
        savedScatterRef.current = new Float32Array(pb.scatterBuf);
        // Get logo positions and copy into scatterBuf
        const logoPositions = getCDCScatterPositions(pb.count, W, H);
        pb.scatterBuf.set(logoPositions);
        scatterAttr.needsUpdate = true;
        // Zero out brownian drift so particles spring cleanly to logo positions
        pb.brownianBuf.fill(0);
        brownianAttr.needsUpdate = true;
        // Reset per-particle brownian velocities
        for (let i = 0; i < pb.count; i++) {
          pb.cpuParticles[i].bvx = 0;
          pb.cpuParticles[i].bvy = 0;
        }
        logoModeRef.current = true;
      } else if (!active && logoModeRef.current) {
        // Restore saved scatter positions
        if (savedScatterRef.current) {
          pb.scatterBuf.set(savedScatterRef.current);
          scatterAttr.needsUpdate = true;
        }
        logoModeRef.current = false;
      }
    };

    // ── Bento thumbnail formation ─────────────────────────────────────────────
    setBentoModeRef.current = (active: boolean, key: string) => {
      if (!pb) return;

      if (active && !bentoModeRef.current) {
        // Save original scatter if not already saved
        if (!bentoSavedScatterRef.current) {
          bentoSavedScatterRef.current = new Float32Array(pb.scatterBuf);
        }
        // Set bento target — lerp will happen in RAF loop
        bentoTargetRef.current = getBentoPoints(key, pb.count, W, H);
        // Zero brownian so lerp is clean
        pb.brownianBuf.fill(0);
        const brownianAttr = pb.geometry.getAttribute('aBrownian') as THREE.BufferAttribute;
        brownianAttr.needsUpdate = true;
        for (let i = 0; i < pb.count; i++) {
          pb.cpuParticles[i].bvx = 0;
          pb.cpuParticles[i].bvy = 0;
        }
        // Flatten Z to zero — removes 3D depth spread
        const posArr = pb.geometry.getAttribute('position').array as Float32Array;
        bentoSavedZRef.current = new Float32Array(pb.count);
        for (let i = 0; i < pb.count; i++) {
          bentoSavedZRef.current[i] = posArr[i * 3 + 2];
          posArr[i * 3 + 2] = 0;
        }
        (pb.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        // Increase particle size for denser fill
        particleMat.uniforms.uDensityScale.value = 5.0;
        bentoModeRef.current = true;
      } else if (!active && bentoModeRef.current) {
        // Set target back to saved scatter — lerp will animate back
        if (bentoSavedScatterRef.current) {
          bentoTargetRef.current = new Float32Array(bentoSavedScatterRef.current);
        }
        // Restore Z depth
        if (bentoSavedZRef.current) {
          const posArr = pb.geometry.getAttribute('position').array as Float32Array;
          for (let i = 0; i < pb.count; i++) {
            posArr[i * 3 + 2] = bentoSavedZRef.current[i];
          }
          (pb.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
          bentoSavedZRef.current = null;
        }
        // Restore original density
        particleMat.uniforms.uDensityScale.value = densityScale;
        bentoModeRef.current = false;
      }
    };

    // ── Progress reset (for HOME pill) ──────────────────────────────────────
    resetProgressRef.current = () => {
      targetProgress = 0;
      progress = 0;
    };

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
      if (isDragging && progress > 0.85) {
        targetRotY += dx * DRAG_ROTATE_SPEED;
        targetRotX = clamp(targetRotX - dy * DRAG_TILT_SPEED, -MAX_TILT_X, MAX_TILT_X);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      try { container.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    const onPointerLeave = (e: PointerEvent) => {
      isDragging = false;
      mouseX = -9999;
      mouseY = -9999;
      try { container.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    const onWindowBlur = () => { isDragging = false; };

    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onWindowBlur);

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

        // Brownian motion — active in scatter AND disintegration, suppressed in logo mode
        {
          const disintActive = progress > 0.9;
          const inFormationMode = logoModeRef.current || bentoModeRef.current;
          const brownianScale = inFormationMode ? 0 : (p.ep < 0.98 ? 1.0 : disintActive ? 0.15 : 0);
          if (brownianScale > 0) {
            p.bvx += (Math.random() - 0.5) * 0.3 * brownianScale;
            p.bvy += (Math.random() - 0.5) * 0.3 * brownianScale;
            p.bvx *= 0.92;
            p.bvy *= 0.92;
            pb.brownianBuf[i * 2] += p.bvx;
            pb.brownianBuf[i * 2 + 1] += p.bvy;
          }
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
      // SCROLL text — visible pre-interaction, fades as tree forms
      if (hintEl) {
        if (progress >= 0.85) {
          hintEl.style.opacity = '0';
        } else if (!interacted) {
          hintEl.style.opacity = String(0.7 + 0.1 * Math.sin(time * 1.8));
        }
        if (dotEl)
          dotEl.style.transform = `scaleY(${0.5 + 0.5 * Math.sin(time * 3.2)})`;
      }

      // Unified show/hide formula for all overlays
      const showAmount = clamp((progress - 0.82) / 0.03, 0, 1);
      const hideAmount = clamp(1 - (progress - 0.95) / 0.2, 0, 1);
      const overlayOpacity = showAmount * hideAmount;

      // Trigger homepage scramble + pill expansion when first visible
      if (overlayOpacity > 0.15 && !homepageRevealedRef.current) {
        homepageRevealedRef.current = true;
        setHomepageRevealed(true);
      }

      if (nameRef.current) {
        nameRef.current.style.opacity = String(overlayOpacity);
      }
      if (zonesRef.current) {
        const zonesVisible = progress > 0.85 && progress < 1.0;
        zonesRef.current.style.opacity = zonesVisible ? '1' : '0';
        zonesRef.current.style.pointerEvents = zonesVisible ? 'auto' : 'none';
      }
      if (starScreenRef.current) {
        const starOpacity = clamp((progress - 1.4) / 0.3, 0, 1);
        starScreenRef.current.style.opacity = String(starOpacity);
        // Never let star screen block WorkPage clicks
        starScreenRef.current.style.pointerEvents = 'none';
      }
      if (paraRef.current) {
        paraRef.current.style.opacity = String(overlayOpacity);
      }
      // Subtitle overlay
      const subtitleEl = container.querySelector('.subtitle-overlay') as HTMLElement;
      if (subtitleEl) {
        subtitleEl.style.opacity = String(overlayOpacity);
      }
      if (workPillRef.current) {
        workPillRef.current.style.opacity = String(overlayOpacity);
        workPillRef.current.style.pointerEvents = overlayOpacity > 0.1 ? 'auto' : 'none';
      }
      // Downward arrow
      const arrowEl = container.querySelector('.pill-arrow') as HTMLElement;
      if (arrowEl) {
        arrowEl.style.opacity = String(overlayOpacity);
      }
      // Vignette: visible in scatter, fades as tree forms
      if (vignetteRef.current) {
        const vigOp = clamp(1 - (progress - 0.6) / 0.25, 0, 0.8);
        vignetteRef.current.style.opacity = String(vigOp);
      }
      if (navRef.current) {
        navRef.current.style.opacity = String(overlayOpacity);
        navRef.current.style.pointerEvents = overlayOpacity > 0.1 ? 'auto' : 'none';
      }
      if (densityPillRef.current) {
        densityPillRef.current.style.opacity = String(overlayOpacity);
        densityPillRef.current.style.pointerEvents = overlayOpacity > 0.1 ? 'auto' : 'none';
      }

      // ── Color logic: smooth lerp background + particle tint on zone hover ──
      // EXPERIENCE: background floods with brand color, particles stay dark,
      //   all UI contrast-switches to white, watermark = darker tint of brand
      // SKILL: background stays white (#F9F8F4), particles + overlays change
      //   to brand color, watermark = brand color
      const cs = colorStateRef.current;
      const lerpSpeed = COLOR_LERP_SPEED;
      const isExperience = cs.zoneType === 'experience';

      // Lerp strength
      cs.strength += (cs.targetStrength - cs.strength) * lerpSpeed;
      if (Math.abs(cs.strength) < 0.001) cs.strength = 0;

      // Lerp color channels
      cs.r += (cs.tr - cs.r) * lerpSpeed;
      cs.g += (cs.tg - cs.g) * lerpSpeed;
      cs.b += (cs.tb - cs.b) * lerpSpeed;

      const r255 = Math.round(cs.r * 255);
      const g255 = Math.round(cs.g * 255);
      const b255 = Math.round(cs.b * 255);

      // Helper: target the INNER child div for refs whose style lives on a nested element
      // nameRef, workPillRef, subtitle-overlay all have their colors on a child div
      const nameInner = nameRef.current?.querySelector('div') as HTMLElement | null;
      const subtitleInner = (container.querySelector('.subtitle-overlay') as HTMLElement)?.querySelector('div') as HTMLElement | null;
      const workPillInner = workPillRef.current?.querySelector('div') as HTMLElement | null;
      // navRef and densityPillRef have their styles directly on the ref'd element
      const arrowSvg = container.querySelector('.pill-arrow svg') as SVGElement | null;

      if (cs.strength > 0.005) {
        const bgR = 249 / 255;
        const bgG = 248 / 255;
        const bgB = 244 / 255;

        // DailyObjects special case: bg is black, so watermark should be LIGHTER (white tint)
        const isDailyObjects = cs.activeZone === 'DAILYOBJECTS';
        const brandLum = 0.299 * cs.r + 0.587 * cs.g + 0.114 * cs.b;

        if (isExperience) {
          // ── EXPERIENCE: full background flood ──
          const mixR = Math.round((bgR + (cs.r - bgR) * cs.strength) * 255);
          const mixG = Math.round((bgG + (cs.g - bgG) * cs.strength) * 255);
          const mixB = Math.round((bgB + (cs.b - bgB) * cs.strength) * 255);
          container.style.background = `rgb(${mixR},${mixG},${mixB})`;
          if (blurRectRef.current) blurRectRef.current.style.background = `rgb(${mixR},${mixG},${mixB})`;

          // Particles stay dark (no tint) — they contrast against colored bg
          // Exception: DailyObjects (black bg) → particles should go white
          if (isDailyObjects) {
            particleMat.uniforms.uTintColor.value.set(1, 1, 1);
            particleMat.uniforms.uTintStrength.value = cs.strength;
          } else {
            particleMat.uniforms.uTintStrength.value = 0;
          }

          // All text → white for contrast
          if (nameInner) nameInner.style.color = '#FFFFFF';
          if (subtitleInner) subtitleInner.style.color = '#FFFFFF';
          if (paraRef.current) paraRef.current.style.color = 'rgba(255,255,255,0.55)';

          // Watermark: darker tint of brand color; exception: DailyObjects → lighter (white)
          if (watermarkRef.current) {
            if (isDailyObjects || brandLum < 0.15) {
              // Dark background → lighter watermark
              watermarkRef.current.style.color = `rgba(255,255,255,0.18)`;
            } else {
              // Colored bg → darker tint of brand
              const darkR = Math.round(cs.r * 0.6 * 255);
              const darkG = Math.round(cs.g * 0.6 * 255);
              const darkB = Math.round(cs.b * 0.6 * 255);
              watermarkRef.current.style.color = `rgba(${darkR},${darkG},${darkB},0.35)`;
            }
          }

          // Pills → white bg, dark text for contrast
          if (workPillInner) {
            workPillInner.style.background = '#FFFFFF';
            workPillInner.style.color = '#000000';
          }
          if (navRef.current) {
            navRef.current.style.background = '#FFFFFF';
            navRef.current.style.color = '#000000';
          }
          if (densityPillRef.current) {
            densityPillRef.current.style.background = '#FFFFFF';
            densityPillRef.current.style.color = '#000000';
          }
          // Arrow SVG → white
          if (arrowSvg) {
            arrowSvg.querySelectorAll('path').forEach(p => {
              p.setAttribute('stroke', '#FFFFFF');
              if (p.getAttribute('fill') !== 'none') p.setAttribute('fill', '#FFFFFF');
            });
          }
        } else {
          // ── SKILL: background stays white, particles + overlays change color ──
          container.style.background = '#F9F8F4';
          if (blurRectRef.current) blurRectRef.current.style.background = '#F9F8F4';

          // Particles tint to brand color
          particleMat.uniforms.uTintColor.value.set(cs.r, cs.g, cs.b);
          particleMat.uniforms.uTintStrength.value = cs.strength;

          // Overlays change to brand color
          if (nameInner) nameInner.style.color = `rgb(${r255},${g255},${b255})`;
          if (subtitleInner) subtitleInner.style.color = `rgb(${r255},${g255},${b255})`;
          if (paraRef.current) paraRef.current.style.color = `rgba(${r255},${g255},${b255},0.45)`;

          // Watermark: brand color, slightly transparent
          if (watermarkRef.current) {
            watermarkRef.current.style.color = `rgba(${r255},${g255},${b255},0.22)`;
          }

          // Pills: change to brand color bg
          if (workPillInner) {
            workPillInner.style.background = `rgb(${r255},${g255},${b255})`;
            workPillInner.style.color = '#FFFFFF';
          }
          if (navRef.current) {
            navRef.current.style.background = `rgb(${r255},${g255},${b255})`;
            navRef.current.style.color = '#FFFFFF';
          }
          if (densityPillRef.current) {
            densityPillRef.current.style.background = `rgb(${r255},${g255},${b255})`;
            densityPillRef.current.style.color = '#FFFFFF';
          }
          // Arrow SVG → brand color
          if (arrowSvg) {
            arrowSvg.querySelectorAll('path').forEach(p => {
              p.setAttribute('stroke', `rgb(${r255},${g255},${b255})`);
              if (p.getAttribute('fill') !== 'none') p.setAttribute('fill', `rgb(${r255},${g255},${b255})`);
            });
          }
        }
      } else {
        // ── Reset to defaults ──
        cs.activeZone = null;
        cs.zoneType = null;
        container.style.background = '#F9F8F4';
        particleMat.uniforms.uTintStrength.value = 0;
        if (nameInner) nameInner.style.color = '#0A0A0A';
        if (subtitleInner) subtitleInner.style.color = 'rgb(10,10,10)';
        if (paraRef.current) paraRef.current.style.color = 'rgba(0,0,0,0.45)';
        if (watermarkRef.current) watermarkRef.current.style.color = 'rgba(10,10,10,0.22)';
        if (blurRectRef.current) blurRectRef.current.style.background = '#F9F8F4';
        if (workPillInner) {
          workPillInner.style.background = '#000000';
          workPillInner.style.color = '#FFFFFF';
        }
        if (navRef.current) {
          navRef.current.style.background = 'rgb(0,0,0)';
          navRef.current.style.color = 'rgb(241,241,241)';
        }
        if (densityPillRef.current) {
          densityPillRef.current.style.background = '#000000';
          densityPillRef.current.style.color = '#ffffff';
        }
        // Arrow SVG → default dark
        if (arrowSvg) {
          arrowSvg.querySelectorAll('path').forEach(p => {
            p.setAttribute('stroke', '#0A0A0A');
            if (p.getAttribute('fill') !== 'none') p.setAttribute('fill', '#0A0A0A');
          });
        }
      }

      // WorkPage color sync via CSS variables
      if (workPageRef.current && workVisibleRef.current) {
        const s = cs.strength;
        const el = workPageRef.current;
        if (s > 0.01) {
          const isExp = cs.zoneType === 'experience';
          if (isExp) {
            el.style.setProperty('--wp-text', '#ffffff');
            el.style.setProperty('--wp-pill-bg', '#ffffff');
            el.style.setProperty('--wp-pill-text', `rgb(${r255},${g255},${b255})`);
            el.style.setProperty('--wp-toggle-bg', 'rgba(255,255,255,0.2)');
          } else {
            el.style.setProperty('--wp-text', `rgb(${r255},${g255},${b255})`);
            el.style.setProperty('--wp-pill-bg', `rgb(${r255},${g255},${b255})`);
            el.style.setProperty('--wp-pill-text', '#ffffff');
            el.style.setProperty('--wp-toggle-bg', `rgba(${r255},${g255},${b255},0.15)`);
          }
        } else {
          el.style.setProperty('--wp-text', '#000000');
          el.style.setProperty('--wp-pill-bg', '#000000');
          el.style.setProperty('--wp-pill-text', '#ffffff');
          el.style.setProperty('--wp-toggle-bg', 'transparent');
        }
      }

      // WorkPage visibility — show when disintegration is well underway
      // Work page visibility
      if (progress >= 1.3 && !workVisibleRef.current) {
        workVisibleRef.current = true;
        setWorkVisible(true);
      } else if (progress < 1.3 && workVisibleRef.current) {
        workVisibleRef.current = false;
        setWorkVisible(false);
      }
    }

    // ── Glitch effect on scroll hint ──────────────────────────────────────────
    const GLITCH_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&';
    const ORIGINAL_TEXT = 'SCROLL';
    let glitchInterval: ReturnType<typeof setInterval> | null = null;
    let glitchTimeout: ReturnType<typeof setTimeout> | null = null;

    function startGlitch() {
      const el = hintRef.current?.querySelector('.glitch-text') as HTMLElement;
      if (!el) return;
      let iterations = 0;
      const maxIterations = 12;
      glitchInterval = setInterval(() => {
        el.textContent = ORIGINAL_TEXT.split('').map((char, i) => {
          if (char === ' ') return ' ';
          if (i < iterations) return ORIGINAL_TEXT[i];
          return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }).join('');
        iterations += 0.6;
        if (iterations >= ORIGINAL_TEXT.length) {
          el.textContent = ORIGINAL_TEXT;
          if (glitchInterval) clearInterval(glitchInterval);
          // Schedule next glitch burst in 2-4 seconds
          glitchTimeout = setTimeout(startGlitch, 2000 + Math.random() * 2000);
        }
      }, 40);
    }

    // Start glitch after 1 second
    const glitchStartTimeout = setTimeout(startGlitch, 1000);

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

    let lastFrameTime = 0;
    function frame(timestamp: number) {
      const delta = timestamp - lastFrameTime;
      if (delta < 16) { // cap at ~60fps
        rafId = requestAnimationFrame(frame);
        return;
      }
      lastFrameTime = timestamp;
      time += 0.016;

      // Sync external progress overrides (WORK pill, HOME pill)
      if (targetProgressRef.current !== 0) {
        targetProgress = targetProgressRef.current;
        targetProgressRef.current = 0;
      }

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

      // Bento scatter lerp — smoothly move scatter positions toward target
      if (bentoTargetRef.current && pb) {
        const target = bentoTargetRef.current;
        const lerpSpeed = 0.06; // ~60 frames to converge (0.06 per frame)
        let maxDelta = 0;
        for (let i = 0; i < pb.count * 2; i++) {
          const delta = target[i] - pb.scatterBuf[i];
          pb.scatterBuf[i] += delta * lerpSpeed;
          maxDelta = Math.max(maxDelta, Math.abs(delta));
        }
        const scatterAttr = pb.geometry.getAttribute('aScatterPos') as THREE.BufferAttribute;
        scatterAttr.needsUpdate = true;
        // Stop lerping when close enough
        if (maxDelta < 0.5) {
          pb.scatterBuf.set(target);
          scatterAttr.needsUpdate = true;
          // If returning to scatter (bentoMode is false), clear refs
          if (!bentoModeRef.current) {
            bentoTargetRef.current = null;
            bentoSavedScatterRef.current = null;
          }
        }
      }

      // Uniforms
      particleMat.uniforms.uProgress.value = progress;
      particleMat.uniforms.uRotY.value = rotY;
      particleMat.uniforms.uRotX.value = rotX;
      particleMat.uniforms.uTime.value = time;
      const disint = clamp((progress - 0.86) / 0.8, 0, 1);
      particleMat.uniforms.uDisintegration.value = disint;
      if (progress >= 1.50) targetProgress = 1.50;
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
      window.removeEventListener('blur', onWindowBlur);
      if (glitchInterval) clearInterval(glitchInterval);
      if (glitchTimeout) clearTimeout(glitchTimeout);
      clearTimeout(glitchStartTimeout);

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
        touchAction: "pan-y",
        userSelect: "none",
        cursor: "default",
      }}
    >
      {/* Tree layer (Three.js WebGL) */}
      <canvas
        ref={treeCanvasRef}
        style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}
      />

      {/* Vignette — Figma 8064:29649, centered, #f9f8f4, blur 72px */}
      <div
        ref={vignetteRef}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 1269,
          height: 410,
          background: '#f9f8f4',
          filter: 'blur(72px)',
          opacity: 0.8,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Center SCROLL text — Figma 8064:29678 */}
      <div
        ref={hintRef}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          pointerEvents: 'none',
          opacity: 0.8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          className="glitch-text"
          style={{
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: 400,
            fontSize: 34.56,
            letterSpacing: '-0.08em',
            color: '#000000',
            whiteSpace: 'nowrap',
          }}
        >
          SCROLL
        </span>
        <span
          ref={dotRef}
          style={{
            display: 'block',
            width: 1,
            height: 14,
            background: 'rgba(0,0,0,0.18)',
          }}
        />
      </div>

      {/* WORK pill — bottom-left, aligned with density pill */}
      <div
        ref={workPillRef}
        onClick={() => { targetProgressRef.current = 1.50; }}
        style={{
          position: 'absolute',
          bottom: 'clamp(32px, 8vh, 135px)',
          left: 'clamp(40px, 4.2vw, 80px)',
          zIndex: 5,
          opacity: 0,
          pointerEvents: 'none',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            background: '#000000',
            color: '#ffffff',
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(14px, 1.17vw, 22px)',
            letterSpacing: '-0.05em',
            padding: 'clamp(12px, 1vw, 16px) clamp(36px, 3.5vw, 68px)',
            borderRadius: 27,
            cursor: 'pointer',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PillButton>WORK</PillButton>
        </div>
      </div>

      {/* Frosted blur rectangle behind name — Figma 8058:8882 */}
      <div
        ref={blurRectRef}
        style={{
          position: 'absolute',
          top: 'clamp(-60px, -8.4vh, -91px)',
          left: 'clamp(-180px, -14.7vw, -282px)',
          width: 'clamp(760px, 66vw, 1269px)',
          height: 'clamp(250px, 38vh, 410px)',
          background: '#F9F8F4',
          filter: 'blur(clamp(44px, 3.75vw, 72px))',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Top-left identity — Figma HEADER group 8060:29306 */}
      <div
        ref={nameRef}
        style={{
          position: 'absolute',
          top: 'clamp(20px, 2.2vh, 40px)',
          left: 'clamp(40px, 4.2vw, 80px)',
          zIndex: 4,
          pointerEvents: 'none',
          opacity: 0,
        }}
      >
        <div style={{
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(42px, 6.5vh, 90px)',
          lineHeight: 0.88,
          letterSpacing: '-0.05em',
          color: '#0A0A0A',
        }}>
          <TextScramble trigger={homepageRevealed} duration={1.2} speed={0.05} as="span">ASHUTOSH</TextScramble>
          <br />
          <TextScramble trigger={homepageRevealed} duration={1.2} speed={0.05} as="span">BHARDWAJ</TextScramble>
        </div>
      </div>

      {/* Subtitle — Figma 8058:8888 — positioned below name block */}
      <div
        style={{
          position: 'absolute',
          top: 'clamp(128px, 17vh, 184px)',
          left: 'clamp(40px, 4.2vw, 80px)',
          zIndex: 4,
          pointerEvents: 'none',
          opacity: 0,
        }}
        className="subtitle-overlay"
      >
        <div style={{
          fontFamily: 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 400,
          fontSize: 'clamp(11px, 0.9vw, 17px)',
          letterSpacing: '0em',
          color: 'rgb(10,10,10)',
          textTransform: 'uppercase',
          marginTop: 'clamp(10px, 1.5vh, 20px)',
        }}>
          <TextScramble trigger={homepageRevealed} duration={0.8} speed={0.04}>MULTI-DISCIPLINARY DESIGNER</TextScramble>
        </div>
      </div>

      {/* Contextual paragraph — above WORK pill */}
      <div
        ref={paraRef}
        style={{
          position: 'absolute',
          bottom: 'clamp(120px, 16vh, 260px)',
          left: 'clamp(40px, 4.2vw, 80px)',
          maxWidth: 280,
          zIndex: 5,
          pointerEvents: 'none',
          opacity: 0,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 400,
          fontSize: 'clamp(11px, 1vw, 16px)',
          lineHeight: 1.21,
          letterSpacing: '0em',
          color: 'rgba(0,0,0,0.45)',
          textTransform: 'uppercase',
          wordBreak: 'break-word',
          overflow: 'hidden',
          maxHeight: 130,
        }}
      >
        <TextScramble key={ambientKey} trigger={true} duration={0.6} speed={0.03}>{ambientText}</TextScramble>
      </div>




      {/* ABOUT / CONTACT nav — Figma 8060:29316 */}
      <div
        ref={navRef}
        style={{
          position: 'absolute',
          top: 'clamp(24px, 3vh, 48px)',
          right: 'clamp(24px, 2.6vw, 48px)',
          zIndex: 5,
          opacity: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 40,
          width: 207,
          height: 53,
          background: 'rgb(0,0,0)',
          backdropFilter: 'blur(14px)',
          borderRadius: 90,
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 700,
          fontSize: 12.6,
          lineHeight: 1.4,
          letterSpacing: '-0.025em',
          color: 'rgb(241,241,241)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        <PillButton onClick={() => window.open('mailto:ashutoshbhardwaj.design@gmail.com', '_self')}>ABOUT</PillButton>
        <PillButton onClick={() => window.open('mailto:ashutoshbhardwaj.design@gmail.com', '_self')}>CONTACT</PillButton>
      </div>

      {/* Density pill bottom-right — Figma 8060:29309 */}
      <div
        ref={densityPillRef}
        style={{
          position: 'absolute',
          bottom: 'clamp(24px, 3vh, 48px)',
          right: 'clamp(24px, 2.6vw, 48px)',
          zIndex: 5,
          opacity: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000000',
          borderRadius: 27,
          padding: 'clamp(6px, 0.56vw, 8px) clamp(14px, 1.3vw, 25px)',
          fontFamily: 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 400,
          fontSize: 'clamp(10px, 0.77vw, 14.7px)',
          color: '#ffffff',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        <PillButton>{'\u2318 + / \u2318 \u2212  [DENSITY]'}</PillButton>
      </div>

      {/* Downward double-chevron arrow — centered, aligned with pills */}
      <div
        className="pill-arrow"
        style={{
          position: 'absolute',
          bottom: 135,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 5,
          opacity: 0,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {/* Two stacked triangles */}
        <svg width="24" height="36" viewBox="0 0 24 36" fill="none" style={{ animation: 'arrowNudge 3s ease-out infinite' }}>
          <path d="M2 2L12 14L22 2" stroke="#0A0A0A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="#0A0A0A" />
          <path d="M2 18L12 30L22 18" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
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

      {/* keyframes */}
      <style>{`
        @keyframes starFade {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.55; }
        }
        @keyframes arrowNudge {
          0%, 75%, 100% { transform: translateY(0); }
          80% { transform: translateY(8px); }
          90% { transform: translateY(-2px); }
          95% { transform: translateY(1px); }
        }
      `}</style>

      {/* Hidden easter egg hover zones — only active once tree is formed */}
      <div ref={zonesRef} style={{ opacity: 0, pointerEvents: 'none', transition: 'opacity 0.6s ease' }}>
        {[
          // Experience brands
          { top: '6%',  left: '30%', w: '18%', h: '16%', word: 'DAILYOBJECTS',   colorKey: 'DAILYOBJECTS' },
          { top: '6%',  left: '50%', w: '20%', h: '16%', word: 'CREPDOGCREW',    colorKey: 'CREPDOGCREW' },
          { top: '22%', left: '34%', w: '16%', h: '14%', word: 'PROBO',          colorKey: 'PROBO' },
          { top: '22%', left: '52%', w: '18%', h: '14%', word: 'STABLE MONEY',   colorKey: 'STABLE MONEY' },
          { top: '36%', left: '38%', w: '14%', h: '12%', word: 'OTHER',          colorKey: 'OTHER' },
          // Skill items
          { top: '36%', left: '52%', w: '14%', h: '12%', word: 'MOTION DESIGN',  colorKey: 'MOTION DESIGN' },
          { top: '48%', left: '36%', w: '14%', h: '11%', word: 'SYSTEMS',        colorKey: 'SYSTEMS' },
          { top: '48%', left: '50%', w: '14%', h: '11%', word: '3D',             colorKey: '3D' },
          { top: '59%', left: '40%', w: '12%', h: '10%', word: 'BRAND',          colorKey: 'BRAND' },
          { top: '59%', left: '52%', w: '12%', h: '10%', word: 'GLITCH',         colorKey: 'GLITCH' },
        ].map((z, i) => (
          <div
            key={i}
            onMouseEnter={() => showWatermark(z.word, z.colorKey)}
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

      {/* Work page overlay */}
      <WorkPage
        ref={workPageRef}
        visible={workVisible}
        onHoverZone={(key) => showWatermark(key, key)}
        onLeaveZone={() => hideWatermark()}
        onHomePill={() => { resetProgressRef.current(); window.scrollTo(0, 0); }}
        onLogoHover={(key) => {
          if (!logoLockedRef.current) {
            setLogoModeRef.current(key === 'CREPDOGCREW');
          }
        }}
        onLogoLock={(key) => {
          logoLockedRef.current = key;
          setLogoModeRef.current(key === 'CREPDOGCREW');
        }}
        onPillClick={(key) => {
          // Future: navigate to case study
        }}
        onBentoHover={(key) => {
          if (key) setBentoModeRef.current(true, key);
          else setBentoModeRef.current(false, '');
        }}
      />
    </div>
  );
}
