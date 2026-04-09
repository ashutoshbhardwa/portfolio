import * as THREE from "three";
import {
  FOV,
  CAMERA_Z_OFFSET,
  CANOPY_TRIPLE_THRESHOLD,
  DARK_TRUNK,
  DARK_BRANCH,
  DARK_MID,
  DIGIT_TRUNK,
  DIGIT_BRANCH,
  DIGIT_MID,
  MAX_DELAY,
  FONT_SIZES,
} from "./constants";
import type { RawPoint, ParticleCPU } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashInt(i: number): number {
  return ((i * 2654435761) >>> 0);
}

function assignDigit(h: number, darkness: number): number {
  // Pool: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" (36 chars)
  if (darkness > DIGIT_TRUNK) return h % 9;            // A–I (indices 0–8)
  if (darkness > DIGIT_BRANCH) return 6 + (h % 13);    // G–S (indices 6–18)
  if (darkness > DIGIT_MID) return 12 + (h % 17);      // M–2 (indices 12–28)
  return 20 + (h % 16);                                 // U–9 (indices 20–35)
}

function fontSize(darkness: number): number {
  if (darkness > DARK_TRUNK) return FONT_SIZES[0];
  if (darkness > DARK_BRANCH) return FONT_SIZES[1];
  if (darkness > DARK_MID) return FONT_SIZES[2];
  return FONT_SIZES[3];
}

// ── Canopy tripling ──────────────────────────────────────────────────────────

export function augmentPoints(raw: RawPoint[]): RawPoint[] {
  // With 45k source points, no augmentation needed — return as-is
  return raw;
}

// ── Build geometry + CPU particle array ──────────────────────────────────────

export interface ParticleBuffers {
  geometry: THREE.BufferGeometry;
  cpuParticles: ParticleCPU[];
  /** Dynamic typed arrays — write to these, then set .needsUpdate on attrs */
  brownianBuf: Float32Array;
  displacementBuf: Float32Array;
  digitBuf: Float32Array;
  opacityBuf: Float32Array;
  /** Static: per-particle scatter positions (rebuilt on resize) */
  scatterBuf: Float32Array;
  count: number;
}

