import type uPlot from 'uplot';

export interface TipRow { label: string; value: string; color: string }

/**
 * Hover readout for charts: one tooltip listing every series at the cursor position, value first and label second,
 * keyed by a short line of the series colour. Built with textContent only (labels may come from data).
 */
export function tooltipPlugin(cfg: { title: (u: uPlot, idx: number) => string; rows: (u: uPlot, idx: number) => TipRow[] }): uPlot.Plugin {
  let tip: HTMLDivElement | undefined;
  const hide = () => { if (tip) tip.style.display = 'none'; };
  return {
    hooks: {
      init: (u) => {
        tip = document.createElement('div');
        tip.className = 'chart-tip';
        tip.style.display = 'none';
        tip.setAttribute('aria-hidden', 'true'); // the same values are available in the table views
        u.root.appendChild(tip);
      },
      setCursor: (u) => {
        const { left, top, idx } = u.cursor;
        if (!tip || idx == null || left == null || left < 0 || top == null) return hide();
        const rows = cfg.rows(u, idx);
        if (!rows.length) return hide();
        tip.replaceChildren();
        const title = document.createElement('div');
        title.className = 'tt';
        title.textContent = cfg.title(u, idx);
        tip.appendChild(title);
        for (const r of rows) {
          const row = document.createElement('div');
          row.className = 'tr';
          const key = document.createElement('span');
          key.className = 'key';
          key.style.borderTopColor = r.color;
          const val = document.createElement('span');
          val.className = 'tv';
          val.textContent = r.value;
          const lab = document.createElement('span');
          lab.className = 'tl';
          lab.textContent = r.label;
          row.append(key, val, lab);
          tip.appendChild(row);
        }
        tip.style.display = 'block';
        const x = u.over.offsetLeft + left;
        const y = u.over.offsetTop + top;
        const w = tip.offsetWidth;
        const flip = x + w + 16 > u.root.clientWidth;
        tip.style.left = `${flip ? x - w - 12 : x + 12}px`;
        tip.style.top = `${Math.max(0, y - tip.offsetHeight - 8)}px`;
      },
      destroy: () => { tip?.remove(); tip = undefined; },
    },
  };
}
