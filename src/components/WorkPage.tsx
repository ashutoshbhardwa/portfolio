'use client';
import React, { useState, useEffect, useRef, forwardRef, useCallback } from 'react';
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
  cardRects?: CardRect[];
}

const WorkPage = forwardRef<HTMLDivElement, WorkPageProps>(function WorkPage(
  { visible, onHoverZone, onLeaveZone, onHomePill, onPillHover, cardRects = [] }, ref
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

  // ── Auto-disintegrate timer ──────────────────────────────────────────────
  const autoDisintegrateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoTimer = useCallback(() => {
    if (autoDisintegrateRef.current) {
      clearTimeout(autoDisintegrateRef.current);
      autoDisintegrateRef.current = null;
    }
  }, []);

  const deactivatePill = useCallback(() => {
    setHovered(null);
    setLockedPill(null);
    setDescText(DEFAULT_DESC);
    setDescKey('default');
    onLeaveZone();
    onPillHover?.(null);
    clearAutoTimer();
  }, [onLeaveZone, onPillHover, clearAutoTimer]);

  const activatePill = useCallback((pill: { key: string; desc: string }) => {
    setHovered(pill.key);
    setDescText(pill.desc);
    setDescKey(pill.key);
    onHoverZone(pill.key);
    onPillHover?.(pill.key);

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
      // Unlock — deactivate
      deactivatePill();
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
  const [markerX, setMarkerX] = useState<number | null>(null);

  // Update marker position when pill changes
  useEffect(() => {
    if (activePillIndex < 0 || !pillRowRef.current) {
      setMarkerX(null);
      return;
    }
    const pillRow = pillRowRef.current;
    const pillEls = pillRow.children;
    if (activePillIndex < pillEls.length) {
      const pillEl = pillEls[activePillIndex] as HTMLElement;
      // Get center of pill relative to pill row container
      const pillRect = pillEl.getBoundingClientRect();
      const rowRect = pillRow.getBoundingClientRect();
      setMarkerX(pillRect.left - rowRect.left + pillRect.width / 2);
    }
  }, [activePillIndex, mode]);

  if (!visible) return null;

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

  return (
    <div ref={ref} style={{
      position: 'absolute', inset: 0, zIndex: 6,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.6s ease',
      pointerEvents: 'auto',
    }}>

      {/* ═══════════ BOTTOM BAR (bottom ~22%) ═══════════ */}

      {/* Gradient backdrop for bottom UI readability */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        bottom: 0,
        height: H * 0.36,
        background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
        pointerEvents: 'none',
        zIndex: 9,
      }} />

      {/* ── Row 1: WORK title (left) + Description (right) — pushed up high ── */}
      <div style={{
        position: 'absolute',
        bottom: 190 * sy,
        left: leftX,
        right: rightX,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        zIndex: 10,
      }}>
        {/* WORK — large, fills the negative space */}
        <div style={{
          fontFamily: 'Inter, "Helvetica Neue", sans-serif',
          fontWeight: 700,
          fontSize: 90 * s,
          lineHeight: 0.9,
          color: '#ffffff',
          letterSpacing: -2,
        }}>
          <TextScramble trigger={scrambleTrigger} duration={1.0} speed={0.04} as="div">
            WORK
          </TextScramble>
        </div>

        {/* Description — inline code-style highlight per line */}
        {(() => {
          const activeZone = hovered ? ZONE_COLORS[hovered] : null;
          const bgColor = activeZone ? activeZone.hex : 'rgba(255,255,255,0.08)';
          const isVeryDark = activeZone && (activeZone.r + activeZone.g + activeZone.b) < 0.3;
          const highlightBg = isVeryDark ? 'rgba(255,255,255,0.12)' : bgColor;
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
                color: '#ffffff',
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
        {/* Year indicator — tracks pill center */}
        {activeYear !== null && markerX !== null && (
          <div style={{
            position: 'absolute',
            top: -26 * sy,
            left: markerX - 18 * s,
            transition: 'left 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
            zIndex: 5,
          }}>
            <span style={{
              fontFamily: 'Inter, "Helvetica Neue", sans-serif',
              fontWeight: 500,
              fontSize: 15 * s,
              color: '#FF0000',
            }}>
              {activeYear}
            </span>
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
            return (
              <div key={pill.key}
                onClick={() => handlePillClick(pill)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 40 * s,
                  background: isActive ? '#ffffff' : '#333333',
                  color: isActive ? '#000000' : '#B3B3B3',
                  borderRadius: 20 * s,
                  fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                  fontWeight: 500,
                  fontSize: 13 * s,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  opacity: isDimmed ? 0.35 : 1,
                  transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                  boxShadow: isLocked ? '0 0 0 2px rgba(255,255,255,0.8)' : 'none',
                  pointerEvents: 'auto',
                }}
              >
                <PillButton
                  onMouseEnter={() => handleEnter(pill)}
                  onMouseLeave={handleLeave}
                >
                  {pill.label}
                </PillButton>
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
                  width: 0.5,
                  height: isMajor ? 24 * sy : 12 * sy,
                  background: 'rgba(255,255,255,0.25)',
                }} />
              </div>
            );
          })}
        </div>

        {/* Red vertical line from year through pills to timeline */}
        {activeYear !== null && markerX !== null && (
          <div style={{
            position: 'absolute',
            top: -4 * sy,
            left: markerX,
            width: 1,
            height: `calc(100% + ${4 * sy}px)`,
            background: '#FF0000',
            transition: 'left 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
            zIndex: 5,
          }} />
        )}
      </div>

      {/* ── Row 3: EXP/SKILL toggle (left) + HOME pill (right) ── */}
      <div style={{
        position: 'absolute',
        bottom: 22 * sy,
        left: leftX,
        right: rightX,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 11,
      }}>
        {/* EXP/SKILL toggle */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          borderRadius: 12 * s,
          overflow: 'hidden',
          background: '#404040',
          width: 'fit-content',
        }}>
          <div
            onClick={() => { setMode('exp'); deactivatePill(); }}
            style={{
              height: 34 * s,
              paddingLeft: 14 * s,
              paddingRight: 14 * s,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: mode === 'exp' ? '#ffffff' : 'transparent',
              color: mode === 'exp' ? '#000000' : '#B3B3B3',
              borderRadius: 12 * s,
              fontFamily: 'Inter, "Helvetica Neue", sans-serif',
              fontWeight: 500,
              fontSize: 8.9 * s,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              pointerEvents: 'auto',
            }}
          >
            EXPERIENCE
          </div>
          <div
            onClick={() => { setMode('skill'); deactivatePill(); }}
            style={{
              height: 34 * s,
              paddingLeft: 14 * s,
              paddingRight: 14 * s,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: mode === 'skill' ? '#ffffff' : 'transparent',
              color: mode === 'skill' ? '#000000' : '#B3B3B3',
              borderRadius: 12 * s,
              fontFamily: 'Inter, "Helvetica Neue", sans-serif',
              fontWeight: 500,
              fontSize: 8.9 * s,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              pointerEvents: 'auto',
            }}
          >
            SKILL
          </div>
        </div>

        {/* HOME pill */}
        <div onClick={onHomePill} style={{
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: '#ffffff', color: '#000000', borderRadius: 40,
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
