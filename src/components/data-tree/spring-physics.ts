import { REPEL_R, DAMPING, MAX_DISP } from "./constants";
import type { ParticleCPU } from "./types";

// ── Noise helpers ────────────────────────────────────────────────────────────

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise2(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function curlNoise(x: number, y: number, t: number): [number, number] {
  const eps = 0.5;
  const n1 = noise2(x, y + eps + t * 0.3);
  const n2 = noise2(x, y - eps + t * 0.3);
  const n3 = noise2(x + eps, y + t * 0.3);
  const n4 = noise2(x - eps, y + t * 0.3);
  return [(n1 - n2) / (2 * eps), -(n3 - n4) / (2 * eps)];
}

// ── Turbulence field ─────────────────────────────────────────────────────────

const INFLUENCE_BASE = REPEL_R; // 100px
const TURBULENCE_STRENGTH = 3.0;  // reduced from 6 — preserve tree shape
const REPEL_STRENGTH = 1.2;       // reduced from 2 — gentle push
const SLOW_DAMPING = 0.90;
const REST_DAMPING = DAMPING;
const REDUCED_MAX_DISP = 40;      // reduced from 75 — don't break the silhouette

/**
 * Turbulence-based cursor interaction with depth-aware influence.
 * Front particles (high depthFactor) react fully.
 * Back particles (low depthFactor) barely react.
 */
export function updateTurbulencePhysics(
  cpuParticles: ParticleCPU[],
  mouseX: number,
  mouseY: number,
  time: number,
  displacementBuf: Float32Array
): number {
  const n = cpuParticles.length;
  let disturbedCount = 0;
  const mouseActive = mouseX > -100;

  for (let i = 0; i < n; i++) {
    const p = cpuParticles[i];

    if (p.ep < 0.5) {
      p.dispX *= 0.9;
      p.dispY *= 0.9;
      p.velX *= 0.9;
      p.velY *= 0.9;
      displacementBuf[i * 2] = p.dispX;
      displacementBuf[i * 2 + 1] = p.dispY;
      continue;
    }

    const sx = p.screenX + p.dispX;
    const sy = p.screenY + p.dispY;

    let isDisturbed = false;

    if (mouseActive) {
      const dx = sx - mouseX;
      const dy = sy - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Noise-modulated influence radius
      const noiseVal = noise2(
        sx * 0.012 + time * 0.8,
        sy * 0.012 + time * 0.6
      );
      const influenceR = INFLUENCE_BASE * (0.6 + noiseVal * 0.9);

      if (dist < influenceR && dist > 0.1) {
        // Depth gate: back particles get much less influence
        // depthFactor: 0 = back, 1 = front
        const depthMul = p.depthFactor * p.depthFactor; // quadratic — back particles barely move

        if (depthMul > 0.05) {
          isDisturbed = true;
          disturbedCount++;

          const proximity = 1 - dist / influenceR;

          // 1. Gentle repulsive force
          const repelF = proximity * proximity * REPEL_STRENGTH * depthMul;
          p.velX += (dx / dist) * repelF;
          p.velY += (dy / dist) * repelF;

          // 2. Curl noise turbulence — swirly, chaotic
          const [cx, cy] = curlNoise(sx * 0.015, sy * 0.015, time * 2.5);
          const turbF = proximity * TURBULENCE_STRENGTH * depthMul;
          p.velX += cx * turbF;
          p.velY += cy * turbF;

          // 3. High-frequency jitter
          const jx = (Math.random() - 0.5) * proximity * 2.0 * depthMul;
          const jy = (Math.random() - 0.5) * proximity * 2.0 * depthMul;
          p.velX += jx;
          p.velY += jy;

          p.velX *= SLOW_DAMPING;
          p.velY *= SLOW_DAMPING;
        }
      }
    }

    if (!isDisturbed) {
      // Restoring force
      p.velX -= p.dispX * 0.018;
      p.velY -= p.dispY * 0.018;
      p.velX *= REST_DAMPING;
      p.velY *= REST_DAMPING;
    }

    // Integrate
    p.dispX += p.velX;
    p.dispY += p.velY;

    // Soft clamp — preserve tree silhouette
    const dLen = Math.sqrt(p.dispX * p.dispX + p.dispY * p.dispY);
    if (dLen > REDUCED_MAX_DISP) {
      const scale = REDUCED_MAX_DISP / dLen;
      p.dispX *= scale;
      p.dispY *= scale;
      p.velX *= 0.6;
      p.velY *= 0.6;
    }

    displacementBuf[i * 2] = p.dispX;
    displacementBuf[i * 2 + 1] = p.dispY;
  }

  return disturbedCount;
}
