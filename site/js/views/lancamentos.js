(function () {
  const local = { flow: "", category: "", search: "", page: 0, pageSize: 50, onlyUncategorized: false, showClientChecklist: false, clientPage: 0 };
  const selection = new Map(); // id -> row (despesas/compras), persiste entre páginas/filtros até aplicar ou limpar
  const clientSelection = new Map(); // nome -> {nome,valor,n}, separado -- cliente é por NOME, não por lançamento
  const CLIENT_PAGE_SIZE = 30;

  function isExpenseLikeRow(r) {
    return (r.basis === "financeiro" && r.flow === "saida") || (r.basis === "nfe" && r.flow === "compra");
  }
  function isClientSideRow(r) {
    return (r.basis === "financeiro" && r.flow === "entrada") || (r.basis === "nfe" && r.flow === "venda");
  }
  // Só despesas/compras -- cliente sem categoria tem checklist próprio
  // (buildClientChecklist), já que é por NOME e não por lançamento: um
  // cliente com 50 lançamentos conta 1 vez ali, não 50.
  function needsCategoria(r) {
    if (r.cancelled) return false;
    return isExpenseLikeRow(r) && !r.category;
  }

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
    const uncatToggle = UI.h("button", {}, []);
    function syncUncatToggle() {
      const uncatCount = Compute.filterTx({ division: st.division, basis: st.basis, month: st.month !== "acum" ? st.month : undefined }).filter(needsCategoria).length;
      UI.clear(uncatToggle);
      uncatToggle.appendChild(document.createTextNode(`Só despesas sem categoria (${Fmt.num(uncatCount)})`));
      uncatToggle.className = "btn btn-sm" + (local.onlyUncategorized ? " btn-accent" : "");
    }
    syncUncatToggle();
    uncatToggle.addEventListener("click", () => { local.onlyUncategorized = !local.onlyUncategorized; local.page = 0; refresh(); syncUncatToggle(); });
    secondRow.appendChild(uncatToggle);
    container.appendChild(secondRow);

    container.appendChild(buildClientChecklist(st));

    const listWrap = UI.h("div", {});
    container.appendChild(listWrap);

    refresh = () => { UI.clear(listWrap); listWrap.appendChild(buildTable(st, syncUncatToggle)); };
    refresh();
  }

  // Clientes sem categoria de cliente (por NOME, não por lançamento) --
  // separado da tabela principal, com seleção/paginação próprias. Começa
  // recolhido: com centenas de clientes de uma vez só, mostrar tudo aberto
  // por padrão dominaria a página. Categoria de cliente não distingue
  // divisão hoje, então a lista independe do filtro de divisão da barra.
  function buildClientChecklist(st) {
    const { clientesAll } = Compute.uncategorized();
    if (!clientesAll.length) return UI.h("div", {});

    const outer = UI.h("div", { style: "margin-top:12px;" });
    let selfRefresh = () => { const fresh = buildClientChecklist(st); outer.replaceWith(fresh); };

    const toggle = UI.h("button", { class: "btn btn-sm" + (local.showClientChecklist ? " btn-accent" : "") }, [
      `${local.showClientChecklist ? "Esconder" : "Ver"} clientes sem categoria (${Fmt.num(clientesAll.length)})`,
    ]);
    toggle.addEventListener("click", () => { local.showClientChecklist = !local.showClientChecklist; local.clientPage = 0; selfRefresh(); });
    outer.appendChild(toggle);

    if (local.showClientChecklist) {
      const pageCount = Math.max(1, Math.ceil(clientesAll.length / CLIENT_PAGE_SIZE));
      local.clientPage = Math.min(local.clientPage, pageCount - 1);
      const pageRows = clientesAll.slice(local.clientPage * CLIENT_PAGE_SIZE, (local.clientPage + 1) * CLIENT_PAGE_SIZE);

      const allOnPageSelected = pageRows.length > 0 && pageRows.every((c) => clientSelection.has(c.nome));
      const headerCb = UI.h("input", { type: "checkbox", title: "Selecionar todos nesta página" });
      headerCb.checked = allOnPageSelected;
      headerCb.addEventListener("change", () => {
        if (headerCb.checked) pageRows.forEach((c) => clientSelection.set(c.nome, c));
        else pageRows.forEach((c) => clientSelection.delete(c.nome));
        selfRefresh();
      });

      const tableEl = UI.table({
        columns: [
          { key: "sel", label: headerCb, render: (c) => clientCheckbox(c, () => selfRefresh()) },
          { key: "nome", label: "Cliente", wrap: true, render: (c) => Fmt.titleCase(c.nome) },
          { key: "n", label: "Transações", align: "right" },
          { key: "valor", label: "Valor total", align: "right", render: (c) => Fmt.money(c.valor) },
        ],
        rows: pageRows,
        emptyText: "Nenhum cliente sem categoria.",
      });

      const pager = UI.h("div", { style: "display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px;" }, [
        UI.h("span", { style: "font-size:12px;color:var(--text-muted);" }, [`Página ${local.clientPage + 1} de ${pageCount}`]),
        pagerBtn("chevronLeft", local.clientPage === 0, () => { local.clientPage--; selfRefresh(); }),
        pagerBtn("chevronRight", local.clientPage >= pageCount - 1, () => { local.clientPage++; selfRefresh(); }),
      ]);

      const bulkBar = buildClientBulkBar(() => selfRefresh());
      outer.appendChild(UI.h("div", { class: "card", style: "margin-top:10px;" }, [
        UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);margin-bottom:12px;" }, [
          "Categoria de cliente vale pra todos os lançamentos daquele nome, não só um. Marque quantos quiser e aplique uma categoria pra todos de uma vez.",
        ]),
        bulkBar, tableEl, pager,
      ]));
    }

    return outer;
  }

  function clientCheckbox(c, onChange) {
    const cb = UI.h("input", { type: "checkbox" });
    cb.checked = clientSelection.has(c.nome);
    cb.addEventListener("change", () => {
      if (cb.checked) clientSelection.set(c.nome, c); else clientSelection.delete(c.nome);
      onChange();
    });
    return cb;
  }

  function buildClientBulkBar(onDone) {
    if (!clientSelection.size) return UI.h("div", {});
    const names = Array.from(clientSelection.keys());
    const inp = UI.h("input", { class: "input", list: "bulkClienteCatList2", style: "width:170px;", placeholder: "Categoria do cliente…" });
    const btn = UI.h("button", { class: "btn btn-sm btn-accent" }, ["Aplicar"]);
    btn.addEventListener("click", () => {
      const v = inp.value.trim();
      if (!v) { UI.toast("Digite uma categoria de cliente."); return; }
      names.forEach((nome) => { Storage.setClienteCategoria(nome, v.toUpperCase()); clientSelection.delete(nome); });
      UI.toast(`${Fmt.num(names.length)} cliente(s) classificado(s) como ${Fmt.titleCase(v)}.`);
      onDone();
    });
    const clearBtn = UI.h("button", { class: "btn btn-sm" }, ["Limpar seleção"]);
    clearBtn.addEventListener("click", () => { clientSelection.clear(); onDone(); });
    return UI.h("div", { style: "display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--surface-3);border-radius:10px;padding:10px 14px;margin-bottom:12px;" }, [
      UI.h("div", { style: "font-weight:700;font-size:12.5px;" }, [`${Fmt.num(names.length)} cliente(s) selecionado(s)`]),
      UI.h("div", { style: "display:flex;gap:6px;align-items:center;" }, [inp, UI.h("datalist", { id: "bulkClienteCatList2" }, clientCategoryOptions()), btn]),
      clearBtn,
    ]);
  }

  function buildTable(st, onDataChanged) {
    const opts = { division: st.division, basis: st.basis, includeCancelled: true };
    if (st.month !== "acum") opts.month = st.month;
    if (local.flow) opts.flow = local.flow;
    if (local.category) opts.category = local.category;
    if (local.search) opts.search = local.search;
    let rows = Compute.filterTx(opts).slice().sort((a, b) => b.date.localeCompare(a.date));
    if (local.onlyUncategorized) rows = rows.filter(needsCategoria);

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

    const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selection.has(r.id));
    const headerCb = UI.h("input", { type: "checkbox", title: "Selecionar todos nesta página" });
    headerCb.checked = allOnPageSelected;
    headerCb.addEventListener("change", () => {
      if (headerCb.checked) pageRows.forEach((r) => selection.set(r.id, r));
      else pageRows.forEach((r) => selection.delete(r.id));
      selfRefresh();
    });

    const tableEl = UI.table({
      columns: [
        { key: "sel", label: headerCb, render: (r) => rowCheckbox(r, () => selfRefresh()) },
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
      emptyText: local.onlyUncategorized ? "Nenhum lançamento sem categoria nesse filtro — tudo classificado por aqui." : "Nenhum lançamento encontrado para esse filtro.",
    });

    const pager = UI.h("div", { style: "display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px;" }, [
      UI.h("span", { style: "font-size:12px;color:var(--text-muted);" }, [`Página ${local.page + 1} de ${pageCount}`]),
      pagerBtn("chevronLeft", local.page === 0, () => { local.page--; selfRefresh(); }),
      pagerBtn("chevronRight", local.page >= pageCount - 1, () => { local.page++; selfRefresh(); }),
    ]);

    const bulkBar = buildBulkBar(() => selfRefresh());
    const wrap = UI.h("div", { class: "card" }, [summary, bulkBar, tableEl, pager]);
    selfRefresh = () => {
      const fresh = buildTable(st, onDataChanged);
      wrap.replaceWith(fresh);
      if (onDataChanged) onDataChanged();
    };
    return wrap;
  }

  function rowCheckbox(r, onChange) {
    const cb = UI.h("input", { type: "checkbox" });
    cb.checked = selection.has(r.id);
    cb.addEventListener("change", () => {
      if (cb.checked) selection.set(r.id, r); else selection.delete(r.id);
      onChange();
    });
    return cb;
  }

  // Barra de ação em lote: some sozinha quando não há seleção. Mostra o
  // controle certo pra cada tipo de linha selecionada (despesa/compra usa
  // categoria fixa; entrada/venda usa categoria de cliente por nome) — os
  // dois podem aparecer juntos se a seleção for mista.
  function buildBulkBar(onDone) {
    if (!selection.size) return UI.h("div", {});
    const rows = Array.from(selection.values());
    const hasExpenseLike = rows.some(isExpenseLikeRow);
    const hasClientSide = rows.some(isClientSideRow);

    const children = [UI.h("div", { style: "font-weight:700;font-size:12.5px;" }, [`${Fmt.num(rows.length)} selecionado(s)`])];

    if (hasExpenseLike) {
      const sel = UI.h("select", {}, Categories.list.map((c) => UI.h("option", { value: c }, [Fmt.titleCase(c)])));
      const btn = UI.h("button", { class: "btn btn-sm btn-accent" }, ["Aplicar categoria"]);
      btn.addEventListener("click", () => {
        let n = 0;
        rows.forEach((r) => {
          if (!isExpenseLikeRow(r)) return;
          if (r.manual) Storage.updateLancamento(r.id, { category: sel.value }); else Storage.setOverride(r.id, { category: sel.value });
          selection.delete(r.id);
          n++;
        });
        UI.toast(`${Fmt.num(n)} despesa(s) classificada(s) como ${Fmt.titleCase(sel.value)}.`);
        onDone();
      });
      children.push(UI.h("div", { style: "display:flex;gap:6px;align-items:center;" }, [sel, btn]));
    }

    if (hasClientSide) {
      const inp = UI.h("input", { class: "input", list: "bulkClienteCatList", style: "width:170px;", placeholder: "Categoria do cliente…" });
      const btn = UI.h("button", { class: "btn btn-sm btn-accent" }, ["Aplicar aos clientes"]);
      btn.addEventListener("click", () => {
        const v = inp.value.trim();
        if (!v) { UI.toast("Digite uma categoria de cliente."); return; }
        const names = new Set();
        rows.forEach((r) => { if (isClientSideRow(r)) names.add(r.counterparty); });
        names.forEach((nome) => Storage.setClienteCategoria(nome, v.toUpperCase()));
        rows.forEach((r) => { if (isClientSideRow(r)) selection.delete(r.id); });
        UI.toast(`${Fmt.num(names.size)} cliente(s) classificado(s) como ${Fmt.titleCase(v)}.`);
        onDone();
      });
      children.push(UI.h("div", { style: "display:flex;gap:6px;align-items:center;" }, [
        inp, UI.h("datalist", { id: "bulkClienteCatList" }, clientCategoryOptions()), btn,
      ]));
    }

    const clearBtn = UI.h("button", { class: "btn btn-sm" }, ["Limpar seleção"]);
    clearBtn.addEventListener("click", () => { selection.clear(); onDone(); });
    children.push(clearBtn);

    return UI.h("div", { style: "display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--surface-3);border-radius:10px;padding:10px 14px;margin-bottom:12px;" }, children);
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
    const reviewBox = UI.h("div", { style: "display:none;flex-direction:column;gap:10px;margin-top:6px;" });
    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const confirmBtn = UI.h("button", { class: "btn btn-accent" }, ["Confirmar importação"]);
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = ".5";

    let parsed = null;
    let mode = "padrao";
    let reviewIncluded = new Set(); // índices (em `parsed`) marcados pra importar -- só usado no modo "simples"
    const classifySelects = []; // [{ raw, select }]

    // Confirmar sempre reflete o que está de fato selecionado pra entrar:
    // no modo simples, só o que ficou marcado na lista de revisão; no modo
    // padrão (sem revisão linha a linha), tudo que foi lido e não é duplicado.
    function updateConfirmState() {
      const n = mode === "simples" ? reviewIncluded.size : (parsed ? parsed.length : 0);
      confirmBtn.disabled = !n;
      confirmBtn.style.opacity = n ? "1" : ".5";
      confirmBtn.textContent = mode === "simples" && parsed && parsed.length ? `Confirmar importação (${n})` : "Confirmar importação";
    }

    // Planilha simples: não é o modelo de 8 abas da Max Led (ex: extrato de
    // banco) -- divisão/tipo/categoria são escolhidos aqui uma vez e valem
    // pra todas as linhas do arquivo.
    const simpleDivSel = UI.h("select", {}, [
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    const simpleBasisSel = UI.h("select", {}, [
      UI.h("option", { value: "financeiro" }, ["Financeiro (caixa)"]),
      UI.h("option", { value: "nfe" }, ["Nota Fiscal (NFe)"]),
    ]);
    const simpleFlowSel = UI.h("select", {});
    const simpleCatSel = UI.h("select", {}, [UI.h("option", { value: "" }, ["— deixar sem categoria —"])].concat(
      Categories.list.map((c) => UI.h("option", { value: c }, [Fmt.titleCase(c)]))
    ));
    const simpleCatField = UI.field("Categoria (se a planilha não trouxer)", simpleCatSel);

    function syncSimpleFlowOptions() {
      const isFin = simpleBasisSel.value === "financeiro";
      UI.clear(simpleFlowSel);
      (isFin ? [["entrada", "Entrada"], ["saida", "Saída"]] : [["venda", "Venda (saída de NFe)"], ["compra", "Compra (entrada de NFe)"]])
        .forEach(([v, l]) => simpleFlowSel.appendChild(UI.h("option", { value: v }, [l])));
      syncSimpleCatVisibility();
    }
    function syncSimpleCatVisibility() {
      const isExpenseLike = (simpleBasisSel.value === "financeiro" && simpleFlowSel.value === "saida") || (simpleBasisSel.value === "nfe" && simpleFlowSel.value === "compra");
      simpleCatField.style.display = isExpenseLike ? "" : "none";
    }
    simpleBasisSel.addEventListener("change", syncSimpleFlowOptions);
    simpleFlowSel.addEventListener("change", syncSimpleCatVisibility);
    syncSimpleFlowOptions();

    const simpleFieldsWrap = UI.h("div", { style: "display:none;flex-direction:column;gap:12px;margin-bottom:14px;" }, [
      UI.h("div", { class: "field-row" }, [UI.field("Divisão (se a planilha não trouxer)", simpleDivSel), UI.field("Base", simpleBasisSel)]),
      UI.h("div", { class: "field-row" }, [UI.field("Tipo (se a planilha não trouxer)", simpleFlowSel), simpleCatField]),
    ]);

    function resetFileState() {
      UI.clear(classifyBox);
      classifyBox.style.display = "none";
      classifySelects.length = 0;
      UI.clear(reviewBox);
      reviewBox.style.display = "none";
      reviewIncluded = new Set();
      parsed = null;
      confirmBtn.textContent = "Confirmar importação";
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = ".5";
    }

    // Lista de revisão (só planilha simples): cada linha lida vira uma
    // caixinha marcada por padrão -- desmarcar tira ESSA linha da importação,
    // sem precisar escolher um tipo só pro arquivo inteiro. O segmentado
    // Todas/Entradas/Saídas só filtra o que aparece na lista, não desmarca.
    function buildReviewChecklist(rows, included, onChange) {
      function isEntradaLike(r) { return r.flow === "entrada" || r.flow === "venda"; }
      let filter = "todas";
      const countLabel = UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);" });
      const tableWrap = UI.h("div", { style: "max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;" });

      function updateCount() { countLabel.textContent = `${included.size} de ${rows.length} selecionada(s) pra importar`; }

      function checkboxCell(i) {
        const cb = UI.h("input", { type: "checkbox" });
        cb.checked = included.has(i);
        cb.addEventListener("change", () => {
          if (cb.checked) included.add(i); else included.delete(i);
          updateCount();
          onChange();
        });
        return cb;
      }

      function refreshTable() {
        const indices = rows.map((r, i) => i).filter((i) => {
          if (filter === "todas") return true;
          return filter === "entrada" ? isEntradaLike(rows[i]) : !isEntradaLike(rows[i]);
        });
        UI.clear(tableWrap);
        tableWrap.appendChild(UI.table({
          columns: [
            { key: "sel", label: "", render: checkboxCell },
            { key: "date", label: "Data", render: (i) => Fmt.dateBR(rows[i].date) },
            { key: "flow", label: "Tipo", render: (i) => UI.badge(isEntradaLike(rows[i]) ? "Entrada" : "Saída", isEntradaLike(rows[i]) ? "good" : "critical") },
            { key: "division", label: "Divisão", render: (i) => UI.badgeDivision(rows[i].division) },
            { key: "category", label: "Categoria", render: (i) => (rows[i].category ? UI.badge(Fmt.titleCase(rows[i].category), "muted") : "—") },
            { key: "counterparty", label: "Contraparte", wrap: true, render: (i) => rows[i].counterparty || "—" },
            { key: "value", label: "Valor", align: "right", render: (i) => Fmt.money(rows[i].value) },
          ],
          rows: indices,
          emptyText: "Nenhuma linha nesse filtro.",
        }));
      }

      const entradaCount = rows.filter(isEntradaLike).length;
      const seg = UI.segmented([
        { value: "todas", label: `Todas (${rows.length})` },
        { value: "entrada", label: `Entradas (${entradaCount})` },
        { value: "saida", label: `Saídas (${rows.length - entradaCount})` },
      ], filter, (v) => { filter = v; refreshTable(); });
      const selectAllBtn = UI.h("button", { class: "btn btn-ghost btn-sm" }, ["Marcar todas"]);
      selectAllBtn.addEventListener("click", () => { rows.forEach((r, i) => included.add(i)); refreshTable(); updateCount(); onChange(); });
      const clearAllBtn = UI.h("button", { class: "btn btn-ghost btn-sm" }, ["Desmarcar todas"]);
      clearAllBtn.addEventListener("click", () => { included.clear(); refreshTable(); updateCount(); onChange(); });

      const wrap = UI.h("div", { style: "display:flex;flex-direction:column;gap:8px;" }, [
        UI.h("div", { style: "display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;" }, [
          seg, UI.h("div", { style: "display:flex;gap:6px;" }, [selectAllBtn, clearAllBtn]),
        ]),
        countLabel, tableWrap,
      ]);
      refreshTable();
      updateCount();
      return wrap;
    }

    const modeSeg = UI.segmented([
      { value: "padrao", label: "Planilha padrão Max Led" },
      { value: "simples", label: "Planilha simples" },
    ], mode, (v) => {
      mode = v;
      simpleFieldsWrap.style.display = mode === "simples" ? "flex" : "none";
      fileInput.value = "";
      fileInput.accept = mode === "simples" ? ".xlsx,.xlsm,.xls,.csv" : ".xlsx,.xlsm";
      UI.clear(summaryBox);
      summaryBox.appendChild(document.createTextNode(mode === "simples"
        ? "Selecione o arquivo. Leio a 1ª aba e tento achar as colunas de Data/Divisão/Tipo/Categoria/Contraparte/Valor pelo cabeçalho (entrada e saída podem estar juntas numa coluna Tipo, ou separadas em duas colunas de valor); o que a planilha não trouxer usa a Divisão/Base/Tipo/Categoria escolhidos acima. Depois de ler, você escolhe linha a linha o que entra. Sem cabeçalho reconhecível, uso as 3 primeiras colunas como Data/Contraparte/Valor."
        : "Selecione o arquivo .xlsx atualizado (o mesmo formato/abas da planilha da Max Led). Vou ler tudo e adicionar só o que ainda não está aqui — nada é duplicado."));
      resetFileState();
    });

    const m = UI.modal({
      title: "Importar planilha Excel",
      body: [
        modeSeg,
        simpleFieldsWrap,
        UI.field("Arquivo", fileInput),
        summaryBox,
        classifyBox,
        reviewBox,
      ],
      footer: [cancelBtn, confirmBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      UI.clear(summaryBox);
      resetFileState();
      summaryBox.appendChild(document.createTextNode("Lendo arquivo…"));
      try {
        const buf = await file.arrayBuffer();
        let rows, missingSheets;
        if (mode === "simples") {
          const result = ExcelImport.parseSimpleSheet(buf, {
            division: simpleDivSel.value, basis: simpleBasisSel.value, flow: simpleFlowSel.value, category: simpleCatSel.value || null,
          });
          rows = result.rows;
          missingSheets = [];
          if (!rows.length) {
            UI.clear(summaryBox);
            summaryBox.appendChild(UI.h("span", { style: "color:var(--critical-text);" }, [
              "Não encontrei nenhuma linha válida (com data e valor) na primeira aba desse arquivo.",
            ]));
            return;
          }
        } else {
          const result = ExcelImport.parseWorkbook(buf);
          rows = result.rows; missingSheets = result.missingSheets;
          if (!result.found.length) {
            UI.clear(summaryBox);
            summaryBox.appendChild(UI.h("span", { style: "color:var(--critical-text);" }, [
              "Não reconheci nenhuma aba conhecida nesse arquivo. Confirme que é a planilha da Max Led (mesma estrutura de sempre), ou troque para \"Planilha simples\" acima.",
            ]));
            return;
          }
        }
        const { toAdd, duplicates } = ExcelImport.dedupe(rows);
        parsed = toAdd;
        const s = ExcelImport.summarize(toAdd);
        UI.clear(summaryBox);
        const lines = [
          `${Fmt.num(rows.length)} lançamento(s) lidos no arquivo.`,
          mode === "simples"
            ? `${Fmt.num(toAdd.length)} são novos (${Fmt.num(duplicates.length)} já existiam e foram ignorados) — escolha abaixo quais entram.`
            : `${Fmt.num(toAdd.length)} são novos e serão importados · ${Fmt.num(duplicates.length)} já existiam e foram ignorados.`,
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

        if (mode === "simples" && toAdd.length) {
          reviewIncluded = new Set(toAdd.map((r, i) => i));
          reviewBox.style.display = "flex";
          UI.clear(reviewBox);
          reviewBox.appendChild(buildReviewChecklist(toAdd, reviewIncluded, updateConfirmState));
        }
        updateConfirmState();
      } catch (e) {
        UI.clear(summaryBox);
        summaryBox.appendChild(UI.h("span", { style: "color:var(--critical-text);" }, ["Não consegui ler esse arquivo. Confirme que é uma planilha válida."]));
      }
    });

    confirmBtn.addEventListener("click", () => {
      if (!parsed || !parsed.length) return;
      let toImport = mode === "simples" ? parsed.filter((r, i) => reviewIncluded.has(i)) : parsed;
      if (!toImport.length) { UI.toast("Nenhuma linha selecionada pra importar."); return; }
      if (classifySelects.length) {
        const mapping = {};
        classifySelects.forEach(({ raw, select }) => { mapping[raw] = select.value; });
        toImport = ExcelImport.applyCategoriaClassification(toImport, mapping);
      }
      Storage.addLancamentosBulk(toImport, "import");
      UI.toast(`${Fmt.num(toImport.length)} lançamento(s) importado(s).`);
      m.close();
      AppState.set({});
    });
  }

  function clientCategoryOptions() {
    const used = Object.values(Storage.getClienteCategorias());
    const all = Array.from(new Set(Categories.clientList.concat(used)));
    return all.map((c) => UI.h("option", { value: c }, []));
  }

  // Sugestões de contraparte já usada -- escolher da lista em vez de digitar
  // de novo evita variação de nome (maiúscula/minúscula, espaço) que faria
  // um cliente já classificado parecer "sem categoria" de novo.
  function counterpartyOptions() {
    const names = new Set();
    Compute.allTransactions().forEach((t) => { if (t.counterparty) names.add(t.counterparty); });
    return Array.from(names).sort().map((n) => UI.h("option", { value: n }, []));
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
    const cpInput = UI.h("input", { class: "input", list: "counterpartyList", placeholder: "Ex: Fornecedor XPTO, Cliente ABC…" });
    const cpDatalist = UI.h("datalist", { id: "counterpartyList" }, counterpartyOptions());
    const valueInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const noteInput = UI.h("textarea", { class: "input", rows: 2, placeholder: "Observação (opcional)" });
    const notaInput = UI.h("input", { class: "input", placeholder: "Ex: 11853 (opcional)" });
    const clienteCatInput = UI.h("input", { class: "input", list: "clienteCategoriaList", placeholder: "Ex: Atacado, Distribuidor… (opcional)" });
    const clienteCatList = UI.h("datalist", { id: "clienteCategoriaList" }, clientCategoryOptions());
    const catField = UI.field("Categoria", catSel);
    const notaField = UI.field("Nota fiscal", notaInput);
    const clienteCatField = UI.field("Categoria do cliente", UI.h("div", {}, [clienteCatInput, clienteCatList]));

    function isExpenseLike() {
      const isFin = basisSel.value === "financeiro";
      return (isFin && flowSel.value === "saida") || (!isFin && flowSel.value === "compra");
    }
    function syncFieldVisibility() {
      const isClientSide = flowSel.value === "entrada" || flowSel.value === "venda";
      catField.style.display = isExpenseLike() ? "" : "none";
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
        UI.field("Contraparte / cliente / fornecedor", UI.h("div", {}, [cpInput, cpDatalist])),
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
        category: isExpenseLike() ? catSel.value : null,
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
  window.Views.presetUncategorizedFilter = () => { local.onlyUncategorized = true; local.page = 0; };
})();
