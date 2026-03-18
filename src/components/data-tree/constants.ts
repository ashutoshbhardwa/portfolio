// ── Projection ───────────────────────────────────────────────────────────────
export const FOV = 900;
export const CAMERA_Z_OFFSET = 280;
export const SCENE_SCALE_FACTOR = 0.68; // min(W,H) * this — 30% larger

// ── Spring physics (cursor repulsion) ────────────────────────────────────────
export const REPEL_R = 100;
export const SPRING_K = 0.028;
export const DAMPING = 0.84;
export const MAX_DISP = 75;

// ── Proximity lines ──────────────────────────────────────────────────────────
export const PROX_R = 100;
export const LINE_MIN_DIST = 30;  // skip pairs closer than this (prevents blobs)
export const LINE_MAX_DIST = 85;  // connect up to this distance
export const MAX_LINE_ALPHA = 0.28;
export const MAX_LINES = 400;     // fewer but defined
export const GRID_CELL = 65;

// ── Matrix rain ──────────────────────────────────────────────────────────────
export const RAIN_COL_W = 16;

// ── Formation ────────────────────────────────────────────────────────────────
export const PROGRESS_LERP = 0.022;
export const SCROLL_SENSITIVITY = 0.0012;
export const DRAG_SENSITIVITY = 0.0007;
export const MAX_DELAY = 0.26;

// ── Rotation ─────────────────────────────────────────────────────────────────
export const AUTO_ROTATE_SPEED = 0.0006;
export const MAX_TILT_X = 0.62;  // ±35° vertical tilt clamp (initial is -30°)
export const DRAG_TILT_SPEED = 0.005;
export const DRAG_ROTATE_SPEED = 0.007;
export const SCROLL_ROTATE_SPEED = 0.002;
export const ROT_LERP = 0.04;

// ── Font sizes per darkness zone (px) ────────────────────────────────────────
export const FONT_SIZES: [number, number, number, number] = [13, 11, 9, 8];
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
