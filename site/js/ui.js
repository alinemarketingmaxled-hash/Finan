// Componentes de UI compartilhados entre as views.
(function (global) {
  function h(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "style") e.style.cssText = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(c) : c);
    });
    return e;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  const DIVISION_LABEL = () => MAXLED_DATA.meta.division_labels;

  function badgeDivision(division) {
    const label = DIVISION_LABEL()[division] || division;
    return h("span", { class: `badge badge-division-${division}` }, [label]);
  }

  function badge(text, kind) {
    return h("span", { class: `badge badge-${kind || "muted"}` }, [text]);
  }

  function card(children, opts) {
    opts = opts || {};
    const c = h("div", { class: "card" + (opts.class ? " " + opts.class : "") }, []);
    if (opts.title) {
      const head = h("div", { class: "card-head" }, [
        h("div", {}, [
          h("div", { class: "card-title" }, [opts.title]),
          opts.subtitle ? h("div", { class: "card-subtitle", style: "margin-bottom:0;" }, [opts.subtitle]) : null,
        ]),
        opts.actions ? h("div", { style: "display:flex;gap:6px;" }, opts.actions) : null,
      ]);
      c.appendChild(head);
    }
    (Array.isArray(children) ? children : [children]).forEach((ch) => ch && c.appendChild(ch));
    return c;
  }

  function sectionTitle(text, desc) {
    const wrap = h("div", {}, [h("div", { class: "section-title" }, [text])]);
    if (desc) wrap.appendChild(h("div", { class: "section-desc" }, [desc]));
    return wrap;
  }

  function emptyState(opts) {
    return h("div", { class: "empty-state" }, [
      opts.icon ? Icon(opts.icon, { size: 34 }) : null,
      h("strong", {}, [opts.title]),
      opts.body ? h("span", {}, [opts.body]) : null,
      opts.action || null,
    ]);
  }

  function deltaEl(delta, opts) {
    opts = opts || {};
    if (delta === null || delta === undefined || !isFinite(delta)) return h("span", { class: "stat-delta flat" }, ["— vs período anterior"]);
    const goodDirection = opts.invert ? delta <= 0 : delta >= 0;
    const cls = Math.abs(delta) < 0.001 ? "flat" : goodDirection ? "up" : "down";
    const arrow = delta >= 0 ? "arrowUp" : "arrowDown";
    const span = h("span", { class: `stat-delta ${cls}` }, [
      Math.abs(delta) < 0.001 ? null : Icon(arrow, { size: 12 }),
      document.createTextNode(`${Fmt.pct(Math.abs(delta))} vs ${opts.label || "mês anterior"}`),
    ]);
    return span;
  }

  function statTile(opts) {
    const tile = h("div", { class: "card stat-tile" }, [
      h("div", { class: "stat-label" }, [opts.label]),
      h("div", { class: "stat-row" }, [
        h("div", { class: "stat-value tabular" }, [opts.value]),
      ]),
      opts.delta !== undefined ? deltaEl(opts.delta, opts.deltaOpts) : null,
      opts.foot ? h("div", { class: "stat-foot" }, [opts.foot]) : null,
    ]);
    if (opts.sparkValues && opts.sparkValues.length > 1) {
      const sparkWrap = h("div", { class: "spark" });
      tile.appendChild(sparkWrap);
      Charts.sparkline(sparkWrap, { values: opts.sparkValues, width: 160, height: 32, color: opts.sparkColor });
    }
    return tile;
  }

  function insightCard(insight) {
    const el = h("div", { class: `insight ${insight.level}` }, [
      h("div", { class: "insight-icon" }, [Icon(insight.icon || "info", { size: 17 })]),
      h("div", {}, [
        h("div", { class: "insight-title" }, [insight.title]),
        h("div", { class: "insight-body" }),
      ]),
    ]);
    // body pode conter <b> para destacar números já formatados por nós (Fmt.*):
    // seguro por construção — nunca interpolamos texto vindo do usuário sem
    // passar por Fmt.esc/textContent antes.
    el.querySelector(".insight-body").innerHTML = insight.body;
    return el;
  }

  function table(opts) {
    const wrap = h("div", { class: "table-wrap" });
    const t = h("table", { class: "data-table" });
    const thead = h("thead", {}, [h("tr", {}, opts.columns.map((c) =>
      h("th", { class: c.align === "right" ? "num" : "" }, [c.label])))]);
    t.appendChild(thead);
    const tbody = h("tbody");
    if (!opts.rows.length) {
      const tr = h("tr");
      const td = h("td", { colspan: opts.columns.length, style: "text-align:center;color:var(--text-muted);padding:24px;" }, [opts.emptyText || "Sem dados para esse filtro."]);
      tr.appendChild(td); tbody.appendChild(tr);
    } else {
      opts.rows.forEach((row) => {
        const tr = h("tr");
        opts.columns.forEach((c) => {
          const td = h("td", { class: (c.align === "right" ? "num" : "") + (c.wrap ? " wrap" : "") });
          const val = c.render ? c.render(row) : row[c.key];
          if (val instanceof Node) td.appendChild(val);
          else td.textContent = val === null || val === undefined ? "—" : val;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  function monthOptions(withAccum) {
    const opts = AppState.detailedMonths.map((m) => ({ value: m, label: Fmt.monthLabel(m, "full") }));
    if (withAccum !== false) opts.push({ value: "acum", label: `Acumulado (${Fmt.monthLabel(AppState.detailedMonths[0])}–${Fmt.monthLabel(AppState.detailedMonths[AppState.detailedMonths.length - 1])})` });
    return opts;
  }

  function select(opts, current, onChange) {
    const sel = h("select", {});
    opts.forEach((o) => {
      const optEl = h("option", { value: o.value }, [o.label]);
      if (o.value === current) optEl.setAttribute("selected", "selected");
      sel.appendChild(optEl);
    });
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  }

  function segmented(opts, current, onChange) {
    const wrap = h("div", { class: "segmented" });
    opts.forEach((o) => {
      const btn = h("button", { class: o.value === current ? "active" : "" }, [o.label]);
      btn.addEventListener("click", () => onChange(o.value));
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function filterBar(container, opts) {
    opts = opts || {};
    const st = AppState.get();
    const row = h("div", { class: "filter-row" }, []);
    if (opts.showDivision !== false) {
      row.appendChild(segmented([
        { value: "consolidado", label: "Consolidado" },
        { value: "iluminacao", label: "Iluminação" },
        { value: "importacao", label: "Importação" },
      ], st.division, (v) => AppState.set({ division: v })));
    }

    if (opts.showMonth !== false) {
      row.appendChild(select(monthOptions(), st.month, (v) => AppState.set({ month: v })));
    }
    if (opts.showBasis) {
      row.appendChild(segmented([
        { value: "financeiro", label: "Financeiro (caixa)" },
        { value: "nfe", label: "Nota Fiscal" },
      ], st.basis, (v) => AppState.set({ basis: v })));
    }
    row.appendChild(h("div", { class: "spacer" }));
    if (opts.extra) opts.extra.forEach((n) => row.appendChild(n));
    container.appendChild(row);
    return row;
  }

  // ---------------- Toast ----------------
  function toast(message, kind) {
    const wrap = document.querySelector('[data-role="toasts"]');
    const t = h("div", { class: "toast" }, [message]);
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ---------------- Modal ----------------
  const openModals = [];
  function closeAllModals() { openModals.slice().forEach((m) => m.close()); }

  function modal(opts) {
    const backdrop = h("div", { class: "modal-backdrop" });
    const box = h("div", { class: "modal" }, [
      h("div", { class: "modal-head" }, [
        h("h3", {}, [opts.title]),
        h("button", { class: "icon-btn", onclick: () => close() }, [Icon("x", { size: 15 })]),
      ]),
    ]);
    const body = h("div", { class: "modal-body" });
    (opts.body || []).forEach((n) => body.appendChild(n));
    box.appendChild(body);
    if (opts.footer && opts.footer.length) {
      const foot = h("div", { class: "modal-foot" });
      opts.footer.forEach((n) => foot.appendChild(n));
      box.appendChild(foot);
    }
    backdrop.appendChild(box);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    const handle = { close, body, el: backdrop };
    function close() {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
      const i = openModals.indexOf(handle);
      if (i >= 0) openModals.splice(i, 1);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(backdrop);
    openModals.push(handle);
    return handle;
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      const cancelBtn = h("button", { class: "btn" }, ["Cancelar"]);
      const okBtn = h("button", { class: "btn btn-accent" }, ["Confirmar"]);
      const m = modal({
        title: "Confirmar ação",
        body: [h("p", { style: "font-size:13.5px;color:var(--text-secondary);" }, [message])],
        footer: [cancelBtn, okBtn],
      });
      cancelBtn.addEventListener("click", () => { m.close(); resolve(false); });
      okBtn.addEventListener("click", () => { m.close(); resolve(true); });
    });
  }

  function field(labelText, inputEl) {
    return h("div", { class: "field" }, [h("label", {}, [labelText]), inputEl]);
  }

  // Chart card com par de acessibilidade "Ver tabela" (troca o gráfico pela
  // tabela de dados equivalente, sem exigir nada do chamador além das linhas).
  function chartCardWithTable(opts) {
    const svgWrap = h("div", {});
    const tableWrap = h("div", { class: "table-view" }, [table({ columns: opts.columns, rows: opts.rows })]);
    const toggleBtn = h("button", { class: "btn btn-ghost btn-sm no-print" }, ["Ver tabela"]);
    toggleBtn.addEventListener("click", () => {
      const showing = tableWrap.classList.toggle("show");
      svgWrap.style.display = showing ? "none" : "";
      toggleBtn.textContent = showing ? "Ver gráfico" : "Ver tabela";
    });
    const head = h("div", { class: "card-head" }, [
      h("div", {}, [h("div", { class: "card-title" }, [opts.title]), opts.subtitle ? h("div", { class: "card-subtitle", style: "margin-bottom:0;" }, [opts.subtitle]) : null]),
      toggleBtn,
    ]);
    const card = h("div", { class: "card chart-card" }, [head, svgWrap, tableWrap]);
    opts.draw(svgWrap);
    return card;
  }

  global.UI = {
    chartCardWithTable,
    h, clear, badgeDivision, badge, card, sectionTitle, emptyState, deltaEl, statTile,
    insightCard, table, monthOptions, select, segmented, filterBar, toast, modal,
    confirmDialog, field, closeAllModals, divisionLabel: (d) => DIVISION_LABEL()[d] || d,
  };
})(window);
