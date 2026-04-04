/**
 * Luminance Sampler
 *
 * Loads a project thumbnail image, samples it into a CARD_COLS × CARD_ROWS grid,
 * and returns a Float32Array of luminance values (0–1) for each cell.
 *
 * Bright pixels → high opacity → visible characters
 * Dark pixels → low opacity → faded characters
 *
 * This creates recognizable image silhouettes made entirely of text characters.
 */

const CARD_COLS = 34;
const CARD_ROWS = 32;

// Cache: image URL → luminance grid (Float32Array of length CARD_COLS * CARD_ROWS)
const luminanceCache = new Map<string, Float32Array>();

// Shared offscreen canvas for sampling
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.width = CARD_COLS;
    _canvas.height = CARD_ROWS;
    _ctx = _canvas.getContext('2d', { willReadFrequently: true })!;
  }
  return { canvas: _canvas, ctx: _ctx! };
}

/**
 * Load an image and sample its luminance into a CARD_COLS × CARD_ROWS grid.
 * Returns a Float32Array where each value is 0 (black) to 1 (white).
 *
 * The image is drawn at CARD_COLS × CARD_ROWS resolution, so each pixel
 * maps directly to one character cell in the card grid.
 */
export function sampleLuminance(imageUrl: string): Promise<Float32Array> {
  // Return cached result if available
  const cached = luminanceCache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const { ctx } = getCanvas();
      // Draw image scaled to grid resolution — each pixel = one character cell
      ctx.drawImage(img, 0, 0, CARD_COLS, CARD_ROWS);
      const imageData = ctx.getImageData(0, 0, CARD_COLS, CARD_ROWS);
      const pixels = imageData.data; // RGBA flat array

      const totalCells = CARD_COLS * CARD_ROWS;
      const raw = new Float32Array(totalCells);

      // Pass 1: extract raw luminance
      let minL = 1, maxL = 0;
      for (let i = 0; i < totalCells; i++) {
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        raw[i] = lum;
        if (lum < minL) minL = lum;
        if (lum > maxL) maxL = lum;
      }

      // Pass 2: contrast stretch + gamma boost
      // The shader's terrain/depth fade reduces card alpha to ~0.2–0.55,
      // so we need aggressive boosting for the image to read through.
      const range = maxL - minL || 1;
      const grid = new Float32Array(totalCells);
      for (let i = 0; i < totalCells; i++) {
        // Normalize to full 0–1 range
        let v = (raw[i] - minL) / range;
        // Gamma boost (lift shadows, expand mid-tones)
        v = Math.pow(v, 0.45);
        // Map to opacity range: 0.15 floor so dark areas are faint but present,
        // 1.0 ceiling so bright areas punch through the shader's fade
        grid[i] = 0.15 + v * 0.85;
      }

      luminanceCache.set(imageUrl, grid);
      resolve(grid);
    };
    img.onerror = () => {
      // On error, return a uniform mid-grey grid so cards still show something
      const fallback = new Float32Array(CARD_COLS * CARD_ROWS).fill(0.5);
      luminanceCache.set(imageUrl, fallback);
      resolve(fallback);
    };
    img.src = imageUrl;
  });
}

/**
 * Preload all luminance grids for a company's projects.
 * Returns a map of card index → luminance grid.
 */
export async function preloadCompanyLuminance(
  projects: Array<{ image: string }>
): Promise<Float32Array[]> {
  return Promise.all(projects.map(p => sampleLuminance(p.image)));
}

/**
 * Get cached luminance grid (sync). Returns null if not yet loaded.
 */
export function getCachedLuminance(imageUrl: string): Float32Array | null {
  return luminanceCache.get(imageUrl) ?? null;
}
