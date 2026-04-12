/**
 * SVG Logo → Particle Position Sampler
 *
 * Renders SVG to an offscreen canvas, scans filled pixels, then samples N
 * positions from those pixels.  This approach handles ANY SVG shape (paths,
 * circles, rects, text outlines…) without needing to parse path data.
 *
 * Usage:
 *   const positions = await sampleLogoPositions('/logos/CDC.svg', particleCount, W, H);
 *   // positions is Float32Array [x,y, x,y, …] in screen-space
 */

// ── Cache: avoid re-sampling on every hover ────────────────────────────────
const cache = new Map<string, Float32Array>();

/**
 * Main entry point.  Fetches SVG, renders it to an offscreen canvas sized to
 * fill ~60% of the viewport centered in the top 80%, then returns `count`
 * screen-space (x,y) pairs sampled from the filled pixels.
 */
export async function sampleLogoPositions(
  svgURL: string,
  count: number,
  viewportW: number,
  viewportH: number,
): Promise<Float32Array> {
  const key = `${svgURL}|${count}|${viewportW}|${viewportH}`;
  if (cache.has(key)) return cache.get(key)!;

  // 1. Fetch SVG markup
  const svgText = await fetch(svgURL).then((r) => r.text());

  // 2. Determine the intrinsic SVG size from the viewBox (or width/height)
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) throw new Error(`No <svg> found in ${svgURL}`);

  let svgW: number, svgH: number;
  const vb = svgEl.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    svgW = parts[2];
    svgH = parts[3];
  } else {
    svgW = parseFloat(svgEl.getAttribute('width') || '100');
    svgH = parseFloat(svgEl.getAttribute('height') || '100');
  }

  // 3. Compute render size: logo fills 60% of viewport, centered in top 80%
  const logoAreaW = viewportW * 0.60;
  const logoAreaH = viewportH * 0.80 * 0.75; // 75% of the top-80% zone
  const aspect = svgW / svgH;
  let renderW: number, renderH: number;
  if (aspect > logoAreaW / logoAreaH) {
    renderW = logoAreaW;
    renderH = logoAreaW / aspect;
  } else {
    renderH = logoAreaH;
    renderW = logoAreaH * aspect;
  }

  // Offset to center in top 80% of viewport
  const offsetX = (viewportW - renderW) / 2;
  const offsetY = (viewportH * 0.80 - renderH) / 2;

  // 4. Render SVG to offscreen canvas
  const canvas = document.createElement('canvas');
  // Use a lower-res canvas for sampling speed — 1px = 2 screen-px
  const SAMPLE_SCALE = 0.5;
  const cw = Math.ceil(renderW * SAMPLE_SCALE);
  const ch = Math.ceil(renderH * SAMPLE_SCALE);
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  // Create an Image from the SVG blob
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = url;
  });
  URL.revokeObjectURL(url);

  // Draw SVG onto canvas (fills entire canvas)
  ctx.drawImage(img, 0, 0, cw, ch);

  // 5. Scan for filled (non-transparent) pixels
  const imageData = ctx.getImageData(0, 0, cw, ch);
  const pixels = imageData.data; // RGBA
  const filled: { x: number; y: number }[] = [];
  console.log(`[logo-sampler] canvas ${cw}x${ch}, offset (${offsetX.toFixed(0)}, ${offsetY.toFixed(0)}), render ${renderW.toFixed(0)}x${renderH.toFixed(0)}`);

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = (y * cw + x) * 4;
      const alpha = pixels[idx + 3];
      if (alpha > 30) {
        // Map canvas pixel → screen position
        filled.push({
          x: offsetX + (x / SAMPLE_SCALE),
          y: offsetY + (y / SAMPLE_SCALE),
        });
      }
    }
  }

  console.log(`[logo-sampler] filled pixels: ${filled.length}, sampling ${count} points`);

  if (filled.length === 0) {
    console.warn(`[logo-sampler] NO filled pixels found! SVG may not have rendered.`);
    const buf = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      buf[i * 2] = Math.random() * viewportW;
      buf[i * 2 + 1] = Math.random() * viewportH;
    }
    cache.set(key, buf);
    return buf;
  }

  // 6. Sample `count` positions from filled pixels (with replacement + jitter)
  const buf = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const pixel = filled[Math.floor(Math.random() * filled.length)];
    // ±1.5px jitter so particles don't stack perfectly
    buf[i * 2] = pixel.x + (Math.random() - 0.5) * 3;
    buf[i * 2 + 1] = pixel.y + (Math.random() - 0.5) * 3;
  }

  cache.set(key, buf);
  return buf;
}

/** Clear the cache (e.g. on resize) */
export function clearLogoCache() {
  cache.clear();
}
