'use client';
import React, { useState, useEffect, useRef, forwardRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TextScramble from './TextScramble';
import type { CardRect } from './DataTree';
import { ZONE_COLORS } from './data-tree/constants';

// ── Scramble PillButton ─────────────────────────────────────────────────────

const PillButton = ({ children, onClick, onMouseEnter, onMouseLeave, style }: {
  children: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  style?: React.CSSProperties;
}) => {
  const [displayText, setDisplayText] = useState(children);
  const [scale, setScale] = useState(1);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scramble30 = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    let ticks = 0;
    intervalRef.current = setInterval(() => {
      let out = '';
      for (let i = 0; i < children.length; i++) {
        if (children[i] === ' ') { out += ' '; continue; }
        out += Math.random() < 0.3
          ? chars[Math.floor(Math.random() * chars.length)]
          : children[i];
      }
      setDisplayText(out);
      ticks++;
      if (ticks > 8) { clearInterval(intervalRef.current!); setDisplayText(children); }
    }, 40);
  };

  const scrambleFull = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    let step = 0;
    const steps = 12;
    intervalRef.current = setInterval(() => {
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
      if (step > steps) { clearInterval(intervalRef.current!); setDisplayText(children); }
    }, 35);
  };

  const handleMouseEnter = () => { scramble30(); onMouseEnter?.(); };
  const handleMouseLeave = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
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

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

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
};

// ── Pill data ───────────────────────────────────────────────────────────────
// Years as specified by user: DO=2022, CDC=2024, Probo=2025, SM=2026
const EXP_PILLS = [
  { key: 'DAILYOBJECTS',  label: 'DAILYOBJECTS',  year: 2022, desc: 'Crafting brand systems and product design for India\u2019s leading accessories company. Identity, packaging, digital \u2014 all of it.' },
  { key: 'CREPDOGCREW',   label: 'CREPDOGCREW',   year: 2024, desc: 'Building the visual language for India\u2019s sneaker culture. Drops, campaigns, community.' },
  { key: 'PROBO',         label: 'PROBO',          year: 2025, desc: 'Designing for a prediction market at scale. Speed, clarity, trust.' },
  { key: 'STABLE MONEY',  label: 'STABLE MONEY',   year: 2026, desc: 'Making fixed income feel modern. Systematic design for a complex financial product.' },
  { key: 'OTHER',         label: 'OTHER',          year: 2021, desc: 'Independent work, passion projects, and things that don\u2019t fit a box.' },
];

const SKILL_PILLS = [
  { key: 'MOTION DESIGN', label: 'MOTION DESIGN', year: 2022, desc: 'Motion as a language. Transitions, interactions, and things that feel alive.' },
  { key: 'SYSTEMS',       label: 'SYSTEMS',       year: 2023, desc: 'Design systems that scale. Tokens, components, documentation.' },
  { key: '3D',            label: '3D',            year: 2021, desc: 'Dimensional work. Objects, environments, and spatial thinking.' },
  { key: 'BRAND',         label: 'BRAND',         year: 2024, desc: 'Identity at its core. Marks, systems, and how things present themselves.' },
  { key: 'GLITCH',        label: 'GLITCH',        year: 2022, desc: 'Controlled chaos. Distortion as aesthetic, noise as signal.' },
];

const DEFAULT_DESC = 'Multi-disciplinary designer based in Bangalore. Brand systems, product design, motion, 3D \u2014 building things that feel alive.';

const TIMELINE_TICKS = 25; // visual tick marks below pills

// Auto-disintegrate timeout (ms) — cards disappear after this
const AUTO_DISINTEGRATE_MS = 10000;

// ── Component ───────────────────────────────────────────────────────────────

interface WorkPageProps {
  visible: boolean;
  onHoverZone: (key: string) => void;
  onLeaveZone: () => void;
  onHomePill: () => void;
  onPillHover?: (company: string | null) => void;
  onCardClick?: (company: string) => void;
  cardRects?: CardRect[];
  isDarkMode?: boolean;
}

