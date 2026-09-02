// Histórico de planilhas importadas (Lançamentos e Notas fiscais) -- agrupa
// por lote (mesmo createdAt = mesma importação, atribuído uma vez por
// chamada de addLancamentosBulk/addContasExtrasBulk, não por linha) pra dar
// pra revisar, editar linha a linha ou remover o lote inteiro de uma vez.
(function () {
  const TIPO_NF_LABEL = { a_receber: "A receber", a_pagar: "A pagar" };
  const ENTRADA_FLOWS = ["entrada", "venda"];

  function groupByCreatedAt(rows) {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.createdAt)) map.set(r.createdAt, []);
      map.get(r.createdAt).push(r);
    });
    return Array.from(map.entries())
      .map(([createdAt, items]) => ({ createdAt, items }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // Remove tudo de um mês de uma vez, não só o que veio de planilha --
  // lançamento da base Excel não dá pra apagar de verdade, então esse vira
  // cancelado (mesmo mecanismo do botão individual "Cancelar lançamento");
  // manual/importado e nota fiscal saem mesmo.
  function monthsWithData() {
    const months = new Set(AppState.detailedMonths);
    Storage.listContasExtras().forEach((c) => { if (c.vencimento) months.add(c.vencimento.slice(0, 7)); });
    return Array.from(months).sort();
  }

  function monthCleanupSection() {
    const months = monthsWithData();
    if (!months.length) return UI.h("div", {});

    const sel = UI.h("select", {}, months.map((m) => UI.h("option", { value: m }, [Fmt.monthLabel(m, "full")])));
    sel.value = months[months.length - 1];
    const previewWrap = UI.h("div", { style: "font-size:12.5px;color:var(--text-secondary);margin-top:10px;" });
    const removeBtn = UI.h("button", { class: "btn btn-sm", style: "margin-top:10px;" }, [Icon("trash", { size: 13 }), "Remover esse mês inteiro"]);

    function matchFor(mk) {
      const lancs = Compute.allTransactions().filter((t) => t.date.slice(0, 7) === mk && !t.cancelled);
      const nfs = Storage.listContasExtras().filter((c) => c.vencimento && c.vencimento.slice(0, 7) === mk);
      return { lancs, nfs };
    }
    function updatePreview() {
      const { lancs, nfs } = matchFor(sel.value);
      const base = lancs.filter((t) => !t.manual).length;
      const manual = lancs.filter((t) => t.manual).length;
      UI.clear(previewWrap);
      const parts = [];
      if (lancs.length) parts.push(`${lancs.length} lançamento(s)${base ? ` (${base} da base Excel + ${manual} adicionado(s)/importado(s))` : ""}`);
      if (nfs.length) parts.push(`${nfs.length} nota(s) fiscal(is)`);
      previewWrap.textContent = parts.length ? `Esse mês tem: ${parts.join(" e ")}.` : "Sem nada cadastrado nesse mês.";
      removeBtn.disabled = !lancs.length && !nfs.length;
      removeBtn.style.opacity = removeBtn.disabled ? ".5" : "1";
    }
    sel.addEventListener("change", updatePreview);
    updatePreview();

    removeBtn.addEventListener("click", async () => {
      const { lancs, nfs } = matchFor(sel.value);
      const ok = await UI.confirmDialog(
        `Remover tudo de ${Fmt.monthLabel(sel.value, "full")}? ${lancs.length} lançamento(s) e ${nfs.length} nota(s) fiscal(is) serão afetados -- os que vieram da base Excel ficam cancelados (não somem do histórico), o resto é apagado de verdade.`
      );
      if (!ok) return;
      lancs.forEach((t) => { if (t.manual) Storage.removeLancamento(t.id); else Storage.setOverride(t.id, { cancelled: true }); });
      nfs.forEach((c) => Storage.removeContaExtra(c.id));
      UI.toast(`Mês removido: ${lancs.length} lançamento(s) e ${nfs.length} nota(s) fiscal(is).`);
      AppState.set({});
    });

    return UI.h("div", { class: "card" }, [
      UI.h("div", { class: "card-subtitle", style: "margin-bottom:12px;" }, ["Apaga tudo de um mês de uma vez, não importa como entrou (planilha, um a um ou da base original)"]),
      sel, previewWrap, removeBtn,
    ]);
  }

  function render(container) {
    container.appendChild(UI.sectionTitle("Remover um mês inteiro", ""));
    container.appendChild(monthCleanupSection());

    const lancBatches = groupByCreatedAt(Storage.listLancamentos().filter((r) => r.origin === "import"));
    const nfBatches = groupByCreatedAt(Storage.listContasExtras().filter((r) => r.origin === "import"));

    if (!lancBatches.length && !nfBatches.length) {
      container.appendChild(UI.sectionTitle("Lotes importados", ""));
      container.appendChild(UI.card([UI.emptyState({
        icon: "upload", title: "Nenhuma planilha importada ainda",
        body: "Quando você importar um Excel em Lançamentos ou em A Receber/A Pagar, os lotes aparecem aqui pra revisar, editar ou remover.",
      })]));
      return;
    }

    if (lancBatches.length) {
      container.appendChild(UI.sectionTitle("Lançamentos importados", `${lancBatches.length} planilha(s) importada(s), mais recente primeiro`));
      lancBatches.forEach((b) => container.appendChild(lancamentoBatchCard(b)));
    }
    if (nfBatches.length) {
      container.appendChild(UI.sectionTitle("Notas fiscais importadas", `${nfBatches.length} planilha(s) importada(s), mais recente primeiro`));
      nfBatches.forEach((b) => container.appendChild(nfBatchCard(b)));
    }
  }

  function batchDateLabel(createdAt) {
    return new Date(createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function divisionBadges(divisoes) {
    return UI.h("span", {}, divisoes.map((d) => UI.badgeDivision(d)));
  }

  function batchCardShell(opts) {
    // opts: { createdAt, count, summary (nodes), onToggle (returns rows table), onRemoveBatch }
    const toggleBtn = UI.h("button", { class: "btn btn-ghost btn-sm" }, ["Ver linhas"]);
    const removeBatchBtn = UI.h("button", { class: "btn btn-sm" }, [Icon("trash", { size: 13 }), "Remover lote"]);
    const rowsWrap = UI.h("div", { style: "display:none;margin-top:14px;" });

    toggleBtn.addEventListener("click", () => {
      const showing = rowsWrap.style.display !== "none";
      if (!showing && !rowsWrap.childNodes.length) rowsWrap.appendChild(opts.buildRowsTable());
      rowsWrap.style.display = showing ? "none" : "block";
      toggleBtn.textContent = showing ? "Ver linhas" : "Esconder linhas";
    });
    removeBatchBtn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover essa planilha inteira? ${opts.count} linha(s) serão apagadas.`);
      if (!ok) return;
      opts.onRemoveBatch();
      UI.toast("Lote removido.");
      AppState.set({});
    });

    const head = UI.h("div", { class: "card-head" }, [
      UI.h("div", {}, [
        UI.h("div", { style: "font-weight:700;font-size:13.5px;" }, [batchDateLabel(opts.createdAt)]),
        UI.h("div", { style: "font-size:12px;color:var(--text-muted);margin-top:2px;" }, [`${opts.count} linha(s)`]),
      ]),
      UI.h("div", { style: "display:flex;gap:6px;flex:none;" }, [toggleBtn, removeBatchBtn]),
    ]);
    return UI.h("div", { class: "card", style: "margin-bottom:12px;" }, [head, opts.summary, rowsWrap]);
  }

  function lancamentoBatchCard(batch) {
    const entradas = batch.items.filter((r) => ENTRADA_FLOWS.includes(r.flow)).reduce((s, r) => s + r.value, 0);
    const saidas = batch.items.filter((r) => !ENTRADA_FLOWS.includes(r.flow)).reduce((s, r) => s + r.value, 0);
    const divisoes = Array.from(new Set(batch.items.map((r) => r.division)));
    const summary = UI.h("div", { style: "display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;align-items:center;" }, [
      divisionBadges(divisoes),
      UI.h("div", {}, [UI.h("span", { style: "color:var(--text-muted);" }, ["Entradas: "]), UI.h("b", {}, [Fmt.money(entradas)])]),
      UI.h("div", {}, [UI.h("span", { style: "color:var(--text-muted);" }, ["Saídas: "]), UI.h("b", {}, [Fmt.money(saidas)])]),
    ]);
    return batchCardShell({
      createdAt: batch.createdAt, count: batch.items.length, summary,
      buildRowsTable: () => lancamentoRowsTable(batch),
      onRemoveBatch: () => Storage.removeLancamentosByBatch(batch.createdAt),
    });
  }

  function lancamentoRowsTable(batch) {
    return UI.table({
      columns: [
        { key: "date", label: "Data", render: (r) => Fmt.dateBR(r.date) },
        { key: "division", label: "Divisão", render: (r) => UI.badgeDivision(r.division) },
        { key: "flow", label: "Tipo", render: (r) => UI.badge(ENTRADA_FLOWS.includes(r.flow) ? "Entrada" : "Saída", ENTRADA_FLOWS.includes(r.flow) ? "good" : "critical") },
        { key: "category", label: "Categoria", render: (r) => (r.category ? UI.badge(Fmt.titleCase(r.category), "muted") : "—") },
        { key: "counterparty", label: "Contraparte", wrap: true },
        { key: "value", label: "Valor", align: "right", render: (r) => Fmt.money(r.value) },
        { key: "actions", label: "", render: (r) => lancRowActions(r) },
      ],
      rows: batch.items.slice().sort((a, b) => b.date.localeCompare(a.date)),
      rowAttrs: (r) => (r.cancelled ? { style: "opacity:.5;" } : null),
    });
  }

  function lancRowActions(row) {
    const editBtn = UI.h("button", { class: "icon-btn", title: "Editar" }, [Icon("edit", { size: 13 })]);
    editBtn.addEventListener("click", () => Views.openLancamentoModal(row));
    const removeBtn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 13 })]);
    removeBtn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover esse lançamento (${Fmt.money(row.value)})?`);
      if (!ok) return;
      Storage.removeLancamento(row.id);
      UI.toast("Lançamento removido.");
      AppState.set({});
    });
    return UI.h("div", { style: "display:flex;justify-content:flex-end;gap:4px;" }, [editBtn, removeBtn]);
  }

  function nfBatchCard(batch) {
    const totalReceber = batch.items.filter((r) => r.tipo === "a_receber").reduce((s, r) => s + r.valor, 0);
    const totalPagar = batch.items.filter((r) => r.tipo === "a_pagar").reduce((s, r) => s + r.valor, 0);
    const divisoes = Array.from(new Set(batch.items.map((r) => r.division)));
    const summary = UI.h("div", { style: "display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;align-items:center;" }, [
      divisionBadges(divisoes),
      UI.h("div", {}, [UI.h("span", { style: "color:var(--text-muted);" }, ["A receber: "]), UI.h("b", {}, [Fmt.money(totalReceber)])]),
      UI.h("div", {}, [UI.h("span", { style: "color:var(--text-muted);" }, ["A pagar: "]), UI.h("b", {}, [Fmt.money(totalPagar)])]),
    ]);
    return batchCardShell({
      createdAt: batch.createdAt, count: batch.items.length, summary,
      buildRowsTable: () => nfRowsTable(batch),
      onRemoveBatch: () => Storage.removeContasExtrasByBatch(batch.createdAt),
    });
  }

  function nfRowsTable(batch) {
    return UI.table({
      columns: [
        { key: "vencimento", label: "Vencimento", render: (r) => Fmt.dateBR(r.vencimento) },
        { key: "tipo", label: "Tipo", render: (r) => UI.badge(TIPO_NF_LABEL[r.tipo] || r.tipo, r.tipo === "a_receber" ? "good" : "critical") },
        { key: "division", label: "Divisão", render: (r) => UI.badgeDivision(r.division) },
        { key: "contraparte", label: "Cliente/Fornecedor", wrap: true },
        { key: "nota_fiscal", label: "Nota fiscal" },
        { key: "valor", label: "Valor", align: "right", render: (r) => Fmt.money(r.valor) },
        { key: "actions", label: "", render: (r) => nfRowActions(r) },
      ],
      rows: batch.items.slice().sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || "")),
    });
  }

  function nfRowActions(row) {
    const editBtn = UI.h("button", { class: "icon-btn", title: "Editar" }, [Icon("edit", { size: 13 })]);
    editBtn.addEventListener("click", () => Views.openNfModal(null, row));
    const removeBtn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 13 })]);
    removeBtn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover essa nota fiscal (${Fmt.money(row.valor)})?`);
      if (!ok) return;
      Storage.removeContaExtra(row.id);
      UI.toast("Nota fiscal removida.");
      AppState.set({});
    });
    return UI.h("div", { style: "display:flex;justify-content:flex-end;gap:4px;" }, [editBtn, removeBtn]);
  }

  window.Views = window.Views || {};
  window.Views.importacoes = render;
})();
