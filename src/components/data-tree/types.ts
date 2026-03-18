/** Raw point from tree-pts.json: [x, y, z, darkness] */
export type RawPoint = [number, number, number, number];

/** Per-particle CPU-side state (not sent to GPU — used for physics, flicker) */
export interface ParticleCPU {
  /** Eased formation progress 0→1 */
  ep: number;
  /** Brownian velocity (scatter drift) */
  bvx: number;
  bvy: number;
  /** Spring displacement */
  dispX: number;
  dispY: number;
  /** Spring velocity */
  velX: number;
  velY: number;
  /** Current digit/character index 0–35 */
  digit: number;
  /** Frames until next flicker */
  flickerTimer: number;
  /** Flicker interval (frames) */
  flickerInterval: number;
  /** Fade opacity 0–1 for smooth character transitions */
  fadeOpacity: number;
  /** Fade state machine */
  fadeState: 'visible' | 'fading-out' | 'fading-in';
  /** Frame counter for fade animation */
  fadeTimer: number;
  /** Darkness value (cached for digit reassignment) */
  darkness: number;
  /** Computed screen position (for proximity lines + spring) */
  screenX: number;
  screenY: number;
  /** Formation delay */
  delay: number;
  /** Depth factor 0→1 (0=back, 1=front) for cursor influence */
  depthFactor: number;
}
