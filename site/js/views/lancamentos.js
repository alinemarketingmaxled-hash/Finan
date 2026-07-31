(function () {
  const local = { flow: "", category: "", search: "", page: 0, pageSize: 50 };

  function render(container) {
    const st = AppState.get();
    let refresh = () => {};

    UI.filterBar(container, {
      showMonth: true, showBasis: true,
      extra: [searchBox(() => refresh()), importBtn(), addBtn()],
    });

    const flowOptions = st.basis === "financeiro"
      ? [{ value: "", label: "Todos os tipos" }, { value: "entrada", label: "Entradas" }, { value: "saida", label: "Saídas" }]
      : [{ value: "", label: "Todos os tipos" }, { value: "venda", label: "Vendas (NFe)" }, { value: "compra", label: "Compras (NFe)" }];
    if (!flowOptions.some((o) => o.value === local.flow)) local.flow = "";
    const catOptions = [{ value: "", label: "Todas as categorias" }].concat(
      Categories.list.map((c) => ({ value: c, label: Fmt.titleCase(c) }))
    );

    const secondRow = UI.h("div", { class: "filter-row" }, [
      UI.select(flowOptions, local.flow, (v) => { local.flow = v; local.page = 0; refresh(); }),
    ]);
    if (st.basis === "financeiro") {
      secondRow.appendChild(UI.select(catOptions, local.category, (v) => { local.category = v; local.page = 0; refresh(); }));
    } else {
      local.category = "";
    }
    container.appendChild(secondRow);

    const listWrap = UI.h("div", {});
    container.appendChild(listWrap);

    refresh = () => { UI.clear(listWrap); listWrap.appendChild(buildTable(st)); };
    refresh();
  }

  function buildTable(st) {
    const opts = { division: st.division, basis: st.basis };
    if (st.month !== "acum") opts.month = st.month;
    if (local.flow) opts.flow = local.flow;
    if (local.category) opts.category = local.category;
    if (local.search) opts.search = local.search;
    const rows = Compute.filterTx(opts).slice().sort((a, b) => b.date.localeCompare(a.date));

    const total = rows.reduce((s, r) => s + (["entrada", "venda"].includes(r.flow) ? r.value : -r.value), 0);
    const summary = UI.h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;" }, [
      UI.h("div", { style: "font-size:12.5px;color:var(--text-secondary);" }, [`${Fmt.num(rows.length)} lançamento(s) · saldo líquido `, UI.h("b", { class: "tabular" }, [Fmt.money(total)])]),
    ]);

    const pageCount = Math.max(1, Math.ceil(rows.length / local.pageSize));
    local.page = Math.min(local.page, pageCount - 1);
    const pageRows = rows.slice(local.page * local.pageSize, (local.page + 1) * local.pageSize);

    let selfRefresh = () => {};
    const tableEl = UI.table({
      columns: [
        { key: "date", label: "Data", render: (r) => Fmt.dateBR(r.date) },
        { key: "division", label: "Divisão", render: (r) => UI.badgeDivision(r.division) },
        { key: "flow", label: "Tipo", render: (r) => flowBadge(r.flow) },
        { key: "category", label: "Categoria", wrap: true, render: (r) => r.category ? Fmt.titleCase(r.category) : "—" },
        { key: "counterparty", label: "Contraparte / Cliente", wrap: true },
        { key: "value", label: "Valor", align: "right", render: (r) => Fmt.money(r.value) },
        { key: "origem", label: "Origem", render: (r) => origemBadge(r) },
        { key: "actions", label: "", render: (r) => r.manual ? removeBtn(r, () => selfRefresh()) : "" },
      ],
      rows: pageRows,
      emptyText: "Nenhum lançamento encontrado para esse filtro.",
    });

    const pager = UI.h("div", { style: "display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px;" }, [
      UI.h("span", { style: "font-size:12px;color:var(--text-muted);" }, [`Página ${local.page + 1} de ${pageCount}`]),
      pagerBtn("chevronLeft", local.page === 0, () => { local.page--; selfRefresh(); }),
      pagerBtn("chevronRight", local.page >= pageCount - 1, () => { local.page++; selfRefresh(); }),
    ]);

    const wrap = UI.h("div", { class: "card" }, [summary, tableEl, pager]);
    selfRefresh = () => {
      const fresh = buildTable(st);
      wrap.replaceWith(fresh);
    };
    return wrap;
  }

  function removeBtn(row, onDone) {
    const btn = UI.h("button", { class: "icon-btn no-print", title: "Remover lançamento manual" }, [Icon("trash", { size: 14 })]);
    btn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog("Remover este lançamento manual? Essa ação não afeta a planilha original.");
      if (ok) { Storage.removeLancamento(row.id); UI.toast("Lançamento removido."); onDone(); }
    });
    return btn;
  }
  function pagerBtn(icon, disabled, onClick) {
    const b = UI.h("button", { class: "icon-btn", style: disabled ? "opacity:.4;pointer-events:none;" : "" }, [Icon(icon, { size: 14 })]);
    b.addEventListener("click", onClick);
    return b;
  }
  function flowBadge(flow) {
    const map = { entrada: ["Entrada", "good"], saida: ["Saída", "critical"], venda: ["Venda", "good"], compra: ["Compra", "critical"] };
    const [label, kind] = map[flow] || [flow, "muted"];
    return UI.badge(label, kind);
  }
  function origemBadge(r) {
    if (!r.manual) return UI.badge("Excel (base)", "muted");
    if (r.origin === "import") return UI.badge("Importado", "good");
    return UI.badge("Manual", "warning");
  }

  function searchBox(onChange) {
    const wrap = UI.h("div", { class: "search-box" }, [Icon("search", { size: 15 })]);
    const input = UI.h("input", { class: "input", placeholder: "Buscar contraparte ou categoria…" });
    input.value = local.search;
    let t = null;
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => { local.search = input.value; local.page = 0; onChange(); }, 200);
    });
    wrap.appendChild(input);
    return wrap;
  }

  function addBtn() {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Novo lançamento"]);
    btn.addEventListener("click", () => openLancamentoModal());
    return btn;
  }

  function importBtn() {
    const btn = UI.h("button", { class: "btn btn-sm" }, [Icon("upload", { size: 14 }), "Importar Excel"]);
    btn.addEventListener("click", () => openImportModal());
    return btn;
  }

  function openImportModal() {
    const fileInput = UI.h("input", { type: "file", accept: ".xlsx,.xlsm" });
    const summaryBox = UI.h("div", { style: "font-size:12.5px;color:var(--text-secondary);line-height:1.6;min-height:20px;" }, [
      "Selecione o arquivo .xlsx atualizado (o mesmo formato/abas da planilha da Max Led). Vou ler tudo e adicionar só o que ainda não está aqui — nada é duplicado.",
    ]);
    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const confirmBtn = UI.h("button", { class: "btn btn-accent" }, ["Confirmar importação"]);
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = ".5";

    let parsed = null;
    const m = UI.modal({
      title: "Importar planilha Excel",
      body: [
        UI.field("Arquivo", fileInput),
        summaryBox,
      ],
      footer: [cancelBtn, confirmBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      UI.clear(summaryBox);
      summaryBox.appendChild(document.createTextNode("Lendo arquivo…"));
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = ".5";
      try {
        const buf = await file.arrayBuffer();
        const { rows, found, missingSheets } = ExcelImport.parseWorkbook(buf);
        if (!found.length) {
          UI.clear(summaryBox);
          summaryBox.appendChild(UI.h("span", { style: "color:var(--critical-text);" }, [
            "Não reconheci nenhuma aba conhecida nesse arquivo. Confirme que é a planilha da Max Led (mesma estrutura de sempre).",
          ]));
          return;
        }
        const { toAdd, duplicates } = ExcelImport.dedupe(rows);
        parsed = toAdd;
        const s = ExcelImport.summarize(toAdd);
        UI.clear(summaryBox);
        const lines = [
          `${found.length} aba(s) reconhecida(s) · ${Fmt.num(rows.length)} lançamento(s) lidos no arquivo.`,
          `${Fmt.num(toAdd.length)} são novos e serão importados · ${Fmt.num(duplicates.length)} já existiam e foram ignorados.`,
        ];
        if (s.total) lines.push(`Novos: ${Fmt.monthLabel(s.minDate.slice(0, 7))} até ${Fmt.monthLabel(s.maxDate.slice(0, 7))} · Iluminação: ${s.byDivision.iluminacao || 0} · Importação: ${s.byDivision.importacao || 0}.`);
        if (missingSheets.length) lines.push(`Abas não encontradas (ok se não usa): ${missingSheets.join(", ")}.`);
        lines.forEach((l) => summaryBox.appendChild(UI.h("div", {}, [l])));
        if (toAdd.length > 0) { confirmBtn.disabled = false; confirmBtn.style.opacity = "1"; }
      } catch (e) {
        UI.clear(summaryBox);
        summaryBox.appendChild(UI.h("span", { style: "color:var(--critical-text);" }, ["Não consegui ler esse arquivo. Confirme que é um .xlsx válido."]));
      }
    });

    confirmBtn.addEventListener("click", () => {
      if (!parsed || !parsed.length) return;
      Storage.addLancamentosBulk(parsed, "import");
      UI.toast(`${Fmt.num(parsed.length)} lançamento(s) importado(s).`);
      m.close();
      AppState.set({});
    });
  }

  function openLancamentoModal() {
    const st = AppState.get();
    const basisSel = UI.h("select", {}, [
      UI.h("option", { value: "financeiro" }, ["Financeiro (caixa)"]),
      UI.h("option", { value: "nfe" }, ["Nota Fiscal (NFe)"]),
    ]);
    const flowSel = UI.h("select", {});
    const divSel = UI.h("select", {}, [
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    const catSel = UI.h("select", {}, Categories.list.map((c) => UI.h("option", { value: c }, [Fmt.titleCase(c)])));
    const dateInput = UI.h("input", { type: "date", class: "input" });
    dateInput.value = new Date().toISOString().slice(0, 10);
    const cpInput = UI.h("input", { class: "input", placeholder: "Ex: Fornecedor XPTO, Cliente ABC…" });
    const valueInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const noteInput = UI.h("textarea", { class: "input", rows: 2, placeholder: "Observação (opcional)" });
    const catField = UI.field("Categoria (despesa)", catSel);

    function syncFlowOptions() {
      const isFin = basisSel.value === "financeiro";
      UI.clear(flowSel);
      (isFin ? [["entrada", "Entrada"], ["saida", "Saída"]] : [["venda", "Venda (saída de NFe)"], ["compra", "Compra (entrada de NFe)"]])
        .forEach(([v, l]) => flowSel.appendChild(UI.h("option", { value: v }, [l])));
      catField.style.display = isFin && flowSel.value === "saida" ? "" : "none";
    }
    basisSel.addEventListener("change", syncFlowOptions);
    flowSel.addEventListener("change", () => { catField.style.display = basisSel.value === "financeiro" && flowSel.value === "saida" ? "" : "none"; });
    syncFlowOptions();
    divSel.value = st.division !== "consolidado" ? st.division : "iluminacao";

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, ["Salvar lançamento"]);
    const m = UI.modal({
      title: "Novo lançamento manual",
      body: [
        UI.h("div", { class: "field-row" }, [UI.field("Divisão", divSel), UI.field("Base", basisSel)]),
        UI.h("div", { class: "field-row" }, [UI.field("Data", dateInput), UI.field("Tipo", flowSel)]),
        catField,
        UI.field("Contraparte / cliente / fornecedor", cpInput),
        UI.field("Valor (R$)", valueInput),
        UI.field("Observação", noteInput),
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      const value = parseFloat(valueInput.value);
      if (!dateInput.value || !value || value <= 0) { UI.toast("Preencha data e um valor válido."); return; }
      Storage.addLancamento({
        date: dateInput.value, division: divSel.value, basis: basisSel.value, flow: flowSel.value,
        category: (basisSel.value === "financeiro" && flowSel.value === "saida") ? catSel.value : null,
        counterparty: cpInput.value.trim() || null, value, note: noteInput.value.trim(),
      });
      UI.toast("Lançamento adicionado.");
      m.close();
      AppState.set({});
    });
  }

  window.Views = window.Views || {};
  window.Views.lancamentos = render;
  window.Views.openLancamentoModal = openLancamentoModal;
})();