export function buildParticleSystem(
  points: RawPoint[],
  W: number,
  H: number
): ParticleBuffers {
  const n = points.length;

  // Static attributes
  const worldPos = new Float32Array(n * 3);
  const scatterPos = new Float32Array(n * 2);
  const darkness = new Float32Array(n);
  const delay = new Float32Array(n);
  const windFreq = new Float32Array(n);
  const windPhase = new Float32Array(n * 2);
  const fontSizeBuf = new Float32Array(n);

  // Dynamic attributes
  const brownianBuf = new Float32Array(n * 2);
  const displacementBuf = new Float32Array(n * 2);
  const digitBuf = new Float32Array(n);
  const opacityBuf = new Float32Array(n);
  for (let j = 0; j < n; j++) opacityBuf[j] = 1.0;

  // CPU particle state
  const cpuParticles: ParticleCPU[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const pt = points[i];
    const d = Math.max(0, Math.min(1, pt[3]));
    const h = hashInt(i);

    // World position (raw, multiplied by uSceneScale in shader)
    worldPos[i * 3] = pt[0];
    worldPos[i * 3 + 1] = pt[1];
    worldPos[i * 3 + 2] = pt[2];

    // Scatter position — Gaussian distribution centered on screen.
    // Creates a soft nebula cluster rather than uniform noise:
    // particles concentrate in the center-to-lower area with natural falloff toward edges.
    const gx1 = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    const gy1 = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    const sx = W * 0.5  + gx1 * W * 0.28; // σ = 28% of width  → most within central 56%
    const sy = H * 0.42 + gy1 * H * 0.22; // σ = 22% of height → centered at 42% from top
    scatterPos[i * 2] = sx;
    scatterPos[i * 2 + 1] = sy;

    darkness[i] = d;

    const del = Math.random() * MAX_DELAY;
    delay[i] = del;

    // Low darkness = canopy = higher flutter frequency
    // High darkness = trunk = lower, slower sway
    const wf = 0.4 + (1.0 - d) * 0.8; // range 0.4 (trunk) to 1.2 (canopy tips)
    windFreq[i] = wf;
    windPhase[i * 2] = Math.random() * Math.PI * 2;
    windPhase[i * 2 + 1] = Math.random() * Math.PI * 2;

    fontSizeBuf[i] = fontSize(d);

    const digit = assignDigit(h, d);
    digitBuf[i] = digit;

    cpuParticles[i] = {
      ep: 0,
      bvx: 0,
      bvy: 0,
      dispX: 0,
      dispY: 0,
      velX: 0,
      velY: 0,
      digit,
      flickerTimer: Math.floor(Math.random() * 60),
      flickerInterval: 18 + Math.floor(Math.random() * 72),
      darkness: d,
      screenX: 0,
      screenY: 0,
      delay: del,
      depthFactor: 0,
      fadeOpacity: 1,
      fadeState: 'visible' as const,
      fadeTimer: 0,
    };
  }

  // Build geometry
  const geometry = new THREE.BufferGeometry();

  // Static
  // Three.js requires "position" attribute to render — use it for world coords
  geometry.setAttribute("position", new THREE.BufferAttribute(worldPos, 3));
  geometry.setAttribute("aScatterPos", new THREE.BufferAttribute(scatterPos, 2));
  geometry.setAttribute("aDarkness", new THREE.BufferAttribute(darkness, 1));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute("aWindFreq", new THREE.BufferAttribute(windFreq, 1));
  geometry.setAttribute("aWindPhase", new THREE.BufferAttribute(windPhase, 2));
  geometry.setAttribute("aFontSize", new THREE.BufferAttribute(fontSizeBuf, 1));

  // Dynamic
  const brownianAttr = new THREE.BufferAttribute(brownianBuf, 2);
  brownianAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aBrownian", brownianAttr);

  const dispAttr = new THREE.BufferAttribute(displacementBuf, 2);
  dispAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aDisplacement", dispAttr);

  const digitAttr = new THREE.BufferAttribute(digitBuf, 1);
  digitAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aDigitIndex", digitAttr);

  const opacityAttr = new THREE.BufferAttribute(opacityBuf, 1);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aFadeOpacity", opacityAttr);

  return {
    geometry,
    cpuParticles,
    brownianBuf,
    displacementBuf,
    digitBuf,
    opacityBuf,
    scatterBuf: scatterPos,
    count: n,
  };
}

// ── Redistribute scatter positions on resize ─────────────────────────────────

export function redistributeScatter(
  scatterBuf: Float32Array,
  scatterAttr: THREE.BufferAttribute,
  W: number,
  H: number
) {
  const n = scatterBuf.length / 2;
  for (let i = 0; i < n; i++) {
    scatterBuf[i * 2] = Math.random() * W;
    scatterBuf[i * 2 + 1] = Math.random() * H;
  }
  scatterAttr.needsUpdate = true;
}

// ── GLSL Shaders ─────────────────────────────────────────────────────────────

