// SVG charts drawn to scale: diverging bars, lines with crosshair, labelled scatter, sparkline.
// Every chart sizes to its container and redraws on resize.
const NS = "http://www.w3.org/2000/svg";

export function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

export function compact(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(Math.round(v));
}

function niceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * step0).find(s => span / s <= count) || step0 * 10;
  const ticks = [];
  for (let t = Math.floor(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(+t.toFixed(10));
  return ticks;
}

const tipEl = () => document.getElementById("tooltip");
export function showTip(html, ev) {
  const t = tipEl();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
  t.style.left = Math.max(8, x) + "px";
  t.style.top = Math.max(8, y) + "px";
}
export const hideTip = () => { tipEl().hidden = true; };

function responsive(container, draw) {
  let last = 0;
  const render = () => {
    const w = container.clientWidth;
    if (!w || w === last) return;
    last = w;
    container.innerHTML = "";
    draw(w);
  };
  new ResizeObserver(render).observe(container);
  render();
}

function roundedBar(x, y, w, h, toRight) {
  const r = Math.min(4, w, h / 2);
  return toRight
    ? `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`
    : `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
}

// Horizontal diverging bars: rows [{label, value, href, tip}]
export function divergingBars(container, rows, { format = compact } = {}) {
  responsive(container, (W) => {
    const rowH = 30, barH = 16, top = 4, labelW = Math.min(124, W * 0.3), valueW = 56;
    const H = top + rows.length * rowH + 22;
    const svg = el("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, height: H, role: "img" }, container);
    const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.value)));
    const hasNeg = rows.some(r => r.value < 0), hasPos = rows.some(r => r.value > 0);
    const x0 = labelW + valueW, x1 = W - valueW;
    const both = hasNeg && hasPos;
    const zero = both ? (x0 + x1) / 2 : hasNeg ? x1 : x0;
    const scale = (both ? (x1 - x0) / 2 : (x1 - x0)) / maxAbs;
    const ticks = niceTicks(hasNeg ? -maxAbs : 0, hasPos ? maxAbs : 0, 4).filter(t => Math.abs(t) <= maxAbs * 1.0001);
    for (const t of ticks) {
      const x = zero + t * scale;
      el("line", { x1: x, x2: x, y1: top, y2: H - 22, class: t === 0 ? "axis" : "grid" }, svg);
      el("text", { x, y: H - 6, "text-anchor": "middle" }, svg).textContent = compact(t);
    }
    rows.forEach((r, i) => {
      const y = top + i * rowH + (rowH - barH) / 2;
      const w = Math.max(1.5, Math.abs(r.value) * scale);
      const x = r.value >= 0 ? zero : zero - w;
      el("path", { d: roundedBar(x, y, w, barH, r.value >= 0), fill: r.value >= 0 ? "var(--pos-bar)" : "var(--neg-bar)" }, svg);
      const lbl = el("text", { x: 0, y: y + barH / 2 + 4, class: "label-ink" }, svg);
      lbl.textContent = r.label.length > 15 ? r.label.slice(0, 14) + "…" : r.label;
      const vx = r.value >= 0 ? x + w + 6 : x - 6;
      el("text", { x: vx, y: y + barH / 2 + 4, "text-anchor": r.value >= 0 ? "start" : "end", class: "label-ink" }, svg)
        .textContent = (r.value > 0 ? "+" : "") + format(r.value);
      const hit = el("rect", { x: 0, y: top + i * rowH, width: W, height: rowH, class: "hit" }, svg);
      if (r.tip) {
        hit.addEventListener("mousemove", ev => showTip(r.tip, ev));
        hit.addEventListener("mouseleave", hideTip);
      }
      if (r.href) hit.addEventListener("click", () => { hideTip(); location.hash = r.href; });
    });
  });
}

// Lines. xs: x values; series [{key, label, values (null = absent), color?}]; markers [{i, label}]
export function lines(container, { xs, series, xLabel = "Hand", xTitle = v => `${xLabel} ${v}`, format = compact,
  height = 300, markers = [], area = false, onPick } = {}) {
  responsive(container, (W) => {
    const H = height, m = { l: 46, r: 84, t: 14, b: 30 };
    const svg = el("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, height: H, role: "img" }, container);
    const all = series.flatMap(s => s.values.filter(v => v != null));
    let min = Math.min(0, ...all), max = Math.max(0, ...all);
    const ticks = niceTicks(min, max, 5);
    min = Math.min(min, ticks[0]); max = Math.max(max, ticks[ticks.length - 1]);
    const n = xs.length;
    const X = i => m.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - m.l - m.r));
    const Y = v => m.t + (1 - (v - min) / (max - min || 1)) * (H - m.t - m.b);
    for (const t of ticks) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? "axis" : "grid" }, svg);
      el("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, svg).textContent = compact(t);
    }
    if (markers.length) {
      markers.forEach((mk, k) => {
        if (mk.i > 0) el("line", { x1: X(mk.i), x2: X(mk.i), y1: m.t, y2: H - m.b, class: "boundary" }, svg);
        const next = markers[k + 1] ? markers[k + 1].i : n - 1;
        const cx = (X(mk.i) + X(next)) / 2;
        if (X(next) - X(mk.i) > 44) el("text", { x: cx, y: H - 8, "text-anchor": "middle" }, svg).textContent = mk.label;
      });
    } else {
      const xt = niceTicks(xs[0], xs[n - 1], Math.max(2, Math.floor(W / 110)));
      for (const t of xt) {
        const i = xs.findIndex(x => x >= t);
        if (i < 0 || X(i) > W - m.r - 24) continue;
        el("text", { x: X(i), y: H - 8, "text-anchor": "middle" }, svg).textContent = compact(t);
      }
      el("text", { x: W - m.r + 6, y: H - 8 }, svg).textContent = xLabel;
    }
    const path = vals => {
      let d = "", pen = false;
      vals.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1);
        pen = true;
      });
      return d;
    };
    if (area && series.length === 1) {
      const s = series[0];
      const first = s.values.findIndex(v => v != null);
      let lastI = s.values.length - 1;
      while (lastI > 0 && s.values[lastI] == null) lastI--;
      el("path", { d: path(s.values) + `L${X(lastI)},${Y(0)}L${X(first)},${Y(0)}Z`, fill: s.color, "fill-opacity": 0.1 }, svg);
    }
    const ordered = [...series].sort((a, b) => (a.color ? 1 : 0) - (b.color ? 1 : 0));
    for (const s of ordered) {
      el("path", { d: path(s.values), fill: "none", stroke: s.color || "var(--other-line)",
        "stroke-width": s.color ? 2 : 1.25, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    }
    const ends = series.filter(s => s.color).map(s => {
      let i = s.values.length - 1;
      while (i >= 0 && s.values[i] == null) i--;
      return { s, i, y: Y(s.values[i]) };
    }).filter(e => e.i >= 0).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
    for (const e of ends) {
      el("circle", { cx: X(e.i), cy: Y(e.s.values[e.i]), r: 4, fill: e.s.color, stroke: "var(--surface)", "stroke-width": 2 }, svg);
      el("text", { x: X(e.i) + 8, y: e.y + 4, class: "label-ink" }, svg).textContent = e.s.label;
    }
    const cross = el("line", { y1: m.t, y2: H - m.b, class: "crosshair", visibility: "hidden" }, svg);
    const dots = el("g", {}, svg);
    const hit = el("rect", { x: m.l, y: m.t, width: Math.max(0, W - m.l - m.r), height: H - m.t - m.b, class: "hit" }, svg);
    const idxAt = ev => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      return Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
    };
    hit.addEventListener("mousemove", ev => {
      const i = idxAt(ev);
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
      dots.innerHTML = "";
      const rows = series.filter(s => s.values[i] != null).sort((a, b) => b.values[i] - a.values[i]);
      for (const s of rows.filter(s => s.color)) {
        el("circle", { cx: X(i), cy: Y(s.values[i]), r: 4, fill: s.color, stroke: "var(--surface)", "stroke-width": 2 }, dots);
      }
      const shown = rows.length > 10 ? rows.filter((s, k) => s.color || k < 5 || k >= rows.length - 3) : rows;
      showTip(`<div class="tt-title">${xTitle(xs[i], i)}</div>` + shown.map(s =>
        `<div class="tt-row"><span class="k"><span class="sw" style="background:${s.color || "var(--other-line)"}"></span>${s.label}</span>` +
        `<span class="${s.values[i] > 0 ? "pos" : s.values[i] < 0 ? "neg" : ""}">${s.values[i] > 0 ? "+" : ""}${format(s.values[i])}</span></div>`).join("") +
        (shown.length < rows.length ? `<div class="tt-row"><span class="k">${rows.length - shown.length} more</span></div>` : "") +
        (onPick ? `<div class="tt-row"><span class="k">Click to open this hand</span></div>` : ""), ev);
    });
    hit.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); dots.innerHTML = ""; hideTip(); });
    if (onPick) hit.addEventListener("click", ev => { hideTip(); onPick(idxAt(ev)); });
  });
}

// Scatter with collision-aware labels: points [{x, y, label, href, tip, r?}]
export function scatter(container, points, { xLabel, yLabel, height = 340, xMax, yMax, avg } = {}) {
  responsive(container, (W) => {
    const H = height, m = { l: 44, r: 16, t: 14, b: 42 };
    const svg = el("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, height: H, role: "img" }, container);
    const xm = xMax ?? Math.max(10, ...points.map(p => p.x)) * 1.05;
    const ym = yMax ?? Math.max(10, ...points.map(p => p.y)) * 1.1;
    const xt = niceTicks(0, xm, 5), yt = niceTicks(0, ym, 5);
    const X = v => m.l + (v / xt[xt.length - 1]) * (W - m.l - m.r);
    const Y = v => m.t + (1 - v / yt[yt.length - 1]) * (H - m.t - m.b);
    for (const t of yt) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? "axis" : "grid" }, svg);
      el("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, svg).textContent = t + "%";
    }
    for (const t of xt) {
      el("line", { x1: X(t), x2: X(t), y1: m.t, y2: H - m.b, class: t === 0 ? "axis" : "grid" }, svg);
      el("text", { x: X(t), y: H - m.b + 16, "text-anchor": "middle" }, svg).textContent = t + "%";
    }
    if (avg) {
      el("line", { x1: X(avg.x), x2: X(avg.x), y1: m.t, y2: H - m.b, class: "crosshair", "stroke-dasharray": "0" }, svg);
      el("line", { x1: m.l, x2: W - m.r, y1: Y(avg.y), y2: Y(avg.y), class: "crosshair" }, svg);
      el("text", { x: X(avg.x) + 4, y: m.t + 10 }, svg).textContent = "table avg";
    }
    el("text", { x: W - m.r, y: H - 6, "text-anchor": "end" }, svg).textContent = xLabel + " →";
    el("text", { x: m.l + 4, y: m.t + 10 }, svg).textContent = "↑ " + yLabel;
    const pts = [...points].sort((a, b) => (b.r || 5) - (a.r || 5)).map(p => ({ ...p, cx: X(p.x), cy: Y(p.y), r: p.r || 5 }));
    for (const p of pts) {
      el("circle", { cx: p.cx, cy: p.cy, r: p.r, fill: p.color || "var(--series-1)", "fill-opacity": 0.9, stroke: "var(--surface)", "stroke-width": 2 }, svg);
    }
    const boxes = pts.map(p => ({ x0: p.cx - p.r, x1: p.cx + p.r, y0: p.cy - p.r, y1: p.cy + p.r }));
    const overlaps = b => boxes.some(q => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
    for (const p of pts) {
      const w = p.label.length * 6.6, h = 12;
      const options = [[p.cx + p.r + 4, p.cy - h / 2], [p.cx - p.r - 4 - w, p.cy - h / 2],
        [p.cx - w / 2, p.cy - p.r - 3 - h], [p.cx - w / 2, p.cy + p.r + 3]];
      for (const [x, y] of options) {
        const b = { x0: x, x1: x + w, y0: y, y1: y + h };
        if (x < m.l || x + w > W || y < 0 || y + h > H - m.b || overlaps(b)) continue;
        boxes.push(b);
        el("text", { x, y: y + h - 2, class: "label-ink" }, svg).textContent = p.label;
        break;
      }
    }
    for (const p of pts) {
      const hit = el("circle", { cx: p.cx, cy: p.cy, r: Math.max(12, p.r + 6), class: "hit" }, svg);
      hit.addEventListener("mousemove", ev => showTip(p.tip, ev));
      hit.addEventListener("mouseleave", hideTip);
      if (p.href) hit.addEventListener("click", () => { hideTip(); location.hash = p.href; });
    }
  });
}

// Sparkline of a cumulative series, end dot emphasised.
export function sparkline(container, values, { height = 40 } = {}) {
  responsive(container, (W) => {
    const H = height, pad = 5;
    const svg = el("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, height: H, "aria-hidden": "true" }, container);
    if (values.length < 2) return;
    const min = Math.min(0, ...values), max = Math.max(0, ...values);
    const X = i => pad + (i / (values.length - 1)) * (W - 2 * pad);
    const Y = v => pad + (1 - (v - min) / (max - min || 1)) * (H - 2 * pad);
    el("line", { x1: pad, x2: W - pad, y1: Y(0), y2: Y(0), class: "grid" }, svg);
    const last = values[values.length - 1];
    const color = last >= 0 ? "var(--pos-bar)" : "var(--neg-bar)";
    const d = values.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1)).join("");
    el("path", { d: d + `L${X(values.length - 1)},${Y(0)}L${X(0)},${Y(0)}Z`, fill: color, "fill-opacity": 0.12 }, svg);
    el("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    el("circle", { cx: X(values.length - 1), cy: Y(last), r: 3.5, fill: color, stroke: "var(--surface)", "stroke-width": 2 }, svg);
  });
}

// Style map: looseness (x) vs aggression (y), both as spread-adjusted distance from the table
// average. points [{x, y, label, href, tip, r?, color?}]
export function styleMap(container, points, { height = 380, corners } = {}) {
  responsive(container, (W) => {
    const H = height, m = { l: 16, r: 16, t: 26, b: 26 }, lim = 2.6;
    const svg = el("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, height: H, role: "img" }, container);
    const clamp = v => Math.max(-lim, Math.min(lim, v));
    const X = v => m.l + ((clamp(v) + lim) / (2 * lim)) * (W - m.l - m.r);
    const Y = v => m.t + (1 - (clamp(v) + lim) / (2 * lim)) * (H - m.t - m.b);
    el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "none", class: "grid", stroke: "var(--line)" }, svg);
    el("line", { x1: X(0), x2: X(0), y1: m.t, y2: H - m.b, class: "axis" }, svg);
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: "axis" }, svg);
    const c = corners || ["Tight-aggressive", "Loose-aggressive", "Rock", "Calling Station"];
    el("text", { x: m.l + 8, y: m.t + 16, class: "label-ink" }, svg).textContent = c[0];
    el("text", { x: W - m.r - 8, y: m.t + 16, "text-anchor": "end", class: "label-ink" }, svg).textContent = c[1];
    el("text", { x: m.l + 8, y: H - m.b - 8, class: "label-ink" }, svg).textContent = c[2];
    el("text", { x: W - m.r - 8, y: H - m.b - 8, "text-anchor": "end", class: "label-ink" }, svg).textContent = c[3];
    el("text", { x: m.l, y: H - 6 }, svg).textContent = "← plays fewer hands";
    el("text", { x: W - m.r, y: H - 6, "text-anchor": "end" }, svg).textContent = "plays more hands →";
    el("text", { x: X(0) + 6, y: m.t - 10 }, svg).textContent = "↑ more aggressive";
    const pts = [...points].sort((a, b) => (b.r || 6) - (a.r || 6)).map(p => ({ ...p, cx: X(p.x), cy: Y(p.y), r: p.r || 6 }));
    for (const p of pts) {
      el("circle", { cx: p.cx, cy: p.cy, r: p.r, fill: p.color || "var(--series-1)", "fill-opacity": 0.92, stroke: "var(--surface)", "stroke-width": 2 }, svg);
    }
    const boxes = pts.map(p => ({ x0: p.cx - p.r, x1: p.cx + p.r, y0: p.cy - p.r, y1: p.cy + p.r }));
    // keep labels off the corner captions
    boxes.push({ x0: m.l, x1: m.l + 130, y0: m.t, y1: m.t + 22 }, { x0: W - m.r - 130, x1: W - m.r, y0: m.t, y1: m.t + 22 },
      { x0: m.l, x1: m.l + 110, y0: H - m.b - 22, y1: H - m.b }, { x0: W - m.r - 130, x1: W - m.r, y0: H - m.b - 22, y1: H - m.b });
    const overlaps = b => boxes.some(q => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
    for (const p of pts) {
      const w = p.label.length * 6.6, h = 12;
      const options = [[p.cx + p.r + 4, p.cy - h / 2], [p.cx - p.r - 4 - w, p.cy - h / 2],
        [p.cx - w / 2, p.cy - p.r - 3 - h], [p.cx - w / 2, p.cy + p.r + 3]];
      for (const [x, y] of options) {
        const b = { x0: x, x1: x + w, y0: y, y1: y + h };
        if (x < m.l || x + w > W - m.r || y < m.t || y + h > H - m.b || overlaps(b)) continue;
        boxes.push(b);
        el("text", { x, y: y + h - 2, class: "label-ink" }, svg).textContent = p.label;
        break;
      }
    }
    for (const p of pts) {
      const hit = el("circle", { cx: p.cx, cy: p.cy, r: Math.max(12, p.r + 6), class: "hit" }, svg);
      hit.addEventListener("mousemove", ev => showTip(p.tip, ev));
      hit.addEventListener("mouseleave", hideTip);
      if (p.href) hit.addEventListener("click", () => { hideTip(); location.hash = p.href; });
    }
  });
}
