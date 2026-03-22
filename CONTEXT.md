# Portfolio — Build Context
*Last updated: March 22, 2026*

## Core Concept

A portfolio site for Ashutosh Bhardwaj (Visual Designer, Bangalore). The hero is a Three.js particle tree made of ~55k alphanumeric characters rendered via GLSL shaders and an SDF atlas. The site is a single-page scroll journey: particles start scattered across the viewport, scroll forms them into a tree silhouette, the tree responds to cursor interaction (spring physics repulsion, proximity lines), then further scrolling disintegrates the tree and reveals a Work page overlay with company/skill pills.

The color system floods the background or tints particles when hovering easter egg zones on the tree (experience brands flood the background; skill zones tint particles + UI). All text uses a left-to-right scramble animation (TextScramble component). The entire experience runs inside a single `position: fixed` viewport with no page navigation — everything is controlled by scroll progress (0 → 1.65).

## Site Architecture

```
src/app/
  page.tsx          — Root page: 400vh scroll spacer + fixed Nav + DataTree
  layout.tsx        — HTML shell, body margin/padding 0

src/components/
  DataTree.tsx      — Main component: Three.js canvas, RAF loop, scroll state
                      machine, overlay management, color lerp, WorkPage wiring
  WorkPage.tsx      — Work page overlay: EXP/SKILL toggle, company/skill pills,
                      ambient text, PillReveal animations, forwardRef for color
  TextScramble.tsx  — Pure scramble animation: left-to-right character reveal
  Nav.tsx           — Top navigation (fixed, zIndex 50)

src/components/data-tree/
  constants.ts      — All tuning values: FOV, spring physics, ZONE_COLORS registry
  particle-system.ts — ParticleBuffers, buildParticleSystem, scatter, shaders
  spring-physics.ts — updateTurbulencePhysics (cursor repulsion)
  sdf-atlas.ts      — generateSDFAtlas (character texture atlas)
  types.ts          — RawPoint, ParticleCPU type definitions
```

**Data flow:** page.tsx renders DataTree (dynamic import, SSR disabled). DataTree owns the Three.js scene, RAF loop, and all mutable state. WorkPage is rendered inside DataTree's container at zIndex 6, receiving visibility + hover callbacks as props. DataTree drives WorkPage's color via CSS custom properties set imperatively on workPageRef each frame.

## Journey Flow

1. **Load** — Body has a 400vh scroll spacer creating scroll height. DataTree mounts as `position: fixed` covering the viewport. Particles fetch `/tree-pts.json` and scatter randomly across the screen with brownian motion. "SCROLL" text with glitch effect appears centered.

2. **Scroll (progress 0 → 0.86)** — Wheel events on the container drive `targetProgress`. Particles lerp from scatter positions toward their tree-form world positions. Vignette blur fades out. SCROLL hint fades.

3. **Tree formed (progress ~0.85)** — `overlayOpacity` fades in overlays: ASHUTOSH/BHARDWAJ name, subtitle, ambient paragraph, WORK pill, ABOUT/CONTACT nav, DENSITY pill, arrow. All text fires TextScramble simultaneously (triggered by `homepageRevealed` state). Auto-rotation begins. Cursor spring physics + proximity lines activate.

4. **Easter egg hover (progress 0.85–1.0)** — 10 invisible hover zones over the tree trigger `showWatermark()`: large watermark text appears, background floods (experience) or particles tint (skill), ambient paragraph scrambles to contextual copy.

5. **Disintegrate (progress 0.86 → 1.65)** — Further scrolling (or clicking WORK pill → targetProgress 1.65) disintegrates the tree. `uDisintegration` uniform drives particles back toward scatter. Homepage overlays fade out (`hideAmount`).

6. **Work page (progress ≥ 1.3)** — WorkPage overlay fades in. "WORK" title + subtitle scramble in. EXP/SKILL toggle + company pills appear with PillReveal width expansion. Starry night text nodes fade in at progress ≥ 1.4.

7. **Company/skill hover** — Pill hover calls `onHoverZone(key)` → `showWatermark(key, key)` in DataTree → color state updates → background floods or particles tint. Ambient paragraph on WorkPage scrambles to company description. Non-hovered pills dim to 0.35 opacity.

8. **HOME pill** — Clicking HOME sets `targetProgressRef = 0.001` → progress lerps back to 0 → tree reforms → homepage overlays reappear.

## What's Built ✓

