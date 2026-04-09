// ── Projection ───────────────────────────────────────────────────────────────
export const FOV = 900;
export const CAMERA_Z_OFFSET = 280;
export const SCENE_SCALE_FACTOR = 0.588; // min(W,H) * this — 0.49 * 1.20

// ── Spring physics (cursor repulsion) ────────────────────────────────────────
export const REPEL_R = 140;
export const SPRING_K = 0.018;
export const DAMPING = 0.72;
export const MAX_DISP = 160;

// ── Proximity lines ──────────────────────────────────────────────────────────
export const PROX_R = 100;
export const LINE_MIN_DIST = 45;  // skip pairs closer than this (prevents triangulation blobs)
export const LINE_MAX_DIST = 90;  // connect up to this distance
export const MAX_LINE_ALPHA = 0.85;
export const MAX_LINES = 700;     // structural trunk→canopy lines
export const GRID_CELL = 65;

// ── Matrix rain ──────────────────────────────────────────────────────────────
export const RAIN_COL_W = 16;

// ── Formation ────────────────────────────────────────────────────────────────
export const PROGRESS_LERP = 0.022;
export const SCROLL_SENSITIVITY = 0.0012;
export const DRAG_SENSITIVITY = 0.0007;
export const MAX_DELAY = 0.26;

// ── Rotation ─────────────────────────────────────────────────────────────────
export const AUTO_ROTATE_SPEED = 0.00025;
export const MAX_TILT_X = 0.62;  // ±35° vertical tilt clamp (initial is -30°)
export const DRAG_TILT_SPEED = 0.005;
export const DRAG_ROTATE_SPEED = 0.004;
export const SCROLL_ROTATE_SPEED = 0.002;
export const ROT_LERP = 0.045;

// ── Font sizes per darkness zone (px) ────────────────────────────────────────
export const FONT_SIZES: [number, number, number, number] = [14, 12, 10, 8];
// darkness > 0.75 → 13, > 0.55 → 11, > 0.35 → 9, else → 8

// ── Darkness thresholds ──────────────────────────────────────────────────────
export const DARK_TRUNK = 0.75;
export const DARK_BRANCH = 0.55;
export const DARK_MID = 0.35;
export const CANOPY_TRIPLE_THRESHOLD = 0.42;

// ── Digit assignment thresholds ──────────────────────────────────────────────
export const DIGIT_TRUNK = 0.78;
export const DIGIT_BRANCH = 0.58;
export const DIGIT_MID = 0.38;

// ── Background ───────────────────────────────────────────────────────────────
export const BG_COLOR = "#F9F8F4";

// ── Color logic (Task 4) ────────────────────────────────────────────────────
// Color lerp speed: how fast the background/tint transitions (~60 frames)
export const COLOR_LERP_SPEED = 0.035;

// Experience brands — solid background flood on hover
export type ZoneType = 'experience' | 'skill';

export interface ZoneColor {
  hex: string;
  r: number;
  g: number;
  b: number;
  type: ZoneType;
}

function hexToZone(hex: string, type: ZoneType): ZoneColor {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { hex, r, g, b, type };
}

// Final 10 items with confirmed hex codes
export const ZONE_COLORS: Record<string, ZoneColor> = {
  // Experience brands (solid flood)
  'DAILYOBJECTS':   hexToZone('#000000', 'experience'),
  'CREPDOGCREW':    hexToZone('#0D8F0A', 'experience'),
  'PROBO':          hexToZone('#1000EC', 'experience'),
  'STABLE MONEY':   hexToZone('#916CFF', 'experience'),
  'OTHER':          hexToZone('#F10000', 'experience'),
  // Skill items (lighter tint)
  'MOTION DESIGN':  hexToZone('#F94C2A', 'skill'),
  'SYSTEMS':        hexToZone('#F94C2A', 'skill'),
  '3D':             hexToZone('#FF9900', 'skill'),
  'BRAND':          hexToZone('#43BBF8', 'skill'),
  'GLITCH':         hexToZone('#F00000', 'skill'),
};

// ── Company projects (card formation data) ──────────────────────────────────

export interface ProjectEntry {
  title: string; year: string; tag: string; image: string;
}

