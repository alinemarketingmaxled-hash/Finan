// Biblioteca leve de gráficos em SVG puro (sem dependências externas).
// Segue as diretrizes: traços finos, extremidades arredondadas de 4px,
// grid recessivo, tooltip com crosshair, legenda quando houver 2+ séries,
// e um botão "ver tabela" como par de acessibilidade de cada gráfico.
(function (global) {
  const SVGNS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function h(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "style") e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(c) : c);
    });
    return e;
  }
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function niceStep(rough) {
    const pow = Math.pow(10, Math.floor(Math.log10(Math.abs(rough) || 1)));
    const n = rough / pow;
    let step;
    if (n <= 1) step = 1; else if (n <= 2) step = 2; else if (n <= 5) step = 5; else step = 10;
    return step * pow;
  }
  function niceTicks(min, max, count) {
    if (min > 0) min = 0;
    if (max < 0) max = 0;
    if (min === max) max = min + 1;
    const step = niceStep((max - min) / count);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    return { ticks, min: niceMin, max: niceMax };
  }

  function observeResize(container, draw) {
    let raf = null;
    const run = () => {
      container.innerHTML = "";
      const w = container.clientWidth || 480;
      draw(w);
    };
    run();
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    });
    ro.observe(container);
    container._maxledRO = ro;
  }

  function ensureTooltip(wrap) {
    let tt = wrap.querySelector(":scope > .viz-tooltip");
    if (!tt) { tt = h("div", { class: "viz-tooltip" }); wrap.appendChild(tt); }
    return tt;
  }
  function positionTooltip(wrap, tt, x, y) {
    const ww = wrap.clientWidth, wh = wrap.clientHeight;
    const tw = tt.offsetWidth || 150, th = tt.offsetHeight || 60;
    let left = x + 14, top = y - th - 10;
    if (left + tw > ww) left = x - tw - 14;
    if (top < 0) top = y + 14;
    tt.style.left = left + "px";
    tt.style.top = top + "px";
  }
  function ttRow(colorVar, label, value) {
    const row = h("div", { class: "tt-row" });
    const key = h("div", { class: "tt-key" });
    if (colorVar) key.appendChild(h("span", { class: "tt-swatch", style: `background:${colorVar}` }));
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    key.appendChild(labelNode);
    row.appendChild(key);
    const val = h("span", { class: "tt-value" });
    val.textContent = value;
    row.appendChild(val);
    return row;
  }

  function legend(items) {
    const wrap = h("div", { class: "viz-legend" });
    items.forEach((it) => {
      const item = h("div", { class: "lg-item" });
      item.appendChild(h("span", { class: it.line ? "lg-line" : "lg-swatch", style: `background:${it.color}` }));
      const label = document.createElement("span");
      label.textContent = it.label;
      item.appendChild(label);
      wrap.appendChild(item);
    });
    return wrap;
  }

  function tableToggleBtn(card, tableEl, svgWrap) {
    const btn = h("button", { class: "btn btn-ghost btn-sm no-print" }, ["Ver tabela"]);
    btn.addEventListener("click", () => {
      const showing = tableEl.classList.toggle("show");
      svgWrap.style.display = showing ? "none" : "";
      btn.textContent = showing ? "Ver gráfico" : "Ver tabela";
    });
    return btn;
  }

  // -------------------------------------------------------------------
  // Line / area chart — multi-series time series with crosshair tooltip.
  // opts: { xKeys, xLabelFn, series:[{key,label,color,values}], height,
  //         formatY, forecastFromIndex, toolbarTarget }
  // -------------------------------------------------------------------
  function lineArea(container, opts) {
    const height = opts.height || 260;
    const formatY = opts.formatY || Fmt.moneyCompact;
    const xLabelFn = opts.xLabelFn || ((k) => k);
    const wrap = h("div", { style: "position:relative;" });
    container.appendChild(wrap);

    observeResize(wrap, (width) => {
      const pad = { top: 14, right: 18, bottom: 26, left: 58 };
      const innerW = Math.max(10, width - pad.left - pad.right);
      const innerH = Math.max(10, height - pad.top - pad.bottom);
      const n = opts.xKeys.length;
      const allVals = opts.series.flatMap((s) => s.values.filter((v) => v !== null && v !== undefined));
      const { ticks, min, max } = niceTicks(Math.min(0, ...allVals), Math.max(0, ...allVals), 4);
      const xAt = (i) => pad.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
      const yAt = (v) => pad.top + innerH - ((v - min) / (max - min)) * innerH;

      const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });

      // gridlines + y labels
      ticks.forEach((t) => {
        const y = yAt(t);
        svg.appendChild(svgEl("line", { x1: pad.left, x2: width - pad.right, y1: y, y2: y, stroke: cssVar("--grid-line", "#2c2c2a"), "stroke-width": 1 }));
        const txt = svgEl("text", { x: pad.left - 10, y: y + 4, "text-anchor": "end", "font-size": 11, fill: cssVar("--text-muted", "#898781") });
        txt.textContent = formatY(t);
        svg.appendChild(txt);
      });
      // baseline (zero)
      const y0 = yAt(0);
      svg.appendChild(svgEl("line", { x1: pad.left, x2: width - pad.right, y1: y0, y2: y0, stroke: cssVar("--baseline", "#383835"), "stroke-width": 1 }));

      // forecast shaded region
      if (opts.forecastFromIndex !== undefined && opts.forecastFromIndex !== null && opts.forecastFromIndex < n - 0.5) {
        const fx = xAt(Math.max(0, opts.forecastFromIndex));
        const rect = svgEl("rect", { x: fx, y: pad.top, width: Math.max(0, width - pad.right - fx), height: innerH, fill: cssVar("--text-muted", "#898781"), opacity: 0.06 });
        svg.appendChild(rect);
        const label = svgEl("text", { x: width - pad.right, y: pad.top + 12, "text-anchor": "end", "font-size": 10, fill: cssVar("--text-muted", "#898781") });
        label.textContent = "PREVISÃO";
        svg.appendChild(label);
      }

      // x labels (thin out if crowded)
      const everyN = Math.ceil((n * 46) / innerW) || 1;
      for (let i = 0; i < n; i += everyN) {
        const txt = svgEl("text", { x: xAt(i), y: height - 6, "text-anchor": "middle", "font-size": 11, fill: cssVar("--text-muted", "#898781") });
        txt.textContent = xLabelFn(opts.xKeys[i]);
        svg.appendChild(txt);
      }

      // series
      opts.series.forEach((s) => {
        const pts = s.values.map((v, i) => [xAt(i), v === null || v === undefined ? null : yAt(v)]);
        const validSegs = [];
        let cur = [];
        pts.forEach((p, i) => {
          if (p[1] === null) { if (cur.length) validSegs.push(cur); cur = []; }
          else cur.push([i, p[0], p[1]]);
        });
        if (cur.length) validSegs.push(cur);

        validSegs.forEach((seg) => {
          const d = seg.map((p, idx) => `${idx === 0 ? "M" : "L"}${p[1]},${p[2]}`).join(" ");
          // area fill
          if (opts.area !== false) {
            const areaD = `${d} L${seg[seg.length - 1][1]},${y0} L${seg[0][1]},${y0} Z`;
            svg.appendChild(svgEl("path", { d: areaD, fill: s.color, opacity: 0.1 }));
          }
          const solidUntil = opts.forecastFromIndex ?? Infinity;
          const solidSeg = seg.filter((p) => p[0] <= solidUntil);
          const dashSeg = seg.filter((p) => p[0] >= solidUntil);
          if (solidSeg.length > 1) {
            const sd = solidSeg.map((p, idx) => `${idx === 0 ? "M" : "L"}${p[1]},${p[2]}`).join(" ");
            svg.appendChild(svgEl("path", { d: sd, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
          }
          if (dashSeg.length > 1) {
            const dd = dashSeg.map((p, idx) => `${idx === 0 ? "M" : "L"}${p[1]},${p[2]}`).join(" ");
            svg.appendChild(svgEl("path", { d: dd, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-dasharray": "5 4", "stroke-linecap": "round", opacity: 0.85 }));
          }
        });

        // end marker
        const lastValid = pts.filter((p) => p[1] !== null).pop();
        if (lastValid) {
          svg.appendChild(svgEl("circle", { cx: lastValid[0], cy: lastValid[1], r: 4, fill: s.color, stroke: cssVar("--surface", "#1a1a19"), "stroke-width": 2 }));
        }
      });

      wrap.appendChild(svg);

      // crosshair + tooltip
      const hit = svgEl("rect", { x: pad.left, y: pad.top, width: innerW, height: innerH, fill: "transparent" });
      const cross = svgEl("line", { x1: 0, x2: 0, y1: pad.top, y2: pad.top + innerH, stroke: cssVar("--border-strong", "#444"), "stroke-width": 1, opacity: 0 });
      svg.appendChild(cross);
      svg.appendChild(hit);
      const tt = ensureTooltip(wrap);
      hit.addEventListener("pointermove", (ev) => {
        const rect = wrap.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        let idx = Math.round(((mx - pad.left) / innerW) * (n - 1));
        idx = Math.max(0, Math.min(n - 1, idx));
        const cx = xAt(idx);
        cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("opacity", 1);
        tt.innerHTML = "";
        tt.appendChild(h("div", { class: "tt-title" }, [xLabelFn(opts.xKeys[idx])]));
        opts.series.forEach((s) => {
          const v = s.values[idx];
          if (v === null || v === undefined) return;
          tt.appendChild(ttRow(s.color, s.label, formatY(v)));
        });
        tt.classList.add("show");
        positionTooltip(wrap, tt, cx, pad.top + innerH / 2);
      });
      hit.addEventListener("pointerleave", () => { tt.classList.remove("show"); cross.setAttribute("opacity", 0); });
    });

    if (opts.series.length >= 2) {
      container.appendChild(legend(opts.series.map((s) => ({ color: s.color, label: s.label, line: true }))));
    }
    return wrap;
  }

  // -------------------------------------------------------------------
  // Diverging bar chart — one value per period, colored by sign.
  // opts: { xKeys, xLabelFn, values, height, formatY, forecastFromIndex, posColor, negColor }
  // -------------------------------------------------------------------
  function divergingBar(container, opts) {
    const height = opts.height || 220;
    const formatY = opts.formatY || Fmt.moneyCompact;
    const xLabelFn = opts.xLabelFn || ((k) => k);
    const posColor = opts.posColor || cssVar("--good", "#0ca30c");
    const negColor = opts.negColor || cssVar("--critical", "#e66767");
    const wrap = h("div", { style: "position:relative;" });
    container.appendChild(wrap);

    observeResize(wrap, (width) => {
      const pad = { top: 14, right: 14, bottom: 26, left: 58 };
      const innerW = Math.max(10, width - pad.left - pad.right);
      const innerH = Math.max(10, height - pad.top - pad.bottom);
      const n = opts.values.length;
      const { ticks, min, max } = niceTicks(Math.min(0, ...opts.values), Math.max(0, ...opts.values), 4);
      const yAt = (v) => pad.top + innerH - ((v - min) / (max - min)) * innerH;
      const y0 = yAt(0);
      const slot = innerW / n;
      const barW = Math.min(24, slot * 0.55);

      const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}` });
      ticks.forEach((t) => {
        const y = yAt(t);
        svg.appendChild(svgEl("line", { x1: pad.left, x2: width - pad.right, y1: y, y2: y, stroke: cssVar("--grid-line", "#2c2c2a"), "stroke-width": 1 }));
        const txt = svgEl("text", { x: pad.left - 10, y: y + 4, "text-anchor": "end", "font-size": 11, fill: cssVar("--text-muted", "#898781") });
        txt.textContent = formatY(t);
        svg.appendChild(txt);
      });

      const everyN = Math.ceil((n * 46) / innerW) || 1;
      const bars = [];
      opts.values.forEach((v, i) => {
        const cx = pad.left + slot * i + slot / 2;
        const isForecast = opts.forecastFromIndex !== undefined && opts.forecastFromIndex !== null && i >= opts.forecastFromIndex;
        const color = v >= 0 ? posColor : negColor;
        const yTop = Math.min(y0, yAt(v));
        const h_ = Math.max(1, Math.abs(yAt(v) - y0));
        const rect = svgEl("rect", {
          x: cx - barW / 2, y: yTop, width: barW, height: h_, rx: 4, ry: 4,
          fill: color, opacity: isForecast ? 0.45 : 1,
        });
        svg.appendChild(rect);
        bars.push({ rect, i, v, cx });
        if (i % everyN === 0) {
          const txt = svgEl("text", { x: cx, y: height - 6, "text-anchor": "middle", "font-size": 11, fill: cssVar("--text-muted", "#898781") });
          txt.textContent = xLabelFn(opts.xKeys[i]);
          svg.appendChild(txt);
        }
      });
      svg.appendChild(svgEl("line", { x1: pad.left, x2: width - pad.right, y1: y0, y2: y0, stroke: cssVar("--baseline", "#383835"), "stroke-width": 1 }));
      wrap.appendChild(svg);

      const tt = ensureTooltip(wrap);
      bars.forEach(({ rect, i, v, cx }) => {
        rect.addEventListener("pointerenter", () => {
          rect.setAttribute("opacity", 1);
          tt.innerHTML = "";
          tt.appendChild(h("div", { class: "tt-title" }, [xLabelFn(opts.xKeys[i])]));
          tt.appendChild(ttRow(v >= 0 ? posColor : negColor, "Resultado", formatY(v)));
          tt.classList.add("show");
          positionTooltip(wrap, tt, cx, yAt(v));
        });
        rect.addEventListener("pointerleave", () => {
          const isForecast = opts.forecastFromIndex !== undefined && opts.forecastFromIndex !== null && i >= opts.forecastFromIndex;
          rect.setAttribute("opacity", isForecast ? 0.45 : 1);
          tt.classList.remove("show");
        });
      });
    });
    return wrap;
  }

  // -------------------------------------------------------------------
  // Ranked horizontal bar list (HTML/CSS) — for category/counterparty rankings.
  // opts: { items:[{label,value,color,sub}], formatValue, max }
  // -------------------------------------------------------------------
  function barListRanked(container, opts) {
    const items = opts.items.slice(0, opts.max || items_length(opts));
    const maxVal = Math.max(1, ...items.map((it) => Math.abs(it.value)));
    const formatValue = opts.formatValue || Fmt.money;
    const list = h("div", { style: "display:flex;flex-direction:column;gap:10px;" });
    items.forEach((it) => {
      const pctW = Math.max(2, (Math.abs(it.value) / maxVal) * 100);
      const row = h("div", {});
      const top = h("div", { style: "display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:4px;" });
      const labelWrap = h("div", { style: "display:flex;align-items:center;gap:7px;min-width:0;" });
      labelWrap.appendChild(h("span", { style: `width:8px;height:8px;border-radius:2px;background:${it.color};flex:none;` }));
      const labelText = h("span", { style: "font-size:12.5px;color:var(--text-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" });
      labelText.textContent = it.label;
      labelWrap.appendChild(labelText);
      top.appendChild(labelWrap);
      const val = h("span", { class: "tabular", style: "font-size:12.5px;font-weight:700;color:var(--text-secondary);flex:none;" });
      val.textContent = formatValue(it.value);
      top.appendChild(val);
      row.appendChild(top);
      const track = h("div", { class: "meter-track" });
      const fill = h("div", { class: "meter-fill", style: `width:${pctW}%;background:${it.color};` });
      track.appendChild(fill);
      row.appendChild(track);
      if (it.sub) {
        const sub = h("div", { style: "font-size:11px;color:var(--text-muted);margin-top:3px;" });
        sub.textContent = it.sub;
        row.appendChild(sub);
      }
      list.appendChild(row);
    });
    container.appendChild(list);
  }
  function items_length(opts) { return opts.items.length; }

  // -------------------------------------------------------------------
  // Stacked share bar — single horizontal bar split into segments (part-to-whole).
  // opts: { items:[{label,value,color}], formatValue }
  // -------------------------------------------------------------------
  function stackedShareBar(container, opts) {
    const total = opts.items.reduce((s, it) => s + Math.max(0, it.value), 0) || 1;
    const formatValue = opts.formatValue || Fmt.money;
    const bar = h("div", { style: "display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--surface-3);gap:2px;" });
    opts.items.forEach((it) => {
      const w = (Math.max(0, it.value) / total) * 100;
      if (w <= 0) return;
      bar.appendChild(h("div", { style: `width:${w}%;background:${it.color};` }));
    });
    container.appendChild(bar);
    const leg = h("div", { style: "display:flex;flex-wrap:wrap;gap:14px 18px;margin-top:12px;" });
    opts.items.forEach((it) => {
      const row = h("div", { style: "display:flex;align-items:center;gap:7px;" });
      row.appendChild(h("span", { style: `width:9px;height:9px;border-radius:3px;background:${it.color};flex:none;` }));
      const txt = h("div", {});
      const l1 = h("div", { style: "font-size:12px;font-weight:600;color:var(--text-primary);" });
      l1.textContent = it.label;
      const l2 = h("div", { class: "tabular", style: "font-size:11.5px;color:var(--text-muted);" });
      l2.textContent = `${formatValue(it.value)} · ${((Math.max(0, it.value) / total) * 100).toFixed(1).replace(".", ",")}%`;
      txt.appendChild(l1); txt.appendChild(l2);
      row.appendChild(txt);
      leg.appendChild(row);
    });
    container.appendChild(leg);
  }

  // -------------------------------------------------------------------
  // Sparkline — tiny inline trend for stat tiles.
  // -------------------------------------------------------------------
  function sparkline(container, opts) {
    const width = opts.width || 100, height = opts.height || 30;
    const values = opts.values.filter((v) => v !== null && v !== undefined);
    if (values.length < 2) return;
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const n = opts.values.length;
    const pts = opts.values.map((v, i) => [
      (width * i) / (n - 1),
      height - 3 - ((v - min) / span) * (height - 6),
    ]);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "spark" });
    svg.appendChild(svgEl("path", { d, fill: "none", stroke: cssVar("--text-muted", "#898781"), "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.6 }));
    const last = pts[pts.length - 1];
    svg.appendChild(svgEl("circle", { cx: last[0], cy: last[1], r: 2.5, fill: opts.color || cssVar("--accent", "#f2a93c") }));
    container.appendChild(svg);
  }

  // -------------------------------------------------------------------
  // Gauge — semicircular score meter (0-100).
  // -------------------------------------------------------------------
  function gauge(container, opts) {
    const score = Math.max(0, Math.min(100, opts.value));
    const size = opts.size || 200;
    const cx = size / 2, cy = size / 2 + 6, r = size / 2 - 18;
    const color = score >= 70 ? cssVar("--good", "#0ca30c") : score >= 40 ? cssVar("--warning", "#fab219") : cssVar("--critical", "#e66767");
    const svg = svgEl("svg", { width: size, height: size / 2 + 40, viewBox: `0 0 ${size} ${size / 2 + 40}` });
    const arcPath = (r0) => `M ${cx - r0} ${cy} A ${r0} ${r0} 0 0 1 ${cx + r0} ${cy}`;
    const track = svgEl("path", { d: arcPath(r), fill: "none", stroke: cssVar("--surface-3", "#262825"), "stroke-width": 14, "stroke-linecap": "round" });
    svg.appendChild(track);
    const fg = svgEl("path", { d: arcPath(r), fill: "none", stroke: color, "stroke-width": 14, "stroke-linecap": "round", "path-length": 100, "stroke-dasharray": `${score} 100` });
    svg.appendChild(fg);
    const label = svgEl("text", { x: cx, y: cy - r / 2, "text-anchor": "middle", "font-size": 30, "font-weight": 700, fill: cssVar("--text-primary", "#fff") });
    label.textContent = Math.round(score);
    svg.appendChild(label);
    const sub = svgEl("text", { x: cx, y: cy - r / 2 + 20, "text-anchor": "middle", "font-size": 11.5, fill: cssVar("--text-muted", "#898781") });
    sub.textContent = "/ 100";
    svg.appendChild(sub);
    container.appendChild(svg);
  }

  global.Charts = {
    lineArea, divergingBar, barListRanked, stackedShareBar, sparkline, gauge,
    legend, tableToggleBtn, cssVar, niceTicks, observeResize,
  };
})(window);
