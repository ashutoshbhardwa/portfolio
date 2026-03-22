// ── CDC Logo Point Sampler ────────────────────────────────────────────────────
// Samples evenly distributed points from the CDC (CREPDOGCREW) logo SVG paths.
// Uses Path2D + isPointInPath for accurate inside-polygon testing.

const CDC_PATHS = [
  // C (left)
  "M44.5695 0.00537109L123.228 0.0350286C135.683 10.4579 148.888 21.1822 160.994 31.9245L160.995 68.3037L109.079 68.3045C107.298 61.5916 105.462 54.8928 103.575 48.2088L65.1914 48.2228C62.5656 50.1594 59.611 52.6343 57.0141 54.6943L57.0242 139.972L65.2125 146.55L103.563 146.558L109.084 126.675L129.352 126.674L160.991 126.716L161.003 161.768C148.053 172.72 134.969 183.516 121.753 194.149L44.4523 194.164C30.6719 183.555 13.3336 168.65 0.000810623 157.182L0 35.8142C6.22266 30.6238 39.7508 1.57403 44.5695 0.00537109Z",
  // D (middle)
  "M320.914 0.0429688C334.031 9.42289 356.508 29.3036 369.711 40.2373L369.703 152.737C358.797 162.487 345.523 172.986 334.148 182.454C329.492 186.446 324.765 190.344 319.961 194.148L185.99 194.165L185.974 152.308C192.758 150.277 200.591 148.425 207.512 146.62L207.467 48.2139C200.346 46.264 193.189 44.4438 186.002 42.7549C185.984 29.1994 185.57 13.4057 186.176 0.0283203L320.914 0.0429688ZM264.89 48.2207L264.851 146.542L300.226 146.534L306.008 141.895L311.961 136.949L311.945 57.6953C308.242 54.5526 304.367 51.1367 300.523 48.2197L264.89 48.2207Z",
  // C (right)
  "M438.961 0L517.148 0.0132553C528.289 8.42292 544.187 22.5862 555.234 31.8544L555.258 68.296L503.062 68.3085C501.406 61.5823 499.641 54.8819 497.781 48.2089L459.227 48.2159C456.492 50.3611 453.75 52.6828 451.063 54.8999L451.078 139.785L459.352 146.534L497.797 146.558L503.07 126.675H523.883L555.227 126.717L555.281 161.573C542.32 172.634 529.18 183.493 515.875 194.133L438.477 194.157C424 182.735 408.422 169.166 394.125 157.26L394.109 35.7479C401.313 30.0014 433.625 1.47569 438.961 0Z",
];

const SVG_W = 556;
const SVG_H = 195;

/**
 * Sample `count` screen-space points from the CDC logo.
 * Returns positions in screen coordinates centered on (cx, cy) with given scale.
 */
export function sampleCDCPoints(
  count: number,
  screenW: number,
  screenH: number,
): Float32Array {
  // Distribution: C ~30%, D ~40%, C ~30%
  const dist = [
    Math.floor(count * 0.30),
    Math.floor(count * 0.40),
    count - Math.floor(count * 0.30) - Math.floor(count * 0.40),
  ];

  const canvas = document.createElement('canvas');
  canvas.width = SVG_W;
  canvas.height = SVG_H;
  const ctx = canvas.getContext('2d')!;

  const allPts: Array<[number, number]> = [];

  CDC_PATHS.forEach((pathData, i) => {
    const needed = dist[i];
    const p2d = new Path2D(pathData);
    const found: Array<[number, number]> = [];
    const step = 3;

    for (let gx = 0; gx < SVG_W; gx += step) {
      for (let gy = 0; gy < SVG_H; gy += step) {
        if (ctx.isPointInPath(p2d, gx, gy)) {
          found.push([gx, gy]);
        }
      }
    }

    // Shuffle and take needed
    for (let j = found.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [found[j], found[k]] = [found[k], found[j]];
    }
    allPts.push(...found.slice(0, needed));
  });

  // Fallback: if path sampling found nothing, scatter randomly
  if (allPts.length === 0) {
    for (let i = 0; i < count; i++) {
      allPts.push([Math.random() * SVG_W, Math.random() * SVG_H]);
    }
  }

  // Pad if not enough points (repeat random existing ones)
  while (allPts.length < count) {
    allPts.push(allPts[Math.floor(Math.random() * allPts.length)]);
  }

  // Convert SVG coords → screen coords centered on viewport
  const scale = Math.min(screenW * 0.6 / SVG_W, screenH * 0.6 / SVG_H);
  const offsetX = (screenW - SVG_W * scale) / 2;
  const offsetY = (screenH - SVG_H * scale) / 2;

  const buf = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const [sx, sy] = allPts[i];
    buf[i * 2] = sx * scale + offsetX;
    buf[i * 2 + 1] = sy * scale + offsetY;
  }

  return buf;
}

// ── Bento thumbnail layouts ──────────────────────────────────────────────────
// Each company/skill has 3 overlapping rectangles in normalized [-2, 2] space.
// Particles fill these rectangles to form a brutalist bento grid.

