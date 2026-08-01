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
    const opts = { division: st.division, basis: st.basis, includeCancelled: true };
    if (st.month !== "acum") opts.month = st.month;
    if (local.flow) opts.flow = local.flow;
    if (local.category) opts.category = local.category;
    if (local.search) opts.search = local.search;
    const rows = Compute.filterTx(opts).slice().sort((a, b) => b.date.localeCompare(a.date));

    const total = rows.filter((r) => !r.cancelled).reduce((s, r) => s + (["entrada", "venda"].includes(r.flow) ? r.value : -r.value), 0);
    const nCancelled = rows.filter((r) => r.cancelled).length;
    const summary = UI.h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;" }, [
      UI.h("div", { style: "font-size:12.5px;color:var(--text-secondary);" }, [
        `${Fmt.num(rows.length)} lançamento(s)`, nCancelled ? ` (${nCancelled} cancelado(s))` : "", ` · saldo líquido `,
        UI.h("b", { class: "tabular" }, [Fmt.money(total)]),
      ]),
    ]);

    const pageCount = Math.max(1, Math.ceil(rows.length / local.pageSize));
    local.page = Math.min(local.page, pageCount - 1);
    const pageRows = rows.slice(local.page * local.pageSize, (local.page + 1) * local.pageSize);

    let selfRefresh = () => {};
    const tableEl = UI.table({
      columns: [
        { key: "date", label: "Data", render: (r) => Fmt.dateBR(r.date) },
        { key: "division", label: "Divisão", render: (r) => UI.badgeDivision(r.division) },
        { key: "flow", label: "Tipo", render: (r) => flowCell(r) },
        { key: "category", label: "Categoria", wrap: true, render: (r) => categoriaCell(r) },
        { key: "nota_fiscal", label: "Nota Fiscal", render: (r) => r.nota_fiscal || "—" },
        { key: "counterparty", label: "Contraparte / Cliente", wrap: true },
        { key: "value", label: "Valor", align: "right", render: (r) => Fmt.money(r.value) },
        { key: "origem", label: "Origem", render: (r) => origemBadge(r) },
        { key: "actions", label: "", render: (r) => actionsCell(r, () => selfRefresh()) },
      ],
      rows: pageRows,
      rowAttrs: (r) => (r.cancelled ? { style: "opacity:.5;" } : null),
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

  function categoriaCell(r) {
    if (r.flow === "entrada" || r.flow === "venda") {
      const cat = Compute.clienteCategoria(r.counterparty);
      return cat ? UI.badge(Fmt.titleCase(cat), "muted") : "—";
    }
    return r.category ? Fmt.titleCase(r.category) : "—";
  }

  function flowCell(r) {
    const children = [flowBadge(r.flow)];
    if (r.cancelled) children.push(UI.badge("Cancelado", "critical"));
    return UI.h("div", { style: "display:flex;gap:4px;align-items:center;flex-wrap:wrap;" }, children);
  }

  function actionsCell(r, onDone) {
    const wrap = UI.h("div", { style: "display:flex;gap:5px;justify-content:flex-end;" }, [
      editBtn(r, onDone), cancelToggleBtn(r, onDone),
    ]);
    if (r.manual) wrap.appendChild(removeBtn(r, onDone));
    return wrap;
  }

  function editBtn(row, onDone) {
    const btn = UI.h("button", { class: "icon-btn no-print", title: "Editar lançamento" }, [Icon("edit", { size: 13 })]);
    btn.addEventListener("click", () => openLancamentoModal(row, onDone));
    return btn;
  }

  function cancelToggleBtn(row, onDone) {
    const cancelled = !!row.cancelled;
    const btn = UI.h("button", { class: "icon-btn no-print", title: cancelled ? "Reativar lançamento" : "Cancelar lançamento" }, [
      Icon(cancelled ? "checkCircle" : "x", { size: 13 }),
    ]);
    btn.addEventListener("click", async () => {
      const msg = cancelled
        ? "Reativar este lançamento? Ele volta a contar nos totais, DRE e relatórios."
        : "Cancelar este lançamento? Ele continua aparecendo aqui pra registro, mas deixa de contar nos totais, DRE e relatórios — como uma nota cancelada.";
      const ok = await UI.confirmDialog(msg);
      if (!ok) return;
      if (row.manual) Storage.updateLancamento(row.id, { cancelled: !cancelled });
      else Storage.setOverride(row.id, { cancelled: !cancelled });
      UI.toast(cancelled ? "Lançamento reativado." : "Lançamento cancelado.");
      onDone();
    });
    return btn;
  }

  function removeBtn(row, onDone) {
    const btn = UI.h("button", { class: "icon-btn no-print", title: "Remover lançamento (permanente)" }, [Icon("trash", { size: 13 })]);
    btn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog("Remover este lançamento definitivamente? Essa ação não pode ser desfeita (diferente de cancelar).");
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
    const input = UI.h("input", { class: "input", placeholder: "Buscar contraparte, categoria ou nota fiscal…" });
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
    const classifyBox = UI.h("div", { style: "display:none;flex-direction:column;gap:10px;" });
    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const confirmBtn = UI.h("button", { class: "btn btn-accent" }, ["Confirmar importação"]);
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = ".5";

    let parsed = null;
    const classifySelects = []; // [{ raw, select }]
    const m = UI.modal({
      title: "Importar planilha Excel",
      body: [
        UI.field("Arquivo", fileInput),
        summaryBox,
        classifyBox,
      ],
      footer: [cancelBtn, confirmBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      UI.clear(summaryBox);
      UI.clear(classifyBox);
      classifyBox.style.display = "none";
      classifySelects.length = 0;
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

        const { categories, weirdNotas } = ExcelImport.analyzeUnknowns(toAdd);
        if (categories.length) {
          classifyBox.style.display = "flex";
          classifyBox.appendChild(UI.h("div", { class: "insight warning" }, [
            UI.h("div", { class: "insight-icon" }, [Icon("alertTriangle", { size: 17 })]),
            UI.h("div", {}, [
              UI.h("div", { class: "insight-title" }, [`${categories.length} categoria(s) não reconhecida(s)`]),
              UI.h("div", { class: "insight-body" }, ["A planilha trouxe um texto de categoria que eu não conheço. Escolha o grupo certo pra cada uma — eu lembro da escolha pras próximas importações."]),
            ]),
          ]));
          categories.forEach((c) => {
            const sel = UI.h("select", {}, Categories.list.map((cat) => UI.h("option", { value: cat }, [Fmt.titleCase(cat)])));
            sel.value = "OUTRAS DESPESAS";
            classifySelects.push({ raw: c.categoria, select: sel });
            classifyBox.appendChild(UI.h("div", { class: "field-row", style: "align-items:end;" }, [
              UI.field(`"${Fmt.titleCase(c.categoria)}" (${c.count}x · ${Fmt.money(c.sum)})`, sel),
            ]));
          });
        }
        if (weirdNotas > 0) {
          classifyBox.style.display = "flex";
          classifyBox.appendChild(UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);" }, [
            `${Fmt.num(weirdNotas)} lançamento(s) com nota fiscal em formato não numérico (ex: "SNF", "DEVOLUÇÃO") — vão ser importados como estão. Revise depois na tela de Lançamentos se precisar.`,
          ]));
        }

        if (toAdd.length > 0) { confirmBtn.disabled = false; confirmBtn.style.opacity = "1"; }
      } catch (e) {
        UI.clear(summaryBox);
        summaryBox.appendChild(UI.h("span", { style: "color:var(--critical-text);" }, ["Não consegui ler esse arquivo. Confirme que é um .xlsx válido."]));
      }
    });

    confirmBtn.addEventListener("click", () => {
      if (!parsed || !parsed.length) return;
      if (classifySelects.length) {
        const mapping = {};
        classifySelects.forEach(({ raw, select }) => { mapping[raw] = select.value; });
        parsed = ExcelImport.applyCategoriaClassification(parsed, mapping);
      }
      Storage.addLancamentosBulk(parsed, "import");
      UI.toast(`${Fmt.num(parsed.length)} lançamento(s) importado(s).`);
      m.close();
      AppState.set({});
    });
  }

  function clientCategoryOptions() {
    const used = Object.values(Storage.getClienteCategorias());
    const all = Array.from(new Set(Categories.clientList.concat(used)));
    return all.map((c) => UI.h("option", { value: c }, []));
  }

  // existing: linha da tabela (base Excel, importada ou manual) quando em modo de edição.
  // onSaved: chamado após salvar — se vier, faz só um refresh local (tabela); senão, AppState.set({}).
  function openLancamentoModal(existing, onSaved) {
    const st = AppState.get();
    const isEdit = !!existing;
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
    const cpInput = UI.h("input", { class: "input", placeholder: "Ex: Fornecedor XPTO, Cliente ABC…" });
    const valueInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const noteInput = UI.h("textarea", { class: "input", rows: 2, placeholder: "Observação (opcional)" });
    const notaInput = UI.h("input", { class: "input", placeholder: "Ex: 11853 (opcional)" });
    const clienteCatInput = UI.h("input", { class: "input", list: "clienteCategoriaList", placeholder: "Ex: Atacado, Distribuidor… (opcional)" });
    const clienteCatList = UI.h("datalist", { id: "clienteCategoriaList" }, clientCategoryOptions());
    const catField = UI.field("Categoria (despesa)", catSel);
    const notaField = UI.field("Nota fiscal", notaInput);
    const clienteCatField = UI.field("Categoria do cliente", UI.h("div", {}, [clienteCatInput, clienteCatList]));

    function syncFieldVisibility() {
      const isFin = basisSel.value === "financeiro";
      const isClientSide = flowSel.value === "entrada" || flowSel.value === "venda";
      catField.style.display = isFin && flowSel.value === "saida" ? "" : "none";
      clienteCatField.style.display = isClientSide ? "" : "none";
    }
    function syncFlowOptions(keepValue) {
      const isFin = basisSel.value === "financeiro";
      const prev = flowSel.value;
      UI.clear(flowSel);
      (isFin ? [["entrada", "Entrada"], ["saida", "Saída"]] : [["venda", "Venda (saída de NFe)"], ["compra", "Compra (entrada de NFe)"]])
        .forEach(([v, l]) => flowSel.appendChild(UI.h("option", { value: v }, [l])));
      if (keepValue && Array.from(flowSel.options).some((o) => o.value === keepValue)) flowSel.value = keepValue;
      else if (prev && Array.from(flowSel.options).some((o) => o.value === prev)) flowSel.value = prev;
      syncFieldVisibility();
    }
    basisSel.addEventListener("change", () => syncFlowOptions());
    flowSel.addEventListener("change", syncFieldVisibility);
    cpInput.addEventListener("blur", () => {
      const isClientSide = flowSel.value === "entrada" || flowSel.value === "venda";
      if (isClientSide && !clienteCatInput.value.trim()) {
        clienteCatInput.value = Compute.clienteCategoria(cpInput.value.trim()) || "";
      }
    });

    if (isEdit) {
      basisSel.value = existing.basis;
      divSel.value = existing.division;
      dateInput.value = existing.date;
      cpInput.value = existing.counterparty || "";
      valueInput.value = existing.value;
      noteInput.value = existing.note || "";
      notaInput.value = existing.nota_fiscal || "";
      syncFlowOptions(existing.flow);
      if (existing.category) catSel.value = existing.category;
      if (existing.flow === "entrada" || existing.flow === "venda") {
        clienteCatInput.value = Compute.clienteCategoria(existing.counterparty) || "";
      }
    } else {
      dateInput.value = new Date().toISOString().slice(0, 10);
      divSel.value = st.division !== "consolidado" ? st.division : "iluminacao";
      syncFlowOptions();
    }

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, [isEdit ? "Salvar alterações" : "Salvar lançamento"]);
    const m = UI.modal({
      title: isEdit ? "Editar lançamento" : "Novo lançamento manual",
      body: [
        UI.h("div", { class: "field-row" }, [UI.field("Divisão", divSel), UI.field("Base", basisSel)]),
        UI.h("div", { class: "field-row" }, [UI.field("Data", dateInput), UI.field("Tipo", flowSel)]),
        catField,
        UI.field("Contraparte / cliente / fornecedor", cpInput),
        clienteCatField,
        UI.h("div", { class: "field-row" }, [UI.field("Valor (R$)", valueInput), notaField]),
        UI.field("Observação", noteInput),
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      const value = parseFloat(valueInput.value);
      if (!dateInput.value || !value || value <= 0) { UI.toast("Preencha data e um valor válido."); return; }
      const counterparty = cpInput.value.trim() || null;
      const isClientSide = flowSel.value === "entrada" || flowSel.value === "venda";
      if (isClientSide && counterparty) {
        Storage.setClienteCategoria(counterparty, clienteCatInput.value.trim().toUpperCase() || null);
      }
      const patch = {
        date: dateInput.value, division: divSel.value, basis: basisSel.value, flow: flowSel.value,
        category: (basisSel.value === "financeiro" && flowSel.value === "saida") ? catSel.value : null,
        counterparty, value, note: noteInput.value.trim(),
        nota_fiscal: notaInput.value.trim() || null,
      };
      if (isEdit) {
        if (existing.manual) Storage.updateLancamento(existing.id, patch);
        else Storage.setOverride(existing.id, patch);
        UI.toast("Lançamento atualizado.");
      } else {
        Storage.addLancamento(patch);
        UI.toast("Lançamento adicionado.");
      }
      m.close();
      if (onSaved) onSaved(); else AppState.set({});
    });
  }

  window.Views = window.Views || {};
  window.Views.lancamentos = render;
  window.Views.openLancamentoModal = openLancamentoModal;
})();