const WorkPage = forwardRef<HTMLDivElement, WorkPageProps>(function WorkPage(
  { visible, onHoverZone, onLeaveZone, onHomePill, onPillHover, onCardClick, cardRects = [], isDarkMode = false }, ref
) {
  const [mode, setMode] = useState<'exp' | 'skill'>('exp');
  const [hovered, setHovered] = useState<string | null>(null);
  const [descText, setDescText] = useState(DEFAULT_DESC);
  const [descKey, setDescKey] = useState('default');
  const [scrambleTrigger, setScrambleTrigger] = useState(false);

  useEffect(() => {
    if (visible) setTimeout(() => setScrambleTrigger(true), 100);
    else setScrambleTrigger(false);
  }, [visible]);

  const [lockedPill, setLockedPill] = useState<string | null>(null);
  const pills = mode === 'exp' ? EXP_PILLS : SKILL_PILLS;
  const ALL_PILLS = [...EXP_PILLS, ...SKILL_PILLS];

  // Work page is ALWAYS dark — black bg, white text, white particles
  // Dark/light mode only affects the home page; work page stays dark regardless
  const wpFg = '#FFFFFF';
  const wpFgSub = '#B3B3B3';
  const wpPillActive = '#FFFFFF';
  const wpPillActiveText = '#000000';
  const wpPillInactive = '#333333';
  const wpPillInactiveText = '#B3B3B3';
  const wpToggleActiveBg = '#ffffff';
  const wpToggleActiveText = '#000000';
  const wpToggleInactiveBg = 'transparent';
  const wpToggleInactiveText = '#B3B3B3';
  const wpToggleBg = '#404040';
  const wpGradient = 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)';
  const wpHomeBg = '#ffffff';
  const wpHomeText = '#000000';

  // ── Auto-disintegrate timer ──────────────────────────────────────────────
  const autoDisintegrateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoTimer = useCallback(() => {
    if (autoDisintegrateRef.current) {
      clearTimeout(autoDisintegrateRef.current);
      autoDisintegrateRef.current = null;
    }
  }, []);

  // Marker state — declared early so deactivatePill/activatePill can reference setMarkerX
  const [markerX, setMarkerX] = useState<number | null>(null);
  // Display year — always visible, tracks cursor nearest pill or defaults to first pill
  const [displayYear, setDisplayYear] = useState<number | null>(EXP_PILLS[0]?.year ?? null);
  // Default markerX anchor (first pill center) — set after DOM mounts
  const defaultMarkerXRef = useRef<number | null>(null);

  const deactivatePill = useCallback(() => {
    setHovered(null);
    setLockedPill(null);
    setDescText(DEFAULT_DESC);
    setDescKey('default');
    onLeaveZone();
    onPillHover?.(null);
    clearAutoTimer();
    // Reset marker to first pill (left anchor)
    if (defaultMarkerXRef.current !== null) setMarkerX(defaultMarkerXRef.current);
    setDisplayYear(EXP_PILLS[0]?.year ?? null);
  }, [onLeaveZone, onPillHover, clearAutoTimer]);

  const activatePill = useCallback((pill: { key: string; desc: string }) => {
    setHovered(pill.key);
    setDescText(pill.desc);
    setDescKey(pill.key);
    onHoverZone(pill.key);
    onPillHover?.(pill.key);

    // Sync display year to this pill
    const foundYear = [...EXP_PILLS, ...SKILL_PILLS].find(p => p.key === pill.key)?.year;
    if (foundYear !== undefined) setDisplayYear(foundYear);

    // Start auto-disintegrate timer
    clearAutoTimer();
    autoDisintegrateRef.current = setTimeout(() => {
      deactivatePill();
    }, AUTO_DISINTEGRATE_MS);
  }, [onHoverZone, onPillHover, clearAutoTimer, deactivatePill]);

  // Clean up timer on unmount
  useEffect(() => () => clearAutoTimer(), [clearAutoTimer]);

  const handleEnter = (pill: { key: string; desc: string }) => {
    if (lockedPill && lockedPill !== pill.key) return;
    activatePill(pill);
  };

  const handleLeave = () => {
    if (lockedPill) return;
    deactivatePill();
  };

  const handlePillClick = (pill: { key: string; desc: string }) => {
    if (lockedPill === pill.key) {
      // Already locked — navigate to detail page
      onCardClick?.(pill.key);
    } else {
      // Lock this pill
      setLockedPill(pill.key);
      activatePill(pill);
    }
  };

  // Get the active pill's year for the timeline marker
  const activePill = pills.find(p => p.key === hovered);
  const activeYear = activePill?.year ?? null;
  const activePillIndex = hovered ? pills.findIndex(p => p.key === hovered) : -1;

  // Pill refs to track positions for marker
  const pillRowRef = useRef<HTMLDivElement>(null);

  // Snap markerX to locked pill center — when not locked, cursor tracking handles it
  useEffect(() => {
    if (!lockedPill) return;
    if (activePillIndex < 0 || !pillRowRef.current) { setMarkerX(null); return; }
    const pillRow = pillRowRef.current;
    const pillEls = pillRow.children;
    if (activePillIndex < pillEls.length) {
      const pillEl = pillEls[activePillIndex] as HTMLElement;
      const pillRect = pillEl.getBoundingClientRect();
      const rowRect = pillRow.getBoundingClientRect();
      setMarkerX(pillRect.left - rowRect.left + pillRect.width / 2);
    }
  }, [activePillIndex, lockedPill, mode]);

  // Initialize markerX to first pill center once DOM is visible
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      const pillRow = pillRowRef.current;
      if (!pillRow || pillRow.children.length === 0) return;
      const firstPill = pillRow.children[0] as HTMLElement;
      const pillRect = firstPill.getBoundingClientRect();
      const rowRect = pillRow.getBoundingClientRect();
      const center = pillRect.left - rowRect.left + pillRect.width / 2;
      defaultMarkerXRef.current = center;
      setMarkerX(prev => prev === null ? center : prev);
    });
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;

  // Two-layer drain:
  //  1. tetrisBase  — rich gradient opacity 0→1, ensures full dark coverage at end
  //  2. tetrisDrain — wipe overlay translateX(100%→0%), soft transparent leading edge sweeps right→left
  //  3. tetrisTextColor — text black→white, sits on top of both layers (zIndex 3)
  const drainKeyframes = `
    @keyframes tetrisBase {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes tetrisDrain {
      from { transform: translateX(100%); }
      to   { transform: translateX(0%);   }
    }
    @keyframes tetrisTextColor {
      0%   { color: #000000; }
      40%  { color: #111111; }
      65%  { color: #666666; }
      82%  { color: #c0c0c0; }
      100% { color: #ffffff; }
    }
  `;

  const W = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const H = typeof window !== 'undefined' ? window.innerHeight : 900;
  // Position scale — proportional to viewport (for layout positioning)
  const sx = W / 1440;  // horizontal position scale
  const sy = H / 900;   // vertical position scale
  // Element scale — capped at 1.0 so elements never grow larger than Figma spec
  // On smaller screens they shrink; on larger screens they stay Figma-sized
  const s = Math.min(sx, 1.0);

  // Bottom bar layout — full width, uses the black bar as design element
  const leftX = 48 * sx;
  const rightX = 48 * sx;
  // Pills + timeline span from leftX to W - rightX (full width minus margins)
  const pillAreaW = W - leftX - rightX;

  // ── Slider zone: full-area mousemove activates nearest pill + tracks red line ──
  const handleSliderMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Zone: from timeline bottom (~46*sy from screen bottom) to header bottom (~155*sy)
    const cursorYFromBottom = H - e.clientY;
    if (cursorYFromBottom < 40 * sy || cursorYFromBottom > 165 * sy) return;
    // X range: pill area
    if (e.clientX < leftX || e.clientX > W - rightX) return;

    const pillRowEl = pillRowRef.current;
    if (!pillRowEl) return;

    // Find nearest pill by cursor X
    const pillEls = pillRowEl.children;
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < pillEls.length; i++) {
      const pr = (pillEls[i] as HTMLElement).getBoundingClientRect();
      const center = pr.left + pr.width / 2;
      const dist = Math.abs(e.clientX - center);
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
    }
    const nearestPill = pills[nearestIdx];
    if (!nearestPill) return;

    // Activate nearest pill if not already active
    if (nearestPill.key !== hovered) activatePill(nearestPill);

    // Track markerX directly to cursor (only when not locked — locked snaps to center via useEffect)
    if (!lockedPill) {
      const rowRect = pillRowEl.getBoundingClientRect();
      setMarkerX(e.clientX - rowRect.left);
    }
  };

  const handleSliderMouseLeave = () => {
    if (!lockedPill) deactivatePill();
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleSliderMouseMove}
      onMouseLeave={handleSliderMouseLeave}
      style={{
        position: 'absolute', inset: 0, zIndex: 6,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease',
        pointerEvents: 'auto',
      }}>
      <style>{drainKeyframes}</style>

      {/* ═══════════ BOTTOM BAR (bottom ~22%) ═══════════ */}

      {/* Gradient backdrop for bottom UI readability */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        bottom: 0,
        height: H * 0.36,
        background: wpGradient,
        pointerEvents: 'none',
        zIndex: 9,
      }} />


      {/* ── Row 1: WORK + toggle inline (left) + Description (right) ── */}
      <div style={{
        position: 'absolute',
        bottom: 155 * sy,
        left: leftX,
        right: rightX,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        zIndex: 10,
      }}>
        {/* Left: WORK + toggle side by side, both bottom-aligned */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 18 * s }}>
          {/* WORK — large headline */}
          <div style={{
            fontFamily: 'Inter, "Helvetica Neue", sans-serif',
            fontWeight: 700,
            fontSize: 90 * s,
            lineHeight: 0.9,
            color: wpFg,
            letterSpacing: -2,
          }}>
            <TextScramble trigger={scrambleTrigger} duration={1.0} speed={0.04} as="div">
              WORK
            </TextScramble>
          </div>

          {/* EXP/SKILL toggle — inline with WORK, aligned to baseline */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            borderRadius: 14 * s,
            overflow: 'hidden',
            background: wpToggleBg,
            width: 'fit-content',
            pointerEvents: 'auto',
            marginBottom: 6 * s,
          }}>
            <div
              onClick={() => { setMode('exp'); deactivatePill(); }}
              style={{
                height: 38 * s,
                paddingLeft: 18 * s,
                paddingRight: 18 * s,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: mode === 'exp' ? wpToggleActiveBg : wpToggleInactiveBg,
                color: mode === 'exp' ? wpToggleActiveText : wpToggleInactiveText,
                borderRadius: 14 * s,
                fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                fontWeight: 600,
                fontSize: 10 * s,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              EXPERIENCE
            </div>
            <div
              onClick={() => { setMode('skill'); deactivatePill(); }}
              style={{
                height: 38 * s,
                paddingLeft: 18 * s,
                paddingRight: 18 * s,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: mode === 'skill' ? wpToggleActiveBg : wpToggleInactiveBg,
                color: mode === 'skill' ? wpToggleActiveText : wpToggleInactiveText,
                borderRadius: 14 * s,
                fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                fontWeight: 600,
                fontSize: 10 * s,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              SKILLS
            </div>
          </div>
        </div>

        {/* Description — inline code-style highlight per line */}
        {(() => {
          const activeZone = hovered ? ZONE_COLORS[hovered] : null;
          const bgColor = activeZone ? activeZone.hex : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');
          const isVeryDark = activeZone && (activeZone.r + activeZone.g + activeZone.b) < 0.3;
          const highlightBg = isVeryDark ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)') : bgColor;
          return (
            <div style={{
              maxWidth: 520 * sx,
              textAlign: 'right',
            }}>
              <span style={{
                fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                fontWeight: 400,
                fontSize: 19 * s,
                lineHeight: 2.0,
                color: wpFg,
                background: highlightBg,
                padding: `${4 * s}px ${10 * s}px`,
                borderRadius: 4 * s,
                WebkitBoxDecorationBreak: 'clone' as any,
                boxDecorationBreak: 'clone' as any,
                transition: 'background 0.5s ease',
              }}>
                <TextScramble key={descKey} trigger={true} duration={0.6} speed={0.025} as="span">
                  {descText}
                </TextScramble>
              </span>
            </div>
          );
        })()}
      </div>

      {/* ── Row 2: Pills + Year indicator ── */}
      <div style={{
        position: 'absolute',
        bottom: 80 * sy,
        left: leftX,
        right: rightX,
        zIndex: 10,
      }}>
        {/* Year indicator — always visible, tracks cursor or defaults to first pill */}
        {markerX !== null && (
          <div style={{
            position: 'absolute',
            top: -48 * sy,
            left: markerX,
            transform: 'translateX(-50%)',
            transition: 'left 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            pointerEvents: 'none',
          }}>
            <span style={{
              fontFamily: 'Inter, "Helvetica Neue", sans-serif',
              fontWeight: 700,
              fontSize: 15 * s,
              color: '#FF2222',
              lineHeight: 1,
              letterSpacing: '0.02em',
              textShadow: '0 0 12px rgba(255,34,34,0.6)',
            }}>
              {displayYear}
            </span>
            <span style={{
              fontSize: 9 * s,
              color: '#FF2222',
              lineHeight: 1,
              opacity: 0.9,
            }}>▼</span>
          </div>
        )}

        {/* Pills row — flex with gap to fill available width */}
        <div ref={pillRowRef} style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 12 * sx,
          alignItems: 'center',
          width: '100%',
        }}>
          {pills.map((pill) => {
            const isActive = hovered === pill.key;
            const isLocked = lockedPill === pill.key;
            const isDimmed = hovered !== null && !isActive;
            const showLockPill = isActive || isLocked;
            return (
              <div
                key={pill.key}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: isDimmed ? 0.35 : 1,
                  transition: 'opacity 0.3s cubic-bezier(0.22,1,0.36,1)',
                  pointerEvents: 'auto',
                  height: 40 * s,
                }}
              >
                {/* Lock pill — springs out from the left of the main pill */}
                <AnimatePresence>
                  {showLockPill && (
                    <motion.div
                      initial={{ opacity: 0, width: 0, scale: 0.5 }}
                      animate={{
                        opacity: 1,
                        width: isLocked ? '40%' : '28%',
                        scale: 1,
                      }}
                      exit={{ opacity: 0, width: 0, scale: 0.5 }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: isLocked ? 22 : 14,
                        mass: 0.8,
                        bounce: 0.3,
                        opacity: { duration: 0.15 },
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isLocked) {
                          onCardClick?.(pill.key);
                        } else {
                          handlePillClick(pill);
                        }
                      }}
                      style={{
                        height: '100%',
                        borderRadius: 20 * s,
                        background: isLocked ? wpPillActive : wpPillInactive,
                        color: isLocked ? wpPillActiveText : wpPillInactiveText,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        flexShrink: 0,
                        overflow: 'hidden',
                        fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                        fontWeight: 500,
                        fontSize: 11 * s,
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <motion.div
                        animate={!isLocked ? { x: [0, -1.5, 1.5, -1, 1, 0] } : {}}
                        transition={!isLocked ? { duration: 0.4, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' } : {}}
                        style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      >
                        <svg width={13 * s} height={13 * s} viewBox="0 0 16 16" fill="none">
                          <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
                          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                          {isLocked && <circle cx="8" cy="10.5" r="1" fill="currentColor" />}
                        </svg>
                      </motion.div>
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: 0.1, duration: 0.15 }}
                      >
                        {isLocked ? 'VIEW' : 'HOLD'}
                      </motion.span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Main pill — takes remaining space, shows company name */}
                <motion.div
                  layout
                  onClick={() => handlePillClick(pill)}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  style={{
                    flex: 1,
                    height: '100%',
                    borderRadius: 20 * s,
                    background: isActive ? wpPillActive : wpPillInactive,
                    color: isActive ? wpPillActiveText : wpPillInactiveText,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                    fontWeight: 500,
                    fontSize: 13 * s,
                    whiteSpace: 'nowrap',
                    transition: 'background 0.3s ease, color 0.3s ease',
                  }}
                >
                  {/* Text — floats above both drain layers, transitions black→white */}
                  <div style={{
                    position: 'relative',
                    zIndex: 3,
                    ...(isActive && !isLocked ? {
                      animation: `tetrisTextColor ${AUTO_DISINTEGRATE_MS}ms linear forwards`,
                    } : {}),
                  }}>
                    <PillButton>
                      {pill.label}
                    </PillButton>
                  </div>

                  {/* Layer 1 (base): rich diagonal gradient, fades opacity 0→1.
                      Guarantees full dark coverage at end regardless of wipe position. */}
                  {isActive && !isLocked && (
                    <div
                      key={`${hovered}-b`}
                      style={{
                        position: 'absolute',
                        top: 0, left: 0, width: '100%', height: '100%',
                        zIndex: 1,
                        opacity: 0,
                        background: 'linear-gradient(135deg, #1e1e1e 0%, #272727 35%, #333 65%, #2a2a2a 100%)',
                        animation: `tetrisBase ${AUTO_DISINTEGRATE_MS}ms linear forwards`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  {/* Layer 2 (wipe): soft-edge gradient sweeps right→left.
                      Transparent leading edge (0–38%) reveals the base layer below,
                      creating a rich dark wave that wipes across the pill. */}
                  {isActive && !isLocked && (
                    <div
                      key={`${hovered}-w`}
                      style={{
                        position: 'absolute',
                        top: 0, left: 0, width: '100%', height: '100%',
                        zIndex: 2,
                        background: 'linear-gradient(to right, transparent 0%, transparent 38%, rgba(42,42,42,0.45) 52%, rgba(40,40,40,0.88) 64%, #333 72%, #2d2d2d 100%)',
                        transform: 'translateX(100%)',
                        animation: `tetrisDrain ${AUTO_DISINTEGRATE_MS}ms linear forwards`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Timeline ticks — proper height, matches pills width */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          marginTop: 10 * sy,
          width: '100%',
          height: 24 * sy,
        }}>
          {Array.from({ length: TIMELINE_TICKS }).map((_, i) => {
            const isMajor = i % 4 === 0;
            return (
              <div key={i} style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
              }}>
                <div style={{
                  width: isMajor ? 1.5 : 1,
                  height: isMajor ? 24 * sy : 14 * sy,
                  background: isMajor ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)',
                }} />
              </div>
            );
          })}
        </div>

        {/* Red vertical line — runs from year label through pills down to ticks */}
        {markerX !== null && (
          <div style={{
            position: 'absolute',
            top: -48 * sy,
            left: markerX,
            width: 1,
            height: `calc(100% + ${48 * sy}px)`,
            background: 'linear-gradient(to bottom, rgba(255,34,34,0) 0%, rgba(255,34,34,0.9) 12%, rgba(255,34,34,0.9) 88%, rgba(255,34,34,0.3) 100%)',
            transition: 'left 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
            zIndex: 5,
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* ── Row 3: HOME pill only (right-aligned) ── */}
      <div style={{
        position: 'absolute',
        bottom: 22 * sy,
        left: leftX,
        right: rightX,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        zIndex: 11,
      }}>
        {/* HOME pill */}
        <div onClick={onHomePill} style={{
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: wpHomeBg, color: wpHomeText, borderRadius: 40,
            padding: `${10 * s}px ${30 * s}px`,
            fontFamily: 'Inter, "Helvetica Neue", sans-serif',
            fontWeight: 600, fontSize: 14 * s,
            textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            <PillButton onClick={onHomePill}>HOME</PillButton>
          </div>
        </div>
      </div>
    </div>
  );
});

export default WorkPage;