export const VERTEX_SHADER = /* glsl */ `
precision highp float;

// "position" is auto-declared by Three.js from geometry.setAttribute("position", ...)
attribute vec2 aScatterPos;
attribute float aDarkness;
attribute float aDelay;
attribute float aWindFreq;
attribute vec2 aWindPhase;
attribute float aFontSize;
attribute vec2 aBrownian;
attribute vec2 aDisplacement;
attribute float aDigitIndex;
attribute float aFadeOpacity;

uniform float uProgress;
uniform float uRotY;
uniform float uRotX;
uniform float uTime;
uniform vec2 uResolution;
uniform float uSceneScale;
uniform float uDPR;
uniform float uUniformScale;
uniform float uDensityScale;
uniform float uDisintegration;

varying float vDigitIndex;
varying float vAlpha;
varying float vDarkness;
varying float vPointSize;
varying float vEp;
varying float vFadeOpacity;

float easeInOutCubic(float t) {
  return t < 0.5
    ? 4.0 * t * t * t
    : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
}

void main() {
  // Formation progress per particle
  float rawP = clamp((uProgress - aDelay) / (1.0 - aDelay * 0.5), 0.0, 1.0);
  float ep = easeInOutCubic(rawP);

  // Scale world coords
  vec3 w = position * uSceneScale;

  // Y-axis rotation (turntable)
  float cosR = cos(uRotY);
  float sinR = sin(uRotY);
  float rx = w.x * cosR - w.z * sinR;
  float ry = w.y;
  float rz = w.x * sinR + w.z * cosR;

  // X-axis tilt (vertical swivel from drag)
  float cosT = cos(uRotX);
  float sinT = sin(uRotX);
  float ry_t = ry * cosT - rz * sinT;
  float rz_t = ry * sinT + rz * cosT;

  // Perspective
  float d = ${FOV}.0 / (${FOV}.0 + rz_t + ${CAMERA_Z_OFFSET}.0);

  // Stretch height, use tilted Y
  float ryFinal = ry_t * 1.15;

  // Right-aligned, base at ~85% down
  float tx = rx * d + uResolution.x * 0.72;
  float ty = -ryFinal * d + uResolution.y * 0.80;

  // Scatter position with brownian drift
  vec2 scatter = aScatterPos + aBrownian;

  // Lerp scatter → target
  vec2 pos = mix(scatter, vec2(tx, ty), ep);

  // Ghost of Tsushima wind — slow uniform wave traveling left to right
  float windGate = smoothstep(0.05, 0.35, ep);

  // Very slow wave — period ~6 seconds, travels left to right
  float windSpeed = 0.55;
  float windSpatialFreq = 0.055;

  // Phase is seeded by world X position so wave TRAVELS across the tree
  float wavePhase = position.x * windSpatialFreq + uTime * windSpeed;

  // Canopy sways more than trunk — darkness is high for trunk, low for canopy
  float swayAmt = (1.0 - aDarkness * 0.8) * 10.0;

  // Primary sway — horizontal, slow
  float windX = sin(wavePhase + aWindPhase.x) * swayAmt * windGate;

  // Secondary micro-turbulence — faster, smaller, gives organic feel
  float turbulence = sin(wavePhase * 2.3 + aWindPhase.y + 1.57) * swayAmt * 0.18 * windGate;

  // Vertical lift — very subtle, leaves breathe up slightly on the wave crest
  float windY = sin(wavePhase * 0.8 + aWindPhase.x + 0.9) * swayAmt * 0.08 * windGate;

  pos += vec2(windX + turbulence, windY);

  // Spring displacement
  pos += aDisplacement;

  // Disintegration: animate back to scatter positions
  float disintEase = 0.0;
  if (uDisintegration > 0.0) {
    disintEase = uDisintegration * uDisintegration * (3.0 - 2.0 * uDisintegration);
    vec2 scatterTarget = aScatterPos + aBrownian;
    pos = mix(pos, scatterTarget, disintEase);
  }

  // Screen-space → clip-space
  vec2 ndc = (pos / uResolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);

  // Scatter state: all particles small (8px max) regardless of zone
  // Formed state: normal depth-scaled size
  float scatterPtSize = 9.0;
  float formedPtSize = aFontSize * d * uDensityScale;
  float ptSize = mix(scatterPtSize, formedPtSize, ep * (1.0 - uDisintegration)) * uDPR;
  gl_PointSize = ptSize;

  // Varyings
  vPointSize = ptSize;
  vEp = ep;
  vDigitIndex = aDigitIndex;
  vFadeOpacity = aFadeOpacity;
  float depthAlpha = clamp((d - 0.35) / 0.75, 0.0, 1.0);

  // Smooth fade: terrain fades with distance from trunk, canopy edges soften
  float yNorm = position.y; // 0=base, 1=top
  float centerDist = length(position.xz); // distance from trunk axis
  float terrainFade = 1.0;
  if (yNorm < 0.25) {
    // Ground zone: gradual fade from trunk outward
    float distStart = 0.12; // full opacity near trunk
    float distEnd = 1.4;    // fully transparent far out
    float distFade = clamp(1.0 - (centerDist - distStart) / (distEnd - distStart), 0.0, 1.0);
    // Also fade with how low the point is (lower = more fade)
    float yFade = clamp(yNorm / 0.25, 0.3, 1.0);
    terrainFade = distFade * distFade * yFade; // cubic-ish falloff
  }
  // Canopy outer edges also soften slightly
  if (yNorm > 0.3) {
    float edgeFade = clamp(1.0 - (centerDist - 0.6) / 0.8, 0.5, 1.0);
    terrainFade *= edgeFade;
  }

  // Scatter: uniform low opacity so field looks like distant stars
  // No darkness variation in scatter — all equally faint
  float scatterOpacity = 0.32;
  vAlpha = mix(scatterOpacity, depthAlpha * terrainFade, ep);
  // Disintegration alpha: fade to 22% as particles return to scatter
  if (uDisintegration > 0.0) {
    vAlpha *= mix(1.0, 0.22, disintEase);
  }
  vDarkness = aDarkness;
}
`;

