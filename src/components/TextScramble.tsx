'use client';
import { useState, useEffect } from 'react';

interface Props {
  children: string;
  trigger?: boolean;
  duration?: number;
  speed?: number;
  as?: keyof JSX.IntrinsicElements;
  style?: React.CSSProperties;
  onComplete?: () => void;
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export default function TextScramble({
  children, trigger = true, duration = 0.8,
  speed = 0.04, as: Tag = 'span', style, onComplete
}: Props) {
  const [display, setDisplay] = useState(children);

  useEffect(() => {
    if (!trigger) return;
    let cancelled = false;
    let step = 0;
    const steps = Math.ceil(duration / speed);
    const interval = setInterval(() => {
      if (cancelled) { clearInterval(interval); return; }
      const progress = step / steps;
      let out = '';
      for (let i = 0; i < children.length; i++) {
        if (children[i] === ' ') { out += ' '; continue; }
        out += progress * children.length > i
          ? children[i]
          : CHARS[Math.floor(Math.random() * CHARS.length)];
      }
      setDisplay(out);
      step++;
      if (step > steps) {
        clearInterval(interval);
        setDisplay(children);
        onComplete?.();
      }
    }, speed * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [trigger]); // [trigger] ONLY — never add children here

  const Component = Tag as any;
  return <Component style={style}>{display}</Component>;
}
