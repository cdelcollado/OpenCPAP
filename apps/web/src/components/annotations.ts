import type uPlot from 'uplot';

/**
 * Vertical markers for events on the time axis (e.g. setting changes): a thin dashed line with a small flag at the
 * top. `xs` are x values in seconds. Drawn after the series so they stay visible over bars.
 */
export function markersPlugin(xs: number[], color: string): uPlot.Plugin {
  return {
    hooks: {
      draw: [(u) => {
        const { ctx, bbox } = u;
        const dpr = devicePixelRatio || 1;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([4 * dpr, 3 * dpr]);
        for (const x of xs) {
          const px = u.valToPos(x, 'x', true);
          if (px < bbox.left || px > bbox.left + bbox.width) continue;
          ctx.beginPath(); ctx.moveTo(px, bbox.top); ctx.lineTo(px, bbox.top + bbox.height); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(px - 5 * dpr, bbox.top); ctx.lineTo(px + 5 * dpr, bbox.top); ctx.lineTo(px, bbox.top + 7 * dpr); ctx.closePath(); ctx.fill();
          ctx.setLineDash([4 * dpr, 3 * dpr]);
        }
        ctx.restore();
      }],
    },
  };
}
