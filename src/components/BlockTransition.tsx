'use client';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';

// ── Block Grid Wipe Transition ────────────────────────────────────────────
//
// Design intent:
//   - Individual colored squares pop in on a TRANSPARENT background
//   - No solid background fill — just the squares themselves
//   - Bell-curve stagger: slow start, burst in the middle, slow tail
//   - Content swap fires at the peak of the bell (max density of visible blocks)
//   - Total duration ~700ms

const COLS = 13;
const ROWS = 8;
const TOTAL = COLS * ROWS; // 104 blocks

const BLOCK_MS = 110;       // Each block's individual pop-in/out animation
const SPREAD_MS = 260;      // Total spread of stagger delays (enter or exit)
const HOLD_MS = 80;         // Brief hold at the covered peak
const SIGMA = 0.18;         // Normal distribution σ (fraction of SPREAD_MS)

type Phase = 'idle' | 'enter' | 'hold' | 'exit' | 'done';

interface BlockTransitionProps {
  active: boolean;
  onCovered?: () => void;
  onComplete?: () => void;
  color?: string;
}

// ── Seeded PRNG (mulberry32) ───────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller normal sample, clamped to [0, 1]
function normalSample(rng: () => number, mean: number, sigma: number): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.min(1, mean + z * sigma));
}

// Generate bell-curve stagger delays (ms) for all blocks
// Delays cluster around the center of SPREAD_MS — slow start, fast peak, slow tail
function bellDelays(seed: number): number[] {
  const rng = makeRng(seed);
  return Array.from({ length: TOTAL }, () =>
    Math.round(normalSample(rng, 0.5, SIGMA) * SPREAD_MS)
  );
}

export default function BlockTransition({
  active,
  onCovered,
  onComplete,
  color = '#000000',
}: BlockTransitionProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const onCoveredRef = useRef(onCovered);
  const onCompleteRef = useRef(onComplete);
  onCoveredRef.current = onCovered;
  onCompleteRef.current = onComplete;

  // New random delays each trigger
  const [seed, setSeed] = useState(42);
  const enterDelays = useMemo(() => bellDelays(seed), [seed]);
  const exitDelays  = useMemo(() => bellDelays(seed + 7777), [seed]);

  // Total enter duration = spread + one block's animation
  const enterTotal = SPREAD_MS + BLOCK_MS;
  // Content swap fires at peak of bell (center of spread) + half block
  const coveredAt  = Math.round(SPREAD_MS * 0.5 + BLOCK_MS * 0.6);

  const triggerExit = useCallback(() => {
    phaseRef.current = 'exit';
    setPhase('exit');
    const exitTotal = SPREAD_MS + BLOCK_MS + 40;
    setTimeout(() => {
      phaseRef.current = 'done';
      setPhase('done');
      onCompleteRef.current?.();
      setTimeout(() => { phaseRef.current = 'idle'; setPhase('idle'); }, 40);
    }, exitTotal);
  }, []);

  useEffect(() => {
    if (!active || phaseRef.current !== 'idle') return;
    setSeed(Date.now());
    phaseRef.current = 'enter';
    setPhase('enter');

    // Fire onCovered at the peak of the bell curve
    const coveredTimer = setTimeout(() => {
      if (phaseRef.current !== 'enter') return;
      onCoveredRef.current?.();
    }, coveredAt);

    // Hold briefly at peak, then exit
    const holdTimer = setTimeout(() => {
      if (phaseRef.current !== 'enter') return;
      phaseRef.current = 'hold';
      setPhase('hold');
      setTimeout(() => {
        if (phaseRef.current !== 'hold') return;
        triggerExit();
      }, HOLD_MS);
    }, enterTotal);

    return () => { clearTimeout(coveredTimer); clearTimeout(holdTimer); };
  }, [active, triggerExit, coveredAt, enterTotal]);

  useEffect(() => {
    if (!active && phaseRef.current === 'done') {
      phaseRef.current = 'idle';
      setPhase('idle');
    }
  }, [active]);

  if (phase === 'idle' || phase === 'done') return null;

  const isExiting = phase === 'exit';

  return (
    <>
      {/* Transparent container — NO background fill, just the blocks */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          pointerEvents: 'none',
          background: 'transparent',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            width: '100%',
            height: '100%',
            gap: 0,
            background: 'transparent',
          }}
        >
          {Array.from({ length: TOTAL }).map((_, i) => {
            const delay = isExiting ? exitDelays[i] : enterDelays[i];

            return (
              <div
                key={i}
                style={{
                  width: '100%',
                  height: '100%',
                  background: color,
                  borderRadius: 0,
                  // During hold: show all blocks at full opacity
                  opacity: phase === 'hold' ? 1 : undefined,
                  animation: (phase === 'enter' || phase === 'exit')
                    ? `blockPop ${BLOCK_MS}ms ease ${delay}ms both`
                    : undefined,
                  '--bp-a': isExiting ? '1' : '0',
                  '--bp-b': isExiting ? '0' : '1',
                } as React.CSSProperties}
              />
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes blockPop {
          from { opacity: var(--bp-a, 0); transform: scale(var(--bp-a, 0.6)); }
          to   { opacity: var(--bp-b, 1); transform: scale(var(--bp-b, 1)); }
        }
      `}</style>
    </>
  );
}