export const COMPANY_PROJECTS: Record<string, ProjectEntry[]> = {
  'STABLE MONEY': [
    { title: 'PROJECT 1', year: '2025', tag: 'PRODUCT · BRAND', image: '/projects/stable-money-1.jpg' },
    { title: 'PROJECT 2', year: '2025', tag: 'MOTION · BRAND',  image: '/projects/stable-money-2.jpg' },
    { title: 'PROJECT 3', year: '2024', tag: 'SYSTEMS · TOOL',  image: '/projects/stable-money-3.jpg' },
    { title: 'PROJECT 4', year: '2024', tag: 'PRODUCT · DATA',  image: '/projects/stable-money-4.jpg' },
  ],
  'DAILYOBJECTS': [
    { title: 'PROJECT 1', year: '2023', tag: 'BRAND IDENTITY', image: '/projects/dailyobjects-1.jpg' },
    { title: 'PROJECT 2', year: '2023', tag: 'PRODUCT UI',     image: '/projects/dailyobjects-2.jpg' },
    { title: 'PROJECT 3', year: '2022', tag: 'MOTION · 3D',    image: '/projects/dailyobjects-3.jpg' },
    { title: 'PROJECT 4', year: '2023', tag: 'PACKAGING',      image: '/projects/dailyobjects-4.jpg' },
  ],
  'CREPDOGCREW': [
    { title: 'PROJECT 1', year: '2022', tag: 'BRAND · DROPS',   image: '/projects/crepdogcrew-1.jpg' },
    { title: 'PROJECT 2', year: '2022', tag: 'SOCIAL · MOTION', image: '/projects/crepdogcrew-2.jpg' },
    { title: 'PROJECT 3', year: '2021', tag: 'CAMPAIGN',        image: '/projects/crepdogcrew-3.jpg' },
    { title: 'PROJECT 4', year: '2021', tag: 'EDITORIAL',       image: '/projects/crepdogcrew-4.jpg' },
  ],
  'PROBO': [
    { title: 'PROJECT 1', year: '2024', tag: 'PRODUCT UI', image: '/projects/probo-1.jpg' },
    { title: 'PROJECT 2', year: '2023', tag: 'SYSTEMS',    image: '/projects/probo-2.jpg' },
    { title: 'PROJECT 3', year: '2023', tag: 'MOTION',     image: '/projects/probo-3.jpg' },
    { title: 'PROJECT 4', year: '2023', tag: 'BRAND',      image: '/projects/probo-4.jpg' },
  ],
  'OTHER': [
    { title: 'PROJECT 1', year: '2023', tag: 'FREELANCE · BRAND', image: '/projects/other-1.jpg' },
    { title: 'PROJECT 2', year: '2022', tag: 'PERSONAL',          image: '/projects/other-2.jpg' },
    { title: 'PROJECT 3', year: '2022', tag: 'UI · UX',           image: '/projects/other-3.jpg' },
    { title: 'PROJECT 4', year: '2021', tag: 'CONCEPT',           image: '/projects/other-4.jpg' },
  ],
  // ── Skill projects ──
  'MOTION DESIGN': [
    { title: 'PROJECT 1', year: '2024', tag: 'ANIMATION',      image: '/projects/motion-design-1.jpg' },
    { title: 'PROJECT 2', year: '2023', tag: 'INTERACTION',    image: '/projects/motion-design-2.jpg' },
    { title: 'PROJECT 3', year: '2023', tag: 'TRANSITIONS',   image: '/projects/motion-design-3.jpg' },
    { title: 'PROJECT 4', year: '2022', tag: 'MICRO · MOTION', image: '/projects/motion-design-4.jpg' },
  ],
  'SYSTEMS': [
    { title: 'PROJECT 1', year: '2024', tag: 'TOKENS · SCALE',  image: '/projects/systems-1.jpg' },
    { title: 'PROJECT 2', year: '2023', tag: 'COMPONENTS',     image: '/projects/systems-2.jpg' },
    { title: 'PROJECT 3', year: '2023', tag: 'DOCUMENTATION',  image: '/projects/systems-3.jpg' },
    { title: 'PROJECT 4', year: '2022', tag: 'GOVERNANCE',     image: '/projects/systems-4.jpg' },
  ],
  '3D': [
    { title: 'PROJECT 1', year: '2024', tag: 'ENVIRONMENT',  image: '/projects/3d-1.jpg' },
    { title: 'PROJECT 2', year: '2023', tag: 'OBJECT',       image: '/projects/3d-2.jpg' },
    { title: 'PROJECT 3', year: '2023', tag: 'SPATIAL',      image: '/projects/3d-3.jpg' },
    { title: 'PROJECT 4', year: '2022', tag: 'RENDER',       image: '/projects/3d-4.jpg' },
  ],
  'BRAND': [
    { title: 'PROJECT 1', year: '2024', tag: 'IDENTITY',     image: '/projects/brand-1.jpg' },
    { title: 'PROJECT 2', year: '2023', tag: 'MARK · LOGO',  image: '/projects/brand-2.jpg' },
    { title: 'PROJECT 3', year: '2023', tag: 'GUIDELINES',   image: '/projects/brand-3.jpg' },
    { title: 'PROJECT 4', year: '2022', tag: 'SYSTEM',       image: '/projects/brand-4.jpg' },
  ],
  'GLITCH': [
    { title: 'PROJECT 1', year: '2024', tag: 'DISTORTION',   image: '/projects/glitch-1.jpg' },
    { title: 'PROJECT 2', year: '2023', tag: 'NOISE · DATA', image: '/projects/glitch-2.jpg' },
    { title: 'PROJECT 3', year: '2022', tag: 'AESTHETIC',    image: '/projects/glitch-3.jpg' },
    { title: 'PROJECT 4', year: '2022', tag: 'EXPERIMENT',   image: '/projects/glitch-4.jpg' },
  ],
};

// Bento grid layout per company — distinct structure for each
export const CARD_BENTO_LAYOUTS: Record<string, {
  areas: string; cols: string; rows: number; cardAreas: string[];
}> = {
  'STABLE MONEY': { areas: '"a"', cols: '1fr', rows: 1, cardAreas: ['a'] },
  'DAILYOBJECTS':  { areas: '"a"', cols: '1fr', rows: 1, cardAreas: ['a'] },
  'CREPDOGCREW':   { areas: '"a"', cols: '1fr', rows: 1, cardAreas: ['a'] },
  'PROBO':         { areas: '"a"', cols: '1fr', rows: 1, cardAreas: ['a'] },
  'OTHER':         { areas: '"a"', cols: '1fr', rows: 1, cardAreas: ['a'] },
};
