import * as THREE from "three";

const CELL = 64;
const COLS = 36; // A-Z (26) + 0-9 (10)
const ATLAS_W = CELL * COLS; // 2304
const ATLAS_H = CELL;
const FONT = 'bold 48px "Courier New", monospace';

/**
 * Generate a bitmap font atlas texture for A–Z + 0–9 (36 cells).
 * Uses RGBA with alpha from the rendered glyph.
 * At small point sizes (8-13px), bitmap sampling produces crisper
 * glyphs than SDF which tends to over-smooth at these scales.
 */
export function generateSDFAtlas(): THREE.DataTexture {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext("2d")!;

  // Black background, white text — we'll use the luminance as alpha
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);
  ctx.font = FONT;
  ctx.fillStyle = "#FFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 36; i++) {
    ctx.fillText(GLYPHS[i], i * CELL + CELL / 2, CELL / 2);
  }

  // Extract pixel data — use the red channel as alpha (white = opaque)
  const imageData = ctx.getImageData(0, 0, ATLAS_W, ATLAS_H);
  const rgba = imageData.data;
  const size = ATLAS_W * ATLAS_H;

  // Create RGBA texture where:
  // RGB = white (255,255,255) everywhere
  // A = the glyph luminance (white text on black = glyph shape)
  const texData = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    texData[i * 4] = 255;     // R
    texData[i * 4 + 1] = 255; // G
    texData[i * 4 + 2] = 255; // B
    texData[i * 4 + 3] = rgba[i * 4]; // A = red channel of rendered text
  }

  const texture = new THREE.DataTexture(
    texData,
    ATLAS_W,
    ATLAS_H,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}