- **Particle tree system** — 55k+ characters, SDF atlas, GLSL shaders, wind simulation, brownian scatter, spring physics cursor repulsion, proximity lines (`DataTree.tsx`, `particle-system.ts`, `spring-physics.ts`, `sdf-atlas.ts`)
- **Scroll state machine** — wheel-driven progress 0→1.65 with formation, interaction, disintegration phases (`DataTree.tsx`)
- **Homepage overlays** — Name (ASHUTOSH/BHARDWAJ), subtitle, ambient paragraph, WORK pill, ABOUT/CONTACT nav, DENSITY pill, arrow, all with opacity transitions synced to progress (`DataTree.tsx`)
- **TextScramble** — Left-to-right character scramble with configurable duration/speed/trigger (`TextScramble.tsx`)
- **Homepage reveal timing** — `homepageRevealed` state fires when overlayOpacity > 0.15, triggering all scrambles simultaneously (`DataTree.tsx`)
- **Easter egg zones** — 10 invisible hover regions over the tree, triggering watermark + color changes (`DataTree.tsx`)
- **Color lerp system** — Per-frame RGB + strength interpolation, experience (bg flood) vs skill (particle tint) logic, all UI elements update reactively (`DataTree.tsx`, `constants.ts`)
- **Contextual ambient text** — Paragraph scrambles to zone-specific copy on hover, resets on leave (`DataTree.tsx` AMBIENT_COPY map)
- **Work page** — EXP/SKILL toggle, 5 company pills + 5 skill pills, PillReveal width animation, ambient text with scramble, HOME/DENSITY pills (`WorkPage.tsx`)
- **Work page color** — CSS custom properties (--wp-text, --wp-pill-bg, --wp-pill-text, --wp-toggle-bg) set by DataTree's RAF loop on workPageRef (`DataTree.tsx` + `WorkPage.tsx`)
- **WORK pill click** — Sets targetProgressRef to 1.65, fast-forwarding through disintegration to work page (`DataTree.tsx`)
- **HOME pill** — Sets targetProgressRef to 0.001, returning to tree formation (`WorkPage.tsx` → `DataTree.tsx`)
- **Responsive clamp()** — All positions use viewport-relative clamp() for MacBook through 4K (`DataTree.tsx`, `WorkPage.tsx`)
- **Scroll spacer** — 400vh div in page.tsx ensures document.body.scrollHeight > 2000 (`page.tsx`)

## Color Logic

The `ZONE_COLORS` registry in `constants.ts` maps 10 keys to hex colors and zone types:

**Experience brands** (background floods with brand color, particles stay dark, all text → white):
| Key | Hex | RGB (0-1) | Notes |
|-----|-----|-----------|-------|
| `DAILYOBJECTS` | `#000000` | 0, 0, 0 | Black bg → particles go white instead |
| `CREPDOGCREW` | `#0D8F0A` | 0.05, 0.56, 0.04 | Forest green |
| `PROBO` | `#1000EC` | 0.06, 0, 0.93 | Electric blue |
| `STABLE MONEY` | `#916CFF` | 0.57, 0.42, 1.0 | Purple |
| `OTHER` | `#F10000` | 0.94, 0, 0 | Red |

**Skill zones** (background stays white, particles + UI tint to brand color):
| Key | Hex | RGB (0-1) | Notes |
|-----|-----|-----------|-------|
| `MOTION DESIGN` | `#F94C2A` | 0.98, 0.30, 0.16 | Orange-red |
| `SYSTEMS` | `#F94C2A` | 0.98, 0.30, 0.16 | Same as Motion Design |
| `3D` | `#FF9900` | 1.0, 0.60, 0 | Orange |
| `BRAND` | `#43BBF8` | 0.26, 0.73, 0.97 | Cyan-blue |
| `GLITCH` | `#F00000` | 0.94, 0, 0 | Bright red |

**Lerp mechanics:** `colorStateRef` stores current r/g/b and target tr/tg/tb. Every frame: `cs.r += (cs.tr - cs.r) * 0.035`. Strength lerps similarly. When strength > 0.005, the experience/skill branch runs. When strength ≈ 0, everything resets to defaults.

**WorkPage color:** DataTree sets CSS variables on workPageRef each frame:
- Experience hover: `--wp-text: #fff`, `--wp-pill-bg: #fff`, `--wp-pill-text: rgb(r,g,b)`
- Skill hover: `--wp-text: rgb(r,g,b)`, `--wp-pill-bg: rgb(r,g,b)`, `--wp-pill-text: #fff`
- Default: `--wp-text: #000`, `--wp-pill-bg: #000`, `--wp-pill-text: #fff`

## Scroll State Machine

| Progress | Phase | What Happens |
|----------|-------|-------------|
| 0 | Start | Particles scattered, brownian motion, SCROLL hint visible |
| 0 → 0.86 | Formation | Particles lerp toward tree positions, vignette fades |
| 0.7 | Lines begin | Proximity lines start appearing near cursor |
| 0.82 | Overlays fade in | `showAmount = clamp((progress - 0.82) / 0.03, 0, 1)` |
| ~0.84 | Reveal trigger | `homepageRevealed` fires when overlayOpacity > 0.15 |
| 0.85 | Tree formed | Auto-rotation starts, treeFormedAt recorded |
| 0.85–1.0 | Hover zones active | 10 invisible zones enable, color system responds |
| 0.86 → 1.65 | Disintegration | `uDisintegration = clamp((progress - 0.86) / 0.8, 0, 1)` |
| 0.95 | Overlays fade out | `hideAmount = clamp(1 - (progress - 0.95) / 0.2, 0, 1)` |
| ≥ 1.3 | Work page | `setWorkVisible(true)`, WorkPage overlay fades in |
| ≥ 1.4 | Star screen | Starry night text nodes fade in |
| 1.65 | Max | Progress capped, full disintegration |

