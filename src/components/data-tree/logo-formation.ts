/**
 * logo-formation.ts  (v6 — tree-particle rearrangement)
 *
 * Provides:
 *  - N_LOGO_PARTICLES: how many tree particles to recruit
 *  - LogoFormationManager.tick()         → form-progress 0-1
 *  - LogoFormationManager.getWorldTargets() → world-space position targets
 *
 * DataTree.tsx moves the actual particle position attribute each frame.
 * NO canvas overlay, NO white dots — the dark tree characters ARE the logo.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Logo SVG path data
// ─────────────────────────────────────────────────────────────────────────────

const LOGO_PATHS: Record<string, { vbW: number; vbH: number; paths: string[] }> = {
  "STABLE MONEY": {
    vbW: 233, vbH: 229,
    paths: [
      "M226.982 21.2381C230.962 20.9079 232.304 22.7974 232.279 26.7031C232.179 42.5849 232.087 58.4681 231.914 74.3496L231.267 153.408L230.739 201.36C230.592 209.433 232.647 222.493 224.802 227.108C216.737 231.85 213.932 224.65 210.842 219.223L203.197 205.743L176.562 158.613C174.444 154.968 172.359 151.305 170.307 147.623C169.447 146.083 166.682 140.945 165.737 139.99C163.784 138.01 151.952 140.595 149.314 141.003L126.235 144.473C121.781 145.183 117.273 146.085 112.749 146.055C108.355 146.028 108.053 144.3 108.204 140.55C110.297 136.703 126.817 120.875 130.862 116.838L158.197 89.1626L206.734 40.1956C211.342 35.6053 221.729 23.6369 226.982 21.2381Z",
      "M195.857 0.0988561C199.429 -0.0706439 210.989 -0.802647 206.627 6.80535C204.692 10.1776 198.982 15.0114 195.967 18.0221L171.199 42.5393L120.668 92.6068C113.601 99.7403 106.471 106.813 99.279 113.82C96.2387 116.78 90.5337 123.365 86.7182 124.323C79.1622 126.218 83.7339 107.998 84.2097 104.838L88.2127 77.9054C89.9404 66.6179 91.3644 67.8843 81.1492 62.2366L26.2019 31.1256L11.193 22.6686C8.04571 20.8911 4.4172 19.0229 1.58995 16.7856C0.674451 16.0699 -0.0793005 13.6026 0.0066995 12.4516C0.8537 1.10136 12.3317 1.71485 20.4232 1.70785C25.9744 1.70335 30.7107 1.50085 35.7937 1.5041L68.5117 1.24261L152.302 0.487101L178.274 0.1961C184.122 0.1636 190.017 0.266606 195.857 0.0988561Z",
    ],
  },
  CREPDOGCREW: {
    vbW: 423, vbH: 149,
    paths: [
      "M122.5 51.5H82.5V40H44.5V111H82.5V96H122.5V124L93.5 148H34.5L0 119.5V23L32 0H94L122.5 23V51.5Z",
      "M423 51.5H383V40H345V111H383V96H423V124L394 148H335L300.5 119.5V23L332.5 0H394.5L423 23V51.5Z",
      "M282.326 32.1211L282.5 32.2705V116.238L282.314 116.389L242.814 148.389L242.677 148.5H140.5V115.5H166V33H140.5V1H246.186L282.326 32.1211ZM200 36V113.5H229.229L229.38 113.325L238.38 102.825L238.5 102.685V44.2754L238.332 44.126L229.332 36.126L229.19 36H200Z",
    ],
  },
  DAILYOBJECTS: {
    vbW: 500, vbH: 500,
    paths: [
      "M7.53716 139.354C9.33176 139.566 14.8748 139.433 16.9929 139.436L36.1225 139.46L84.1748 139.46C91.2733 139.456 98.3823 139.416 105.48 139.454C138.49 139.634 169.729 151.541 193.09 174.816C215.324 196.983 227.831 227.08 227.856 258.475C227.91 291.162 215.233 320.514 192.248 343.579C173.004 362.014 149.436 373.83 122.77 376.787C111.405 378.045 98.7925 377.645 87.2465 377.645L33.8473 377.65L16.0818 377.665C13.2971 377.665 9.77261 377.407 7.08398 377.715C7.38508 370.007 7.19811 361.334 7.19891 353.549L7.20153 311.422L7.20168 183.256C7.20143 178.07 6.86583 140.858 7.53716 139.354ZM76.7365 307.697C83.4903 307.767 90.2443 307.795 96.9983 307.78C101.943 307.777 107.159 307.887 112.054 307.442C122.385 306.507 132.928 301.955 140.372 294.62C140.607 294.39 140.837 294.155 141.061 293.917C150.859 283.975 155.654 272.462 155.595 258.435C155.642 245.381 150.478 232.849 141.248 223.618C125.347 207.866 108.337 209.818 87.9688 209.86C85.401 209.865 79.3485 210.083 77.139 209.844C76.152 211.696 77.6095 296.957 76.7365 307.697Z",
      "M364.142 233.62C370.34 233.552 376.535 233.907 382.685 234.684C416.442 239.063 447.08 256.665 467.87 283.62C488.55 310.302 497.73 344.132 493.377 377.61C471.477 378.022 449.38 377.385 427.462 377.645C424.535 377.68 421.64 377.487 418.705 377.607C424.337 360.735 420.155 341.137 409.022 327.43C401.312 317.892 390.647 311.192 378.707 308.387C375.505 307.667 372.372 307.397 369.115 307.06C363.64 306.965 358.45 307.387 353.102 308.657C339.19 312.075 327.175 320.822 319.647 333.012C310.69 347.547 309.957 361.437 313.772 377.525C305.72 377.812 296.75 377.637 288.627 377.637L239.016 377.607C238.863 374.08 238.467 370.61 238.335 367.065C236.878 333.02 249.059 299.802 272.18 274.772C296.962 248.113 328.075 234.983 364.142 233.62Z",
      "M257.015 139.386C263.928 139.752 273.883 139.431 281.013 139.43L328.868 139.428L475.78 139.446C470.225 152.029 456.833 166.425 446.625 175.449C434.108 186.22 417.365 195.176 401.57 199.844C370.005 209.148 336.035 205.552 307.118 189.845C289.488 180.29 274.395 166.657 263.105 150.083C261.353 147.528 257.84 142.188 257.015 139.386Z",
    ],
  },
  PROBO: {
    vbW: 114, vbH: 127,
    paths: [
      "M45.3664 0.121279C50.3465 -0.159092 58.1209 -0.0512045 62.7142 1.50995C101.829 14.8232 106.752 69.9018 69.2581 89.0516C59.4388 94.0669 47.1176 96.1455 36.3547 92.9771C38.3261 95.1433 39.7535 97.1018 41.9589 99.3285C50.1733 107.622 57.8829 110.939 68.0358 115.594C72.1649 117.852 72.0911 119.701 70.8371 124.013C66.298 127.87 62.2504 125.37 57.3186 123.607C27.144 112.822 2.33887 86.3248 0.125346 53.4142C-0.763667 40.1979 3.06902 25.5272 11.8552 15.4092C20.8636 5.14752 31.9741 0.928335 45.3664 0.121279Z",
      "M92.1703 87.4547C102.849 86.2501 112.489 93.9155 113.721 104.591C114.954 115.267 107.313 124.927 96.6406 126.187C85.9285 127.451 76.2256 119.777 74.9888 109.062C73.7522 98.3465 81.4518 88.6634 92.1703 87.4547Z",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Projection constants (must match vertex shader / DataTree.tsx constants)
// ─────────────────────────────────────────────────────────────────────────────

const FOV_K            = 900;
const CAM_Z_K          = 280;
const SCENE_SCALE_FAC  = 0.70;

// ─────────────────────────────────────────────────────────────────────────────
// Tuneable
// ─────────────────────────────────────────────────────────────────────────────

export const N_LOGO_PARTICLES   = 9000;   // 5× boost for dense logo fill
/** Logo half-size as a fraction of min(W,H) — must fit inside the ~140px repulsion void */
export const LOGO_HALF_PX_RATIO = 0.10;
const SAMPLE_STEP = 2;             // finer SVG sampling → more detailed shape
const FORM_SPEED  = 0.045;
const EXIT_SPEED  = 0.065;


