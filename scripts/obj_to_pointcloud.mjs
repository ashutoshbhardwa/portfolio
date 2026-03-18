/**
 * Parse PORT_TREE2.obj (tree only, no terrain) → tree-pts.json
 *
 * Tree centered, camera at ~15° above eye level.
 * Background scatter particles added in the component, not here.
 */

import { readFileSync, writeFileSync } from "fs";

const INPUT  = "/Users/ashutoshbhardwaj/Downloads/PORT_TREE2.obj";
const OUTPUT = "/Users/ashutoshbhardwaj/Desktop/portfolio-output/public/tree-pts.json";
const TARGET_POINTS = 55000;

// Trunk center from analysis
const TRUNK_CX = 0.72;
const TRUNK_CZ = -0.005;

// ── Parse OBJ ───────────────────────────────────────────────────────────────
const lines = readFileSync(INPUT, "utf-8").split("\n");
const vertices = [];
const faces = [];

for (const line of lines) {
  if (line.startsWith("v ")) {
    const [, x, y, z] = line.split(/\s+/).map(Number);
    vertices.push([x, y, z]);
  } else if (line.startsWith("f ")) {
    const parts = line.split(/\s+/).slice(1);
    const indices = parts.map(p => parseInt(p.split("/")[0]) - 1);
    for (let i = 1; i < indices.length - 1; i++) {
      faces.push([indices[0], indices[i], indices[i + 1]]);
    }
  }
}
console.log(`Parsed ${vertices.length} vertices, ${faces.length} triangles`);

// ── Surface sampling ────────────────────────────────────────────────────────
function triArea(a, b, c) {
  const abx = b[0]-a[0], aby = b[1]-a[1], abz = b[2]-a[2];
  const acx = c[0]-a[0], acy = c[1]-a[1], acz = c[2]-a[2];
  const cx = aby*acz - abz*acy, cy = abz*acx - abx*acz, cz = abx*acy - aby*acx;
  return 0.5 * Math.sqrt(cx*cx + cy*cy + cz*cz);
}

const areas = faces.map(f => triArea(vertices[f[0]], vertices[f[1]], vertices[f[2]]));
const totalArea = areas.reduce((s, a) => s + a, 0);
const cdf = new Float64Array(areas.length);
cdf[0] = areas[0] / totalArea;
for (let i = 1; i < areas.length; i++) cdf[i] = cdf[i-1] + areas[i] / totalArea;

function samplePoint() {
  const r = Math.random();
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
  const face = faces[lo];
  const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
  let u = Math.random(), v = Math.random();
  if (u + v > 1) { u = 1 - u; v = 1 - v; }
  return [
    a[0]*(1-u-v) + b[0]*u + c[0]*v,
    a[1]*(1-u-v) + b[1]*u + c[1]*v,
    a[2]*(1-u-v) + b[2]*u + c[2]*v,
  ];
}

// Dense sampling with organic noise rejection for natural variation
const rawPoints = [];
// Simple 3D hash noise for density variation
function noise3(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

for (let attempt = 0; attempt < TARGET_POINTS * 3 && rawPoints.length < TARGET_POINTS; attempt++) {
  const pt = samplePoint();
  // Organic noise rejection: ~30% of points rejected based on spatial noise
  // This creates natural density variation (clumps and gaps like real foliage)
  const n = noise3(pt[0] * 8, pt[1] * 8, pt[2] * 8);
  if (n < 0.20) continue; // reject ~20% for organic gaps
  rawPoints.push(pt);
}
console.log(`Sampled ${rawPoints.length} surface points (with noise rejection)`);

// ── Normalize ───────────────────────────────────────────────────────────────
// Center on trunk, scale so tree fits in [-1,1] range
const ys = rawPoints.map(p => p[1]);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);
const heightRange = maxY - minY;

// Use height as the primary scale reference so tree fills vertically
const scale = heightRange / 2; // half-height

const output = [];
for (const [ox, oy, oz] of rawPoints) {
  const nx = (ox - TRUNK_CX) / scale;
  const ny = (oy - minY) / heightRange; // 0 = base, 1 = top
  const nz = (oz - TRUNK_CZ) / scale;

  // ── Darkness + fade ────────────────────────────────────────────────
  const axisDist = Math.sqrt(nx * nx + nz * nz);

  let darkness;
  if (ny < 0.18 && axisDist < 0.18) {
    // Trunk base: very dark, dense
    darkness = 0.82 + Math.random() * 0.15;
  } else if (axisDist < 0.10 && ny < 0.50) {
    // Inner trunk
    darkness = 0.78 + Math.random() * 0.18;
  } else if (axisDist < 0.20 && ny < 0.40) {
    // Wider trunk / main branches
    darkness = 0.68 + Math.random() * 0.20;
  } else if (ny < 0.15) {
    // Terrain/base: fade with distance from trunk
    const fadeFactor = Math.max(0, 1 - axisDist / 1.2);
    darkness = (0.55 + Math.random() * 0.25) * fadeFactor;
    darkness = Math.max(0.02, darkness);
  } else {
    // Canopy: lighter toward edges and top
    const distFactor = Math.min(axisDist / 0.85, 1.0);
    const heightFactor = ny;
    const base = 0.12 + (1 - distFactor) * 0.32 + (1 - heightFactor) * 0.14;
    darkness = base + (Math.random() - 0.5) * 0.12;
    darkness = Math.max(0.04, Math.min(0.60, darkness));
  }

  output.push([
    Math.round(nx * 100000) / 100000,
    Math.round(ny * 100000) / 100000,
    Math.round(nz * 100000) / 100000,
    Math.round(darkness * 10000) / 10000,
  ]);
}

writeFileSync(OUTPUT, JSON.stringify(output));
console.log(`\nWrote ${output.length} points to ${OUTPUT}`);
const xs2 = output.map(p=>p[0]), ys2 = output.map(p=>p[1]), zs2 = output.map(p=>p[2]);
console.log(`  X: [${Math.min(...xs2).toFixed(3)}, ${Math.max(...xs2).toFixed(3)}]`);
console.log(`  Y: [${Math.min(...ys2).toFixed(3)}, ${Math.max(...ys2).toFixed(3)}]`);
console.log(`  Z: [${Math.min(...zs2).toFixed(3)}, ${Math.max(...zs2).toFixed(3)}]`);
