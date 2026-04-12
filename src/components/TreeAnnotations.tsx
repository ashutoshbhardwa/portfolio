"use client";
import React, { useEffect, useRef, useCallback, useState } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// Annotation system:
//  1. Glitch flicker: ~3 labels visible, cycling at comfortable pace but with
//     INSTANT snap on/off (no slow opacity fade)
//  2. Invisible hover zones → zone color change
//  3. On hover: a SEPARATE big highlight label appears NEAR THE CURSOR
//     with brand name at ~24px + CTA subtext
//  4. Main SUTÉRA card stays always visible
// ═══════════════════════════════════════════════════════════════════════════════

interface TreeState {
  rotY: number;
  rotX: number;
  W: number;
  H: number;
  sceneScale: number;
  progress: number;
  time: number;
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
  dailyobjects: "DAILYOBJECTS",
  crepdogcrew: "CREPDOGCREW",
  probo: "PROBO",
  stablemoney: "STABLE MONEY",
  other: "OTHER",
  motion: "MOTION DESIGN",
  systems: "SYSTEMS",
  "3d": "3D",
  brand: "BRAND",
  glitch: "GLITCH",
};

// ── CTA copy per touchpoint ────────────────────────────────────────────────
const CTA_COPY: Record<string, string> = {
  dailyobjects: "→ EXPLORE DAILYOBJECTS",
  crepdogcrew: "→ EXPLORE CREPDOGCREW",
  probo: "→ EXPLORE PROBO",
  stablemoney: "→ EXPLORE STABLE MONEY",
  other: "→ VIEW MORE WORK",
  motion: "→ SEE MOTION WORK",
  systems: "→ SEE DESIGN SYSTEMS",
  "3d": "→ SEE 3D WORK",
  brand: "→ SEE BRAND WORK",
  glitch: "→ SEE GLITCH WORK",
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
  // Experience
  { id: "dailyobjects", anchor: { x: -0.15, y: 0.45, z: 0.05 }, screenPos: { x: 0.06, y: 0.12 }, label: "DAILYOBJECTS", sub: "BRAND · PRODUCT", isMainCard: false, type: "exp", staggerDelay: 0.3 },
  { id: "crepdogcrew", anchor: { x: 0.20, y: 0.55, z: -0.06 }, screenPos: { x: 0.88, y: 0.38 }, label: "CREPDOGCREW", sub: "STREETWEAR · CULTURE", isMainCard: false, type: "exp", staggerDelay: 0.6 },
  { id: "probo", anchor: { x: -0.10, y: 0.65, z: 0.10 }, screenPos: { x: 0.04, y: 0.55 }, label: "PROBO", sub: "PRODUCT · FINTECH", isMainCard: false, type: "exp", staggerDelay: 0.9 },
  { id: "stablemoney", anchor: { x: 0.12, y: 0.80, z: -0.03 }, screenPos: { x: 0.82, y: 0.72 }, label: "STABLE MONEY", sub: "DESIGN LEAD · 2026", isMainCard: false, type: "exp", staggerDelay: 1.2 },
  { id: "other", anchor: { x: -0.05, y: 0.35, z: 0.02 }, screenPos: { x: 0.06, y: 0.82 }, label: "OTHER", sub: "INDEPENDENT", isMainCard: false, type: "exp", staggerDelay: 1.5 },
  // Skills
  { id: "motion", anchor: { x: -0.18, y: 0.58, z: -0.05 }, screenPos: { x: 0.22, y: 0.08 }, label: "MOTION", sub: "ANIMATION · INTERACTION", isMainCard: false, type: "skill", staggerDelay: 0.5 },
  { id: "systems", anchor: { x: 0.08, y: 0.70, z: 0.08 }, screenPos: { x: 0.72, y: 0.14 }, label: "SYSTEMS", sub: "TOKENS · COMPONENTS", isMainCard: false, type: "skill", staggerDelay: 0.8 },
  { id: "3d", anchor: { x: 0.22, y: 0.50, z: 0.04 }, screenPos: { x: 0.92, y: 0.58 }, label: "3D", sub: "SPATIAL · RENDER", isMainCard: false, type: "skill", staggerDelay: 1.1 },
  { id: "brand", anchor: { x: -0.20, y: 0.75, z: -0.04 }, screenPos: { x: 0.18, y: 0.68 }, label: "BRAND", sub: "IDENTITY · MARKS", isMainCard: false, type: "skill", staggerDelay: 1.4 },
  { id: "glitch", anchor: { x: 0.05, y: 0.48, z: -0.10 }, screenPos: { x: 0.50, y: 0.85 }, label: "GLITCH", sub: "DISTORTION · NOISE", isMainCard: false, type: "skill", staggerDelay: 0.7 },
];

