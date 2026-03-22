'use client';
import React, { useState, useEffect, useRef, forwardRef } from 'react';
import TextScramble from './TextScramble';

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
}

const WorkPage = forwardRef<HTMLDivElement, WorkPageProps>(function WorkPage({ visible, onHoverZone, onLeaveZone, onHomePill }, ref) {
  const [mode, setMode] = useState<'exp'|'skill'>('exp');
  const [hovered, setHovered] = useState<string|null>(null);
  const [ambientText, setAmbientText] = useState(DEFAULT_AMBIENT);
  const [ambientKey, setAmbientKey] = useState('default');
  const [scrambleTrigger, setScrambleTrigger] = useState(false);

  useEffect(() => {
    if (visible) setTimeout(() => setScrambleTrigger(true), 100);
    else setScrambleTrigger(false);
  }, [visible]);

  const pills = mode === 'exp' ? EXP_PILLS : SKILL_PILLS;

  const handleEnter = (pill: { key: string; label: string; desc: string }) => {
    setHovered(pill.key);
    setAmbientText(pill.desc);
    setAmbientKey(pill.key);
    onHoverZone(pill.key);
  };

  const handleLeave = () => {
    setHovered(null);
    setAmbientText(DEFAULT_AMBIENT);
    setAmbientKey('default');
    onLeaveZone();
  };

  if (!visible) return null;

  return (
    <div ref={ref} style={{
      position: 'absolute', inset: 0, zIndex: 6,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.6s ease',
      pointerEvents: visible ? 'auto' : 'none',
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
        <PillReveal delay={0}>
          <div style={{
            display: 'inline-flex', background: 'var(--wp-pill-bg, #000)', borderRadius: 40,
            padding: 4, gap: 0,
          }}>
            {(['exp','skill'] as const).map(m => (
              <div key={m} onClick={() => setMode(m)} style={{
                ...PILL_STYLE,
                background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#000' : '#fff',
                padding: '8px 20px', fontSize: 11,
              }}>
                {m.toUpperCase()}
              </div>
            ))}
          </div>
        </PillReveal>

        {/* Company/Skill pills */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20,
        }}>
        {pills.map((pill, i) => (
          <PillReveal key={pill.key} delay={i * 80}>
            <div
              onMouseEnter={() => handleEnter(pill)}
              onMouseLeave={handleLeave}
              style={{
                ...PILL_STYLE,
                opacity: hovered && hovered !== pill.key ? 0.35 : 1,
              }}
            >
              <TextScramble
                trigger={scrambleTrigger}
                duration={0.6}
                speed={0.03}
                as="span"
              >
                {pill.label}
              </TextScramble>
            </div>
          </PillReveal>
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
      <div style={{ position: 'absolute', bottom: 'clamp(24px, 3vh, 48px)', left: 'clamp(40px, 4vw, 80px)' }}>
        <PillReveal delay={0}>
          <div onClick={onHomePill} style={{ ...PILL_STYLE, cursor: 'pointer' }}>
            <TextScramble trigger={scrambleTrigger} as="span">HOME</TextScramble>
          </div>
        </PillReveal>
      </div>

      {/* DENSITY pill — bottom right */}
      <div style={{ position: 'absolute', bottom: 'clamp(24px, 3vh, 48px)', right: 'clamp(24px, 2.6vw, 48px)' }}>
        <PillReveal delay={0}>
          <div style={{ ...PILL_STYLE, pointerEvents: 'none' }}>
            <TextScramble trigger={scrambleTrigger} as="span">
              {'\u2318 + / \u2318 \u2212  [DENSITY]'}
            </TextScramble>
          </div>
        </PillReveal>
      </div>
    </div>
  );
});

export default WorkPage;
