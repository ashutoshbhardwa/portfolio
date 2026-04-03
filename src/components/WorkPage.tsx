'use client';
import React, { useState, useEffect, useRef, forwardRef } from 'react';
import TextScramble from './TextScramble';
import { COMPANY_PROJECTS, ZONE_COLORS } from './data-tree/constants';
import type { CardRect } from './DataTree';

const PillReveal = ({ children, delay = 0 }: {
  children: React.ReactNode; delay?: number;
}) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!innerRef.current) return;
    const natural = innerRef.current.scrollWidth;
    const t = setTimeout(() => setWidth(natural), delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      overflow: 'hidden',
      width: width,
      transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
      display: 'inline-flex',
    }}>
      <div ref={innerRef} style={{ width: 'max-content', flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
};

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
      if (ticks > 8) {
        clearInterval(intervalRef.current!);
        setDisplayText(children);
      }
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
      if (step > steps) {
        clearInterval(intervalRef.current!);
        setDisplayText(children);
      }
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

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
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
};

const EXP_PILLS = [
  { key: 'DAILYOBJECTS',  label: 'DAILYOBJECTS',  role: 'Brand + Product Designer', period: '2022–2024', desc: 'Crafting brand systems and product design for India\'s leading accessories company. Identity, packaging, digital — all of it.' },
  { key: 'CREPDOGCREW',   label: 'CREPDOGCREW',   role: 'Visual Designer',           period: '2021–2022', desc: 'Building the visual language for India\'s sneaker culture. Drops, campaigns, community.' },
  { key: 'PROBO',         label: 'PROBO',          role: 'Product Designer',          period: '2023–2024', desc: 'Designing for a prediction market at scale. Speed, clarity, trust.' },
  { key: 'STABLE MONEY',  label: 'STABLE MONEY',   role: 'Lead Designer',             period: '2024–Present', desc: 'Making fixed income feel modern. Systematic design for a complex financial product.' },
  { key: 'OTHER',         label: 'OTHER',          role: 'Freelance',                 period: '2019–Present', desc: 'Independent work, passion projects, and things that don\'t fit a box.' },
];

const SKILL_PILLS = [
  { key: 'MOTION DESIGN', label: 'MOTION DESIGN', desc: 'Motion as a language. Transitions, interactions, and things that feel alive.' },
  { key: 'SYSTEMS',       label: 'SYSTEMS',       desc: 'Design systems that scale. Tokens, components, documentation.' },
  { key: '3D',            label: '3D',            desc: 'Dimensional work. Objects, environments, and spatial thinking.' },
  { key: 'BRAND',         label: 'BRAND',         desc: 'Identity at its core. Marks, systems, and how things present themselves.' },
  { key: 'GLITCH',        label: 'GLITCH',        desc: 'Controlled chaos. Distortion as aesthetic, noise as signal.' },
];

const DEFAULT_AMBIENT = 'VISUAL DESIGNER \u00B7 BANGALORE \u00B7 MULTI-DISCIPLINARY DESIGNER \u00B7 VISUAL DESIGNER \u00B7 BANGALORE';

const PILL_STYLE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--wp-pill-bg, #000)', color: 'var(--wp-pill-text, #fff)', borderRadius: 40,
  padding: '12px 28px', cursor: 'pointer', userSelect: 'none',
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontWeight: 700, fontSize: 13, letterSpacing: '-0.02em',
  textTransform: 'uppercase', whiteSpace: 'nowrap',
  transition: 'opacity 0.3s ease',
};

interface WorkPageProps {
  visible: boolean;
  onHoverZone: (key: string) => void;
  onLeaveZone: () => void;
  onHomePill: () => void;
  onPillHover?: (company: string | null) => void;
  cardRects?: CardRect[];
}