const MAX_VISIBLE = 3;

// ── Invisible hover zones positioned OVER THE TREE ─────────────────────────
// These are large viewport-% areas covering the tree silhouette, matching
// the original DataTree zone layout so the user can hover over the tree itself.
const TREE_ZONES: { id: string; top: string; left: string; w: string; h: string }[] = [
  // Experience brands
  { id: "dailyobjects", top: "6%",  left: "30%", w: "18%", h: "16%" },
  { id: "crepdogcrew",  top: "6%",  left: "50%", w: "20%", h: "16%" },
  { id: "probo",        top: "22%", left: "34%", w: "16%", h: "14%" },
  { id: "stablemoney",  top: "22%", left: "52%", w: "18%", h: "14%" },
  { id: "other",        top: "36%", left: "38%", w: "14%", h: "12%" },
  // Skills
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
const BOX_W = 220;
const BOX_H = 130;

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
  flickers: { next: number; end: number; on: boolean }[];
  burstPhase: number;
  wasVisible: boolean;
}
function createTPState(): TPState {
  return {
    sx: 0, sy: 0, svx: 0, svy: 0,
    dx: 0, dy: 0, rY: 0, rX: 0, prevDx: 0, prevDy: 0,
    flickers: [{ next: 0, end: 0, on: true }, { next: 0, end: 0, on: true }],
    burstPhase: 0,
    wasVisible: false,
  };
}

