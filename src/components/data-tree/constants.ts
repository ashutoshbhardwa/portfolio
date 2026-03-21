// ── Projection ───────────────────────────────────────────────────────────────
export const FOV = 900;
export const CAMERA_Z_OFFSET = 280;
export const SCENE_SCALE_FACTOR = 0.78; // min(W,H) * this

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
export const MAX_LINES = 220;     // sparse clean connections
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
export const ROT_LERP = 0.022;

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