const WorkPage = forwardRef<HTMLDivElement, WorkPageProps>(function WorkPage({ visible, onHoverZone, onLeaveZone, onHomePill, onPillHover, cardRects = [] }, ref) {
  const [mode, setMode] = useState<'exp'|'skill'>('exp');
  const [hovered, setHovered] = useState<string|null>(null);
  const [ambientText, setAmbientText] = useState(DEFAULT_AMBIENT);
  const [ambientKey, setAmbientKey] = useState('default');
  const [scrambleTrigger, setScrambleTrigger] = useState(false);

  useEffect(() => {
    if (visible) setTimeout(() => setScrambleTrigger(true), 100);
    else setScrambleTrigger(false);
  }, [visible]);

  // Delayed card overlay visibility (300ms after hover starts)
  const [overlayVisible, setOverlayVisible] = useState(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    if (hovered && COMPANY_PROJECTS[hovered]) {
      overlayTimerRef.current = setTimeout(() => setOverlayVisible(true), 300);
    } else {
      setOverlayVisible(false);
    }
    return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); };
  }, [hovered, mode]);

  const [lockedPill, setLockedPill] = useState<string | null>(null);

  const pills = mode === 'exp' ? EXP_PILLS : SKILL_PILLS;

  const activatePill = (pill: { key: string; label: string; desc: string }) => {
    setHovered(pill.key);
    setAmbientText(pill.desc);
    setAmbientKey(pill.key);
    onHoverZone(pill.key);
    onPillHover?.(pill.key);
  };

  const deactivatePill = () => {
    setHovered(null);
    setAmbientText(DEFAULT_AMBIENT);
    setAmbientKey('default');
    onLeaveZone();
    onPillHover?.(null);
  };

  const handleEnter = (pill: { key: string; label: string; desc: string }) => {
    if (lockedPill && lockedPill !== pill.key) return;
    activatePill(pill);
  };

  const handleLeave = () => {
    if (lockedPill) return;
    deactivatePill();
  };

  const handlePillClick = (pill: { key: string; label: string; desc: string }) => {
    if (lockedPill === pill.key) {
      setLockedPill(null);
      deactivatePill();
    } else {
      setLockedPill(pill.key);
      activatePill(pill);
    }
  };

  if (!visible) return null;

  return (
    <div ref={ref} style={{
      position: 'absolute', inset: 0, zIndex: 6,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.6s ease',
      pointerEvents: 'auto',
    }}>
      {/* WORK title — top left */}
      <div style={{ position: 'absolute', top: 'clamp(24px, 3vh, 48px)', left: 'clamp(40px, 4vw, 80px)' }}>
        <div style={{
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 700, fontSize: 'clamp(60px, 8vw, 130px)',
          letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--wp-text, #000)',
        }}>
          <TextScramble trigger={scrambleTrigger} duration={1.0} speed={0.04} as="div">
            WORK
          </TextScramble>
        </div>
        <div style={{
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 400, fontSize: 'clamp(12px, 1vw, 16px)',
          letterSpacing: '-0.02em', color: 'var(--wp-text, #000)', marginTop: 'clamp(8px, 1vh, 16px)',
        }}>
          <TextScramble trigger={scrambleTrigger} duration={0.8} speed={0.03} as="div">
            MULTI-DISCIPLINARY DESIGNER
          </TextScramble>
        </div>
      </div>

      {/* Left column — vertically centered: toggle, pills, ambient, HOME */}
      <div style={{
        position: 'absolute', top: '50%', left: 'clamp(40px, 4vw, 80px)',
        transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        {/* Toggle */}
        <div style={{
          display: 'inline-flex', background: 'rgba(255,255,255,0.15)', borderRadius: 40,
          padding: 3, gap: 0,
        }}>
          {(['exp','skill'] as const).map(m => (
            <div key={m} onClick={() => { setMode(m); setLockedPill(null); deactivatePill(); }} style={{
              background: mode === m ? '#fff' : 'transparent',
              color: mode === m ? '#000' : 'rgba(255,255,255,0.5)',
              borderRadius: 40,
              padding: '8px 20px',
              fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase' as const,
              whiteSpace: 'nowrap' as const,
              cursor: 'pointer',
              pointerEvents: 'auto',
              transition: 'all 0.25s ease',
            }}>
              {m.toUpperCase()}
            </div>
          ))}
        </div>

        {/* Company/Skill pills */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20,
        }}>
        {pills.map((pill, i) => (
            <div key={pill.key}
              onClick={() => handlePillClick(pill)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--wp-pill-bg, #000)',
                color: 'var(--wp-pill-text, #fff)',
                borderRadius: 40,
                overflow: 'hidden',
                opacity: hovered && hovered !== pill.key ? 0.35 : 1,
                transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                boxShadow: lockedPill === pill.key ? '0 0 0 2px #fff' : 'none',
              }}
            >
              <PillButton
                onMouseEnter={() => handleEnter(pill)}
                onMouseLeave={handleLeave}
                style={{ padding: '12px 28px' }}
              >
                {pill.label}
              </PillButton>
            </div>
        ))}
        </div>
      </div>

      {/* Ambient paragraph — above HOME pill */}
      <div style={{
        position: 'absolute', bottom: 'clamp(90px, 12vh, 140px)', left: 'clamp(40px, 4vw, 80px)', maxWidth: 260,
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        fontSize: 'clamp(11px, 1vw, 16px)', letterSpacing: '0.02em', color: 'var(--wp-text, #000)',
        lineHeight: 1.5,
      }}>
        <TextScramble key={ambientKey} trigger={true} duration={0.6} speed={0.025} as="span">
          {ambientText}
        </TextScramble>
      </div>

      {/* HOME pill — bottom left */}
      <div onClick={onHomePill} style={{ position: 'absolute', bottom: 'clamp(24px, 3vh, 48px)', left: 'clamp(40px, 4vw, 80px)', cursor: 'pointer', pointerEvents: 'auto' }}>
        <div style={{ ...PILL_STYLE }}>HOME</div>
      </div>

      {/* DENSITY pill — bottom right */}
      <div style={{ position: 'absolute', bottom: 'clamp(24px, 3vh, 48px)', right: 'clamp(24px, 2.6vw, 48px)' }}>
        <div style={{ ...PILL_STYLE }}>{'\u2318 + / \u2318 \u2212  [DENSITY]'}</div>
      </div>

      {/* Card label overlays — positioned over particle cards */}
      {hovered && COMPANY_PROJECTS[hovered] && cardRects.length >= 4 && (() => {
        const zc = ZONE_COLORS[hovered];
        const gr = zc ? Math.round(zc.r * 255) : 0;
        const gg = zc ? Math.round(zc.g * 255) : 0;
        const gb = zc ? Math.round(zc.b * 255) : 0;
        return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
          {cardRects.slice(0, 4).map((rect, i) => {
            const project = COMPANY_PROJECTS[hovered]?.[i];
            if (!project) return null;
            const W = typeof window !== 'undefined' ? window.innerWidth : 1440;
            const H = typeof window !== 'undefined' ? window.innerHeight : 900;
            const pad = 13 * (W / 1440);
            return (
              <div key={i} style={{
                position: 'absolute',
                left: rect.x, top: rect.y,
                width: rect.w, height: rect.h,
                overflow: 'hidden',
                opacity: overlayVisible ? 1 : 0,
                transition: 'opacity 0.3s ease',
              }}>
                {/* Gradient */}
                <div style={{
                  position: 'absolute',
                  left: 0, right: 0,
                  bottom: 0,
                  height: '55%',
                  background: `linear-gradient(to top right, rgba(${gr},${gg},${gb},1) 0%, rgba(${gr},${gg},${gb},0) 100%)`,
                  pointerEvents: 'none',
                }} />
                {/* Labels */}
                <div style={{
                  position: 'absolute',
                  left: pad,
                  bottom: rect.h * 0.084,
                  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                }}>
                  <div style={{
                    fontSize: 12 * (H / 900),
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.75)',
                    marginBottom: 2,
                  }}>
                    {project.title}
                  </div>
                  <div style={{
                    fontSize: 10.5 * (H / 900),
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.45)',
                    marginBottom: 1,
                  }}>
                    {project.year} · {hovered}
                  </div>
                  <div style={{
                    fontSize: 10.5 * (H / 900),
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.35)',
                  }}>
                    {project.tag}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        );
      })()}
    </div>
  );
});

export default WorkPage;