**Scroll sensitivity:** Normal scroll `deltaY * 0.0012`. After tree forms (progress > 0.86), reduced to `deltaY * 0.0012 * 0.4`. Scroll-to-disintegrate unlocked 5 seconds after tree formation.

**Progress lerp:** `progress += (targetProgress - progress) * 0.022` per frame (smooth, not instant).

## What's Pending ✗

- **Company logo/name particle morphing** — Pills on Work page should morph the particle system to form company logo or name shapes. Currently particles just disintegrate; no per-company formation targets exist.
- **Individual company case study pages** — No routing or detailed project pages built.
- **About page** — ABOUT pill exists but has no click handler or destination.
- **Contact page** — CONTACT pill exists but has no click handler or destination.
- **Mobile/touch support** — Scroll uses wheel events only; no touch gesture handling.
- **Page transitions** — No animated transitions between conceptual "pages" beyond the scroll-driven homepage→work transition.
- **Work page pill click navigation** — Company pills trigger color + ambient text but don't navigate to case studies.
- **Keyboard navigation / accessibility** — Only density ⌘+/⌘- keyboard shortcut exists.
- **Loading state** — No loading indicator while tree-pts.json fetches.
- **Work page right side** — Currently empty space where particle formations would appear on pill hover.

## Key Rules (Never Break)

1. **Shader vertex/fragment code** — Do not modify GLSL in particle-system.ts
2. **Scroll state machine** — Do not change progress thresholds (0→0.86→1.65) or PROGRESS_LERP
3. **Spring physics constants** — REPEL_R, SPRING_K, DAMPING, MAX_DISP in constants.ts
4. **Disintegration logic** — `uDisintegration` uniform calculation
5. **Wind wave uniforms** — Wind frequency, phase, and sway calculations
6. **colorStateRef and COLOR_LERP_SPEED** — The lerp mechanism itself; only add to the color block, never restructure
7. **ZONE_COLORS registry** — The 10 keys, hex values, and types
8. **Canvas ref and particle system init** — Three.js setup, WebGLRenderer, scene, camera
9. **Two-line name layout** — ASHUTOSH / BHARDWAJ on separate lines
10. **Name font size** — Currently `clamp(42px, 6.5vh, 90px)`, scales with viewport
11. **overlayOpacity calculation** — `showAmount * hideAmount` formula
12. **Wheel event listener** — `container.addEventListener("wheel", onWheel, { passive: false })`

## Ambient Copy

**DataTree.tsx AMBIENT_COPY** (keys match ZONE_COLORS, used for homepage hover):
```
DAILYOBJECTS  → "Brand + Product Designer, 2022–2024. Crafting brand systems and product design for India's leading accessories company."
CREPDOGCREW   → "Visual Designer, 2021–2022. Building the visual language for India's sneaker culture. Drops, campaigns, community."
PROBO         → "Product Designer, 2023–2024. Designing for a prediction market at scale. Speed, clarity, trust."
STABLE MONEY  → "Lead Designer, 2024–Present. Making fixed income feel modern. Systematic design for a complex financial product."
OTHER         → "Freelance, 2019–Present. Independent work, passion projects, and things that don't fit a box."
MOTION DESIGN → "Motion as a language. Transitions, interactions, and things that feel alive."
SYSTEMS       → "Design systems that scale. Tokens, components, documentation."
3D            → "Dimensional work. Objects, environments, and spatial thinking."
BRAND         → "Identity at its core. Marks, systems, and how things present themselves."
GLITCH        → "Controlled chaos. Distortion as aesthetic, noise as signal."
```

**Default:** `"VISUAL DESIGNER · BANGALORE · MULTI-DISCIPLINARY DESIGNER · VISUAL DESIGNER · BANGALORE"`

**WorkPage.tsx** uses pill `desc` fields directly (longer descriptions specific to companies/skills).

## How to Start a New Session

Paste this as your first message:

```
PORTFOLIO SESSION — RESUME

Repo: git@github.com:ashutoshbhardwa/portfolio.git
Working dir: ~/Desktop/portfolio-output
Dev server: npm run dev (port 3005)
Stack: Next.js, Three.js, GLSL shaders, inline styles (no Tailwind)

Read CONTEXT.md in the project root for full architecture.
Then read whichever files are relevant to the task.
Run: npx tsc --noEmit (must be clean before any changes)
Run: curl -s -o /dev/null -w "%{http_code}" http://localhost:3005 (must return 200)

RULES:
- ONE change at a time, npx tsc --noEmit after each
- Never touch: shaders, scroll state machine, spring physics,
  colorStateRef, ZONE_COLORS, overlayOpacity calculation, canvas init
- Read files fully before editing
- If anything breaks, revert that single change before trying again
- Inline styles only — no Tailwind, no CSS modules

TASK: [describe what you want built]
```
