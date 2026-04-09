"use client";

import React, { useRef, useEffect, useState } from "react";
import WorkPage from "./WorkPage";
import ProjectDetailPage from "./ProjectDetailPage";
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
  COMPANY_PROJECTS,
  CARD_BENTO_LAYOUTS,
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
import { preloadCompanyLuminance, getCachedLuminance } from "./data-tree/luminance-sampler";

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

// ── Card target computation ──────────────────────────────────────────────────

const PARTICLES_PER_CARD = 11200;  // 140 × 80 — 2x density for higher resolution
const CARD_COLS = 140;
const CARD_ROWS = 80;

export interface CardRect { x: number; y: number; w: number; h: number }

function computeCardTargets(
  W: number,
  H: number,
  cardPixelWidthRef: React.MutableRefObject<number>,
  cardPixelHeightRef: React.MutableRefObject<number>,
  cardRectsRef: React.MutableRefObject<CardRect[]>,
): { positions: Map<string, Float32Array>; opacities: Map<string, Float32Array> } {
  const positions = new Map<string, Float32Array>();
  const opacities = new Map<string, Float32Array>();
  const d = FOV / (FOV + CAMERA_Z_OFFSET);
  const SCENE_SCALE = Math.min(W, H) * SCENE_SCALE_FACTOR;

  // Flipped layout: card fills top 80%, header/controls at bottom 20%
  // This keeps particles in the tree's safe Y zone (high worldY = canopy, no terrain fade)
  const cardLeft   = W * 0.02;
  const cardTop    = 0;           // starts at very top
  const cardW      = W * 0.96;   // 2% margin each side
  const cardH      = H * 0.78;   // top 78%, leaving 22% for bottom header area

  // 1 card position — full-width single card
  const cardRects: CardRect[] = [
    { x: cardLeft, y: cardTop, w: cardW, h: cardH },
  ];

  // Store card pixel dimensions for font size calculation + overlay positioning
  cardPixelWidthRef.current = cardW;
  cardPixelHeightRef.current = cardH;
  cardRectsRef.current = cardRects;

  const NUM_CARDS = 1;  // Single card layout

  for (const [company, projects] of Object.entries(COMPANY_PROJECTS)) {
    const numCards = Math.min(projects.length, NUM_CARDS);
    const buf = new Float32Array(numCards * PARTICLES_PER_CARD * 3);
    const opBuf = new Float32Array(numCards * PARTICLES_PER_CARD);

    for (let ci = 0; ci < numCards; ci++) {
      const rect = cardRects[ci];
      const cellW = rect.w / CARD_COLS;
      const cellH = rect.h / CARD_ROWS;
      for (let row = 0; row < CARD_ROWS; row++) {
        for (let col = 0; col < CARD_COLS; col++) {
          const pi = ci * PARTICLES_PER_CARD + row * CARD_COLS + col;
          const screenX = rect.x + (col + 0.5) * cellW;
          const screenY = rect.y + (row + 0.5) * cellH;
          // 0.72 / 0.85 — must match vertex shader's screen mapping
          const worldX = (screenX - W * 0.72) / (SCENE_SCALE * d);
          const worldY = (H * 0.65 - screenY) / (SCENE_SCALE * d * 1.15);
          buf[pi * 3]     = worldX;
          buf[pi * 3 + 1] = worldY;
          buf[pi * 3 + 2] = 0;

          // Compute expected terrain fade at this world position and compensate
          // Vertex shader: if yNorm < 0.25 → distFade² * yFade
          // centerDist = length(xz) — for card particles z=0, so centerDist = |worldX|
          const centerDist = Math.abs(worldX);
          let terrainFade = 1.0;
          if (worldY < 0.25) {
            const distFade = Math.max(0, Math.min(1, 1.0 - (centerDist - 0.12) / 1.28));
            const yFade = Math.max(0.3, Math.min(1, worldY / 0.25));
            terrainFade = distFade * distFade * yFade;
          }
          // Boost opacity to counteract terrain fade + 2.5x brightness multiplier
          // Fragment shader discards when vAlpha < 0.02, so we need the boost
          // to keep vAlpha * vFadeOpacity above the visible threshold
          const baseBrightness = 2.5; // 150% brighter than original
          opBuf[pi] = terrainFade > 0.005 ? Math.min(baseBrightness / terrainFade, 30.0) : 30.0;
        }
      }
    }
    positions.set(company, buf);
    opacities.set(company, opBuf);
  }

  return { positions, opacities };
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
  const densityUpRef = useRef<() => void>(() => {});
  const densityDownRef = useRef<() => void>(() => {});

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

  /** Zone key currently hovered — drives name scramble on home page */
  const [hoveredZoneKey, setHoveredZoneKey] = useState<string | null>(null);

  // Card formation state (particle grid cards on pill hover)
  const hoveredCardRef = useRef<string | null>(null);
  const cardFormingRef = useRef(false);
  const cardFormProgressRef = useRef(0);
  const activeCardCompanyRef = useRef<string | null>(null);
  const cardDisintegratingRef = useRef(false);
  const disintVelocitiesRef = useRef<Float32Array | null>(null);
  const disintTickRef = useRef(0);
  const disintCardCountRef = useRef(0);  // how many particles were in the card grid
  const cardTargetsRef = useRef<Map<string, Float32Array>>(new Map());
  const cardOpacityTargetsRef = useRef<Map<string, Float32Array>>(new Map());
  const savedWorldPosRef = useRef<Float32Array | null>(null);
  const savedFontSizesRef = useRef<Float32Array | null>(null);
  const savedOpacityRef = useRef<Float32Array | null>(null);
  const particleMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const cardPixelWidthRef = useRef(0);
  const cardPixelHeightRef = useRef(0);
  const cardRectsRef = useRef<CardRect[]>([]);
  const cardLuminanceRef = useRef<Float32Array[]>([]);  // per-card luminance grids
  const particleBufRef = useRef<ParticleBuffers | null>(null);

  // ── Project detail page state ──────────────────────────────────────────────
  const [detailCompany, setDetailCompany] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // ── Brand-color wipe transition ───────────────────────────────────────────
  const [wipeActive, setWipeActive] = useState(false);
  const [wipeKey, setWipeKey] = useState(0);
  const [wipeColor, setWipeColor] = useState('#000000');

  // Block transition state
  // ── Particle-expand transition state ────────────────────────────────────
  // Forward: card particles turn brand color + scale up to fill screen → detail page
  // Back:    particles contract from brand color back to card grid size → work page
  const particleExpandRef = useRef(false);       // animation running
  const particleExpandTickRef = useRef(0);
  const particleExpandDirRef = useRef<'enter' | 'exit'>('enter');
  const particleExpandCompanyRef = useRef<string | null>(null);
  const particleExpandCoveredRef = useRef(false); // onCovered already fired
  const [detailBrandColor, setDetailBrandColor] = useState('#000000');

  // Saved particle state for restoring after detail page
  const detailActiveCompanyRef = useRef<string | null>(null);
  const savedDetailPosRef = useRef<Float32Array | null>(null);
  const savedDetailFontsRef = useRef<Float32Array | null>(null);
  const savedDetailOpacRef = useRef<Float32Array | null>(null);

  // Card positions state for WorkPage overlays
  const [cardPositions, setCardPositions] = useState<CardRect[]>([]);

  // Card image overlay state (rendered at DataTree level for correct blend mode compositing)
  const [hoveredCompany, setHoveredCompany] = useState<string | null>(null);
  const [cardImagesVisible, setCardImagesVisible] = useState(false);
  const cardImagesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync hoveredCompany → delayed image visibility
  useEffect(() => {
    if (cardImagesTimerRef.current) clearTimeout(cardImagesTimerRef.current);
    if (hoveredCompany && COMPANY_PROJECTS[hoveredCompany]) {
      cardImagesTimerRef.current = setTimeout(() => setCardImagesVisible(true), 350);
    } else {
      setCardImagesVisible(false);
    }
    return () => { if (cardImagesTimerRef.current) clearTimeout(cardImagesTimerRef.current); };
  }, [hoveredCompany]);

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
    // Watermark is intentionally hidden — company name now lives in the bottom-left name scramble
    // el.style.opacity = '1';
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

  // ── Card click → brand wipe → detail page ───────────────────────────────
  function handleCardClick(company: string) {
    if (wipeActive || detailVisible) return;
    const zoneColor = ZONE_COLORS[company];
    const hex = zoneColor ? zoneColor.hex : '#111111';
    setDetailBrandColor(hex);
    setWipeColor(hex);
    setWipeKey(k => k + 1);
    setWipeActive(true);

    // Mid-wipe: show detail page behind the sweeping rect
    setTimeout(() => {
      setDetailCompany(company);
      setDetailVisible(true);
    }, 320);

    // Wipe finishes sweeping off-screen top
    setTimeout(() => setWipeActive(false), 720);

    // Keep particle expand running in background for state management
    particleExpandCompanyRef.current = company;
    particleExpandDirRef.current = 'enter';
    particleExpandTickRef.current = 0;
    particleExpandCoveredRef.current = false;
    particleExpandRef.current = true;
  }

  function handleDetailBack() {
    if (wipeActive) return;
    setWipeKey(k => k + 1);
    setWipeActive(true);

    // Mid-wipe: hide detail page, restore work page
    setTimeout(() => {
      setDetailVisible(false);
      particleExpandDirRef.current = 'exit';
      particleExpandTickRef.current = 0;
      particleExpandRef.current = true;
    }, 320);

    setTimeout(() => setWipeActive(false), 720);
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
    let hasInitiallyFormed = false;  // true after first scatter→tree animation completes
    let densityScale = 3.0; // default visible density
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
    particleMatRef.current = particleMat;
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

      // Redistribute scatter positions & recompute card targets
      if (pb) {
        const scatterAttr = pb.geometry.getAttribute(
          "aScatterPos"
        ) as THREE.BufferAttribute;
        redistributeScatter(pb.scatterBuf, scatterAttr, W, H);
        { const _ct = computeCardTargets(W, H, cardPixelWidthRef, cardPixelHeightRef, cardRectsRef); cardTargetsRef.current = _ct.positions; cardOpacityTargetsRef.current = _ct.opacities; }
        setCardPositions([...cardRectsRef.current]);
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
      // Keep all card particles (first PARTICLES_PER_CARD) at full density for card formation.
      // Thin the remaining tree particles by 50% — reduces visual noise on the work page
      // without affecting card formation quality.
      const cardSlice = pts.slice(0, PARTICLES_PER_CARD);
      const treeSlice = pts.slice(PARTICLES_PER_CARD).filter((_, i) => i % 2 === 0);
      const filteredPts = (cardSlice as RawPoint[]).concat(treeSlice as RawPoint[]);
      pb = buildParticleSystem(filteredPts, W || 1280, H || 800);
      particleBufRef.current = pb;
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
      // Compute card formation targets
      { const _ct = computeCardTargets(W, H, cardPixelWidthRef, cardPixelHeightRef, cardRectsRef); cardTargetsRef.current = _ct.positions; cardOpacityTargetsRef.current = _ct.opacities; }
      setCardPositions([...cardRectsRef.current]);
    }

    // ── Progress reset (for HOME pill) ──────────────────────────────────────
    // Sets targetProgress only — progress lerps smoothly toward it (smooth scroll-up feel)
    resetProgressRef.current = () => {
      if (hasInitiallyFormed) {
        targetProgress = 0.86;
        // Don't snap progress — let it lerp for smooth animation
      } else {
        targetProgress = 0;
        progress = 0;
      }
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

      // SCROLL UP — after initial formation, clamp to formed tree (no scatter replay)
      if (e.deltaY < 0) {
        const minProgress = hasInitiallyFormed ? 0.86 : 0;
        targetProgress = clamp(
          targetProgress + e.deltaY * SCROLL_SENSITIVITY,
          minProgress,
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
        const tx = rx * d + W * 0.72;
        const ty = -ryFinal * d + H * 0.65;

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

        // Brownian motion — active in scatter AND disintegration, suppressed in logo/card mode
        {
          const disintActive = progress > 0.9;
          const inFormationMode = cardFormingRef.current || cardDisintegratingRef.current;
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
        if (!cardFormingRef.current && !cardDisintegratingRef.current) {
          pb.opacityBuf[i] = p.fadeOpacity;
        }
      }

      // Turbulence physics
      const uScale = Math.min(W / 1920, H / 1080);
      updateTurbulencePhysics(cpu, mouseX, mouseY, time, pb.displacementBuf, uScale);

      // Zero displacement and brownian when cards are forming or disintegrating
      if (cardFormingRef.current || cardDisintegratingRef.current) {
        pb.displacementBuf.fill(0);
        pb.brownianBuf.fill(0);
      }

      // Mark dynamic attributes for upload
      (pb.geometry.getAttribute("aBrownian") as THREE.BufferAttribute).needsUpdate = true;
      (pb.geometry.getAttribute("aDisplacement") as THREE.BufferAttribute).needsUpdate = true;
      (pb.geometry.getAttribute("aDigitIndex") as THREE.BufferAttribute).needsUpdate = true;
      (pb.geometry.getAttribute("aFadeOpacity") as THREE.BufferAttribute).needsUpdate = true;
    }

    // ── Smart proximity lines (1 connection per particle, no clusters) ────────

    function updateSmartLines() {
      if (!pb || progress < 0.7 || mouseX < -100 || cardFormingRef.current || cardDisintegratingRef.current) {
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
        if (progress >= 0.85 || interacted) {
          hintEl.style.opacity = '0';
          hintEl.style.pointerEvents = 'none';
        } else {
          hintEl.style.opacity = String(0.7 + 0.1 * Math.sin(time * 1.8));
          hintEl.style.pointerEvents = 'auto';
        }
        if (dotEl)
          dotEl.style.transform = `scaleY(${0.5 + 0.5 * Math.sin(time * 3.2)})`;

        // Update onboarding pill colors — always white on black
        const obModePill = container.querySelector('.onboard-mode-pill') as HTMLElement | null;
        const obDensityPill = container.querySelector('.onboard-density-pill') as HTMLElement | null;
        const scrollText = hintEl?.querySelector('.glitch-text') as HTMLElement | null;
        if (obModePill) {
          obModePill.style.background = '#FFFFFF';
          obModePill.style.color = '#000000';
        }
        if (obDensityPill) {
          obDensityPill.style.background = '#FFFFFF';
          obDensityPill.style.color = '#000000';
        }
        if (scrollText) {
          scrollText.style.color = '#FFFFFF';
        }
        if (dotEl) {
          dotEl.style.background = 'rgba(255,255,255,0.18)';
        }
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
      // paraRef and subtitle are now nested inside nameRef — inherit its opacity
      if (workPillRef.current) {
        workPillRef.current.style.opacity = String(overlayOpacity);
        workPillRef.current.style.pointerEvents = overlayOpacity > 0.1 ? 'auto' : 'none';
      }
      // Arrow is now inside workPillRef — inherits its opacity
      // Vignette: visible in scatter, fades as tree forms
      if (vignetteRef.current) {
        const vigOp = clamp(1 - (progress - 0.6) / 0.25, 0, 0.8);
        vignetteRef.current.style.opacity = String(vigOp);
      }
      if (navRef.current) {
        navRef.current.style.opacity = String(overlayOpacity);
        navRef.current.style.pointerEvents = overlayOpacity > 0.1 ? 'auto' : 'none';
      }
      // Density pill + mode toggle follow overlay opacity (fade out on work page)
      if (densityPillRef.current) {
        densityPillRef.current.style.opacity = String(overlayOpacity);
        densityPillRef.current.style.pointerEvents = overlayOpacity > 0.1 ? 'auto' : 'none';
      }
      // AB mark, scroll line follow same overlay opacity
      const abMark = container.querySelector('.ab-mark') as HTMLElement | null;
      if (abMark) abMark.style.opacity = String(overlayOpacity);
      const scrollLine = container.querySelector('.scroll-line') as HTMLElement | null;
      if (scrollLine) scrollLine.style.opacity = String(overlayOpacity * 0.5);

      // ── Color logic: site is always black. Brand colors tint particles + UI only. ──
      // Background never changes on the homepage — always #0A0A0A.
      // Zone hover (experience OR skill): particles + UI text go brand color.
      // Default: white particles at full tint, white UI.
      const cs = colorStateRef.current;
      const lerpSpeed = COLOR_LERP_SPEED;

      // Always-black palette
      const BASE_BG = '#0A0A0A';
      const BASE_FG = '#FFFFFF';

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

      // Target the actual elements for color changes
      const nameTextEl = container.querySelector('.home-name-text') as HTMLElement | null;
      const subtitleEl = container.querySelector('.subtitle-overlay') as HTMLElement | null;
      const paraTextEl = container.querySelector('.home-para-text') as HTMLElement | null;
      const arrowSvg = container.querySelector('.pill-arrow svg') as SVGElement | null;
      const sDashEl = container.querySelector('.scroll-dash') as HTMLElement | null;
      const abMarkEl = container.querySelector('.ab-mark') as HTMLElement | null;
      const scrollLineEl = container.querySelector('.scroll-line') as HTMLElement | null;
      const densityPillEl = densityPillRef.current;

      // Helper: apply a color to all minor UI (arrow, dash, AB mark, scroll line)
      const applyMinorUI = (color: string) => {
        if (sDashEl) sDashEl.style.background = color;
        if (abMarkEl) abMarkEl.style.color = color;
        if (scrollLineEl) scrollLineEl.style.background = color;
        if (arrowSvg) {
          arrowSvg.querySelectorAll('path').forEach(p => {
            p.setAttribute('stroke', color);
            if (p.getAttribute('fill') !== 'none') p.setAttribute('fill', color);
          });
        }
      };

      if (cs.strength > 0.005) {
        // ── ZONE HOVERED: particles + UI go brand color, bg stays black ──
        particleMat.uniforms.uTintColor.value.set(cs.r, cs.g, cs.b);
        particleMat.uniforms.uTintStrength.value = cs.strength;

        const brandColor = `rgb(${r255},${g255},${b255})`;
        if (nameTextEl) nameTextEl.style.color = brandColor;
        if (subtitleEl) subtitleEl.style.color = brandColor;
        if (paraTextEl) {
          paraTextEl.style.color = '#000000';
          paraTextEl.style.background = brandColor;
        }
        if (watermarkRef.current) watermarkRef.current.style.color = `rgba(${r255},${g255},${b255},0.22)`;
        if (densityPillEl) { densityPillEl.style.background = brandColor; densityPillEl.style.color = '#000000'; }
        applyMinorUI(brandColor);
      } else {
        // ── DEFAULT: no zone hovered — white on black ──
        cs.activeZone = null;
        cs.zoneType = null;

        // White particles at full tint
        particleMat.uniforms.uTintColor.value.set(1, 1, 1);
        particleMat.uniforms.uTintStrength.value = 1;

        if (nameTextEl) nameTextEl.style.color = BASE_FG;
        if (subtitleEl) subtitleEl.style.color = BASE_FG;
        if (paraTextEl) { paraTextEl.style.color = '#000000'; paraTextEl.style.background = BASE_FG; }
        if (watermarkRef.current) watermarkRef.current.style.color = 'rgba(255,255,255,0.22)';
        if (densityPillEl) { densityPillEl.style.background = BASE_FG; densityPillEl.style.color = '#000000'; }
        applyMinorUI(BASE_FG);
      }

      // ── Background: always black → stays black into work page ──
      // Home is #0A0A0A. On scroll to work it transitions to pure #000000.
      const workBgT = clamp((progress - 1.0) / 0.3, 0, 1);
      const smoothBgT = workBgT * workBgT * (3 - 2 * workBgT); // smoothstep
      if (progress >= 0.95) {
        const bgV = Math.round(10 * (1 - smoothBgT));
        container.style.background = `rgb(${bgV},${bgV},${bgV})`;
        if (blurRectRef.current) blurRectRef.current.style.background = `rgb(${bgV},${bgV},${bgV})`;
      } else {
        // Always black on homepage (brand color never floods the background)
        container.style.background = BASE_BG;
        if (blurRectRef.current) blurRectRef.current.style.background = BASE_BG;
      }

      // WorkPage color sync via CSS variables
      // On work page (black bg), brand color shows on WORK header + pills
      if (workPageRef.current && workVisibleRef.current) {
        const s = cs.strength;
        const el = workPageRef.current;
        if (s > 0.01) {
          // Brand hover: text + pills use brand color (white fallback for dark brands)
          const brandLum = 0.299 * cs.r + 0.587 * cs.g + 0.114 * cs.b;
          const brandIsDark = brandLum < 0.15;
          const wpColor = brandIsDark ? '#ffffff' : `rgb(${r255},${g255},${b255})`;
          el.style.setProperty('--wp-text', wpColor);
          el.style.setProperty('--wp-pill-bg', wpColor);
          el.style.setProperty('--wp-pill-text', brandIsDark ? '#000000' : '#ffffff');
          el.style.setProperty('--wp-toggle-bg', `rgba(${r255},${g255},${b255},0.2)`);
        } else {
          // Default: always dark (white text on black work page)
          el.style.setProperty('--wp-text', '#ffffff');
          el.style.setProperty('--wp-pill-bg', '#ffffff');
          el.style.setProperty('--wp-pill-text', '#000000');
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
        // Force-reset color state when leaving work page via scroll
        const cs = colorStateRef.current;
        cs.targetStrength = 0;
        cs.strength = 0;
        cs.activeZone = null;
        cs.zoneType = null;
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
      // Always prevent browser zoom for +/- keys
      if (e.key === '=' || e.key === '+' || e.key === '-') {
        e.preventDefault();
      }
      // Skip density changes during card formation/disintegration
      if (cardFormingRef.current || cardDisintegratingRef.current) return;
      if (e.key === '=' || e.key === '+') {
        densityScale = Math.min(densityScale + 1.0, 12.0);
        particleMat.uniforms.uDensityScale.value = densityScale;
        updateDensityHint();
      }
      if (e.key === '-') {
        densityScale = Math.max(densityScale - 1.0, 0.5);
        particleMat.uniforms.uDensityScale.value = densityScale;
        updateDensityHint();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Expose density controls via refs for clickable +/- buttons
    densityUpRef.current = () => {
      if (cardFormingRef.current || cardDisintegratingRef.current) return;
      densityScale = Math.min(densityScale + 1.0, 12.0);
      particleMat.uniforms.uDensityScale.value = densityScale;
      updateDensityHint();
    };
    densityDownRef.current = () => {
      if (cardFormingRef.current || cardDisintegratingRef.current) return;
      densityScale = Math.max(densityScale - 1.0, 0.5);
      particleMat.uniforms.uDensityScale.value = densityScale;
      updateDensityHint();
    };

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
        hasInitiallyFormed = true;
      }
      // Unlock scroll-to-disintegrate after 5 seconds
      if (treeFormedAt !== null && !scrollUnlocked) {
        scrollUnlocked = (time - treeFormedAt) >= 5.0;
      }

      if (progress > 0.85 && !cardDisintegratingRef.current) targetRotY += AUTO_ROTATE_SPEED;
      rotY += (targetRotY - rotY) * ROT_LERP;
      rotX += (targetRotX - rotX) * ROT_LERP;

      // CPU work
      updateCPU();

      // ── Home page opacity: scale to ~0 at progress=0 so initial screen is nearly empty.
      // WebGL min point size is 1px so density-scale alone can't hide particles.
      // This directly multiplies opacityBuf after the CPU update overwrites it each frame.
      if (pb && progress < 0.35 && !cardFormingRef.current && !cardDisintegratingRef.current) {
        const showT = clamp(progress / 0.35, 0, 1);
        const opScale = showT * showT; // quadratic — near-zero at start, 1.0 at 0.35
        const opBuf = pb.opacityBuf;
        for (let i = 0; i < pb.count; i++) opBuf[i] *= opScale;
        (pb.geometry.getAttribute('aFadeOpacity') as THREE.BufferAttribute).needsUpdate = true;
      }

      // ── Clear card/hover state when scrolling away from Work page ────────
      if (progress < 1.2 && hoveredCardRef.current) {
        hoveredCardRef.current = null;
        setHoveredCompany(null);
      }

      // ── Card formation state machine (PAUSED during block transition) ─────
      if (pb && !particleExpandRef.current) {
        const posArr = pb.geometry.getAttribute('position').array as Float32Array;
        const fontArr = pb.geometry.getAttribute('aFontSize').array as Float32Array;
        const wantCompany = (progress >= 1.3) ? hoveredCardRef.current : null;
        const activeCompany = activeCardCompanyRef.current;
        const companyChanged = wantCompany !== activeCompany;
        const isDisintegrating = cardDisintegratingRef.current;

        // ── CARD TRANSITION: company changed or hover ended while card is active
        if (companyChanged && cardFormingRef.current && savedWorldPosRef.current && !isDisintegrating) {
          if (wantCompany) {
            // PILL-TO-PILL SWITCH: instant restore + immediate new formation
            const saved = savedWorldPosRef.current;
            const savedFonts = savedFontSizesRef.current;
            const savedOpac = savedOpacityRef.current;
            posArr.set(saved);
            if (savedFonts) fontArr.set(savedFonts);
            if (savedOpac) pb.opacityBuf.set(savedOpac);
            (pb.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFontSize') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFadeOpacity') as THREE.BufferAttribute).needsUpdate = true;
            savedWorldPosRef.current = null;
            savedFontSizesRef.current = null;
            savedOpacityRef.current = null;
            cardFormingRef.current = false;
            cardFormProgressRef.current = 0;
            activeCardCompanyRef.current = null;
            particleMat.uniforms.uDensityScale.value = densityScale;
          } else {
            // HOVER ENDED / SCROLL AWAY: disintegrate with physics
            // Figure out card particle count before clearing state
            const company = activeCompany;
            const numCards = company ? Math.min(COMPANY_PROJECTS[company]?.length ?? 0, 1) : 0;
            const cardPtCount = numCards * PARTICLES_PER_CARD;
            disintCardCountRef.current = cardPtCount;

            cardFormingRef.current = false;
            cardDisintegratingRef.current = true;
            disintTickRef.current = 0;
            activeCardCompanyRef.current = null;

            // Snap rotY to 0 so the cfp-unwind rotation is minimal (no accumulated 720° spin)
            rotY = 0;
            targetRotY = 0;

            // Scatter kick — fast enough to pop visibly, slow enough to stay on screen
            const velBuf = new Float32Array(pb.count * 3);
            for (let i = 0; i < cardPtCount; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 0.5 + Math.random() * 1.1;
              velBuf[i * 3]     = Math.cos(angle) * speed;
              velBuf[i * 3 + 1] = Math.sin(angle) * speed * 0.7;
              velBuf[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
              fontArr[i] *= 1.2;
            }
            disintVelocitiesRef.current = velBuf;

            // Hidden particles: snap positions back to saved immediately
            // (they were at z=2000 which would cause flying-in artifacts)
            // Keep opacity at 0 — they fade in gradually during animation
            const saved = savedWorldPosRef.current!;
            for (let i = cardPtCount; i < pb.count; i++) {
              const i3 = i * 3;
              posArr[i3]     = saved[i3];
              posArr[i3 + 1] = saved[i3 + 1];
              posArr[i3 + 2] = saved[i3 + 2];
            }
          }
        }

        // ── ANIMATE DISINTEGRATION: card particles scatter gently, hidden particles fade in
        if (cardDisintegratingRef.current && savedWorldPosRef.current) {
          const saved = savedWorldPosRef.current;
          const savedFonts = savedFontSizesRef.current;
          const savedOpac = savedOpacityRef.current;
          const vel = disintVelocitiesRef.current;
          const tick = disintTickRef.current;
          const cardPtCount = disintCardCountRef.current;
          disintTickRef.current++;

          // ── Pop → drift → reconverge. No per-particle RNG (performance). ──
          const SCATTER_TICKS = 14;  // velocity-driven scatter phase
          const TOTAL_TICKS   = 55;  // ~0.9s at 60fps
          const t = tick / TOTAL_TICKS;

          if (tick < TOTAL_TICKS) {
            // ── Card particles ──
            for (let i = 0; i < cardPtCount; i++) {
              const i3 = i * 3;

              // Scatter: apply velocity with fast damping → particles pop then slow
              if (tick < SCATTER_TICKS && vel) {
                vel[i3]     *= 0.86;
                vel[i3 + 1] *= 0.86;
                vel[i3 + 2] *= 0.86;
                posArr[i3]     += vel[i3];
                posArr[i3 + 1] += vel[i3 + 1];
                posArr[i3 + 2] += vel[i3 + 2];
              }

              // Converge: quadratic ease-in — nearly still at start, pulls hard at end
              const ease = t * t;
              const cf = 0.012 + ease * 0.11;
              posArr[i3]     += (saved[i3]     - posArr[i3])     * cf;
              posArr[i3 + 1] += (saved[i3 + 1] - posArr[i3 + 1]) * cf;
              posArr[i3 + 2] += (saved[i3 + 2] - posArr[i3 + 2]) * cf;
              if (savedFonts) fontArr[i] += (savedFonts[i] - fontArr[i]) * cf;
              if (savedOpac)  pb.opacityBuf[i] += (savedOpac[i] - pb.opacityBuf[i]) * cf;
            }

            // ── Hidden particles fade in from tick 15 ──
            const fadeInT = clamp((tick - 15) / 40, 0, 1);
            for (let i = cardPtCount; i < pb.count; i++) {
              if (savedFonts) fontArr[i] += (savedFonts[i] - fontArr[i]) * 0.06;
              if (savedOpac) pb.opacityBuf[i] = savedOpac[i] * fadeInT;
            }

            (pb.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFontSize') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFadeOpacity') as THREE.BufferAttribute).needsUpdate = true;
          } else {
            // Animation complete — card particles are already at opacity 0, hidden ones at full.
            // Snap positions cleanly (invisible since card particles are transparent).
            posArr.set(saved);
            if (savedFonts) fontArr.set(savedFonts);
            if (savedOpac) pb.opacityBuf.set(savedOpac);
            (pb.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFontSize') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFadeOpacity') as THREE.BufferAttribute).needsUpdate = true;

            // Clean up
            savedWorldPosRef.current = null;
            savedFontSizesRef.current = null;
            savedOpacityRef.current = null;
            disintVelocitiesRef.current = null;
            cardDisintegratingRef.current = false;
            cardFormProgressRef.current = 0;
            activeCardCompanyRef.current = null;
            particleMat.uniforms.uDensityScale.value = densityScale;
          }
        }

        // FORM: start new formation if we want a company and aren't forming/disintegrating
        if (wantCompany && !cardFormingRef.current && !cardDisintegratingRef.current) {
          const targets = cardTargetsRef.current.get(wantCompany);
          const numCards = Math.min(COMPANY_PROJECTS[wantCompany]?.length ?? 0, 1);
          const cardPtCount = numCards * PARTICLES_PER_CARD;
          if (targets) {
            savedWorldPosRef.current = new Float32Array(posArr);
            savedFontSizesRef.current = new Float32Array(fontArr);
            savedOpacityRef.current = new Float32Array(pb.opacityBuf);
            cardFormingRef.current = true;
            cardFormProgressRef.current = 1.0;
            activeCardCompanyRef.current = wantCompany;

            // Preload luminance grids for this company's project images
            const projects = COMPANY_PROJECTS[wantCompany] ?? [];
            preloadCompanyLuminance(projects).then(grids => {
              cardLuminanceRef.current = grids;
            });

            // Instantly hide non-card particles
            for (let i = cardPtCount; i < pb.count; i++) {
              posArr[i * 3 + 2] = 2000;
              fontArr[i] = 0;
              pb.opacityBuf[i] = 0;
            }
            (pb.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFontSize') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFadeOpacity') as THREE.BufferAttribute).needsUpdate = true;
          }
        }

        // ANIMATE: lerp card particles toward targets
        if (cardFormingRef.current && activeCardCompanyRef.current) {
          const company = activeCardCompanyRef.current;
          const targets = cardTargetsRef.current.get(company);
          const opTargets = cardOpacityTargetsRef.current.get(company);
          const numCards = Math.min(COMPANY_PROJECTS[company]?.length ?? 0, 1);
          const cardPtCount = numCards * PARTICLES_PER_CARD;

          if (targets) {
            // LOCKED card font size — compute from actual card cell size
            const d_persp = FOV / (FOV + CAMERA_Z_OFFSET);
            const rect0 = cardRectsRef.current[0];
            const cellW = rect0 ? rect0.w / CARD_COLS : 10;
            // 0.55 factor: smaller chars at 2x density — never overlap, higher resolution
            const targetFontSize = (cellW * 0.55) / d_persp;
            // Force density scale to 1.0 during card formation so font is stable
            particleMat.uniforms.uDensityScale.value = 1.0;

            for (let i = 0; i < cardPtCount; i++) {
              const i3 = i * 3;
              posArr[i3]     += (targets[i3]     - posArr[i3])     * 0.07;
              posArr[i3 + 1] += (targets[i3 + 1] - posArr[i3 + 1]) * 0.07;
              posArr[i3 + 2] += (targets[i3 + 2] - posArr[i3 + 2]) * 0.07;
              fontArr[i] += (targetFontSize - fontArr[i]) * 0.07;
              // Lerp toward boosted opacity target to compensate terrain fade
              const opTarget = opTargets ? opTargets[i] : 1.0;
              pb.opacityBuf[i] += (opTarget - pb.opacityBuf[i]) * 0.09;
            }
            // Keep non-card particles hidden
            for (let i = cardPtCount; i < pb.count; i++) {
              posArr[i * 3 + 2] = 2000;
              fontArr[i] = 0;
              pb.opacityBuf[i] = 0;
            }
            (pb.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFontSize') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFadeOpacity') as THREE.BufferAttribute).needsUpdate = true;
          }

          // Pause auto-rotation
          targetRotY -= AUTO_ROTATE_SPEED;
        }
      }

      // ── PARTICLE EXPAND TRANSITION ─────────────────────────────────────────
      // Forward (enter): card particles tint to brand color + scale up to fill screen
      // Back (exit):     particles contract from brand color back to card grid
      const EXPAND_FRAMES = 38;          // ~630ms at 60fps
      const COVERED_FRAME = 28;          // frame when detail page shows (particles ~full-screen)
      const CONTRACT_FRAMES = 34;        // back animation duration

      if (particleExpandRef.current && pb) {
        const tick = particleExpandTickRef.current++;
        const dir = particleExpandDirRef.current;
        const company = particleExpandCompanyRef.current;
        const numCards = company ? Math.min(COMPANY_PROJECTS[company]?.length ?? 0, 1) : 0;
        const cardPtCount = numCards * PARTICLES_PER_CARD;
        const zc = company ? ZONE_COLORS[company] : null;

        if (dir === 'enter') {
          const t = Math.min(tick / EXPAND_FRAMES, 1);
          // Ease-in-out quad
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

          // 1. Tint all card particles to brand color, ramp to full strength
          if (zc) {
            particleMat.uniforms.uTintColor.value.set(zc.r, zc.g, zc.b);
            particleMat.uniforms.uTintStrength.value = Math.min(1, eased * 1.8);
          }

          // 2. Scale up — particles grow from card size to screen-filling
          particleMat.uniforms.uDensityScale.value = 1.0 + eased * 22.0;

          // 3. All card particles → 100% opaque
          for (let i = 0; i < cardPtCount; i++) {
            pb.opacityBuf[i] = 1.0;
          }
          (pb.geometry.getAttribute('aFadeOpacity') as THREE.BufferAttribute).needsUpdate = true;

          // 4. At COVERED_FRAME: save state + show detail page behind the expanded particles
          if (tick === COVERED_FRAME && !particleExpandCoveredRef.current) {
            particleExpandCoveredRef.current = true;
            const posArr2 = pb.geometry.getAttribute('position').array as Float32Array;
            const fontArr2 = pb.geometry.getAttribute('aFontSize').array as Float32Array;
            savedDetailPosRef.current = new Float32Array(posArr2);
            savedDetailFontsRef.current = new Float32Array(fontArr2);
            savedDetailOpacRef.current = new Float32Array(pb.opacityBuf);
            detailActiveCompanyRef.current = company;
            setDetailCompany(company);
            setDetailVisible(true);
          }

          // 5. Animation complete
          if (t >= 1) {
            particleExpandRef.current = false;
          }

        } else {
          // EXIT: particles contract from large brand-color back to card grid
          const t = Math.min(tick / CONTRACT_FRAMES, 1);
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

          // Contract density scale back to card-formation scale (1.0)
          particleMat.uniforms.uDensityScale.value = 1.0 + (1 - eased) * 22.0;

          // Tint strength fades out as we contract
          if (zc) {
            particleMat.uniforms.uTintColor.value.set(zc.r, zc.g, zc.b);
            particleMat.uniforms.uTintStrength.value = Math.max(0, (1 - eased) * 1.0);
          }

          // At midpoint (t≈0.5): restore full 3D tree state behind the contracting particles
          // so when they fully shrink, the work page tree is ready
          if (tick === Math.round(CONTRACT_FRAMES * 0.4) && savedWorldPosRef.current) {
            const posArr2 = pb.geometry.getAttribute('position').array as Float32Array;
            const fontArr2 = pb.geometry.getAttribute('aFontSize').array as Float32Array;
            posArr2.set(savedWorldPosRef.current);
            if (savedFontSizesRef.current) fontArr2.set(savedFontSizesRef.current);
            if (savedOpacityRef.current) pb.opacityBuf.set(savedOpacityRef.current);
            (pb.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFontSize') as THREE.BufferAttribute).needsUpdate = true;
            (pb.geometry.getAttribute('aFadeOpacity') as THREE.BufferAttribute).needsUpdate = true;
            // Clear card state — tree restored
            cardFormingRef.current = false;
            cardDisintegratingRef.current = false;
            cardFormProgressRef.current = 0;
            activeCardCompanyRef.current = null;
            savedWorldPosRef.current = null;
            savedFontSizesRef.current = null;
            savedOpacityRef.current = null;
            hoveredCardRef.current = null;
            setHoveredCompany(null);
            setDetailVisible(false);
            setDetailCompany(null);
          }

          // Animation complete
          if (t >= 1) {
            particleExpandRef.current = false;
            particleExpandCoveredRef.current = false;
            detailActiveCompanyRef.current = null;
            savedDetailPosRef.current = null;
            savedDetailFontsRef.current = null;
            savedDetailOpacRef.current = null;
            // Ensure density scale is fully restored
            particleMat.uniforms.uDensityScale.value = densityScale;
            particleMat.uniforms.uTintStrength.value = 0;
          }
        }
      }

      // Hide watermark during card formation or disintegration
      if (watermarkRef.current && (cardFormingRef.current || cardDisintegratingRef.current || cardFormProgressRef.current > 0)) {
        watermarkRef.current.style.opacity = '0';
      }

      // Lerp card formation progress (pause during particle expand)
      if (!particleExpandRef.current) {
        if (cardFormingRef.current) {
          cardFormProgressRef.current = Math.min(1, cardFormProgressRef.current + 0.04);
        } else if (!cardDisintegratingRef.current) {
          cardFormProgressRef.current = Math.max(0, cardFormProgressRef.current - 0.06);
        } else {
          cardFormProgressRef.current = Math.max(0, cardFormProgressRef.current - 0.015);
        }
      }
      const cfp = cardFormProgressRef.current;

      // Uniforms
      particleMat.uniforms.uProgress.value = progress;
      // Density scale: tiny on initial home scatter → grows as tree forms → small on work page
      if (!cardFormingRef.current && !cardDisintegratingRef.current && !particleExpandRef.current && cfp < 0.05) {
        const workT  = clamp((progress - 1.0) / 0.3, 0, 1);
        const homeT  = clamp(progress / 0.85, 0, 1);
        const homeEased = homeT * homeT; // quadratic: slow reveal, dramatic finish
        const homeDensity = 0.04 + (densityScale - 0.04) * homeEased; // 0.04 → densityScale
        const workDensity = 0.8;
        particleMat.uniforms.uDensityScale.value = homeDensity * (1 - workT) + workDensity * workT;
      }
      // When cards forming, lerp rotation toward 0 (front-facing)
      particleMat.uniforms.uRotY.value = cfp > 0 ? rotY * (1 - cfp) : rotY;
      particleMat.uniforms.uRotX.value = cfp > 0 ? rotX * (1 - cfp) : rotX;
      particleMat.uniforms.uTime.value = time;

      const disint = clamp((progress - 0.86) / 0.8, 0, 1);
      particleMat.uniforms.uDisintegration.value = cfp > 0 ? Math.max(0, disint - disint * cfp) : disint;
      if (progress >= 1.50) targetProgress = 1.50;
      lineMat.uniforms.uTime.value = time;

      // Particles: transition dark→white as background goes white→black on scroll
      // Uses the same smoothstep as the background transition
      const scrollWhiteT = clamp((progress - 1.0) / 0.3, 0, 1);
      const scrollWhiteEased = scrollWhiteT * scrollWhiteT * (3 - 2 * scrollWhiteT);
      if (scrollWhiteEased > 0) {
        // Both modes: particles transition to white as bg goes black on scroll to work page
        particleMat.uniforms.uTintColor.value.set(1, 1, 1);
        particleMat.uniforms.uTintStrength.value = Math.max(scrollWhiteEased, cfp);
      }

      // LED glow effect — particles glow when background is dark (work page is always dark)
      // Uses CSS filter on canvas for performant soft glow
      const glowStrength = Math.max(scrollWhiteEased, cfp);
      if (treeCanvasRef.current) {
        if (glowStrength > 0.01) {
          const blur = Math.round(5 + glowStrength * 14);    // 5-19px blur
          const brightness = 1 + glowStrength * 0.6;          // subtle brightness lift
          treeCanvasRef.current.style.filter =
            `drop-shadow(0 0 ${blur}px rgba(255,255,255,${glowStrength * 0.7})) brightness(${brightness})`;
        } else {
          treeCanvasRef.current.style.filter = 'none';
        }
      }

      // Canvas always renders on a black background — near-opaque at 0.85 on home,
      // fully opaque once card formation or scroll-to-work kicks in.
      const clearAlpha = Math.max(cfp, scrollWhiteEased, 0.85);
      renderer.setClearColor(0x000000, clearAlpha);

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
  const wipeKeyframes = `
    @keyframes brandWipeThrough {
      0%   { transform: translateY(100%); filter: blur(0px); }
      14%  { filter: blur(22px); }
      30%  { transform: translateY(0%);   filter: blur(6px); }
      48%  { filter: blur(18px); }
      72%  { filter: blur(4px); }
      100% { transform: translateY(-100%); filter: blur(0px); }
    }
  `;

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: '#0A0A0A',
        overflow: "hidden",
        touchAction: "pan-y",
        userSelect: "none",
        cursor: "default",
        transition: 'background 0.5s ease',
      }}
    >
      <style>{wipeKeyframes}</style>
      {/* Tree layer (Three.js WebGL) */}
      <canvas
        ref={treeCanvasRef}
        style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}
      />

      {/* Card image layer — rendered here (sibling of canvas) so mix-blend-mode:multiply
          composites against the canvas particles' backdrop. z-index:3 paints after canvas (z:2),
          so the backdrop includes the white card particles. On dark brand backgrounds,
          multiply(image, black) = black (hidden), multiply(image, white_particle) = image (visible).
          This creates the effect of images showing THROUGH the living particle characters. */}
      {hoveredCompany && COMPANY_PROJECTS[hoveredCompany] && cardPositions.length >= 1 && (
        cardPositions.slice(0, 1).map((rect, i) => {
          const project = COMPANY_PROJECTS[hoveredCompany]?.[i];
          if (!project) return null;
          return (
            <React.Fragment key={`card-frag-${i}`}>
              <img
                key={`card-img-${i}`}
                src={project.image}
                alt=""
                style={{
                  position: 'absolute',
                  left: rect.x, top: rect.y,
                  width: rect.w, height: rect.h,
                  objectFit: 'cover',
                  mixBlendMode: 'multiply',
                  opacity: cardImagesVisible ? 1 : 0,
                  transition: 'opacity 0.6s ease',
                  pointerEvents: 'none',
                  zIndex: 3,
                }}
              />
              {/* Clickable overlay on card area — triggers detail page */}
              <div
                key={`card-click-${i}`}
                onClick={() => handleCardClick(hoveredCompany!)}
                style={{
                  position: 'absolute',
                  left: rect.x, top: rect.y,
                  width: rect.w, height: rect.h,
                  zIndex: 7,
                  cursor: 'pointer',
                  background: 'transparent',
                }}
              />
            </React.Fragment>
          );
        })
      )}

      {/* Vignette — Figma 8064:29649, centered, blur 72px, follows mode */}
      <div
        ref={vignetteRef}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 1269,
          height: 410,
          background: '#0A0A0A',
          filter: 'blur(72px)',
          opacity: 0.8,
          zIndex: 1,
          pointerEvents: 'none',
          transition: 'background 0.5s ease',
        }}
      />

      {/* Center SCROLL text + onboarding controls */}
      <div
        ref={hintRef}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          pointerEvents: 'auto',
          opacity: 0.8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 32,
        }}
      >
        {/* SCROLL text */}
        <span
          className="glitch-text"
          style={{
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: 400,
            fontSize: 34.56,
            letterSpacing: '-0.08em',
            color: '#FFFFFF',
            whiteSpace: 'nowrap',
          }}
        >
          SCROLL
        </span>

        {/* Pulse line */}
        <span
          ref={dotRef}
          style={{
            display: 'block',
            width: 1,
            height: 14,
            background: 'rgba(255,255,255,0.18)',
          }}
        />
      </div>

      {/* ═══════════ TOP-RIGHT: Density pill ═══════════ */}

      {/* Density pill */}
      <div
        ref={densityPillRef}
        style={{
          position: 'absolute',
          top: 'clamp(24px, 3vh, 48px)',
          right: 'clamp(24px, 2.6vw, 48px)',
          zIndex: 5,
          opacity: 0,
          height: 36,
          borderRadius: 18,
          background: '#FFFFFF',
          color: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px',
          gap: 2,
          fontFamily: 'Inter, "Helvetica Neue", sans-serif',
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: '0.08em',
          pointerEvents: 'auto',
          transition: 'background 0.5s ease, color 0.5s ease',
        }}
      >
        <div
          onClick={() => densityDownRef.current()}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(128,128,128,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 14, fontWeight: 300, userSelect: 'none',
          }}
        >−</div>
        <span style={{ padding: '0 6px' }}>DENSITY</span>
        <div
          onClick={() => densityUpRef.current()}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(128,128,128,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 14, fontWeight: 300, userSelect: 'none',
          }}
        >+</div>
      </div>

      {/* ═══════════ BOTTOM SECTION — matching work page aesthetic ═══════════ */}

      {/* Frosted blur rectangle behind bottom content */}
      <div
        ref={blurRectRef}
        style={{
          position: 'absolute',
          bottom: '-5vh',
          left: '-5vw',
          width: '110vw',
          height: 'clamp(200px, 32vh, 340px)',
          background: '#0A0A0A',
          filter: 'blur(clamp(44px, 3.75vw, 72px))',
          zIndex: 1,
          pointerEvents: 'none',
          transition: 'background 0.5s ease',
        }}
      />

      {/* ── Bottom row: Name (left) | WORK pill (center) | Paragraph (right) — all bottoms aligned ── */}
      <div
        ref={nameRef}
        style={{
          position: 'absolute',
          bottom: 'clamp(36px, 5vh, 70px)',
          left: 'clamp(40px, 4.2vw, 80px)',
          right: 'clamp(40px, 4.2vw, 80px)',
          zIndex: 4,
          pointerEvents: 'none',
          opacity: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        {/* Left: Subtitle above Name — scrambles to company/skill on hover */}
        {(() => {
          // Name lines for each hover target
          const NAME_LINES: Record<string, [string, string]> = {
            // Experience
            'DAILYOBJECTS': ['DAILY', 'OBJECTS'],
            'CREPDOGCREW':  ['CREPDOG', 'CREW'],
            'PROBO':        ['PROBO', ''],
            'STABLE MONEY': ['STABLE', 'MONEY'],
            'OTHER':        ['OTHER', ''],
            // Skills
            'MOTION DESIGN': ['MOTION', 'DESIGN'],
            'SYSTEMS':       ['SYSTEMS', ''],
            '3D':            ['3D', ''],
            'BRAND':         ['BRAND', ''],
            'GLITCH':        ['GLITCH', ''],
          };
          const COMPANY_YEARS: Record<string, number> = {
            'DAILYOBJECTS': 2022, 'CREPDOGCREW': 2024, 'PROBO': 2025,
            'STABLE MONEY': 2026, 'OTHER': 2021,
            'MOTION DESIGN': 2022, 'SYSTEMS': 2023, '3D': 2021,
            'BRAND': 2024, 'GLITCH': 2022,
          };
          // Zone hover (home page) takes priority, then work-page pill hover
          const activeKey = hoveredZoneKey ?? hoveredCompany;
          const [line1, line2] = activeKey
            ? (NAME_LINES[activeKey] ?? [activeKey, ''])
            : ['ASHUTOSH', 'BHARDWAJ'];
          const subtitle = activeKey
            ? `${COMPANY_YEARS[activeKey] ?? ''}  ·  ${activeKey}`
            : 'MULTI-DISCIPLINARY DESIGNER';
          // Key changes force TextScramble to remount → re-fires animation
          const nameKey = activeKey ?? 'default';
          return (
            <div style={{ flexShrink: 0 }}>
              <div className="subtitle-overlay" style={{
                fontFamily: 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif',
                fontWeight: 400,
                fontSize: 'clamp(14px, 1.2vw, 22px)',
                letterSpacing: '0em',
                textTransform: 'uppercase',
                marginBottom: 'clamp(8px, 1.2vh, 16px)',
              }}>
                <TextScramble
                  key={`subtitle-${nameKey}`}
                  trigger={homepageRevealed}
                  duration={0.6}
                  speed={0.03}
                >
                  {subtitle}
                </TextScramble>
              </div>
              <div className="home-name-text" style={{
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(63px, 9.75vh, 135px)',
                lineHeight: 0.88,
                letterSpacing: '-0.05em',
              }}>
                <TextScramble
                  key={`name1-${nameKey}`}
                  trigger={homepageRevealed}
                  duration={0.9}
                  speed={0.045}
                  as="span"
                >
                  {line1}
                </TextScramble>
                {line2 && (
                  <>
                    <br />
                    <TextScramble
                      key={`name2-${nameKey}`}
                      trigger={homepageRevealed}
                      duration={0.9}
                      speed={0.045}
                      as="span"
                    >
                      {line2}
                    </TextScramble>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* Center: Scroll arrow indicator (replaces WORK pill) */}
        <div
          ref={workPillRef}
          onClick={() => { targetProgressRef.current = 1.50; }}
          style={{
            cursor: 'pointer',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            marginBottom: 4,
          }}
        >
          {/* Horizontal dash */}
          <div className="scroll-dash" style={{
            width: 24,
            height: 2,
            background: '#FFFFFF',
            borderRadius: 1,
            transition: 'background 0.5s ease',
          }} />
          {/* Double chevron arrow */}
          <div className="pill-arrow" style={{ pointerEvents: 'none' }}>
            <svg width="16" height="24" viewBox="0 0 16 24" fill="none" style={{ animation: 'arrowNudge 3s ease-out infinite' }}>
              <path d="M2 2L8 9L14 2" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M2 12L8 19L14 12" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
        </div>

        {/* Right: Contextual paragraph — black highlight with white text */}
        <div
          ref={paraRef}
          style={{
            maxWidth: 'clamp(280px, 36vw, 520px)',
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          <span className="home-para-text" style={{
            fontFamily: 'Inter, "Helvetica Neue", sans-serif',
            fontWeight: 400,
            fontSize: 'clamp(14px, 1.32vw, 19px)',
            lineHeight: 2.0,
            color: '#000000',
            background: '#FFFFFF',
            padding: '4px 10px',
            borderRadius: 4,
            WebkitBoxDecorationBreak: 'clone' as any,
            boxDecorationBreak: 'clone' as any,
            transition: 'background 0.5s ease, color 0.5s ease',
          }}>
            <TextScramble key={ambientKey} trigger={true} duration={0.6} speed={0.03} as="span">
              {ambientText}
            </TextScramble>
          </span>
        </div>
      </div>


      {/* ═══════════ BOTTOM-CENTER: Scroll line ═══════════ */}
      <div
        className="scroll-line"
        style={{
          position: 'absolute',
          bottom: 'clamp(8px, 1.2vh, 18px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 1,
          height: 'clamp(8px, 1.3vh, 14px)',
          background: '#FFFFFF',
          zIndex: 4,
          opacity: 0.5,
          transition: 'background 0.5s ease',
        }}
      />

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
            onMouseEnter={() => { showWatermark(z.word, z.colorKey); setHoveredZoneKey(z.colorKey); }}
            onMouseLeave={() => { hideWatermark(); setHoveredZoneKey(null); }}
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
        isDarkMode={true}
        onHoverZone={(key) => showWatermark(key, key)}
        onLeaveZone={() => hideWatermark()}
        onHomePill={() => {
          // Clear hover so card state machine sees wantCompany=null
          hoveredCardRef.current = null;
          setHoveredCompany(null);
          // Force-reset ALL color state so zone colors don't bleed into homepage
          hideWatermark();
          const cs = colorStateRef.current;
          cs.targetStrength = 0;
          cs.strength = 0;
          cs.activeZone = null;
          cs.zoneType = null;
          // Reset to white particles on black background
          if (particleMatRef.current) {
            particleMatRef.current.uniforms.uTintColor.value.set(1, 1, 1);
            particleMatRef.current.uniforms.uTintStrength.value = 1;
          }
          if (treeCanvasRef.current) {
            treeCanvasRef.current.style.filter = 'none';
          }
          // Re-trigger homepage text scramble once we arrive
          homepageRevealedRef.current = false;
          setHomepageRevealed(false);
          setTimeout(() => {
            homepageRevealedRef.current = true;
            setHomepageRevealed(true);
          }, 50);
          // Smooth scroll: set target, let progress lerp naturally
          resetProgressRef.current();
          window.scrollTo(0, 0);
        }}
        onPillHover={(c) => { hoveredCardRef.current = c; setHoveredCompany(c); }}
        onCardClick={handleCardClick}
        cardRects={cardPositions}
      />

      {/* Brand-color wipe — sweeps bottom→top on card enter/exit, covers particle animation */}
      {wipeActive && (
        <div
          key={wipeKey}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 22,
            background: wipeColor,
            animation: 'brandWipeThrough 680ms cubic-bezier(0.76, 0, 0.24, 1) forwards',
            willChange: 'transform, filter',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Project detail page — overlays everything when a card is clicked */}
      <ProjectDetailPage
        company={detailCompany ?? ''}
        visible={detailVisible}
        brandColor={detailBrandColor}
        onBack={handleDetailBack}
      />
    </div>
  );
}
