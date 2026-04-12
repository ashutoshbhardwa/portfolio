"use client";

import React, { useRef, useEffect, useState } from "react";
import WorkPage from "./WorkPage";
import ProjectDetailPage from "./ProjectDetailPage";
import TextScramble from "./TextScramble";
import TreeAnnotations from "./TreeAnnotations";
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
  MAX_LINE_ALPHA,
  DIGIT_TRUNK,
  DIGIT_BRANCH,
  DIGIT_MID,
  BG_COLOR,
  COLOR_LERP_SPEED,
  ZONE_COLORS,
  COMPANY_PROJECTS,
  CARD_BENTO_LAYOUTS,
} from "./data-tree/constants";
import {
  BRANCH_SEG_COUNT,
  BRANCH_POSITIONS,
  BRANCH_DELAYS,
  BRANCH_ALPHAS,
  BRANCH_PHASES,
} from "./data-tree/branch-lines";
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
import { sampleLogoPositions, clearLogoCache } from "./data-tree/logo-sampler";

// ── Logo SVG URLs per company (served from /public/logos/) ─────────────────
const LOGO_URLS: Record<string, string> = {
  DAILYOBJECTS: '/logos/DAILYOBJECTS.svg',
  CREPDOGCREW: '/logos/CREPDOGCREW.svg',
  PROBO: '/logos/PROBO.svg',
  'STABLE MONEY': '/logos/STABLEMONEY.svg',
  // OTHER: uses glyphs (no SVG), handled separately
};

// ── Perlin noise for fluid particle flow (work page zero state) ────────────
// Compact implementation — permutation table + gradient noise
const _perm = (() => {
  const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,
    30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,
    219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,
    175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,
    220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,
    132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,
    3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,
    227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,
    221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,
    185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,
    51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,
    121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,
    78,66,215,61,156,180];
  const out = new Uint8Array(512);
  for (let i = 0; i < 256; i++) { out[i] = p[i]; out[256 + i] = p[i]; }
  return out;
})();