// ─────────────────────────────────────────────────────────────────────────────
// SVG offset samplers (return normalised offsets in [-1, +1])
// ─────────────────────────────────────────────────────────────────────────────

function sampleLogoOffsets(key: string): Array<[number, number]> {
  const ld = LOGO_PATHS[key];
  if (!ld) return genGhostOffsets();
  const { vbW, vbH, paths } = ld;
  const maxDim = Math.max(vbW, vbH);
  const canvas = document.createElement("canvas");
  canvas.width  = vbW;
  canvas.height = vbH;
  const ctx = canvas.getContext("2d")!;
  const raw: Array<[number, number]> = [];
  for (const pathStr of paths) {
    const p2d = new Path2D(pathStr);
    for (let gy = 0; gy < vbH; gy += SAMPLE_STEP) {
      for (let gx = 0; gx < vbW; gx += SAMPLE_STEP) {
        if (ctx.isPointInPath(p2d, gx, gy)) {
          raw.push([
            (gx - vbW / 2) / maxDim * 2,
            (gy - vbH / 2) / maxDim * 2,
          ]);
        }
      }
    }
  }
  if (raw.length < 50) return genGhostOffsets();
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [raw[i], raw[j]] = [raw[j], raw[i]];
  }
  return raw;
}

function genGhostOffsets(): Array<[number, number]> {
  const acc: Array<[number, number]> = [];
  for (const r of [0.85, 0.58, 0.32]) {
    const N = 110;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const tMod = t % 0.333;
      if (tMod > 0.08 && tMod < 0.17) continue;
      const a = t * Math.PI * 2;
      const j = (Math.random() - 0.5) * r * 0.14;
      acc.push([Math.cos(a) * (r + j), Math.sin(a) * (r + j)]);
    }
  }
  return acc;
}

