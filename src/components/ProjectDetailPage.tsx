'use client';
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TextScramble from './TextScramble';

// ── Mock project content per company/skill ─────────────────────────────────

interface ProjectContent {
  hero: string;        // hero headline
  subtitle: string;
  role: string;
  year: string;
  description: string;
  sections: { title: string; body: string }[];
}

const PROJECT_CONTENT: Record<string, ProjectContent> = {
  'DAILYOBJECTS': {
    hero: 'DAILYOBJECTS',
    subtitle: 'Brand Systems & Product Design',
    role: 'Lead Visual Designer',
    year: '2022 — 2023',
    description: 'Crafting the visual language for India\'s leading lifestyle accessories brand. From product design to packaging, digital to retail — a system that scales across thousands of SKUs while feeling personal.',
    sections: [
      { title: 'THE CHALLENGE', body: 'DailyObjects needed a design system that could flex across 40+ product categories while maintaining a cohesive identity. The existing visual language was fragmented — each touchpoint felt like a different brand.' },
      { title: 'THE APPROACH', body: 'We built a modular design system rooted in typography and restraint. A grid-based layout system, a tonal color architecture, and a packaging framework that could adapt from phone cases to laptop sleeves to home decor.' },
      { title: 'THE IMPACT', body: 'Brand consistency improved across all channels. The new system reduced design iteration time by 60% and provided a scalable foundation for seasonal campaigns and artist collaborations.' },
    ],
  },
  'CREPDOGCREW': {
    hero: 'CREPDOGCREW',
    subtitle: 'Sneaker Culture & Streetwear',
    role: 'Brand Designer',
    year: '2024',
    description: 'Building the visual identity for India\'s most energetic sneaker community. Drops, campaigns, and cultural moments — all designed to move at the speed of hype.',
    sections: [
      { title: 'THE CULTURE', body: 'CDC isn\'t just a brand — it\'s a community. The design language needed to feel raw, urgent, and authentic. Every asset had to work at the speed of drops and limited releases.' },
      { title: 'THE SYSTEM', body: 'A type-forward identity built on bold sans-serifs and high-contrast photography. Campaign kits designed for rapid deployment across social, email, and physical events.' },
      { title: 'THE RESULT', body: 'Campaign engagement rates doubled. The visual system became a recognizable signature across platforms, turning CDC into a design-led streetwear destination.' },
    ],
  },
  'PROBO': {
    hero: 'PROBO',
    subtitle: 'Prediction Markets at Scale',
    role: 'Product Designer',
    year: '2025',
    description: 'Designing for a prediction market where speed, clarity, and trust are non-negotiable. Every pixel serves a purpose when real money is on the line.',
    sections: [
      { title: 'THE PROBLEM', body: 'Prediction markets are inherently complex — probability, odds, real-time data, and financial stakes. The interface needed to make all of this feel intuitive without dumbing it down.' },
      { title: 'THE DESIGN', body: 'A data-dense interface built on a custom component library. Information hierarchy driven by motion — important changes animate, stable data stays quiet. Dark mode as the primary surface.' },
      { title: 'THE OUTCOME', body: 'User onboarding completion improved significantly. The design system now supports rapid feature iteration while maintaining visual consistency across web and mobile.' },
    ],
  },
  'STABLE MONEY': {
    hero: 'STABLE MONEY',
    subtitle: 'Fixed Income, Reimagined',
    role: 'Design Lead',
    year: '2026',
    description: 'Making fixed deposits and bonds feel modern. A systematic design approach for a complex financial product — clarity without condescension.',
    sections: [
      { title: 'THE VISION', body: 'Financial products don\'t have to look like spreadsheets. Stable Money needed a visual identity that communicated trust and sophistication while remaining accessible to first-time investors.' },
      { title: 'THE CRAFT', body: 'A design system built on token architecture — primitive, semantic, and component tokens that scale across product, marketing, and investor communications. Purple as the signature, restraint as the method.' },
      { title: 'THE RESULT', body: 'The rebrand launched to strong user reception. Design velocity increased and the token system now powers everything from in-app components to marketing banners.' },
    ],
  },
  'OTHER': {
    hero: 'OTHER WORK',
    subtitle: 'Independent & Passion Projects',
    role: 'Designer',
    year: '2021 — Present',
    description: 'The work that doesn\'t fit a box. Freelance commissions, personal experiments, and explorations that keep the craft sharp.',
    sections: [
      { title: 'FREELANCE', body: 'Select client work spanning brand identity, UI/UX, and editorial design. Each project a fresh context, a new set of constraints.' },
      { title: 'PERSONAL', body: 'Generative art, type experiments, and creative coding. The playground where ideas get tested before they become professional work.' },
      { title: 'COMMUNITY', body: 'Open-source design resources, mentorship, and contributions to the broader design community in Bangalore and beyond.' },
    ],
  },
  'MOTION DESIGN': {
    hero: 'MOTION DESIGN',
    subtitle: 'Things That Feel Alive',
    role: 'Motion Designer',
    year: '2022 — Present',
    description: 'Motion as a language. Transitions, micro-interactions, and choreographed sequences that give interfaces a sense of physicality.',
    sections: [
      { title: 'PHILOSOPHY', body: 'Good motion is invisible. It guides attention, creates continuity, and makes digital surfaces feel tangible. Every animation serves a functional purpose.' },
      { title: 'TOOLKIT', body: 'After Effects for hero animations, Framer Motion and CSS for production code, Lottie for cross-platform delivery. The tool serves the intent, not the other way around.' },
      { title: 'SELECTED WORK', body: 'Product transitions for Probo, brand animations for Stable Money, and experimental generative motion pieces that push technical boundaries.' },
    ],
  },
  'SYSTEMS': {
    hero: 'DESIGN SYSTEMS',
    subtitle: 'Scale Without Compromise',
    role: 'Systems Designer',
    year: '2023 — Present',
    description: 'Design systems that actually get adopted. Tokens, components, documentation — the infrastructure that makes good design repeatable.',
    sections: [
      { title: 'APPROACH', body: 'Start with tokens, not components. A three-layer token architecture (primitive → semantic → component) that flexes across brands and platforms without breaking.' },
      { title: 'GOVERNANCE', body: 'Systems die without adoption. Every system includes contribution guidelines, decision trees, and living documentation that evolves with the product.' },
      { title: 'IMPACT', body: 'Reduced design-to-dev handoff friction across multiple organizations. Consistent visual quality at scale, shipped faster.' },
    ],
  },
  '3D': {
    hero: '3D WORK',
    subtitle: 'Dimensional Thinking',
    role: '3D Artist',
    year: '2021 — Present',
    description: 'Spatial design, product visualization, and environments. Adding a third dimension to brand and product storytelling.',
    sections: [
      { title: 'ENVIRONMENTS', body: 'Immersive scenes for brand campaigns. Lighting, materials, and composition that bridge the gap between digital and physical.' },
      { title: 'PRODUCT', body: 'High-fidelity product renders for e-commerce and marketing. Photorealistic materials on accurate geometry.' },
      { title: 'EXPERIMENTAL', body: 'Abstract spatial compositions, generative 3D, and real-time WebGL experiments pushing the boundaries of browser-based 3D.' },
    ],
  },
  'BRAND': {
    hero: 'BRAND IDENTITY',
    subtitle: 'Marks, Systems, Presence',
    role: 'Brand Designer',
    year: '2024 — Present',
    description: 'Identity at its core. Logomarks, visual systems, and brand guidelines that give companies a recognizable face.',
    sections: [
      { title: 'PROCESS', body: 'Brand work starts with listening. Understanding the business, the audience, and the competitive landscape before putting pen to paper. Strategy before aesthetics.' },
      { title: 'CRAFT', body: 'Custom typography, symbol design, and color systems. Every element built to work at every scale — from app icon to billboard.' },
      { title: 'DELIVERY', body: 'Comprehensive brand books, asset libraries, and implementation guidelines. The brand should work even when I\'m not in the room.' },
    ],
  },
  'GLITCH': {
    hero: 'GLITCH ART',
    subtitle: 'Controlled Chaos',
    role: 'Artist',
    year: '2022 — Present',
    description: 'Distortion as aesthetic, noise as signal. Exploring the beauty in digital artifacts and the space between intent and accident.',
    sections: [
      { title: 'METHOD', body: 'Databending, pixel sorting, feedback loops, and shader manipulation. Each technique reveals a different kind of hidden structure in digital media.' },
      { title: 'APPLICATION', body: 'Glitch aesthetics applied to commercial work — album art, event graphics, social campaigns. Making chaos feel intentional.' },
      { title: 'EXPLORATION', body: 'Long-form generative series, real-time audio-reactive visuals, and collaborations with musicians and technologists.' },
    ],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Perceived luminance of a hex color (0 = black, 1 = white) */
function hexLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const toLinear = (x: number) => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// ── Component ──────────────────────────────────────────────────────────────

interface ProjectDetailPageProps {
  company: string;
  visible: boolean;
  brandColor: string;
  onBack: () => void;
}

export default function ProjectDetailPage({ company, visible, brandColor, onBack }: ProjectDetailPageProps) {
  const content = PROJECT_CONTENT[company] ?? PROJECT_CONTENT['OTHER'];
  const [showContent, setShowContent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pick text color based on brand color luminance for hero contrast
  const isLight = hexLuminance(brandColor) > 0.35;
  const heroText = isLight ? '#000000' : '#FFFFFF';
  const heroTextMuted = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
  const heroTextFaint = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
  // Content area colors (below the hero)
  const bodyText = isLight ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.7)';
  const bodyTextStrong = isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.8)';
  const sectionBorder = isLight ? `rgba(0,0,0,0.1)` : `${brandColor}30`;
  const sectionTitle = isLight ? '#000000' : brandColor;

  // Stagger content in after the flyaway animation completes
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setShowContent(true), 600);
      return () => clearTimeout(t);
    } else {
      setShowContent(false);
    }
  }, [visible]);

  // Reset scroll position when entering
  useEffect(() => {
    if (visible && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [visible, company]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            background: isLight ? '#FFFFFF' : '#000000',
            color: isLight ? '#000000' : '#FFFFFF',
            overflow: 'hidden',
          }}
        >
          {/* Scrollable content area */}
          <div
            ref={scrollRef}
            style={{
              position: 'absolute',
              inset: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* ── Hero section — background matches expanded particle color ── */}
            <div style={{
              minHeight: '100vh',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: 'clamp(40px, 5vw, 80px)',
              paddingBottom: 'clamp(60px, 8vh, 120px)',
              background: brandColor,
              color: heroText,
            }}>
              {/* Back button — top left — pill style */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={showContent ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1 }}
                onClick={onBack}
                style={{
                  position: 'fixed',
                  top: 'clamp(24px, 3vh, 48px)',
                  left: 'clamp(24px, 3vw, 48px)',
                  zIndex: 25,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 18px 8px 12px',
                  borderRadius: 40,
                  background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)',
                  fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                  fontWeight: 600,
                  fontSize: 12,
                  letterSpacing: '0.07em',
                  color: heroText,
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  const t = e.currentTarget as HTMLElement;
                  t.style.background = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.22)';
                }}
                onMouseLeave={(e) => {
                  const t = e.currentTarget as HTMLElement;
                  t.style.background = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                WORK
              </motion.div>

              {/* Hero text */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={showContent ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div style={{
                  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                  fontWeight: 900,
                  fontSize: 'clamp(60px, 10vw, 160px)',
                  lineHeight: 0.9,
                  letterSpacing: '-0.04em',
                  marginBottom: 24,
                }}>
                  <TextScramble trigger={showContent} duration={1.0} speed={0.05} as="div">
                    {content.hero}
                  </TextScramble>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={showContent ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'clamp(16px, 3vw, 40px)',
                  alignItems: 'baseline',
                }}
              >
                <span style={{
                  fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                  fontWeight: 400,
                  fontSize: 'clamp(16px, 1.4vw, 22px)',
                  color: heroTextMuted,
                }}>
                  {content.subtitle}
                </span>
                <span style={{
                  fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                  fontWeight: 500,
                  fontSize: 13,
                  letterSpacing: '0.06em',
                  color: heroTextFaint,
                }}>
                  {content.role}
                </span>
                <span style={{
                  fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                  fontWeight: 500,
                  fontSize: 13,
                  letterSpacing: '0.06em',
                  color: heroTextFaint,
                }}>
                  {content.year}
                </span>
              </motion.div>
            </div>

            {/* ── Description block ── */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={showContent ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{
                padding: '0 clamp(40px, 5vw, 80px)',
                paddingBottom: 'clamp(40px, 6vh, 80px)',
                maxWidth: 860,
              }}
            >
              {/* Brand-colored rule */}
              <div style={{
                width: 40,
                height: 3,
                background: isLight ? '#000000' : brandColor,
                borderRadius: 2,
                marginBottom: 24,
                opacity: 0.8,
              }} />
              <p style={{
                fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                fontWeight: 400,
                fontSize: 'clamp(18px, 1.5vw, 24px)',
                lineHeight: 1.7,
                color: bodyTextStrong,
                margin: 0,
              }}>
                {content.description}
              </p>
            </motion.div>

            {/* ── Sections ── */}
            {content.sections.map((section, i) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 40 }}
                animate={showContent ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.8 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  padding: 'clamp(30px, 4vh, 60px) clamp(40px, 5vw, 80px)',
                  borderTop: `1px solid ${sectionBorder}`,
                  display: 'flex',
                  gap: 'clamp(30px, 5vw, 80px)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{
                  minWidth: 200,
                  flexShrink: 0,
                }}>
                  <h3 style={{
                    fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    color: sectionTitle,
                    opacity: 0.75,
                    margin: 0,
                  }}>
                    {section.title}
                  </h3>
                </div>
                <div style={{ flex: 1, minWidth: 280 }}>
                  <p style={{
                    fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                    fontWeight: 400,
                    fontSize: 'clamp(15px, 1.2vw, 18px)',
                    lineHeight: 1.85,
                    color: bodyText,
                    margin: 0,
                  }}>
                    {section.body}
                  </p>
                </div>
              </motion.div>
            ))}

            {/* ── Footer spacer + back CTA ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={showContent ? { opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: 1.3 }}
              style={{
                padding: 'clamp(60px, 8vh, 120px) clamp(40px, 5vw, 80px)',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <div
                onClick={onBack}
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '14px 36px',
                  borderRadius: 40,
                  background: brandColor,
                  color: isLight ? '#000000' : '#FFFFFF',
                  fontFamily: 'Inter, "Helvetica Neue", sans-serif',
                  fontWeight: 600,
                  fontSize: 14,
                  letterSpacing: '0.06em',
                  transition: 'transform 0.2s ease, opacity 0.2s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                BACK TO WORK
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
