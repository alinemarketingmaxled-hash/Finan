// A Receber / A Pagar: sempre os próximos 5 meses a partir de hoje -- rola
// sozinho quando o mês vira, sem precisar reimportar a planilha inteira. O
// que veio da última extração é complementado pelas notas fiscais
// cadastradas aqui (uma a uma ou por planilha), pra manter o controle em dia
// entre uma extração completa e outra.
(function () {
  const WINDOW_MONTHS = 5;
  const TIPO_LABEL = { a_receber: "A receber", a_pagar: "A pagar" };
  const TIPO_KIND = { a_receber: "good", a_pagar: "critical" };

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false, extra: [addNfBtn(st), importNfBtn(st)] });

    const { rows, overdue } = Compute.receivablesPayablesWindow(st.division, WINDOW_MONTHS);

    const totalReceber = rows.reduce((s, r) => s + r.a_receber, 0);
    const totalPagar = rows.reduce((s, r) => s + r.a_pagar, 0);
    const saldoFinal = totalReceber - totalPagar;
    const piorMes = rows.slice().sort((a, b) => a.saldo - b.saldo)[0];

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: `Total a receber (${WINDOW_MONTHS} meses)`, value: Fmt.money(totalReceber) }),
      UI.statTile({ label: `Total a pagar (${WINDOW_MONTHS} meses)`, value: Fmt.money(totalPagar) }),
      UI.statTile({ label: "Saldo projetado", value: Fmt.money(saldoFinal), foot: saldoFinal >= 0 ? "Positivo no período" : "Atenção: negativo" }),
      UI.statTile({ label: "Pior mês", value: Fmt.monthLabel(piorMes.month), foot: `Saldo de ${Fmt.money(piorMes.saldo)}` }),
    ]));

    if (overdue.months.length && (overdue.a_receber || overdue.a_pagar)) {
      container.appendChild(UI.insightCard({
        level: overdue.saldo < 0 ? "critical" : "warning", icon: "alertTriangle",
        title: "Existem contas de meses anteriores ainda em aberto",
        body: `${overdue.months.map((m) => Fmt.monthLabel(m)).join(", ")}: ${Fmt.money(overdue.a_receber)} a receber e ${Fmt.money(overdue.a_pagar)} a pagar que ficaram fora da janela dos ${WINDOW_MONTHS} meses acima. Vale conferir se ainda precisa cobrar, pagar ou já pode encerrar essas pendências.`,
      }));
    }

    const chartCard = UI.card([], { title: "A Receber vs A Pagar por mês", subtitle: `Próximos ${WINDOW_MONTHS} meses, a partir de hoje`, class: "chart-card" });
    const chartWrap = UI.h("div", {});
    chartCard.appendChild(chartWrap);
    Charts.lineArea(chartWrap, {
      xKeys: rows.map((r) => r.month), xLabelFn: Fmt.monthLabel,
      series: [
        { label: "A receber", color: Charts.cssVar("--series-1"), values: rows.map((r) => r.a_receber) },
        { label: "A pagar", color: Charts.cssVar("--series-2"), values: rows.map((r) => r.a_pagar) },
      ],
      height: 240,
    });
    const balCard = UI.card([], { title: "Saldo projetado", subtitle: "A receber − a pagar", class: "chart-card" });
    const balWrap = UI.h("div", {});
    balCard.appendChild(balWrap);
    Charts.divergingBar(balWrap, { xKeys: rows.map((r) => r.month), xLabelFn: Fmt.monthLabel, values: rows.map((r) => r.saldo), height: 240 });

    container.appendChild(UI.h("div", { class: "grid grid-2", style: "align-items:start;" }, [chartCard, balCard]));

    if (rows.some((r) => r.saldo < 0)) {
      container.appendChild(UI.insightCard({
        level: "critical", icon: "alertTriangle", title: "Existem meses com saldo previsto negativo",
        body: `O mês mais crítico é <b>${Fmt.monthLabel(piorMes.month)}</b>, com saldo de ${Fmt.money(piorMes.saldo)}. Considere antecipar recebíveis, renegociar prazos com fornecedores ou reservar caixa com antecedência.`,
      }));
    }

    container.appendChild(UI.sectionTitle("Detalhamento por mês", `Sempre os próximos ${WINDOW_MONTHS} meses a partir de hoje — atualiza sozinho quando o mês vira`));
    container.appendChild(UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "a_receber", label: "A receber", align: "right", render: (r) => Fmt.money(r.a_receber) },
        { key: "a_pagar", label: "A pagar", align: "right", render: (r) => Fmt.money(r.a_pagar) },
        { key: "saldo", label: "Saldo", align: "right", render: (r) => Fmt.money(r.saldo) },
        { key: "status", label: "Status", render: (r) => UI.badge(r.saldo >= 0 ? "Positivo" : "Atenção", r.saldo >= 0 ? "good" : "critical") },
      ],
      rows,
    })]));

    container.appendChild(UI.sectionTitle("Notas fiscais em aberto", "Adicionadas aqui manualmente ou por planilha — complementam a previsão acima"));
    container.appendChild(notasFiscaisCard(st));
  }

  function notasFiscaisCard(st) {
    const all = Storage.listContasExtras();
    const rows = (!st.division || st.division === "consolidado") ? all : all.filter((e) => e.division === st.division);
    rows.sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || ""));
    if (!rows.length) {
      return UI.h("div", { class: "card" }, [UI.emptyState({
        icon: "fileText", title: "Nenhuma nota fiscal cadastrada aqui ainda",
        body: 'Use "Nova nota fiscal" ou "Importar planilha" acima pra registrar contas a receber/pagar que ainda não vieram da última extração da planilha.',
      })]);
    }
    const showDivCol = !st.division || st.division === "consolidado";
    const columns = [
      { key: "vencimento", label: "Vencimento", render: (r) => Fmt.dateBR(r.vencimento) },
      { key: "tipo", label: "Tipo", render: (r) => UI.badge(TIPO_LABEL[r.tipo] || r.tipo, TIPO_KIND[r.tipo] || "muted") },
    ];
    if (showDivCol) columns.push({ key: "division", label: "Divisão", render: (r) => UI.badgeDivision(r.division) });
    columns.push(
      { key: "contraparte", label: "Cliente/Fornecedor", render: (r) => r.contraparte || "—" },
      { key: "nota_fiscal", label: "Nota fiscal", render: (r) => r.nota_fiscal || "—" },
      { key: "valor", label: "Valor", align: "right", render: (r) => Fmt.money(r.valor) },
      { key: "actions", label: "", render: (r) => nfActionsCell(r) },
    );
    return UI.h("div", { class: "card" }, [UI.table({ columns, rows })]);
  }

  function nfActionsCell(entry) {
    const editBtn = UI.h("button", { class: "icon-btn", title: "Editar" }, [Icon("edit", { size: 13 })]);
    editBtn.addEventListener("click", () => openNfModal(null, entry));
    const removeBtn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 13 })]);
    removeBtn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover essa nota fiscal (${Fmt.money(entry.valor)}, vencimento ${Fmt.dateBR(entry.vencimento)})?`);
      if (!ok) return;
      Storage.removeContaExtra(entry.id);
      UI.toast("Nota fiscal removida.");
      AppState.set({});
    });
    return UI.h("div", { style: "display:flex;justify-content:flex-end;gap:4px;" }, [editBtn, removeBtn]);
  }

  function counterpartyOptions() {
    const names = new Set();
    Compute.allTransactions().forEach((t) => { if (t.counterparty) names.add(t.counterparty); });
    return Array.from(names).sort().map((n) => UI.h("option", { value: n }, []));
  }

  function addNfBtn(st) {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Nova nota fiscal"]);
    btn.addEventListener("click", () => openNfModal(st));
    return btn;
  }

  // st: divisão default pra uma nota nova (só usado quando existing é null).
  // existing: a nota a editar, ou null pra cadastrar uma nova.
  function openNfModal(st, existing) {
    const isEdit = !!existing;
    const tipoSel = UI.h("select", {}, Object.entries(TIPO_LABEL).map(([v, l]) => UI.h("option", { value: v }, [l])));
    const divSel = UI.h("select", {}, [
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    const vencInput = UI.h("input", { type: "date", class: "input" });
    const valorInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const cpInput = UI.h("input", { class: "input", list: "contaNfNomeList", placeholder: "Nome do cliente/fornecedor" });
    const cpDatalist = UI.h("datalist", { id: "contaNfNomeList" }, counterpartyOptions());
    const notaInput = UI.h("input", { class: "input", placeholder: "Nº da nota fiscal" });
    const obsInput = UI.h("textarea", { class: "input", rows: 2, placeholder: "Observação (opcional)" });

    if (isEdit) {
      tipoSel.value = existing.tipo; divSel.value = existing.division;
      vencInput.value = existing.vencimento || ""; valorInput.value = existing.valor ?? "";
      cpInput.value = existing.contraparte || ""; notaInput.value = existing.nota_fiscal || "";
      obsInput.value = existing.observacao || "";
    } else {
      divSel.value = st && st.division !== "consolidado" ? st.division : "iluminacao";
    }

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, [isEdit ? "Salvar alterações" : "Salvar nota fiscal"]);
    const m = UI.modal({
      title: isEdit ? "Editar nota fiscal" : "Nova nota fiscal",
      body: [
        UI.h("div", { class: "field-row" }, [UI.field("Tipo", tipoSel), UI.field("Divisão", divSel)]),
        UI.h("div", { class: "field-row" }, [UI.field("Vencimento", vencInput), UI.field("Valor (R$)", valorInput)]),
        UI.field("Cliente/Fornecedor", UI.h("div", {}, [cpInput, cpDatalist])),
        UI.field("Nota fiscal (opcional)", notaInput),
        UI.field("Observação (opcional)", obsInput),
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      if (!vencInput.value || !valorInput.value) { UI.toast("Preencha ao menos o vencimento e o valor."); return; }
      const patch = {
        tipo: tipoSel.value, division: divSel.value, vencimento: vencInput.value,
        valor: Math.round(parseFloat(valorInput.value) * 100) / 100,
        contraparte: cpInput.value.trim() || null,
        nota_fiscal: notaInput.value.trim() || null,
        observacao: obsInput.value.trim() || null,
      };
      if (isEdit) { Storage.updateContaExtra(existing.id, patch); UI.toast("Nota fiscal atualizada."); }
      else { Storage.addContaExtra(patch); UI.toast("Nota fiscal salva."); }
      m.close();
      AppState.set({});
    });
  }

  function importNfBtn(st) {
    const btn = UI.h("button", { class: "btn btn-sm" }, [Icon("upload", { size: 14 }), "Importar planilha"]);
    btn.addEventListener("click", () => openNfImportModal(st));
    return btn;
  }

  function openNfImportModal(st) {
    const fileInput = UI.h("input", { type: "file" });
    const summaryBox = UI.h("div", { style: "font-size:12.5px;color:var(--text-secondary);line-height:1.6;min-height:20px;" }, [
      "Selecione a planilha. Tento reconhecer as colunas de Vencimento, Tipo, Divisão, Valor, Cliente/Fornecedor e Nota fiscal pelo cabeçalho — o que eu não conseguir identificar, você escolhe abaixo (vale pra planilha inteira).",
    ]);
    const tipoFallbackSel = UI.h("select", {}, [UI.h("option", { value: "" }, ["— detectar pela planilha —"])].concat(
      Object.entries(TIPO_LABEL).map(([v, l]) => UI.h("option", { value: v }, [l]))
    ));
    const divFallbackSel = UI.h("select", {}, [
      UI.h("option", { value: "" }, ["— detectar pela planilha —"]),
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    if (st && st.division !== "consolidado") divFallbackSel.value = st.division;
    const fallbackRow = UI.h("div", { class: "field-row" }, [
      UI.field("Se não achar Tipo na planilha, usar:", tipoFallbackSel),
      UI.field("Se não achar Divisão na planilha, usar:", divFallbackSel),
    ]);

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const confirmBtn = UI.h("button", { class: "btn btn-accent" }, ["Confirmar importação"]);
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = ".5";
    let parsed = null;

    const m = UI.modal({
      title: "Importar notas fiscais por planilha",
      body: [fallbackRow, UI.field("Arquivo", fileInput), summaryBox],
      footer: [cancelBtn, confirmBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());

    async function reparse() {
      const file = fileInput.files[0];
      if (!file) return;
      UI.clear(summaryBox);
      parsed = null;
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = ".5";
      summaryBox.appendChild(document.createTextNode("Lendo arquivo…"));
      try {
        const buf = await file.arrayBuffer();
        const result = ExcelImport.parseNotasFiscais(buf, {
          tipoFallback: tipoFallbackSel.value || null,
          divisionFallback: divFallbackSel.value || null,
        });
        parsed = result.rows;
        UI.clear(summaryBox);
        if (!parsed.length) {
          const reasons = [];
          if (result.skipped.data) reasons.push(`${result.skipped.data} sem vencimento reconhecível`);
          if (result.skipped.valor) reasons.push(`${result.skipped.valor} sem valor reconhecível`);
          if (result.skipped.tipo) reasons.push(`${result.skipped.tipo} sem tipo identificado`);
          if (result.skipped.divisao) reasons.push(`${result.skipped.divisao} sem divisão identificada`);
          summaryBox.appendChild(UI.h("span", { style: "color:var(--critical-text);" }, [
            "Não encontrei nenhuma linha válida nessa planilha." + (reasons.length ? " Linhas ignoradas: " + reasons.join(", ") + ". Tente escolher um valor fixo acima pra Tipo e/ou Divisão." : ""),
          ]));
          return;
        }
        const totalReceber = parsed.filter((r) => r.tipo === "a_receber").reduce((s, r) => s + r.valor, 0);
        const totalPagar = parsed.filter((r) => r.tipo === "a_pagar").reduce((s, r) => s + r.valor, 0);
        const lines = [`${Fmt.num(parsed.length)} nota(s) fiscal(is) reconhecida(s): ${Fmt.money(totalReceber)} a receber e ${Fmt.money(totalPagar)} a pagar.`];
        const skippedTotal = result.skipped.data + result.skipped.valor + result.skipped.tipo + result.skipped.divisao;
        if (skippedTotal) lines.push(`${Fmt.num(skippedTotal)} linha(s) ignorada(s) (sem data, valor, tipo ou divisão reconhecíveis).`);
        lines.forEach((l) => summaryBox.appendChild(UI.h("div", {}, [l])));
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = "1";
      } catch (e) {
        UI.clear(summaryBox);
        summaryBox.appendChild(UI.h("span", { style: "color:var(--critical-text);" }, ["Não consegui ler esse arquivo. Confirme que é uma planilha válida."]));
      }
    }
    fileInput.addEventListener("change", reparse);
    tipoFallbackSel.addEventListener("change", reparse);
    divFallbackSel.addEventListener("change", reparse);

    confirmBtn.addEventListener("click", () => {
      if (!parsed || !parsed.length) return;
      Storage.addContasExtrasBulk(parsed);
      UI.toast(`${Fmt.num(parsed.length)} nota(s) fiscal(is) importada(s).`);
      m.close();
      AppState.set({});
    });
  }

  window.Views = window.Views || {};
  window.Views.contas = render;
  window.Views.openNfModal = openNfModal;
})();