// Layouts in normalized [0,1] screen space (0=left/top, 1=right/bottom).
// Rectangles positioned on right ~60% of screen to leave room for pills on left.
// Dimensions scaled down 40% for dense particle packing.
const S = 0.3; // scale factor for density — 30% of original for solid fill
const BENTO_LAYOUTS: Record<string, Array<{x:number,y:number,w:number,h:number}>> = {
  'DAILYOBJECTS': [
    { x: 0.50, y: 0.22, w: 0.34*S, h: 0.32*S },
    { x: 0.68, y: 0.18, w: 0.18*S, h: 0.42*S },
    { x: 0.54, y: 0.55, w: 0.24*S, h: 0.28*S },
  ],
  'CREPDOGCREW': [
    { x: 0.48, y: 0.24, w: 0.30*S, h: 0.28*S },
    { x: 0.66, y: 0.20, w: 0.20*S, h: 0.38*S },
    { x: 0.52, y: 0.53, w: 0.26*S, h: 0.30*S },
  ],
  'PROBO': [
    { x: 0.52, y: 0.20, w: 0.36*S, h: 0.30*S },
    { x: 0.70, y: 0.16, w: 0.16*S, h: 0.44*S },
    { x: 0.56, y: 0.51, w: 0.22*S, h: 0.26*S },
  ],
  'STABLE MONEY': [
    { x: 0.46, y: 0.22, w: 0.28*S, h: 0.34*S },
    { x: 0.64, y: 0.24, w: 0.22*S, h: 0.38*S },
    { x: 0.50, y: 0.57, w: 0.28*S, h: 0.26*S },
  ],
  'OTHER': [
    { x: 0.50, y: 0.22, w: 0.34*S, h: 0.32*S },
    { x: 0.68, y: 0.18, w: 0.18*S, h: 0.42*S },
    { x: 0.54, y: 0.55, w: 0.24*S, h: 0.28*S },
  ],
  'MOTION DESIGN': [
    { x: 0.52, y: 0.24, w: 0.36*S, h: 0.28*S },
    { x: 0.70, y: 0.14, w: 0.16*S, h: 0.46*S },
    { x: 0.52, y: 0.53, w: 0.26*S, h: 0.26*S },
  ],
  'SYSTEMS': [
    { x: 0.48, y: 0.20, w: 0.32*S, h: 0.34*S },
    { x: 0.66, y: 0.22, w: 0.20*S, h: 0.38*S },
    { x: 0.51, y: 0.55, w: 0.25*S, h: 0.28*S },
  ],
  '3D': [
    { x: 0.49, y: 0.24, w: 0.30*S, h: 0.30*S },
    { x: 0.68, y: 0.16, w: 0.18*S, h: 0.44*S },
    { x: 0.56, y: 0.53, w: 0.22*S, h: 0.28*S },
  ],
  'BRAND': [
    { x: 0.51, y: 0.22, w: 0.34*S, h: 0.30*S },
    { x: 0.67, y: 0.20, w: 0.19*S, h: 0.40*S },
    { x: 0.53, y: 0.55, w: 0.24*S, h: 0.28*S },
  ],
  'GLITCH': [
    { x: 0.50, y: 0.22, w: 0.33*S, h: 0.30*S },
    { x: 0.69, y: 0.18, w: 0.17*S, h: 0.42*S },
    { x: 0.55, y: 0.53, w: 0.23*S, h: 0.26*S },
  ],
};

/**
 * Get bento rectangle scatter positions for a given company/skill key.
 * Returns Float32Array of [x,y] pairs in screen pixel coordinates.
 */
export function getBentoPoints(key: string, count: number, screenW: number, screenH: number): Float32Array {
  const rects = BENTO_LAYOUTS[key] ?? BENTO_LAYOUTS['OTHER'];
  const result = new Float32Array(count * 2);

  // Distribute particles by rectangle area
  const areas = rects.map(r => r.w * r.h);
  const total = areas.reduce((a, b) => a + b, 0);
  let idx = 0;

  rects.forEach((rect, ri) => {
    const n = ri === rects.length - 1
      ? count - idx
      : Math.round(count * areas[ri] / total);

    for (let i = 0; i < n && idx < count; i++, idx++) {
      // Random point within rectangle, then scale to screen pixels
      const nx = rect.x + (Math.random() - 0.5) * rect.w;
      const ny = rect.y + (Math.random() - 0.5) * rect.h;
      result[idx * 2]     = nx * screenW;
      result[idx * 2 + 1] = ny * screenH;
    }
  });

  return result;
}

// Cache
let _cache: Float32Array | null = null;
let _cacheW = 0;
let _cacheH = 0;

export function getCDCScatterPositions(
  count: number,
  screenW: number,
  screenH: number,
): Float32Array {
  if (_cache && _cacheW === screenW && _cacheH === screenH && _cache.length === count * 2) {
    return _cache;
  }
  _cache = sampleCDCPoints(count, screenW, screenH);
  _cacheW = screenW;
  _cacheH = screenH;
  return _cache;
}