// ── Glitch visibility scheduler ──
interface GlitchState {
  visibleSet: Set<number>;
  nextSwap: number;
}

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

  // Mouse position for highlight label
  const mouseRef = useRef({ x: 0, y: 0 });

  // Hovered touchpoint (by id)
  const hoveredIdRef = useRef<string | null>(null);

  // Track mouse globally
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

    // Smooth position for highlight label (lerped toward mouse)
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

      // ── GLITCH FLICKER: comfortable pace, instant snap ──
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
          // Swap just 1 — comfortable rhythm
          const swappable = visArr.filter(i => TOUCHPOINTS[i].id !== hId);
          if (swappable.length > 0 && hidArr.length > 0) {
            const out = swappable[Math.floor(Math.random() * swappable.length)];
            const inIdx = hidArr[Math.floor(Math.random() * hidArr.length)];
            gl.visibleSet.delete(out);
            gl.visibleSet.add(inIdx);
          }
        }

        // Original comfortable pace: 600–2000ms
        gl.nextSwap = t + 600 + Math.random() * 1400;
      }

      // ── HIGHLIGHT LABEL: follows mouse when hovering a zone ──
      if (hlEl) {
        if (hId) {
          const tp = TOUCHPOINTS.find(p => p.id === hId);
          const tpIdx = TOUCHPOINTS.findIndex(p => p.id === hId);
          if (tp && tpIdx >= 0) {
            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;
            // Smooth lerp toward mouse
            if (!hlPos.inited) { hlPos.x = mx; hlPos.y = my; hlPos.inited = true; }
            hlPos.x += (mx - hlPos.x) * 0.18;
            hlPos.y += (my - hlPos.y) * 0.18;

            hlEl.style.opacity = "1";
            hlEl.style.left = hlPos.x.toFixed(1) + "px";
            hlEl.style.top = hlPos.y.toFixed(1) + "px";

            // Set text content
            const nameEl = hlEl.querySelector(".hl-name") as HTMLElement | null;
            const ctaEl = hlEl.querySelector(".hl-cta") as HTMLElement | null;
            if (nameEl) nameEl.textContent = tp.label;
            if (ctaEl) ctaEl.textContent = CTA_COPY[tp.id] || `→ EXPLORE ${tp.label}`;

            // ── Draw connector line from tree anchor to highlight label ──
            const st = statesRef.current[tpIdx];
            const projected = projectToScreen(tp.anchor.x, tp.anchor.y, tp.anchor.z, ts.rotY, ts.rotX, ts.sceneScale, W, H);
            // Use spring-smoothed anchor
            const aX = st.sx || projected.x;
            const aY = st.sy || projected.y;
            const hlX = hlPos.x;
            const hlY = hlPos.y;
            const midX = aX + (hlX - aX) * 0.5;
            const hlWaypoints = [
              { x: aX, y: aY },
              { x: midX, y: aY },
              { x: midX, y: hlY },
              { x: hlX, y: hlY },
            ];
            const hlBreathe = 0.35 + 0.15 * Math.sin(time * 1.2);
            drawConnectorLine(ctx, hlWaypoints, 1.0, hlBreathe);
            // Anchor dot
            ctx.fillStyle = `rgba(255,255,255,0.7)`;
            ctx.fillRect(aX - 2.5, aY - 2.5, 5, 5);
            // End dot at label
            ctx.fillStyle = `rgba(255,255,255,0.5)`;
            ctx.fillRect(hlX - 2, hlY - 2, 4, 4);
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

        // ── Detect visibility edges for burst effect ──
        if (isGlitchVisible && !st.wasVisible) {
          st.burstPhase = 6;
        }
        st.wasVisible = isGlitchVisible;
        if (st.burstPhase > 0) st.burstPhase--;

        // ── Project anchor ──
        const projected = projectToScreen(tp.anchor.x, tp.anchor.y, tp.anchor.z, ts.rotY, ts.rotX, ts.sceneScale, W, H);

        // ── Spring physics ──
        if (st.sx === 0 && st.sy === 0) { st.sx = projected.x; st.sy = projected.y; }
        const fx = (projected.x - st.sx) * 0.08;
        const fy = (projected.y - st.sy) * 0.08;
        st.svx = (st.svx + fx) * 0.75;
        st.svy = (st.svy + fy) * 0.75;
        st.sx += st.svx;
        st.sy += st.svy;
        const anchorX = st.sx, anchorY = st.sy;

        // ── Sway physics ──
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
          // ── MAIN CARD ──
          const boxBaseX = W - BOX_RIGHT_MARGIN - BOX_W;
          const boxBaseY = BOX_TOP;
          const boxX = boxBaseX + st.dx, boxY = boxBaseY + st.dy;
          const boxConnectX = boxX, boxConnectY = boxY + BOX_H * 0.5;
          const midX = anchorX + (boxConnectX - anchorX) * 0.55;
          const waypoints = [
            { x: anchorX, y: anchorY }, { x: midX, y: anchorY },
            { x: midX, y: boxConnectY }, { x: boxConnectX, y: boxConnectY },
          ];
          drawConnectorLine(ctx, waypoints, drawProgress, breathe);
          drawFlickerDots(ctx, waypoints, drawProgress, st.flickers, t);
          const boxFade = Math.max(0, Math.min(1, (tpElapsed - 1.0) / 0.5));
          if (boxEl) {
            boxEl.style.opacity = String(boxFade);
            boxEl.style.left = boxX.toFixed(1) + "px";
            boxEl.style.top = boxY.toFixed(1) + "px";
            boxEl.style.transform = `perspective(${PERSPECTIVE}px) rotateY(${st.rY.toFixed(2)}deg) rotateX(${st.rX.toFixed(2)}deg)`;
          }
        } else {
          // ── BRAND/SKILL LABEL (small, flickering) ──
          const labelBaseX = tp.screenPos.x * W;
          const labelBaseY = tp.screenPos.y * H;
          const labelX = labelBaseX + st.dx * 0.4;
          const labelY = labelBaseY + st.dy * 0.4;

          // Draw connector + anchor dot when visible
          if (isGlitchVisible && drawProgress > 0) {
            const midX = anchorX + (labelX - anchorX) * 0.5;
            const waypoints = [
              { x: anchorX, y: anchorY }, { x: midX, y: anchorY },
              { x: midX, y: labelY + 6 }, { x: labelX, y: labelY + 6 },
            ];
            const lineAlpha = isHovered ? breathe * 1.5 : breathe * 0.5;
            drawConnectorLine(ctx, waypoints, drawProgress, Math.min(lineAlpha, 0.7));

            if (drawProgress > 0.1) {
              updateFlicker(st.flickers[0], t);
              const dotA = st.flickers[0].on ? 0.5 : 0.03;
              ctx.fillStyle = `rgba(255,255,255,${dotA})`;
              ctx.fillRect(anchorX - 2, anchorY - 2, 4, 4);
            }
          }

          // ── Update DOM label ──
          const labelEl = labelRefs.current[ti];
          if (labelEl) {
            if (isGlitchVisible) {
              // Burst: brief brightness flash on appear
              const burstOp = st.burstPhase > 3 ? 0.9 : st.burstPhase > 0 ? 0.7 : 0.5;
              const burstScale = st.burstPhase > 3 ? 1.2 : st.burstPhase > 0 ? 1.08 : 1.0;

              labelEl.style.opacity = String(isHovered ? 0.8 : burstOp);
              labelEl.style.left = labelX.toFixed(1) + "px";
              labelEl.style.top = labelY.toFixed(1) + "px";
              labelEl.style.transform =
                `perspective(${PERSPECTIVE}px) scale(${burstScale.toFixed(3)}) rotateY(${(st.rY * 0.5).toFixed(2)}deg) rotateX(${(st.rX * 0.5).toFixed(2)}deg)`;
            } else {
              // Instant snap off
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

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none", overflow: "hidden" }}>
      {/* Canvas: connector lines + dots */}
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

      {/* Main card */}
      <div
        ref={boxRef}
        style={{
          position: "absolute", width: BOX_W, height: BOX_H, opacity: 0,
          pointerEvents: "none", transformOrigin: "center center", willChange: "transform, opacity",
        }}
      >
        <div style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,255,255,0.5)" }} />
        <div style={{ position: "absolute", inset: 3, border: "0.8px solid rgba(255,255,255,0.2)" }} />
        <div style={{ position: "absolute", left: 3, top: 3, right: 3, height: 28, background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", left: 3, top: 31, right: 3, height: 1.5, background: "rgba(255,255,255,0.25)" }} />
        <div style={{ position: "absolute", left: 14, top: 9, fontFamily: "'SF Mono','Fira Code',Consolas,monospace", fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: "18px" }}>ASHUTOSH</div>
        <div style={{ position: "absolute", right: 14, top: 10, fontFamily: "'SF Mono','Fira Code',Consolas,monospace", fontWeight: 400, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>/25</div>
        <div style={{ position: "absolute", left: 14, top: 42, fontFamily: "'SF Mono','Fira Code',Consolas,monospace", fontWeight: 400, fontSize: 10, lineHeight: "16px" }}>
          <div style={{ color: "rgba(255,255,255,0.55)" }}>MULTI-DISCIPLINARY</div>
          <div style={{ color: "rgba(255,255,255,0.55)" }}>+ VISUAL DESIGNER</div>
          <div style={{ height: 10 }} />
          <div style={{ color: "rgba(255,255,255,0.35)" }}>→ BANGALORE, INDIA</div>
        </div>
      </div>

      {/* ── HIGHLIGHT LABEL: appears near cursor on hover ── */}
      <div
        ref={highlightRef}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          willChange: "transform, opacity",
          fontFamily: "'SF Mono','Fira Code',Consolas,monospace",
          whiteSpace: "nowrap",
          zIndex: 10,
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <div
          className="hl-name"
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "rgba(255,255,255,0.95)",
            lineHeight: "34px",
          }}
        />
        <div
          className="hl-cta"
          style={{
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.45)",
            lineHeight: "14px",
            marginTop: 8,
          }}
        />
      </div>

      {/* Invisible hover trigger zones — positioned OVER THE TREE (large areas) */}
      {TREE_ZONES.map((z) => (
        <div
          key={`zone-${z.id}`}
          onMouseEnter={() => handleZoneEnter(z.id)}
          onMouseLeave={handleZoneLeave}
          onClick={() => handleZoneClick(z.id)}
          style={{
            position: "absolute",
            top: z.top,
            left: z.left,
            width: z.w,
            height: z.h,
            pointerEvents: "auto",
            cursor: "pointer",
            // Uncomment to debug: background: "rgba(255,0,0,0.08)",
          }}
        />
      ))}

      {/* Small flickering labels — NO transitions, instant snap */}
      {TOUCHPOINTS.map((tp, i) =>
        tp.isMainCard ? null : (
          <div
            key={tp.id}
            ref={(el) => { labelRefs.current[i] = el; }}
            style={{
              position: "absolute",
              opacity: 0,
              pointerEvents: "none",
              transformOrigin: "left top",
              willChange: "transform, opacity",
              fontFamily: "'SF Mono','Fira Code',Consolas,monospace",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{
              fontSize: tp.type === "exp" ? 10 : 9,
              fontWeight: tp.type === "exp" ? 600 : 400,
              letterSpacing: tp.type === "exp" ? "0.08em" : "0.12em",
              color: "rgba(255,255,255,0.75)",
              lineHeight: "14px",
            }}>
              {tp.label}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

// ── Drawing helpers ──

function drawConnectorLine(ctx: CanvasRenderingContext2D, waypoints: { x: number; y: number }[], drawProgress: number, breathe: number) {
  let totalLen = 0;
  for (let i = 1; i < waypoints.length; i++) totalLen += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y);
  const drawLen = totalLen * drawProgress;
  ctx.beginPath();
  ctx.moveTo(waypoints[0].x, waypoints[0].y);
  let acc = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const segLen = Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y);
    if (acc + segLen <= drawLen) { ctx.lineTo(waypoints[i].x, waypoints[i].y); acc += segLen; }
    else { const f = (drawLen - acc) / segLen; ctx.lineTo(waypoints[i - 1].x + (waypoints[i].x - waypoints[i - 1].x) * f, waypoints[i - 1].y + (waypoints[i].y - waypoints[i - 1].y) * f); break; }
  }
  ctx.strokeStyle = `rgba(255,255,255,${breathe})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawFlickerDots(ctx: CanvasRenderingContext2D, waypoints: { x: number; y: number }[], drawProgress: number, flickers: { next: number; end: number; on: boolean }[], t: number) {
  let totalLen = 0;
  for (let i = 1; i < waypoints.length; i++) totalLen += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y);
  const drawLen = totalLen * drawProgress;
  for (let i = 0; i < Math.min(waypoints.length, flickers.length); i++) {
    let len = 0;
    for (let j = 1; j <= i; j++) len += Math.hypot(waypoints[j].x - waypoints[j - 1].x, waypoints[j].y - waypoints[j - 1].y);
    if (len > drawLen) continue;
    updateFlicker(flickers[i], t);
    const a = flickers[i].on ? 0.85 : 0.06;
    const wp = waypoints[i];
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.7})`;
    ctx.lineWidth = 1;
    ctx.fillRect(wp.x - 2.5, wp.y - 2.5, 5, 5);
    ctx.strokeRect(wp.x - 2.5, wp.y - 2.5, 5, 5);
  }
}

function updateFlicker(f: { next: number; end: number; on: boolean }, t: number) {
  if (t >= f.next && !f.on && t >= f.end) { f.next = t + 400 + Math.random() * 2200; f.on = true; }
  if (f.on && t >= f.next && f.end <= f.next) { f.end = t + 60 + Math.random() * 160; }
  if (t >= f.next && t < f.end) { f.on = Math.random() > 0.4; }
  else if (t >= f.end) { f.on = true; f.next = t + 300 + Math.random() * 2000; f.end = f.next; }
}
