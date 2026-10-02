// Nota Fiscal: controle da parte fiscal, separado dos lançamentos
// financeiros -- compras e vendas por divisão, por mês, ordenadas por número
// de nota com destaque pra número faltando na sequência (só vendas: é a
// numeração que a própria Max Led emite; compra é de cada fornecedor,
// então só ordena). SNF = Sem Nota Fiscal, entrada rápida à parte, sem
// numeração.
(function () {
  const STATUS_LABEL = { normal: "Normal", cancelada: "Cancelada", devolvida: "Devolvida" };
  const STATUS_KIND = { normal: "good", cancelada: "critical", devolvida: "warning" };
  const TIPO_LABEL = { compra: "Compra", venda: "Venda" };
  const TIPO_KIND = { compra: "neutral", venda: "good" };

  function currentMonthKey() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  // Estado só desta página (mês/filtros não são um conceito global do app,
  // igual o período acum/mês de outras telas) -- fica no módulo, não em
  // AppState, e some num reload de página (comportamento aceitável aqui).
  let nfMonth = currentMonthKey();
  let nfTipo = "todos";
  let nfStatus = "todos";
  let nfBusca = "";

  function availableMonths() {
    const months = new Set(Storage.listNotasFiscais().map((n) => n.mes).filter(Boolean));
    months.add(currentMonthKey());
    return Array.from(months).sort();
  }

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false, showBasis: false, extra: [addBtn(st), downloadBtn(st)] });

    container.appendChild(UI.h("div", { style: "margin-bottom:16px;" }, [
      UI.segmented(availableMonths().map((m) => ({ value: m, label: Fmt.monthLabel(m) })), nfMonth, (v) => { nfMonth = v; AppState.set({}); }),
    ]));

    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:20px;" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Como funciona"]),
        UI.h("div", { class: "insight-body" }, [UI.richText(
          "Compra e venda ficam em tabelas separadas, ordenadas pelo número da nota. Em vendas, um número que falta na sequência aparece em vermelho -- é a numeração que a própria Max Led emite, então um buraco pode indicar nota não lançada ou cancelada sem registrar aqui. " +
          "<b>SNF</b> (Sem Nota Fiscal) é pra lançar rápido algo que não tem nota -- fica numa lista à parte, sem entrar na checagem de sequência."
        )]),
      ]),
    ]));

    const summary = Compute.notasFiscaisSummary(st.division, nfMonth);
    const vendasFiltradas = applyFilters(summary.vendas);
    const comprasFiltradas = applyFilters(summary.compras);

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Total vendas (mês)", value: Fmt.money(summary.totalVendas) }),
      UI.statTile({ label: "Total compras (mês)", value: Fmt.money(summary.totalCompras) }),
      UI.statTile({ label: "Notas faltando na sequência", value: Fmt.num(summary.faltantesCount), foot: summary.faltantesCount ? "Verificar" : "Sequência completa" }),
      UI.statTile({ label: "Lançamentos SNF (mês)", value: Fmt.num(summary.snf.length), foot: "Sem nota fiscal" }),
    ]));

    const mainCol = UI.h("div", { style: "flex:1;min-width:0;display:flex;flex-direction:column;gap:20px;" }, [
      sectionTable("Vendas", "Numeração emitida pela Max Led -- número em vermelho é o que falta", vendasFiltradas, st),
      sectionTable("Compras", "Numeração de cada fornecedor -- só ordenada, sem checagem de sequência", comprasFiltradas, st),
    ]);
    const sideCol = UI.h("div", { style: "width:280px;flex:none;display:flex;flex-direction:column;gap:16px;" }, [
      filterCard(),
      snfCard(summary.snf, st),
    ]);

    container.appendChild(UI.h("div", { style: "display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;" }, [mainCol, sideCol]));
  }

  function applyFilters(rows) {
    return rows.filter((r) => {
      if (nfTipo !== "todos" && r.tipo !== nfTipo) return false;
      if (nfStatus !== "todos" && !r.missing && (r.status || "normal") !== nfStatus) return false;
      if (nfBusca && !r.missing && !(r.nome || "").toLowerCase().includes(nfBusca.toLowerCase())) return false;
      return true;
    });
  }

  function filterCard() {
    const tipoSel = UI.h("select", {}, [
      UI.h("option", { value: "todos" }, ["Todos"]),
      UI.h("option", { value: "venda" }, ["Venda"]),
      UI.h("option", { value: "compra" }, ["Compra"]),
    ]);
    tipoSel.value = nfTipo;
    tipoSel.addEventListener("change", () => { nfTipo = tipoSel.value; AppState.set({}); });

    const statusSel = UI.h("select", {}, [
      UI.h("option", { value: "todos" }, ["Todos"]),
      UI.h("option", { value: "normal" }, ["Normal"]),
      UI.h("option", { value: "cancelada" }, ["Cancelada"]),
      UI.h("option", { value: "devolvida" }, ["Devolvida"]),
    ]);
    statusSel.value = nfStatus;
    statusSel.addEventListener("change", () => { nfStatus = statusSel.value; AppState.set({}); });

    const buscaInput = UI.h("input", { class: "input", placeholder: "Nome..." });
    buscaInput.value = nfBusca;
    buscaInput.addEventListener("input", () => { nfBusca = buscaInput.value; AppState.set({}); });

    return UI.h("div", { class: "card" }, [
      UI.h("div", { style: "font-weight:700;font-size:12.5px;margin-bottom:10px;" }, ["Filtrar"]),
      UI.field("Tipo", tipoSel),
      UI.h("div", { style: "height:8px;" }),
      UI.field("Status", statusSel),
      UI.h("div", { style: "height:8px;" }),
      UI.field("Buscar nome", buscaInput),
    ]);
  }

  function sectionTable(title, desc, rows, st) {
    return UI.h("div", {}, [
      UI.sectionTitle(title, desc),
      UI.h("div", { class: "card" }, [UI.table({
        columns: [
          { key: "numero", label: "Número", render: (r) => numeroCell(r) },
          { key: "divisao", label: "Divisão", render: (r) => (st.division === "consolidado" ? UI.badgeDivision(r.divisao) : "") },
          { key: "nome", label: "Nome", wrap: true, render: (r) => r.missing ? UI.badge("Faltando", "critical") : (r.nome || "—") },
          { key: "valor", label: "Valor", align: "right", render: (r) => (r.missing || r.valor === null ? "—" : Fmt.money(r.valor)) },
          { key: "status", label: "Status", render: (r) => (r.missing ? "" : UI.badge(STATUS_LABEL[r.status || "normal"], STATUS_KIND[r.status || "normal"])) },
          { key: "actions", label: "", render: (r) => (r.missing ? "" : actionsCell(r)) },
        ],
        rows,
        rowAttrs: (r) => (r.missing ? { style: "background:rgba(230,103,103,.08);" } : null),
        emptyText: "Nenhuma nota fiscal cadastrada pra esse filtro.",
      })]),
    ]);
  }

  function numeroCell(r) {
    const span = UI.h("span", { class: "tabular", style: r.missing ? "color:var(--critical-text);font-weight:700;" : "font-weight:700;" }, [String(r.numero)]);
    return span;
  }

  function snfCard(rows, st) {
    const nomeInput = UI.h("input", { class: "input", placeholder: "Nome" });
    const valorInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "Valor" });
    const tipoSel = UI.h("select", {}, [UI.h("option", { value: "venda" }, ["Venda"]), UI.h("option", { value: "compra" }, ["Compra"])]);
    const addSnfBtn = UI.h("button", { class: "btn btn-accent btn-sm" }, ["Adicionar"]);
    addSnfBtn.addEventListener("click", () => {
      if (!nomeInput.value.trim() || !valorInput.value) { UI.toast("Preencha nome e valor."); return; }
      Storage.addNotaFiscal({
        nome: nomeInput.value.trim(), valor: parseFloat(valorInput.value), tipo: tipoSel.value,
        divisao: st.division === "consolidado" ? "iluminacao" : st.division, mes: nfMonth, origem: "snf", status: "normal",
      });
      UI.toast("Lançamento SNF adicionado.");
      AppState.set({});
    });

    const list = UI.h("div", { style: "display:flex;flex-direction:column;gap:6px;margin-top:10px;max-height:220px;overflow:auto;" },
      rows.length ? rows.map((r) => snfRow(r)) : [UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);" }, ["Nada lançado esse mês."])]);

    return UI.h("div", { class: "card" }, [
      UI.h("div", { style: "display:flex;align-items:center;gap:6px;margin-bottom:10px;" }, [
        UI.h("div", { style: "font-weight:700;font-size:12.5px;" }, ["SNF"]),
        UI.badge("Sem nota fiscal", "muted"),
      ]),
      UI.h("div", { style: "display:flex;flex-direction:column;gap:6px;" }, [nomeInput, valorInput, tipoSel, addSnfBtn]),
      list,
    ]);
  }

  function snfRow(r) {
    const removeBtn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 12 })]);
    removeBtn.addEventListener("click", () => { Storage.removeNotaFiscal(r.id); UI.toast("Removido."); AppState.set({}); });
    return UI.h("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11.5px;border-bottom:1px solid var(--border);padding-bottom:6px;" }, [
      UI.h("div", { style: "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, [`${r.nome} · ${Fmt.money(r.valor)}`]),
      removeBtn,
    ]);
  }

  function actionsCell(nf) {
    const editBtn = UI.h("button", { class: "icon-btn", title: "Editar" }, [Icon("edit", { size: 12 })]);
    editBtn.addEventListener("click", () => openModal(nf));
    const removeBtn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 12 })]);
    removeBtn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover a nota nº ${nf.numero}?`);
      if (ok) { Storage.removeNotaFiscal(nf.id); UI.toast("Nota removida."); AppState.set({}); }
    });
    return UI.h("div", { style: "display:flex;gap:4px;justify-content:flex-end;" }, [editBtn, removeBtn]);
  }

  function addBtn(st) {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Nova nota"]);
    btn.addEventListener("click", () => openModal(null, st));
    return btn;
  }

  function openModal(existing, st) {
    const numeroInput = UI.h("input", { type: "number", step: "1", min: "1", class: "input" });
    const nomeInput = UI.h("input", { class: "input", placeholder: "Cliente ou fornecedor" });
    const valorInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input" });
    const divSel = UI.h("select", {}, [
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    const tipoSel = UI.h("select", {}, [UI.h("option", { value: "venda" }, ["Venda"]), UI.h("option", { value: "compra" }, ["Compra"])]);
    const mesInput = UI.h("input", { type: "month", class: "input" });
    const statusSel = UI.h("select", {}, Object.entries(STATUS_LABEL).map(([v, l]) => UI.h("option", { value: v }, [l])));

    if (existing) {
      numeroInput.value = existing.numero; nomeInput.value = existing.nome || "";
      valorInput.value = existing.valor; divSel.value = existing.divisao;
      tipoSel.value = existing.tipo; mesInput.value = existing.mes; statusSel.value = existing.status || "normal";
    } else {
      divSel.value = st && st.division !== "consolidado" ? st.division : "iluminacao";
      mesInput.value = nfMonth; statusSel.value = "normal";
    }

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, [existing ? "Salvar alterações" : "Salvar"]);
    const m = UI.modal({
      title: existing ? "Editar nota fiscal" : "Nova nota fiscal",
      body: [
        UI.h("div", { class: "field-row" }, [UI.field("Número", numeroInput), UI.field("Tipo", tipoSel)]),
        UI.field("Nome (cliente/fornecedor)", nomeInput),
        UI.h("div", { class: "field-row" }, [UI.field("Valor (R$)", valorInput), UI.field("Divisão", divSel)]),
        UI.h("div", { class: "field-row" }, [UI.field("Mês", mesInput), UI.field("Status", statusSel)]),
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      if (!numeroInput.value || !nomeInput.value.trim() || !valorInput.value || !mesInput.value) { UI.toast("Preencha número, nome, valor e mês."); return; }
      const payload = {
        numero: parseInt(numeroInput.value, 10), nome: nomeInput.value.trim(), valor: parseFloat(valorInput.value),
        divisao: divSel.value, tipo: tipoSel.value, mes: mesInput.value, status: statusSel.value, origem: "nfe",
      };
      if (existing) Storage.updateNotaFiscal(existing.id, payload); else Storage.addNotaFiscal(payload);
      UI.toast("Nota fiscal salva.");
      m.close();
      nfMonth = payload.mes;
      AppState.set({});
    });
  }

  function downloadBtn() {
    const btn = UI.h("button", { class: "btn btn-sm" }, [Icon("download", { size: 14 }), "Baixar"]);
    btn.addEventListener("click", () => {
      const st = AppState.get();
      const summary = Compute.notasFiscaisSummary(st.division, nfMonth);
      const toRows = (list) => list.map((r) => ({
        Número: r.missing ? `${r.numero} (FALTANDO)` : r.numero, Nome: r.nome || "", Valor: r.valor,
        Divisão: r.divisao, Status: r.missing ? "" : (STATUS_LABEL[r.status || "normal"]),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(summary.vendas).length ? toRows(summary.vendas) : [{}]), "Vendas");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(summary.compras).length ? toRows(summary.compras) : [{}]), "Compras");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(summary.snf).length ? toRows(summary.snf) : [{}]), "SNF");
      XLSX.writeFile(wb, `maxled-notas-fiscais-${nfMonth}.xlsx`);
    });
    return btn;
  }

  window.Views = window.Views || {};
  window.Views.notafiscal = render;
})();
