import { RAIN_COL_W } from "./constants";

interface RainCol {
  x: number;
  y: number;
  speed: number;
  opacity: number;
  chars: string[];
}

export class RainLayer {
  private cols: RainCol[] = [];

  init(W: number, H: number) {
    const n = Math.ceil(W / RAIN_COL_W) + 2;
    this.cols = Array.from({ length: n }, (_, i) => ({
      x: i * RAIN_COL_W,
      y: Math.random() * H,
      speed: 1.5 + Math.random() * 2.5,
      opacity: 0.04 + Math.random() * 0.08,
      chars: Array.from({ length: Math.ceil(H / 14) + 5 }, () =>
        String(Math.floor(Math.random() * 10))
      ),
    }));
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, progress: number) {
    ctx.clearRect(0, 0, W, H);
    const rainOpacity = Math.max(0, (1 - progress * 2.6) * 0.95 + 0.015);
    if (rainOpacity < 0.003) return;

    ctx.font = '10px "Courier New",monospace';
    const charH = 14;

    for (const col of this.cols) {
      col.y += col.speed;
      if (col.y > H + charH * 3) col.y = -charH * 3;

      const n = col.chars.length;
      for (let j = 0; j < n; j++) {
        const cy = col.y - j * charH;
        if (cy < -charH || cy > H + charH) continue;
        if (Math.random() < 0.008)
          col.chars[j] = String(Math.floor(Math.random() * 10));

        const a =
          j === 0
            ? col.opacity * 2.8 * rainOpacity
            : col.opacity * rainOpacity * Math.pow(1 - j / n, 1.5);
        if (a < 0.004) continue;

        ctx.fillStyle = `rgba(10,10,10,${a.toFixed(3)})`;
        ctx.fillText(col.chars[j], col.x, cy);
      }
    }
  }
}
