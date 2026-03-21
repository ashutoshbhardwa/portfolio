# ASHUTOSH BHARDWAJ PORTFOLIO — COWORK CONTEXT

## Project location
`~/Desktop/portfolio-output` — Next.js 14, TypeScript, Three.js WebGL

## Live dev server
`localhost:3000` — run `cd ~/Desktop/portfolio-output && npm run dev` to start

## GitHub
`github.com/ashutoshbhardwa/portfolio` — push with `git push origin main`, Vercel auto-deploys to `ashutoshbhardwaj.online`

## Tech stack
- Next.js 14 + TypeScript
- Three.js WebGL (particle system)
- GSAP (installed, not yet wired for text animations)
- Courier New + Helvetica Neue typography

## Key files
```
src/components/DataTree.tsx                — main component, all UI + particle logic
src/components/data-tree/constants.ts      — all tunable values (font sizes, speeds, etc)
src/components/data-tree/particle-system.ts — Three.js shaders + particle geometry
src/components/data-tree/spring-physics.ts  — cursor repulsion physics
src/components/data-tree/sdf-atlas.ts       — character texture atlas (A-Z + 0-9)
src/app/globals.css                         — global styles, keyframes
```

---

## Current homepage state (what's built and working)

### Particle system
- 45k particles, A-Z + 0-9 characters, SDF atlas rendered in WebGL
- Scatter field on load → scroll to form tree → scroll again to disintegrate back to scatter
- Ghost of Tsushima wind wave on canopy
- Cursor repulsion with spring physics
- Proximity lines on cursor hover
- Drag to rotate (Y and X axis)
- Auto-rotate when tree formed

### Scroll states
- Progress 0 → 0.86: scatter assembles into tree
- Progress 0.86 → 1.65: disintegration (particles return to scatter positions)
- Scroll UP always works to return to tree
- Hard scroll down triggers disintegration after tree is formed

### UI overlays (all in DataTree.tsx JSX)
- `nameRef` — ASHUTOSH BHARDWAJ, top-left, fades in at progress > 0.82, fades out at disintegration
- `paraRef` — contextual paragraph, right of name
- `hintRef` — "SCROLL" text center screen with glitch effect (characters cycle, no opacity change)
- `workPillRef` — black pill "WORK ↓" bottom-left with wiggle animation
- `watermarkRef` — large watermark word on easter egg zone hover
- `zonesRef` — 7 invisible hover zones over tree, each triggers a watermark word
- `workScreenRef` — work section overlay (WORK header + 4 pills), appears after disintegration
- `starScreenRef` — floating text nodes (CDC, Motion, etc.) appears after disintegration

### Easter egg zones (7 hidden hit areas on tree)
CDC 3D · Stable Money · System Design · Daily Objects · Probo · Strategic Thinking · Motion

---

## Figma file
**File:** Ashutosh Space
**URL:** `https://www.figma.com/design/sMZXoqCLa0Hv1C8Gnjf8Cr/`
**Page:** Portfolio Homepage — node `8058:6449`

### Key frames
| Node ID | Name | Use |
|---|---|---|
| `8058:8873` | 1920×1080 — Homepage | Main design: tree, name, WORK pill, para |
| `8058:8810` | 1920×1080 — Scroll Page | SCROLL text with white vignette |
| `8059:8938` | Color State 1 | Full red background color logic |
| `8059:9003` | Color State v2 | Another color variant |
| `8059:9022` | Color State v2 | Another color variant |

**IMPORTANT:** Read ALL layout values (position, font size, weight, tracking, color) directly from Figma. Do not approximate. The Figma MCP connection is active.

---

## Tasks for Cowork

### TASK 1 — Match homepage layout exactly to Figma `8058:8873`
Read frame directly from Figma. Match in `DataTree.tsx`:
- Name: position, font size, weight, letter spacing, color
- Subtitle "MULTI-DISCIPLINARY DESIGNER": position, style
- Contextual paragraph: right of name, same top alignment, max height = name block height
- WORK pill: exact size, position, border radius, font

### TASK 2 — SCROLL text (Figma `8058:8810`)
- White radial vignette behind SCROLL text
- Text style exactly from Figma
- Glitch effect: characters cycle randomly at ~35ms, resolve left to right, NO opacity change — pure character swap only

### TASK 3 — Paragraph animation (reference: collectifparcelles.com)
Line-by-line slide up reveal using GSAP:
- Each line slides up from `translateY(110%)` inside `overflow: hidden` wrapper
- Stagger: 90ms between lines
- Duration: 600ms per line  
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`
- Triggers when tree forms (progress > 0.82)
- Same animation on WORK section header and pills

### TASK 4 — Color logic (reference: Figma `8059:8938`)
When cursor enters any of the 7 easter egg zones, full background floods to brand color. Smooth lerp ~60 frames. Affects: background, particle tint, text color.

Color registry:
- Stable Money: `#916CFF`
- CDC, Daily Objects, Probo: confirm with Ashutosh
- System Design / Strategic Thinking / Motion: subtle tints TBD

---

## Animation references
| Effect | Reference | Technique |
|---|---|---|
| Paragraph reveal | collectifparcelles.com | GSAP line mask slide-up, 90ms stagger |
| Header entrance | jobyaviation.com | Word-by-word staggered reveal |
| Image transitions | Takamitsu Motoyoshi (Awwwards) | Clip-path wipe + displacement |
| Artwork strips | devouringdetails.com | CSS flex accordion expand |
| 3D work wall | Edoardo Smerilli (Awwwards) | Three.js Z-axis infinite scroll |

---

## DO NOT change
- Shader code in `particle-system.ts` unless specifically asked
- Scroll state machine logic (progress thresholds)
- Spring physics constants
- Disintegration logic
- Wind wave uniforms

---

## Last stable git checkpoint
`checkpoint: full flow working — scatter, tree, disintegrate, starry field`
To restore: `git log --oneline` to find hash, then `git checkout <hash>`