export const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uAtlas;
uniform float uTime;
uniform vec3 uTintColor;
uniform float uTintStrength;

varying float vDigitIndex;
varying float vAlpha;
varying float vDarkness;
varying float vPointSize;
varying float vEp;
varying float vFadeOpacity;

void main() {
  if (vAlpha < 0.02) discard;

  // Map gl_PointCoord to the correct digit cell in the atlas
  float cellWidth = 1.0 / 36.0;
  float glitchDigit = vDigitIndex;
  if (vEp < 0.5) {
    float g1 = fract(sin(vDigitIndex * 127.1 + uTime * 11.3) * 43758.5);
    float g2 = fract(sin(vDigitIndex * 311.7 + uTime * 7.1) * 23421.6);
    float glitchStrength = (1.0 - vEp / 0.5) * 0.9;
    if (g1 < glitchStrength) glitchDigit = floor(g2 * 36.0);
  }
  float digitU = floor(glitchDigit + 0.5) * cellWidth;
  vec2 uv = vec2(digitU + gl_PointCoord.x * cellWidth, gl_PointCoord.y);

  // Sample bitmap atlas alpha
  float glyphAlpha = texture2D(uAtlas, uv).a;

  if (glyphAlpha < 0.05) discard;

  // Color: all particles are near-black (#0A0A0A), trunk darkest
  // Trunk (high darkness) = pure black, canopy = very dark grey
  float g = (1.0 - vDarkness) * 0.18 + 0.04; // range: 0.04 (black) to 0.22 (very dark grey)
  vec3 baseColor = vec3(g);

  // Tint: lerp toward brand color when hovering skill zones
  // Trunk (high darkness) gets full brand color, canopy gets lighter shade
  // This preserves depth while clearly showing the brand color
  vec3 tintedColor = uTintColor * (0.4 + vDarkness * 0.6);
  vec3 color = mix(baseColor, tintedColor, uTintStrength);

  gl_FragColor = vec4(color, glyphAlpha * vAlpha * vFadeOpacity);
}
`;

// ── Create ShaderMaterial ────────────────────────────────────────────────────

export function createParticleMaterial(
  atlas: THREE.DataTexture
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uProgress: { value: 0 },
      uRotY: { value: 0 },
      uRotX: { value: 0 },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uSceneScale: { value: 1 },
      uDPR: { value: 1 },
      uUniformScale: { value: 1 },
      uDensityScale: { value: 3.0 },
      uDisintegration: { value: 0.0 },
      uAtlas: { value: atlas },
      uTintColor: { value: new THREE.Vector3(0, 0, 0) },
      uTintStrength: { value: 0.0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

// ── Proximity lines material ─────────────────────────────────────────────────

export const LINE_VERTEX_SHADER = /* glsl */ `
precision highp float;

uniform vec2 uResolution;
attribute float aAlpha;
varying float vAlpha;

void main() {
  vec2 ndc = (position.xy / uResolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  vAlpha = aAlpha;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const LINE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform float uLineAlpha;
uniform float uTime;
uniform vec3 uColor;
varying float vAlpha;

void main() {
  // Subtle shimmer — quieter than before so structural lines don't distract
  float pulse = 0.92 + 0.08 * sin(uTime * 4.0 + gl_FragCoord.x * 0.03);
  gl_FragColor = vec4(uColor, uLineAlpha * vAlpha * pulse);
}
`;

export function createLineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: LINE_VERTEX_SHADER,
    fragmentShader: LINE_FRAGMENT_SHADER,
    uniforms: {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uLineAlpha: { value: 0.55 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Vector3(1, 1, 1) }, // white by default, tinted on zone hover
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}