function genPlayTriangleOffsets(): Array<[number, number]> {
  const verts: [number, number][] = [[-0.65, -0.85], [-0.65, 0.85], [0.95, 0]];
  const acc: Array<[number, number]> = [];
  for (let e = 0; e < 3; e++) {
    const a = verts[e], b = verts[(e + 1) % 3];
    for (let i = 0; i < 90; i++) {
      const t = i / 90;
      acc.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  for (let f = 0; f < 250; f++) {
    const u = Math.random(), v = Math.random() * (1 - u), w = 1 - u - v;
    acc.push([verts[0][0]*u + verts[1][0]*v + verts[2][0]*w,
              verts[0][1]*u + verts[1][1]*v + verts[2][1]*w]);
  }
  return acc;
}

function genHexGridOffsets(): Array<[number, number]> {
  const r = 0.28, h = r * Math.sqrt(3);
  const centers: [number, number][] = [
    [0,0],[r*1.73,0],[-r*1.73,0],[r*0.87,h],[-r*0.87,h],[r*0.87,-h],[-r*0.87,-h],
  ];
  const acc: Array<[number, number]> = [];
  for (const [ox, oy] of centers) {
    for (let i = 0; i < 55; i++) {
      const a = (i / 55) * Math.PI * 2;
      acc.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
  }
  return acc;
}

function genCubeOffsets(): Array<[number, number]> {
  const s = 0.55;
  const top: [number, number][] = [[0,-s],[s*0.87,-s*0.5],[0,0],[-s*0.87,-s*0.5]];
  const bY = s * 0.9, N = 48;
  const acc: Array<[number, number]> = [];
  for (let e = 0; e < 4; e++) {
    const a = top[e], b = top[(e+1)%4];
    for (let i = 0; i < N; i++) { const t=i/N; acc.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]); }
  }
  for (const [vx, vy] of top) {
    for (let i = 0; i <= N; i++) acc.push([vx, vy + bY*(i/N)]);
  }
  for (let e = 0; e < 4; e++) {
    const a = top[e], b = top[(e+1)%4];
    for (let i = 0; i < N; i++) { const t=i/N; acc.push([a[0]+(b[0]-a[0])*t, a[1]+bY+(b[1]-a[1])*t]); }
  }
  return acc;
}

function genBullseyeOffsets(): Array<[number, number]> {
  const acc: Array<[number, number]> = [];
  const rings = [0.9, 0.62, 0.36, 0.14], counts = [130, 95, 65, 28];
  for (let ri = 0; ri < rings.length; ri++) {
    const r = rings[ri], N = counts[ri];
    for (let i = 0; i < N; i++) {
      const a = (i/N)*Math.PI*2;
      acc.push([Math.cos(a)*r, Math.sin(a)*r]);
    }
  }
  return acc;
}

function genGlitchOffsets(): Array<[number, number]> {
  const bars = 5, barH = 0.20, gap = 0.07;
  const totalH = bars*barH + (bars-1)*gap;
  const acc: Array<[number, number]> = [];
  for (let b = 0; b < bars; b++) {
    const barW = 0.85 + (Math.random()-0.5)*0.55;
    const gx   = (Math.random()-0.5)*0.38;
    const by   = -totalH/2 + b*(barH+gap);
    const N    = Math.max(30, Math.floor(barW*60));
    for (let i = 0; i < N; i++) {
      const t = i/N;
      acc.push([gx - barW/2 + t*barW, by]);
      acc.push([gx - barW/2 + t*barW, by + barH]);
    }
    for (let f = 0; f < 30; f++)
      acc.push([gx+(Math.random()-.5)*barW, by+Math.random()*barH]);
  }
  return acc;
}

const GLYPH_GENS: Record<string, () => Array<[number, number]>> = {
  "MOTION DESIGN": genPlayTriangleOffsets,
  SYSTEMS:         genHexGridOffsets,
  "3D":            genCubeOffsets,
  BRAND:           genBullseyeOffsets,
  GLITCH:          genGlitchOffsets,
  OTHER:           genGhostOffsets,
};

function getOffsets(key: string): Array<[number, number]> {
  const gen = GLYPH_GENS[key];
  return gen ? gen() : sampleLogoOffsets(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// LogoFormationManager
// ─────────────────────────────────────────────────────────────────────────────

export class LogoFormationManager {
  private activeKey: string | null = null;
  private formProgress = 0;
  private offsetCache = new Map<string, Array<[number, number]>>();

  get formProg(): number { return this.formProgress; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init(_scene: any, _W: number, _H: number): void {}
  dispose(): void { this._reset(); }
  onResize(_W: number, _H: number): void { this.offsetCache.clear(); this._reset(); }

  /**
   * Returns the cached (and lazily computed) normalised offsets for a logo key.
   * Offsets are in [-1, +1] x [-1, +1] screen-space relative to the logo centre.
   * ox=+1 → right, oy=+1 → down (SVG convention, matches screen Y).
   */
  getCachedOffsets(key: string): Array<[number, number]> {
    if (!this.offsetCache.has(key)) {
      this.offsetCache.set(key, getOffsets(key));
    }
    return this.offsetCache.get(key)!;
  }

  /** Advance form progress and return it (0–1). */
  tick(wantKey: string | null, enabled: boolean, _W: number, _H: number): number {
    if (!enabled) wantKey = null;
    if (wantKey !== null) {
      this.activeKey = wantKey;
      this.formProgress = Math.min(1, this.formProgress + FORM_SPEED);
    } else {
      this.formProgress = Math.max(0, this.formProgress - EXIT_SPEED);
      if (this.formProgress <= 0) this._reset();
    }
    return this.formProgress;
  }

  /**
   * Fill `outBuf` (length N_LOGO_PARTICLES * 3) with world-space target positions.
   *
   * Logo is centred on (cursorSX, cursorSY) in screen pixels.
   * rotY / rotX are the current tree rotation angles (rotation should be frozen
   * before calling so targets are stable across frames).
   *
   * Forward projection (vertex shader, wz=0):
   *   tx = posX * SS * cosR * d + W * 0.58
   *   ty = -(posY * SS * cosT - posX * SS * sinR * sinT) * 1.15 * d + H * 0.85
   *
   * Inverse:
   *   posX = (tx - W*0.58) / (SS * cosR * d)
   *   posY = (H*0.85 - ty) / (SS * 1.15 * d * cosT)  +  posX * sinR*sinT/cosT
   *
   * Returns false if no offsets are available yet.
   */
  getWorldTargets(
    key: string,
    cursorSX: number, cursorSY: number,
    W: number, H: number,
    rotY: number,
    rotX: number,
    outBuf: Float32Array,
  ): boolean {
    if (!this.offsetCache.has(key)) {
      this.offsetCache.set(key, getOffsets(key));
    }
    const offsets = this.offsetCache.get(key)!;
    if (!offsets.length) return false;

    const SS     = Math.min(W, H) * SCENE_SCALE_FAC;
    const d      = FOV_K / (FOV_K + CAM_Z_K);
    const halfPx = Math.min(W, H) * LOGO_HALF_PX_RATIO;

    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    const cosT = Math.cos(rotX);
    const sinT = Math.sin(rotX);

    // Guard near-singularity when tree is edge-on
    const cosRs = Math.abs(cosR) > 0.12 ? cosR : 0.12 * Math.sign(cosR || 1);
    const cosTs = Math.abs(cosT) > 0.05 ? cosT : 0.05 * Math.sign(cosT || 1);
    const denomX = SS * cosRs * d;
    const denomY = SS * 1.15 * d * cosTs;

    const nOff = offsets.length;
    for (let i = 0; i < N_LOGO_PARTICLES; i++) {
      const [ox, oy] = offsets[i % nOff];
      const sx = cursorSX + ox * halfPx;
      const sy = cursorSY + oy * halfPx;
      const posX = (sx - W * 0.58) / denomX;
      const posY = (H * 0.85 - sy) / denomY  +  posX * sinR * sinT / cosTs;
      outBuf[i * 3]     = posX;
      outBuf[i * 3 + 1] = posY;
      outBuf[i * 3 + 2] = 0;
    }
    return true;
  }

  private _reset(): void {
    this.activeKey    = null;
    this.formProgress = 0;
  }
}
