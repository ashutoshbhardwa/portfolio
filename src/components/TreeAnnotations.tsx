"use client";
import React, { useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// Annotation system with SVG-style diagonal connectors + bullseye anchors:
//  1. Main card: partial-frame outline, diagonal connector → bullseye on tree
//  2. Flickering labels: ~3 visible at a time, instant snap on/off
//  3. Hover highlight: large label near cursor with diagonal connector + bullseye
//  4. Invisible zones over tree for hover interaction
// ═══════════════════════════════════════════════════════════════════════════════

interface TreeState {
  rotY: number; rotX: number; W: number; H: number;
  sceneScale: number; progress: number; time: number;
}

interface Props {
  visible: boolean;
  treeStateRef: React.RefObject<TreeState>;
  onHoverZone?: (key: string) => void;
  onLeaveZone?: () => void;
  onClickZone?: (key: string) => void;
}

// ── Zone key mapping ───────────────────────────────────────────────────────
const ZONE_KEY_MAP: Record<string, string> = {
  dailyobjects: "DAILYOBJECTS", crepdogcrew: "CREPDOGCREW",
  probo: "PROBO", stablemoney: "STABLE MONEY", other: "OTHER",
  motion: "MOTION DESIGN", systems: "SYSTEMS", "3d": "3D",
  brand: "BRAND", glitch: "GLITCH",
};

const CTA_COPY: Record<string, string> = {
  dailyobjects: "→ EXPLORE DAILYOBJECTS", crepdogcrew: "→ EXPLORE CREPDOGCREW",
  probo: "→ EXPLORE PROBO", stablemoney: "→ EXPLORE STABLE MONEY",
  other: "→ VIEW MORE WORK", motion: "→ SEE MOTION WORK",
  systems: "→ SEE DESIGN SYSTEMS", "3d": "→ SEE 3D WORK",
  brand: "→ SEE BRAND WORK", glitch: "→ SEE GLITCH WORK",
};

// ── Touchpoints ──────────────────────────────────────────────────────────────
interface Touchpoint {
  id: string;
  anchor: { x: number; y: number; z: number };
  screenPos: { x: number; y: number };
  label: string;
  sub: string;
  isMainCard: boolean;
  type: "main" | "exp" | "skill";
  staggerDelay: number;
}

const TOUCHPOINTS: Touchpoint[] = [
  { id: "main", anchor: { x: 0.10, y: 0.40, z: 0.08 }, screenPos: { x: 0, y: 0 }, label: "ASHUTOSH", sub: "", isMainCard: true, type: "main", staggerDelay: 0 },
  { id: "dailyobjects", anchor: { x: -0.15, y: 0.45, z: 0.05 }, screenPos: { x: 0.06, y: 0.12 }, label: "DAILYOBJECTS", sub: "BRAND · PRODUCT", isMainCard: false, type: "exp", staggerDelay: 0.3 },
  { id: "crepdogcrew", anchor: { x: 0.20, y: 0.55, z: -0.06 }, screenPos: { x: 0.88, y: 0.38 }, label: "CREPDOGCREW", sub: "STREETWEAR · CULTURE", isMainCard: false, type: "exp", staggerDelay: 0.6 },
  { id: "probo", anchor: { x: -0.10, y: 0.65, z: 0.10 }, screenPos: { x: 0.04, y: 0.55 }, label: "PROBO", sub: "PRODUCT · FINTECH", isMainCard: false, type: "exp", staggerDelay: 0.9 },
  { id: "stablemoney", anchor: { x: 0.12, y: 0.80, z: -0.03 }, screenPos: { x: 0.82, y: 0.72 }, label: "STABLE MONEY", sub: "DESIGN LEAD · 2026", isMainCard: false, type: "exp", staggerDelay: 1.2 },
  { id: "other", anchor: { x: -0.05, y: 0.35, z: 0.02 }, screenPos: { x: 0.06, y: 0.82 }, label: "OTHER", sub: "INDEPENDENT", isMainCard: false, type: "exp", staggerDelay: 1.5 },
  { id: "motion", anchor: { x: -0.18, y: 0.58, z: -0.05 }, screenPos: { x: 0.22, y: 0.08 }, label: "MOTION", sub: "ANIMATION · INTERACTION", isMainCard: false, type: "skill", staggerDelay: 0.5 },
  { id: "systems", anchor: { x: 0.08, y: 0.70, z: 0.08 }, screenPos: { x: 0.72, y: 0.14 }, label: "SYSTEMS", sub: "TOKENS · COMPONENTS", isMainCard: false, type: "skill", staggerDelay: 0.8 },
  { id: "3d", anchor: { x: 0.22, y: 0.50, z: 0.04 }, screenPos: { x: 0.92, y: 0.58 }, label: "3D", sub: "SPATIAL · RENDER", isMainCard: false, type: "skill", staggerDelay: 1.1 },
  { id: "brand", anchor: { x: -0.20, y: 0.75, z: -0.04 }, screenPos: { x: 0.18, y: 0.68 }, label: "BRAND", sub: "IDENTITY · MARKS", isMainCard: false, type: "skill", staggerDelay: 1.4 },
  { id: "glitch", anchor: { x: 0.05, y: 0.48, z: -0.10 }, screenPos: { x: 0.50, y: 0.85 }, label: "GLITCH", sub: "DISTORTION · NOISE", isMainCard: false, type: "skill", staggerDelay: 0.7 },
];

const MAX_VISIBLE = 3;

// ── Invisible zones over the tree ──────────────────────────────────────────
const TREE_ZONES: { id: string; top: string; left: string; w: string; h: string }[] = [
  { id: "dailyobjects", top: "6%",  left: "30%", w: "18%", h: "16%" },
  { id: "crepdogcrew",  top: "6%",  left: "50%", w: "20%", h: "16%" },
  { id: "probo",        top: "22%", left: "34%", w: "16%", h: "14%" },
  { id: "stablemoney",  top: "22%", left: "52%", w: "18%", h: "14%" },
  { id: "other",        top: "36%", left: "38%", w: "14%", h: "12%" },
  { id: "motion",       top: "36%", left: "52%", w: "14%", h: "12%" },
  { id: "systems",      top: "48%", left: "36%", w: "14%", h: "11%" },
  { id: "3d",           top: "48%", left: "50%", w: "14%", h: "11%" },
  { id: "brand",        top: "59%", left: "40%", w: "12%", h: "10%" },
  { id: "glitch",       top: "59%", left: "52%", w: "12%", h: "10%" },
];

// ── Physics config ──
const TILT_Y_AMP = 5;
const TILT_X_AMP = 5;
const SWAY_X_AMP = 22;
const SWAY_Y_AMP = 10;
const BOB_SPEED = 0.8;
const BOB_AMP = 3;
const CARD_LERP = 0.035;
const PERSPECTIVE = 800;
const BOX_RIGHT_MARGIN = 60;
const BOX_TOP = 120;
const BOX_W = 260;
const BOX_H = 145;

// ── Projection ──
function projectToScreen(
  px: number, py: number, pz: number,
  rotY: number, rotX: number,
  sceneScale: number, W: number, H: number,
): { x: number; y: number } {
  const wx = px * sceneScale, wy = py * sceneScale, wz = pz * sceneScale;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const rx = wx * cosY - wz * sinY, ry = wy, rz = wx * sinY + wz * cosY;
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const ryT = ry * cosX - rz * sinX, rzT = ry * sinX + rz * cosX;
  const d = 900 / (900 + rzT + 280);
  return { x: rx * d + W * 0.50, y: -(ryT * 1.15) * d + H * 0.65 };
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

// ── Per-touchpoint state ──
interface TPState {
  sx: number; sy: number; svx: number; svy: number;
  dx: number; dy: number; rY: number; rX: number; prevDx: number; prevDy: number;
  burstPhase: number; wasVisible: boolean;
}
function createTPState(): TPState {
  return {
    sx: 0, sy: 0, svx: 0, svy: 0,
    dx: 0, dy: 0, rY: 0, rX: 0, prevDx: 0, prevDy: 0,
    burstPhase: 0, wasVisible: false,
  };
}

// ── Glitch visibility ──
interface GlitchState { visibleSet: Set<number>; nextSwap: number; }
function createGlitchState(): GlitchState {
  const initial = new Set<number>();
  const indices: number[] = [];
  for (let i = 0; i < TOUCHPOINTS.length; i++) {
    if (!TOUCHPOINTS[i].isMainCard) indices.push(i);
  }
  for (let n = 0; n < MAX_VISIBLE && indices.length > 0; n++) {
    const pick = Math.floor(Math.random() * indices.length);
    initial.add(indices[pick]);
    indices.splice(pick, 1);
  }
  return { visibleSet: initial, nextSwap: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRAWING HELPERS — SVG-style diagonal connectors + bullseye
// ═══════════════════════════════════════════════════════════════════════════════

/** MAIN CARD connector (matches Group 2147223923.svg):
 *  card-corner → diagonal(45°) → horizontal → diagonal(45°) → horizontal → bullseye
 *  Two diagonal breaks for the larger card. */
function buildCardConnector(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const absDy = Math.abs(dy);
  const signX = dx > 0 ? 1 : -1;
  const signY = dy > 0 ? 1 : -1;

  if (Math.abs(dx) < 30 && absDy < 30) return [from, to];

  // First diagonal: ~30% of vertical distance
  const diag1Len = absDy * 0.3;
  const p1 = { x: from.x + signX * diag1Len, y: from.y + signY * diag1Len };

  // Horizontal run
  const remainDy = absDy - diag1Len;
  const diag2Len = remainDy * 0.5;
  const horizEndX = to.x - signX * diag2Len;
  const p2 = { x: horizEndX, y: p1.y };

  // Second diagonal: rest of vertical
  const p3 = { x: to.x, y: p2.y + signY * diag2Len };

  // Horizontal to bullseye (if any remaining)
  return [from, p1, p2, p3, to];
}

/** SMALL NODE connector (matches Group 2147223924.svg):
 *  label → horizontal → diagonal(45°) → horizontal → bullseye
 *  Single diagonal break for smaller labels. */
function buildNodeConnector(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const absDy = Math.abs(dy);
  const signX = dx > 0 ? 1 : -1;
  const signY = dy > 0 ? 1 : -1;

  if (Math.abs(dx) < 20 && absDy < 20) return [from, to];

  // Horizontal out from label (~40% of horizontal distance)
  const horizOut = Math.abs(dx) * 0.4;
  const p1 = { x: from.x + signX * horizOut, y: from.y };

  // Diagonal 45°: covers all the vertical distance
  const diagLen = absDy;
  const p2 = { x: p1.x + signX * diagLen, y: p1.y + signY * diagLen };

  // Horizontal to bullseye
  return [from, p1, p2, to];
}

/** Draw a polyline path with animated draw-in */
function drawPath(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  progress: number,
  alpha: number,
) {
  if (pts.length < 2 || progress <= 0) return;
  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const drawLen = totalLen * progress;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const segLen = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + segLen <= drawLen) {
      ctx.lineTo(pts[i].x, pts[i].y);
      acc += segLen;
    } else {
      const f = (drawLen - acc) / segLen;
      ctx.lineTo(
        pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
        pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
      );
      break;
    }
  }
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Draw bullseye at anchor: outer circle (stroke) + inner circle (filled) */
function drawBullseye(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
  // Outer ring
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.6})`;
  ctx.lineWidth = 1;
  ctx.stroke();
  // Inner filled dot
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.fill();
}

/** Draw partial card frame (SVG style: left, top-left, gap, top-right, right) */
function drawCardFrame(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  titleBarX: number, titleBarW: number,
  alpha: number,
) {
  const a = `rgba(255,255,255,${alpha})`;
  ctx.strokeStyle = a;
  ctx.lineWidth = 1;

  // Left side (bottom to top)
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Top-left (left edge to title bar start)
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + titleBarX, y);
  ctx.stroke();

  // Top-right (title bar end to right edge)
  ctx.beginPath();
  ctx.moveTo(x + titleBarX + titleBarW, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();

  // Right side (top to bottom)
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();
}

/** Draw partial highlight frame (top-left corner lines + bottom-right hint) */
function drawHighlightFrame(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, // center position
  hw: number, hh: number, // half width, half height
  alpha: number,
) {
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 1;

  const x1 = cx - hw, y1 = cy - hh;
  const x2 = cx + hw, y2 = cy + hh;
  const cornerLen = 25;

  // Top-left corner
  ctx.beginPath();
  ctx.moveTo(x1, y1 + cornerLen);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 + cornerLen, y1);
  ctx.stroke();

  // Top-right corner
  ctx.beginPath();
  ctx.moveTo(x2 - cornerLen, y1);
  ctx.lineTo(x2, y1);
  ctx.lineTo(x2, y1 + cornerLen);
  ctx.stroke();

  // Bottom-right corner
  ctx.beginPath();
  ctx.moveTo(x2, y2 - cornerLen);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - cornerLen, y2);
  ctx.stroke();

  // Bottom-left corner
  ctx.beginPath();
  ctx.moveTo(x1 + cornerLen, y2);
  ctx.lineTo(x1, y2);
  ctx.lineTo(x1, y2 - cornerLen);
  ctx.stroke();
}


// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TreeAnnotations({ visible, treeStateRef, onHoverZone, onLeaveZone, onClickZone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const highlightRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const enteredRef = useRef(false);
  const enterTimeRef = useRef(0);
  const statesRef = useRef<TPState[]>(TOUCHPOINTS.map(() => createTPState()));
  const glitchRef = useRef<GlitchState>(createGlitchState());
  const mouseRef = useRef({ x: 0, y: 0 });
  const hoveredIdRef = useRef<string | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { mouseRef.current.x = e.clientX; mouseRef.current.y = e.clientY; };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const handleZoneEnter = useCallback((id: string) => {
    hoveredIdRef.current = id;
    const zoneKey = ZONE_KEY_MAP[id];
    if (zoneKey && onHoverZone) onHoverZone(zoneKey);
  }, [onHoverZone]);

  const handleZoneLeave = useCallback(() => {
    hoveredIdRef.current = null;
    if (onLeaveZone) onLeaveZone();
  }, [onLeaveZone]);

  const handleZoneClick = useCallback((id: string) => {
    const zoneKey = ZONE_KEY_MAP[id];
    if (zoneKey && onClickZone) onClickZone(zoneKey);
  }, [onClickZone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = window.innerWidth + "px";
      canvas!.style.height = window.innerHeight + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const hlPos = { x: 0, y: 0, inited: false };

    function frame(t: number) {
      const ts = treeStateRef.current;
      if (!ts || !ctx || !canvas) { rafRef.current = requestAnimationFrame(frame); return; }
      const W = window.innerWidth;
      const H = window.innerHeight;
      ctx.clearRect(0, 0, W, H);

      const boxEl = boxRef.current;
      const hlEl = highlightRef.current;

      if (!visible || ts.progress < 0.84) {
        enteredRef.current = false;
        enterTimeRef.current = 0;
        if (boxEl) boxEl.style.opacity = "0";
        if (hlEl) hlEl.style.opacity = "0";
        labelRefs.current.forEach(el => { if (el) el.style.opacity = "0"; });
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      if (!enteredRef.current) {
        enteredRef.current = true;
        enterTimeRef.current = t;
      }
      const elapsed = (t - enterTimeRef.current) / 1000;
      const time = ts.time;

      // ── Glitch flicker ──
      const gl = glitchRef.current;
      const hId = hoveredIdRef.current;

      if (t >= gl.nextSwap) {
        const nonMainIndices: number[] = [];
        for (let i = 0; i < TOUCHPOINTS.length; i++) {
          if (!TOUCHPOINTS[i].isMainCard) nonMainIndices.push(i);
        }
        const visArr = Array.from(gl.visibleSet);
        const hidArr = nonMainIndices.filter(i => !gl.visibleSet.has(i));
        if (visArr.length > 0 && hidArr.length > 0) {
          const swappable = visArr.filter(i => TOUCHPOINTS[i].id !== hId);
          if (swappable.length > 0 && hidArr.length > 0) {
            const out = swappable[Math.floor(Math.random() * swappable.length)];
            const inIdx = hidArr[Math.floor(Math.random() * hidArr.length)];
            gl.visibleSet.delete(out);
            gl.visibleSet.add(inIdx);
          }
        }
        gl.nextSwap = t + 600 + Math.random() * 1400;
      }

      // ── HIGHLIGHT LABEL (near cursor on hover) ──
      if (hlEl) {
        if (hId) {
          const tp = TOUCHPOINTS.find(p => p.id === hId);
          const tpIdx = TOUCHPOINTS.findIndex(p => p.id === hId);
          if (tp && tpIdx >= 0) {
            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;
            if (!hlPos.inited) { hlPos.x = mx; hlPos.y = my; hlPos.inited = true; }
            hlPos.x += (mx - hlPos.x) * 0.18;
            hlPos.y += (my - hlPos.y) * 0.18;

            hlEl.style.opacity = "1";
            hlEl.style.left = hlPos.x.toFixed(1) + "px";
            hlEl.style.top = hlPos.y.toFixed(1) + "px";

            const nameEl = hlEl.querySelector(".hl-name") as HTMLElement | null;
            const ctaEl = hlEl.querySelector(".hl-cta") as HTMLElement | null;
            if (nameEl) nameEl.textContent = tp.label;
            if (ctaEl) ctaEl.textContent = CTA_COPY[tp.id] || `→ EXPLORE ${tp.label}`;

            // Connector: highlight → tree anchor
            const st = statesRef.current[tpIdx];
            const projected = projectToScreen(tp.anchor.x, tp.anchor.y, tp.anchor.z, ts.rotY, ts.rotX, ts.sceneScale, W, H);
            const aX = st.sx || projected.x;
            const aY = st.sy || projected.y;
            const breathe = 0.35 + 0.12 * Math.sin(time * 1.2);

            // Diagonal connector from highlight to anchor
            const hlPath = buildNodeConnector({ x: hlPos.x, y: hlPos.y }, { x: aX, y: aY });
            drawPath(ctx, hlPath, 1.0, breathe);
            drawBullseye(ctx, aX, aY, breathe * 1.2);

            // Highlight frame (corner brackets around text)
            const hlW = Math.max(tp.label.length * 16, 120);
            drawHighlightFrame(ctx, hlPos.x, hlPos.y, hlW / 2 + 20, 35, breathe * 0.6);
          }
        } else {
          hlEl.style.opacity = "0";
          hlPos.inited = false;
        }
      }

      // ── Process each touchpoint ──
      for (let ti = 0; ti < TOUCHPOINTS.length; ti++) {
        const tp = TOUCHPOINTS[ti];
        const st = statesRef.current[ti];
        const tpElapsed = Math.max(0, elapsed - tp.staggerDelay);
        const isHovered = tp.id === hId;
        const isGlitchVisible = tp.isMainCard || gl.visibleSet.has(ti);

        if (isGlitchVisible && !st.wasVisible) st.burstPhase = 6;
        st.wasVisible = isGlitchVisible;
        if (st.burstPhase > 0) st.burstPhase--;

        // Project anchor
        const projected = projectToScreen(tp.anchor.x, tp.anchor.y, tp.anchor.z, ts.rotY, ts.rotX, ts.sceneScale, W, H);
        if (st.sx === 0 && st.sy === 0) { st.sx = projected.x; st.sy = projected.y; }
        st.svx = (st.svx + (projected.x - st.sx) * 0.08) * 0.75;
        st.svy = (st.svy + (projected.y - st.sy) * 0.08) * 0.75;
        st.sx += st.svx;
        st.sy += st.svy;
        const anchorX = st.sx, anchorY = st.sy;

        // Sway
        const phaseOff = ti * 1.7;
        const swayScale = tp.isMainCard ? 1 : 0.5;
        const targetDx = Math.sin(ts.rotY + phaseOff) * SWAY_X_AMP * swayScale + Math.sin(time * BOB_SPEED * 1.3 + phaseOff) * BOB_AMP * 0.6;
        const rotXDeg = ts.rotX * (180 / Math.PI);
        const targetDy = Math.cos(ts.rotY * 0.7 + phaseOff) * SWAY_Y_AMP * swayScale + rotXDeg * (tp.isMainCard ? 3.5 : 2) + Math.sin(time * BOB_SPEED + phaseOff) * BOB_AMP;

        st.prevDx = st.dx; st.prevDy = st.dy;
        st.dx += (targetDx - st.dx) * CARD_LERP;
        st.dy += (targetDy - st.dy) * CARD_LERP;
        const velX = st.dx - st.prevDx, velY = st.dy - st.prevDy;
        st.rY += (clamp(velX * 12, -TILT_Y_AMP, TILT_Y_AMP) - st.rY) * 0.08;
        st.rX += (clamp(-velY * 10, -TILT_X_AMP, TILT_X_AMP) - st.rX) * 0.08;

        const drawProgress = Math.min(1, tpElapsed / 1.2);
        const breathe = 0.25 + 0.15 * Math.sin(time * 1.2 + phaseOff);

        if (tp.isMainCard) {
          // ══════ MAIN CARD ══════
          const boxBaseX = W - BOX_RIGHT_MARGIN - BOX_W;
          const boxBaseY = BOX_TOP;
          const boxX = boxBaseX + st.dx;
          const boxY = boxBaseY + st.dy;

          // Card frame on canvas (SVG style: partial frame with title bar gap)
          const titleBarRelX = 8; // relative to card left
          const titleBarW = BOX_W - 16; // title bar width
          const frameAlpha = Math.max(0, Math.min(1, (tpElapsed - 0.5) / 0.8)) * 0.5;
          drawCardFrame(ctx, boxX, boxY, BOX_W, BOX_H, titleBarRelX, titleBarW, frameAlpha);

          // Diagonal connector: card bottom-right → tree anchor
          const connectorStart = { x: boxX + BOX_W, y: boxY + BOX_H };
          const connectorEnd = { x: anchorX, y: anchorY };
          const cardPath = buildCardConnector(connectorStart, connectorEnd);
          drawPath(ctx, cardPath, drawProgress, breathe);
          if (drawProgress > 0.6) {
            drawBullseye(ctx, anchorX, anchorY, breathe * drawProgress);
          }

          // DOM card
          const boxFade = Math.max(0, Math.min(1, (tpElapsed - 1.0) / 0.5));
          if (boxEl) {
            boxEl.style.opacity = String(boxFade);
            boxEl.style.left = boxX.toFixed(1) + "px";
            boxEl.style.top = boxY.toFixed(1) + "px";
            boxEl.style.transform = `perspective(${PERSPECTIVE}px) rotateY(${st.rY.toFixed(2)}deg) rotateX(${st.rX.toFixed(2)}deg)`;
          }
        } else {
          // ══════ BRAND/SKILL LABEL ══════
          const labelBaseX = tp.screenPos.x * W;
          const labelBaseY = tp.screenPos.y * H;
          const labelX = labelBaseX + st.dx * 0.4;
          const labelY = labelBaseY + st.dy * 0.4;

          if (isGlitchVisible && drawProgress > 0) {
            // Diagonal connector: label → tree anchor
            const labelPath = buildNodeConnector({ x: labelX, y: labelY }, { x: anchorX, y: anchorY });
            const lineAlpha = isHovered ? breathe * 1.5 : breathe * 0.4;
            drawPath(ctx, labelPath, drawProgress, Math.min(lineAlpha, 0.6));

            if (drawProgress > 0.4) {
              drawBullseye(ctx, anchorX, anchorY, breathe * 0.5 * drawProgress);
            }
          }

          // DOM label
          const labelEl = labelRefs.current[ti];
          if (labelEl) {
            if (isGlitchVisible) {
              const burstOp = st.burstPhase > 3 ? 0.9 : st.burstPhase > 0 ? 0.7 : 0.5;
              const burstScale = st.burstPhase > 3 ? 1.2 : st.burstPhase > 0 ? 1.08 : 1.0;
              labelEl.style.opacity = String(isHovered ? 0.8 : burstOp);
              labelEl.style.left = labelX.toFixed(1) + "px";
              labelEl.style.top = labelY.toFixed(1) + "px";
              labelEl.style.transform = `perspective(${PERSPECTIVE}px) scale(${burstScale.toFixed(3)}) rotateY(${(st.rY * 0.5).toFixed(2)}deg) rotateX(${(st.rX * 0.5).toFixed(2)}deg)`;
            } else {
              labelEl.style.opacity = "0";
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [visible, treeStateRef]);

  // ═════════════════════════════════════════════════════════════════════════════
  // JSX
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none", overflow: "hidden",
      display: visible ? undefined : "none",
    }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

      {/* ── MAIN CARD (DOM content, frame drawn on canvas) ── */}
      <div
        ref={boxRef}
        style={{
          position: "absolute", width: BOX_W, height: BOX_H, opacity: 0,
          pointerEvents: "none", transformOrigin: "center center", willChange: "transform, opacity",
        }}
      >
        {/* Title bar (white filled rectangle — matches SVG rect) */}
        <div style={{
          position: "absolute", left: 8, top: 8, right: 8, height: 36,
          background: "rgba(255,255,255,0.95)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 12px",
        }}>
          <span style={{
            fontFamily: "'SF Mono','Fira Code',Consolas,monospace",
            fontWeight: 700, fontSize: 14, color: "#000", letterSpacing: "0.04em",
          }}>ASHUTOSH</span>
          <span style={{
            fontFamily: "'SF Mono','Fira Code',Consolas,monospace",
            fontWeight: 400, fontSize: 10, color: "rgba(0,0,0,0.4)",
          }}>/25</span>
        </div>

        {/* Body text */}
        <div style={{
          position: "absolute", left: 14, top: 56,
          fontFamily: "'SF Mono','Fira Code',Consolas,monospace",
          fontWeight: 400, fontSize: 10, lineHeight: "17px",
        }}>
          <div style={{ color: "rgba(255,255,255,0.55)" }}>MULTI-DISCIPLINARY</div>
          <div style={{ color: "rgba(255,255,255,0.55)" }}>+ VISUAL DESIGNER</div>
          <div style={{ height: 12 }} />
          <div style={{ color: "rgba(255,255,255,0.35)" }}>→ BANGALORE, INDIA</div>
        </div>
      </div>

      {/* ── HIGHLIGHT LABEL (follows cursor, centered) ── */}
      <div
        ref={highlightRef}
        style={{
          position: "absolute", opacity: 0, pointerEvents: "none",
          willChange: "transform, opacity",
          fontFamily: "'SF Mono','Fira Code',Consolas,monospace",
          whiteSpace: "nowrap", zIndex: 10,
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <div className="hl-name" style={{
          fontSize: 30, fontWeight: 700, letterSpacing: "0.05em",
          color: "rgba(255,255,255,0.95)", lineHeight: "36px",
        }} />
        <div className="hl-cta" style={{
          fontSize: 9, fontWeight: 500, letterSpacing: "0.14em",
          color: "rgba(255,255,255,0.45)", lineHeight: "14px", marginTop: 8,
        }} />
      </div>

      {/* ── Invisible hover zones over the tree ── */}
      {TREE_ZONES.map((z) => (
        <div
          key={`zone-${z.id}`}
          onMouseEnter={() => handleZoneEnter(z.id)}
          onMouseLeave={handleZoneLeave}
          onClick={() => handleZoneClick(z.id)}
          style={{
            position: "absolute", top: z.top, left: z.left, width: z.w, height: z.h,
            pointerEvents: "auto", cursor: "pointer",
          }}
        />
      ))}

      {/* ── Flickering labels ── */}
      {TOUCHPOINTS.map((tp, i) =>
        tp.isMainCard ? null : (
          <div
            key={tp.id}
            ref={(el) => { labelRefs.current[i] = el; }}
            style={{
              position: "absolute", opacity: 0, pointerEvents: "none",
              transformOrigin: "left top", willChange: "transform, opacity",
              fontFamily: "'SF Mono','Fira Code',Consolas,monospace",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{
              fontSize: tp.type === "exp" ? 10 : 9,
              fontWeight: tp.type === "exp" ? 600 : 400,
              letterSpacing: tp.type === "exp" ? "0.08em" : "0.12em",
              color: "rgba(255,255,255,0.75)", lineHeight: "14px",
            }}>
              {tp.label}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