function _fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
function _lerp(t: number, a: number, b: number) { return a + t * (b - a); }
function _grad(hash: number, x: number, y: number, z: number) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14) ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** 3D Perlin noise, returns value in roughly [-1, 1] */
function noise3(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = _fade(x), v = _fade(y), w = _fade(z);
  const A = _perm[X] + Y, AA = _perm[A] + Z, AB = _perm[A + 1] + Z;
  const B = _perm[X + 1] + Y, BA = _perm[B] + Z, BB = _perm[B + 1] + Z;
  return _lerp(w,
    _lerp(v,
      _lerp(u, _grad(_perm[AA], x, y, z), _grad(_perm[BA], x - 1, y, z)),
      _lerp(u, _grad(_perm[AB], x, y - 1, z), _grad(_perm[BB], x - 1, y - 1, z))),
    _lerp(v,
      _lerp(u, _grad(_perm[AA + 1], x, y, z - 1), _grad(_perm[BA + 1], x - 1, y, z - 1)),
      _lerp(u, _grad(_perm[AB + 1], x, y - 1, z - 1), _grad(_perm[BB + 1], x - 1, y - 1, z - 1))));
}

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
          // 0.50 / 0.65 — must match vertex shader's screen mapping
          const worldX = (screenX - W * 0.50) / (SCENE_SCALE * d);
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

  // Shared projection state — annotation reads this every frame to track tree rotation
  const treeStateRef = useRef({ rotY: 0, rotX: 0, W: 1, H: 1, sceneScale: 1, progress: 0, time: 0 });

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

  // Logo formation state
  const logoFormationRef = useRef(0); // 0→1 lerp for uLogoFormation uniform
  const logoCompanyRef = useRef<string | null>(null); // which company's logo is loaded in buffer
  const logoWantCompanyRef = useRef<string | null>(null); // which company is WANTED (hovered)
  const logoLoadingRef = useRef(false); // prevents duplicate fetches
  const logoTransitionPhase = useRef<'idle' | 'scatter-out' | 'form-in'>('idle');
  const logoPendingCompany = useRef<string | null>(null); // company queued during scatter-out
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
  const cardImagesVisibleRef = useRef(false);
  const cardImagesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync hoveredCompany → delayed image visibility
  // Images only appear once logo formation is well underway (checked in anim loop)
  useEffect(() => {
    if (cardImagesTimerRef.current) clearTimeout(cardImagesTimerRef.current);
    if (!hoveredCompany || !COMPANY_PROJECTS[hoveredCompany]) {
      setCardImagesVisible(false);
    }
    // Images will be shown from the animation loop when logoFormationRef > 0.5
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
    // Background invert: 0 = black bg / white particles, 1 = white bg / black particles
    bgInvert: 0,
    targetBgInvert: 0,
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
      // Companies with light/white brand identity invert the scene
      const INVERT_COMPANIES = new Set(['DAILYOBJECTS']);
      cs.targetBgInvert = INVERT_COMPANIES.has(colorKey) ? 1 : 0;
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
    cs.targetBgInvert = 0;
    // Reset color target to white so cs.r/g/b lerp back alongside cs.strength.
    // This keeps text and particles in sync — both fade from zone color → white together.
    cs.tr = 1; cs.tg = 1; cs.tb = 1;

    // Reset ambient text
    setAmbientText(DEFAULT_AMBIENT);
    setAmbientKey('default');
  }

  // ── Card click → brand wipe → detail page ───────────────────────────────
  function handleCardClick(company: string) {
    if (wipeActive || detailVisible) return;
    const zoneColor = ZONE_COLORS[company];
    const hex = zoneColor ? zoneColor.hex : '#111111';
    // Override detail page brand color for companies with inverted identity
    const DETAIL_COLOR_OVERRIDE: Record<string, string> = { 'DAILYOBJECTS': '#FFFFFF' };
    const detailHex = DETAIL_COLOR_OVERRIDE[company] ?? hex;
    setDetailBrandColor(detailHex);
    setWipeColor(detailHex);
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
    let rotY = Math.PI * 0.85,
      targetRotY = Math.PI * 0.85;
    let rotX = -0.17,       // ~10° slight downward look — tree silhouette reads as tree
      targetRotX = -0.17;
    let mouseX = -9999,
      mouseY = -9999;
    let interacted = false;
    // Velocity-based rotation: track mouse speed, only rotate above threshold
    let prevMoveX = -9999;
    let prevMoveY = -9999;
    let prevMoveTime = 0;
    let mouseVelX = 0;  // smoothed velocity
    let mouseVelY = 0;
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

    // ── Branch skeleton lines ─────────────────────────────────────────────────
    // Static 3D geometry from OBJ; vertex shader projects with same math as
    // particles so lines stay registered to the tree at all rotation angles.
    // Data loaded at runtime from /public/branch-lines.json (avoids TS compiler OOM).
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(BRANCH_POSITIONS, 3));
    lineGeometry.setAttribute("aDelay",   new THREE.BufferAttribute(BRANCH_DELAYS,    1));
    lineGeometry.setAttribute("aAlpha",   new THREE.BufferAttribute(BRANCH_ALPHAS,    1));
    lineGeometry.setAttribute("aPhase",   new THREE.BufferAttribute(BRANCH_PHASES,    1));
    lineGeometry.setDrawRange(0, 0); // hidden until data loads + tree begins forming
    const lineSegments = new THREE.LineSegments(lineGeometry, lineMat);
    scene.add(lineSegments);
    let branchSegCount = BRANCH_SEG_COUNT; // 0 from stub; updated by JSON fetch

    fetch("/branch-lines.json")
      .then(r => r.json())
      .then((bd: { count: number; positions: number[]; delays: number[]; alphas: number[]; phases: number[] }) => {
        // Set geometry attributes FIRST, then update count
        lineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bd.positions), 3));
        lineGeometry.setAttribute("aDelay",   new THREE.BufferAttribute(new Float32Array(bd.delays),    1));
        lineGeometry.setAttribute("aAlpha",   new THREE.BufferAttribute(new Float32Array(bd.alphas),    1));
        lineGeometry.setAttribute("aPhase",   new THREE.BufferAttribute(new Float32Array(bd.phases),    1));
        branchSegCount = bd.count; // LAST — activates draw range after buffers are populated
        console.log(`[DataTree] branch-lines.json loaded: ${branchSegCount} segments`);
      })
      .catch(err => console.warn("[DataTree] branch-lines.json load failed:", err));

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
      clearLogoCache(); // logo positions depend on viewport size
      logoCompanyRef.current = null; // force re-sample on next hover

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

    const onPointerMove = (e: PointerEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (progress <= 0.85) {
        prevMoveX = mouseX;
        prevMoveY = mouseY;
        prevMoveTime = performance.now();
        return;
      }

      // ── Velocity-thresholded rotation ──
      // Compute instantaneous mouse speed (px/ms)
      const now = performance.now();
      const dt = now - prevMoveTime;
      if (dt > 0 && prevMoveX > -9000) {
        const rawVelX = (mouseX - prevMoveX) / dt; // px/ms
        const rawVelY = (mouseY - prevMoveY) / dt;
        // Smooth the velocity (exponential moving average)
        const smooth = 0.3;
        mouseVelX = mouseVelX * (1 - smooth) + rawVelX * smooth;
        mouseVelY = mouseVelY * (1 - smooth) + rawVelY * smooth;
      }
      prevMoveX = mouseX;
      prevMoveY = mouseY;
      prevMoveTime = now;

      // Speed = magnitude in px/ms
      const speed = Math.sqrt(mouseVelX * mouseVelX + mouseVelY * mouseVelY);

      // Threshold: ignore slow/small movements (< 0.3 px/ms ≈ casual hovering)
      // Ramp up from 0.3 to 0.8 px/ms for full effect
      const SPEED_MIN = 0.3;   // below this = no rotation
      const SPEED_MAX = 0.8;   // above this = full rotation strength
      const t = clamp((speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN), 0, 1);
      // Ease-in curve so it ramps gently
      const strength = t * t;

      if (strength > 0.01) {
        markInteracted();
        // Apply rotation proportional to velocity direction × strength
        const ROT_SCALE = 0.018;   // strong enough for full 360 on fast swipes
        const TILT_SCALE = 0.008;
        targetRotY += mouseVelX * strength * ROT_SCALE;
        targetRotX = clamp(
          targetRotX - mouseVelY * strength * TILT_SCALE,
          -MAX_TILT_X,
          MAX_TILT_X
        );
      }
    };

    const onPointerLeave = (_e: PointerEvent) => {
      mouseX = -9999;
      mouseY = -9999;
      prevMoveX = -9999;
      mouseVelX = 0;
      mouseVelY = 0;
    };

    const onWindowBlur = () => {
      mouseVelX = 0;
      mouseVelY = 0;
    };

    container.addEventListener("wheel", onWheel, { passive: true });
    // Listen on window so rotation works even when WorkPage overlay captures events
    window.addEventListener("pointermove", onPointerMove);
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
        const tx = rx * d + W * 0.50;
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

        // Brownian / flow field motion
        {
          const disintActive = progress > 0.9;
          const inFormationMode = cardFormingRef.current || cardDisintegratingRef.current;
          const onWorkPage = workVisibleRef.current;
          const logoForming = logoFormationRef.current > 0.1;

          if (onWorkPage && disintActive && !inFormationMode) {
            // ── Work page: Perlin noise flow field + light jitter ──
            // Noise is dominant — particles visibly drift in regional currents.
            // Light jitter keeps them as individual particles, not thread streams.

            // Noise flow — use current actual position for local field sampling
            const ax = pb.scatterBuf[i * 2] + pb.brownianBuf[i * 2];
            const ay = pb.scatterBuf[i * 2 + 1] + pb.brownianBuf[i * 2 + 1];
            const n = noise3(ax * 0.002, ay * 0.002, time * 0.06);
            const angle = n * Math.PI * 4;
            const speed = logoForming ? 0.06 : 0.9;
            const fx = Math.cos(angle) * speed;
            const fy = Math.sin(angle) * speed;

            // Light jitter for particle individuality
            const jx = (Math.random() - 0.5) * 0.15;
            const jy = (Math.random() - 0.5) * 0.15;

            // Fast velocity response — 0.25 blend means particles pick up
            // the flow direction quickly instead of slowly drifting into it
            p.bvx = p.bvx * 0.75 + (fx + jx) * 0.25;
            p.bvy = p.bvy * 0.75 + (fy + jy) * 0.25;

            pb.brownianBuf[i * 2] += p.bvx;
            pb.brownianBuf[i * 2 + 1] += p.bvy;

            // Moderate decay — prevents stream buildup while keeping movement visible
            pb.brownianBuf[i * 2] *= 0.996;
            pb.brownianBuf[i * 2 + 1] *= 0.996;

            // Soft wrap off-screen
            if (ax < -50) pb.brownianBuf[i * 2] += W + 100;
            else if (ax > W + 50) pb.brownianBuf[i * 2] -= W + 100;
            if (ay < -50) pb.brownianBuf[i * 2 + 1] += H + 100;
            else if (ay > H + 50) pb.brownianBuf[i * 2 + 1] -= H + 100;
          } else {
            // ── Home page / formation: original brownian jitter ──
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

    // ── Branch skeleton animation ─────────────────────────────────────────────
    // Geometry is static (uploaded once). Each frame we only update uniforms
    // so the vertex shader can compute the current dissolve state + projection.

    function updateSmartLines() {
      if (cardFormingRef.current || cardDisintegratingRef.current) {
        lineMat.uniforms.uLineAlpha.value = 0;
        lineGeometry.setDrawRange(0, 0);
        return;
      }

      // Same fade-in / fade-out window as the tree formation
      const fadeIn  = clamp((progress - 0.60) / 0.20, 0, 1);
      const fadeOut = clamp(1 - (progress - 0.94) / 0.05, 0, 1);
      const alpha   = MAX_LINE_ALPHA * fadeIn * fadeOut;

      lineMat.uniforms.uLineAlpha.value      = alpha;
      lineMat.uniforms.uProgress.value       = progress;
      lineMat.uniforms.uRotY.value           = rotY;
      lineMat.uniforms.uRotX.value           = rotX;
      lineMat.uniforms.uSceneScale.value     = Math.min(W, H) * SCENE_SCALE_FACTOR;
      lineMat.uniforms.uResolution.value.set(W, H);
      lineMat.uniforms.uDisintegration.value = particleMatRef.current
        ? particleMatRef.current.uniforms.uDisintegration.value
        : 0;

      // ── Match particle tint color ─────────────────────────────────────────
      // When a zone is active (cs.strength > 0) lines adopt the same brand color.
      // Otherwise fall back to a warm near-white that complements dark trunk particles.
      const cs = colorStateRef.current;
      if (cs.strength > 0.05) {
        if (cs.bgInvert > 0.01) {
          // Light brand: lines go dark
          const lR = (1 - cs.bgInvert) * cs.r;
          const lG = (1 - cs.bgInvert) * cs.g;
          const lB = (1 - cs.bgInvert) * cs.b;
          lineMat.uniforms.uColor.value.set(lR, lG, lB);
        } else {
          lineMat.uniforms.uColor.value.set(cs.r, cs.g, cs.b);
        }
      } else {
        lineMat.uniforms.uColor.value.set(0.85, 0.80, 0.75); // warm neutral default
      }

      // Show all segments once the tree starts forming
      if (alpha > 0 || progress > 0.55) {
        lineGeometry.setDrawRange(0, branchSegCount * 2);
      } else {
        lineGeometry.setDrawRange(0, 0);
      }
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
      const BASE_BG = '#000000';
      const BASE_FG = '#FFFFFF';

      // Lerp strength
      cs.strength += (cs.targetStrength - cs.strength) * lerpSpeed;
      if (Math.abs(cs.strength) < 0.001) cs.strength = 0;

      // Lerp background invert (0 = dark, 1 = light) — only on home page
      const effectiveTarget = workVisibleRef.current ? 0 : cs.targetBgInvert;
      cs.bgInvert += (effectiveTarget - cs.bgInvert) * lerpSpeed;
      if (Math.abs(cs.bgInvert) < 0.001) cs.bgInvert = 0;
      if (Math.abs(cs.bgInvert - 1) < 0.001) cs.bgInvert = 1;
      const inv = cs.bgInvert;

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
        // ── ZONE HOVERED ──
        if (inv > 0.01) {
          // Light brand (e.g. DAILYOBJECTS #FFF): invert to white bg, black particles/UI
          const pR = inv * 0 + (1 - inv) * cs.r;
          const pG = inv * 0 + (1 - inv) * cs.g;
          const pB = inv * 0 + (1 - inv) * cs.b;
          particleMat.uniforms.uTintColor.value.set(pR, pG, pB);
          particleMat.uniforms.uTintStrength.value = cs.strength;

          const uiColor = `rgb(${Math.round(pR * 255)},${Math.round(pG * 255)},${Math.round(pB * 255)})`;
          const bgHex = Math.round(inv * 255);
          const fgHex = Math.round((1 - inv) * 255);
          const uiBg = `rgb(${bgHex},${bgHex},${bgHex})`;
          const uiFg = `rgb(${fgHex},${fgHex},${fgHex})`;

          if (nameTextEl) nameTextEl.style.color = uiColor;
          if (subtitleEl) subtitleEl.style.color = uiColor;
          if (paraTextEl) { paraTextEl.style.color = uiBg; paraTextEl.style.background = uiFg; }
          if (watermarkRef.current) watermarkRef.current.style.color = `rgba(${fgHex},${fgHex},${fgHex},0.22)`;
          if (densityPillEl) { densityPillEl.style.background = uiFg; densityPillEl.style.color = uiBg; }
          applyMinorUI(uiFg);
        } else {
          // Dark brand: particles + UI go brand color, bg stays black
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
        }
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

      // ── Blending mode: additive on dark bg, normal on light bg ──
      const needNormal = inv > 0.5;
      const targetBlending = needNormal ? THREE.NormalBlending : THREE.AdditiveBlending;
      if (particleMat.blending !== targetBlending) {
        particleMat.blending = targetBlending;
        particleMat.needsUpdate = true;
      }
      if (lineMat.blending !== targetBlending) {
        lineMat.blending = targetBlending;
        lineMat.needsUpdate = true;
      }

      // ── Background: lerps between black and white based on bgInvert ──
      const bgVal = Math.round(cs.bgInvert * 255);
      const bgColor = `rgb(${bgVal},${bgVal},${bgVal})`;
      container.style.background = bgColor;
      if (blurRectRef.current) {
        blurRectRef.current.style.background = bgColor;
        // Hide on work page so it doesn't block the particle photo wall
        blurRectRef.current.style.opacity = workVisibleRef.current ? '0' : '1';
      }
      if (vignetteRef.current) {
        // Also force-hide vignette on work page
        if (workVisibleRef.current) vignetteRef.current.style.opacity = '0';
      }

      // WorkPage color sync via CSS variables
      // On work page (black bg), brand color shows on WORK header + pills
      if (workPageRef.current && workVisibleRef.current) {
        const s = cs.strength;
        const el = workPageRef.current;
        if (s > 0.01) {
          // Brand hover: text + pills use brand color (work page always black bg)
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
        cs.tr = 1; cs.tg = 1; cs.tb = 1;
        cs.r  = 1; cs.g  = 1; cs.b  = 1;
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

      // Decay mouse velocity each frame — 0.95 gives nice momentum carry on fast swipes
      mouseVelX *= 0.95;
      mouseVelY *= 0.95;

      // Delay auto-rotation 4s after tree forms so the default view angle holds
      const autoRotateDelay = treeFormedAt !== null ? time - treeFormedAt : 0;
      if (progress > 0.85 && !cardDisintegratingRef.current && autoRotateDelay > 4.0) {
        targetRotY += AUTO_ROTATE_SPEED;
      }
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
        // Skip card formation when logo formation is active (work page with SVG logo)
        const useLogoInstead = wantCompany && LOGO_URLS[wantCompany] && workVisibleRef.current;
        if (wantCompany && !useLogoInstead && !cardFormingRef.current && !cardDisintegratingRef.current) {
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

      // Disintegration: full scatter by progress ~1.40 so particles fill entire screen
      const disint = clamp((progress - 0.86) / 0.5, 0, 1);
      // On work page: keep disintegration at 1.0 regardless of cfp (logo formation handles visuals)
      // On home page: cfp reduces disintegration for card formation
      const onWorkPage = workVisibleRef.current;
      particleMat.uniforms.uDisintegration.value = onWorkPage ? disint : (cfp > 0 ? Math.max(0, disint - disint * cfp) : disint);
      if (progress >= 1.50) targetProgress = 1.50;
      lineMat.uniforms.uTime.value = time;

      // ── Logo formation with pill-to-pill transitions ────────────────────
      // State machine: idle → form-in → (pill switch) scatter-out → form-in
      {
        const wantCompany = workVisibleRef.current ? hoveredCardRef.current : null;
        const wantUrl = wantCompany ? LOGO_URLS[wantCompany] : null;
        const phase = logoTransitionPhase.current;
        const prevWant = logoWantCompanyRef.current;

        // ── Detect changes ──
        const companyChanged = wantCompany !== prevWant;
        logoWantCompanyRef.current = wantCompany;

        if (companyChanged) {
          if (!wantCompany) {
            // Pill unhovered → scatter out
            logoTransitionPhase.current = 'scatter-out';
            logoPendingCompany.current = null;
          } else if (logoFormationRef.current > 0.15 && prevWant) {
            // Pill-to-pill switch while formed → scatter out first, queue new company
            logoTransitionPhase.current = 'scatter-out';
            logoPendingCompany.current = wantCompany;
          } else {
            // First hover or formation barely started → go straight to form-in
            logoTransitionPhase.current = 'form-in';
            logoPendingCompany.current = null;
          }
        }

        // ── Phase: scatter-out — speed depends on context ──
        // Pill-to-pill: fast snap (0.25) so the new logo forms quickly
        // Pill release to zero: smooth gentle dissolve (0.035) so particles drift naturally
        if (logoTransitionPhase.current === 'scatter-out') {
          const isPillToPill = !!logoPendingCompany.current;
          const scatterSpeed = isPillToPill ? 0.25 : 0.035;
          logoFormationRef.current += (0 - logoFormationRef.current) * scatterSpeed;
          if (logoFormationRef.current < 0.02) {
            logoFormationRef.current = 0;
            // Scatter complete — check if we have a pending company to form into
            if (logoPendingCompany.current) {
              logoTransitionPhase.current = 'form-in';
              // Reset company ref so the loader triggers
              logoCompanyRef.current = null;
            } else {
              logoTransitionPhase.current = 'idle';
              logoCompanyRef.current = null;
            }
          }
        }

        // ── Phase: form-in — load logo if needed, then ramp formation up ──
        if (logoTransitionPhase.current === 'form-in') {
          const targetCompany = logoPendingCompany.current || wantCompany;
          const targetUrl = targetCompany ? LOGO_URLS[targetCompany] : null;

          // Load logo positions if not yet loaded for this company
          if (targetUrl && targetCompany !== logoCompanyRef.current && !logoLoadingRef.current && pb) {
            logoLoadingRef.current = true;
            sampleLogoPositions(targetUrl, pb.count, W, H).then((positions) => {
              if (!pb) return;
              const logoBuf = pb.logoPosBuf;
              const logoAttr = pb.geometry.getAttribute('aLogoPos') as THREE.BufferAttribute;
              for (let i = 0; i < pb.count; i++) {
                logoBuf[i * 2] = positions[i * 2];
                logoBuf[i * 2 + 1] = positions[i * 2 + 1];
              }
              logoAttr.needsUpdate = true;
              logoCompanyRef.current = targetCompany;
              logoLoadingRef.current = false;
              logoPendingCompany.current = null;
            }).catch(() => {
              logoLoadingRef.current = false;
            });
          }

          // Ramp up once logo positions are loaded
          if (logoCompanyRef.current === targetCompany && targetCompany) {
            logoFormationRef.current += (1.0 - logoFormationRef.current) * 0.045; // smooth form-in
            if (logoFormationRef.current > 0.998) logoFormationRef.current = 1.0;
          }
        }

        // ── Phase: idle — decay to 0 if somehow still > 0 ──
        if (logoTransitionPhase.current === 'idle' && logoFormationRef.current > 0) {
          logoFormationRef.current += (0 - logoFormationRef.current) * 0.06;
          if (logoFormationRef.current < 0.005) logoFormationRef.current = 0;
        }

        particleMat.uniforms.uLogoFormation.value = logoFormationRef.current;

        // Show card images only after logo is mostly formed (avoids images before logo)
        const shouldShow = logoFormationRef.current > 0.55 && !!wantCompany && !!COMPANY_PROJECTS[wantCompany];
        if (shouldShow !== cardImagesVisibleRef.current) {
          cardImagesVisibleRef.current = shouldShow;
          setCardImagesVisible(shouldShow);
        }
      }

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

      // Canvas bg lerps with bgInvert (black ↔ white)
      const clearVal = colorStateRef.current.bgInvert;
      renderer.setClearColor(new THREE.Color(clearVal, clearVal, clearVal), 1.0);

      // Smart lines
      updateSmartLines();

      // Render Three.js scene
      renderer.render(scene, camera);

      // Overlays
      updateOverlays();

      // Expose projection state for annotation component
      const ts = treeStateRef.current;
      ts.rotY = rotY; ts.rotX = rotX;
      ts.W = W; ts.H = H;
      ts.sceneScale = Math.min(W, H) * SCENE_SCALE_FACTOR;
      ts.progress = progress;
      ts.time = time;

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      container.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onPointerMove);
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
                fontSize: 'clamp(9px, 0.72vw, 13px)',
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
                fontSize: 'clamp(38px, 5.85vh, 81px)',
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

      {/* SUTÉRA-style floating annotations — visible when tree is formed */}
      <TreeAnnotations
        visible={homepageRevealed && !workVisible}
        treeStateRef={treeStateRef}
        onHoverZone={(key) => { showWatermark(key, key); setHoveredZoneKey(key); }}
        onLeaveZone={() => { hideWatermark(); setHoveredZoneKey(null); }}
        onClickZone={(company) => handleCardClick(company)}
      />

      {/* Old hover zones removed — TreeAnnotations now handles all zone interactions */}
      <div ref={zonesRef} style={{ display: 'none' }} />

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
