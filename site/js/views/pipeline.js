// Previsões: entrada ou saída futura que você já sabe que vai acontecer mas
// ainda não é um lançamento real -- ex: um pedido de R$5.000 fechado em 3x.
// Cadastra o valor total + nº de parcelas + mês da 1ª parcela, e o sistema
// distribui automaticamente pelos meses seguintes. Puro planejamento
// (localStorage): não conta no DRE nem no fluxo de caixa realizado -- quando
// a parcela realmente acontecer, registra o lançamento normal em Lançamentos.
(function () {
  const STATUS_LABEL = { ativo: "Ativo", cancelado: "Cancelado" };
  const STATUS_KIND = { ativo: "neutral", cancelado: "muted" };
  const TIPO_LABEL = { entrada: "Entrada", saida: "Saída" };
  const TIPO_KIND = { entrada: "good", saida: "critical" };

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false, extra: [addBtn(st)] });

    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:20px;" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Como funciona"]),
        UI.h("div", { class: "insight-body" }, [
          "Cadastre algo que você já sabe que vai entrar ou sair, mesmo que ainda não tenha acontecido: um pedido fechado em parcelas, uma compra grande programada, etc. " +
          "Informe o valor total, em quantas parcelas e o mês da 1ª — o sistema divide o valor e mostra em qual mês cada parcela cai. " +
          "É só planejamento: não vira lançamento nem entra no DRE sozinho. Quando a parcela realmente acontecer, registre o lançamento de verdade em Lançamentos. " +
          "Marque como <b>Cancelado</b> se não for mais acontecer — some da previsão sem precisar apagar o histórico.",
        ]),
      ]),
    ]));

    const summary = Compute.pipelineSummary(st.division);
    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Total a entrar (previsto)", value: Fmt.money(summary.totalEntrada) }),
      UI.statTile({ label: "Total a sair (previsto)", value: Fmt.money(summary.totalSaida) }),
      UI.statTile({ label: "Saldo previsto", value: Fmt.money(summary.saldo), foot: summary.saldo >= 0 ? "Positivo" : "Atenção: negativo" }),
      UI.statTile({ label: "Previsões ativas", value: Fmt.num(summary.items.filter((p) => p.status !== "cancelado").length), foot: `${summary.items.length} no total` }),
    ]));

    if (!summary.items.length) {
      container.appendChild(UI.card([UI.emptyState({
        icon: "users", title: "Nenhuma previsão cadastrada",
        body: "Clique em \"Nova previsão\" pra registrar algo que ainda vai entrar ou sair do caixa.",
      })]));
      return;
    }

    if (summary.monthly.length) {
      container.appendChild(UI.sectionTitle("Previsão por mês", "Entradas e saídas ainda não realizadas, distribuídas pelas parcelas"));
      container.appendChild(UI.chartCardWithTable({
        title: "Entrada vs Saída prevista",
        draw: (wrap) => Charts.lineArea(wrap, {
          xKeys: summary.monthly.map((r) => r.mes), xLabelFn: (m) => Fmt.monthLabel(m, "full"),
          series: [
            { key: "entrada", label: "Entrada", color: Charts.cssVar("--series-1"), values: summary.monthly.map((r) => r.entrada) },
            { key: "saida", label: "Saída", color: Charts.cssVar("--series-2"), values: summary.monthly.map((r) => r.saida) },
          ],
          height: 240,
        }),
        columns: [
          { key: "mes", label: "Mês", render: (r) => Fmt.monthLabel(r.mes, "full") },
          { key: "entrada", label: "Entrada", align: "right", render: (r) => Fmt.money(r.entrada) },
          { key: "saida", label: "Saída", align: "right", render: (r) => Fmt.money(r.saida) },
          { key: "saldo", label: "Saldo", align: "right", render: (r) => Fmt.money(r.saldo) },
        ],
        rows: summary.monthly,
      }));
    }

    container.appendChild(UI.sectionTitle("Previsões cadastradas", `${summary.items.length} no total`));
    container.appendChild(UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "descricao", label: "Descrição", wrap: true },
        { key: "tipo", label: "Tipo", render: (r) => UI.badge(TIPO_LABEL[r.tipo] || r.tipo, TIPO_KIND[r.tipo] || "muted") },
        { key: "divisao", label: "Divisão", render: (r) => UI.badgeDivision(r.divisao) },
        { key: "valor_total", label: "Valor total", align: "right", render: (r) => Fmt.money(r.valor_total) },
        { key: "parcelas", label: "Parcelas", render: (r) => parcelasCell(r) },
        { key: "status", label: "Status", render: (r) => UI.badge(STATUS_LABEL[r.status] || r.status, STATUS_KIND[r.status] || "muted") },
        { key: "actions", label: "", render: (r) => actionsCell(r) },
      ],
      rows: summary.items.slice().sort((a, b) => (b.mes_inicio || "").localeCompare(a.mes_inicio || "")),
    })]));
  }

  function parcelasCell(r) {
    const n = Math.max(1, parseInt(r.parcelas, 10) || 1);
    const valorParcela = (Number(r.valor_total) || 0) / n;
    if (!r.mes_inicio) return `${n}x de ${Fmt.money(valorParcela, { compact: true })}`;
    const insts = Compute.pipelineInstallments(r);
    const first = Fmt.monthLabel(insts[0].mes);
    const last = Fmt.monthLabel(insts[insts.length - 1].mes);
    return n === 1
      ? `À vista · ${first}`
      : `${n}x de ${Fmt.money(valorParcela, { compact: true })} · ${first} a ${last}`;
  }

  function actionsCell(p) {
    return UI.h("div", { style: "display:flex;gap:5px;justify-content:flex-end;" }, [editBtn(p), removeBtn(p)]);
  }
  function editBtn(p) {
    const btn = UI.h("button", { class: "icon-btn", title: "Editar" }, [Icon("edit", { size: 13 })]);
    btn.addEventListener("click", () => openPipelineModal(p));
    return btn;
  }
  function removeBtn(p) {
    const btn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 13 })]);
    btn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover a previsão "${p.descricao}"?`);
      if (ok) { Storage.removePipelineItem(p.id); UI.toast("Previsão removida."); AppState.set({}); }
    });
    return btn;
  }
  function addBtn(st) {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Nova previsão"]);
    btn.addEventListener("click", () => openPipelineModal(null, st));
    return btn;
  }

  function openPipelineModal(existing, st) {
    const descInput = UI.h("input", { class: "input", placeholder: "Ex: Pedido Cliente X, Compra de equipamento…" });
    const tipoSel = UI.h("select", {}, Object.entries(TIPO_LABEL).map(([v, l]) => UI.h("option", { value: v }, [l])));
    const divSel = UI.h("select", {}, [
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    const valorInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const parcelasInput = UI.h("input", { type: "number", step: "1", min: "1", class: "input" });
    const mesInput = UI.h("input", { type: "month", class: "input" });
    const statusSel = UI.h("select", {}, Object.entries(STATUS_LABEL).map(([v, l]) => UI.h("option", { value: v }, [l])));
    const statusField = UI.field("Status", statusSel);
    const notaInput = UI.h("textarea", { class: "input", rows: 2, placeholder: "Observação (opcional)" });
    const preview = UI.h("div", { style: "font-size:12px;color:var(--text-muted);margin-top:-6px;margin-bottom:2px;" }, []);

    function syncPreview() {
      const total = parseFloat(valorInput.value);
      const n = Math.max(1, parseInt(parcelasInput.value, 10) || 1);
      UI.clear(preview);
      if (!total || !mesInput.value) { preview.appendChild(document.createTextNode("Preencha valor, parcelas e mês pra ver a distribuição.")); return; }
      const insts = Compute.pipelineInstallments({ valor_total: total, parcelas: n, mes_inicio: mesInput.value });
      const txt = insts.map((i) => `${Fmt.monthLabel(i.mes)}: ${Fmt.money(i.valor)}`).join(" · ");
      preview.appendChild(document.createTextNode(txt));
    }
    [valorInput, parcelasInput, mesInput].forEach((el) => el.addEventListener("input", syncPreview));

    if (existing) {
      descInput.value = existing.descricao || "";
      tipoSel.value = existing.tipo || "entrada";
      divSel.value = existing.divisao || "iluminacao";
      valorInput.value = existing.valor_total || "";
      parcelasInput.value = existing.parcelas || 1;
      mesInput.value = existing.mes_inicio || "";
      statusSel.value = existing.status || "ativo";
      notaInput.value = existing.nota || "";
      statusField.style.display = "";
    } else {
      divSel.value = st && st.division !== "consolidado" ? st.division : "iluminacao";
      parcelasInput.value = 1;
      statusSel.value = "ativo";
      statusField.style.display = "none";
    }
    syncPreview();

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, [existing ? "Salvar alterações" : "Salvar previsão"]);
    const m = UI.modal({
      title: existing ? "Editar previsão" : "Nova previsão",
      body: [
        UI.field("Descrição", descInput),
        UI.h("div", { class: "field-row" }, [UI.field("Tipo", tipoSel), UI.field("Divisão", divSel)]),
        UI.h("div", { class: "field-row" }, [UI.field("Valor total (R$)", valorInput), UI.field("Nº de parcelas", parcelasInput)]),
        UI.field("Mês da 1ª parcela", mesInput),
        preview,
        statusField,
        UI.field("Observação", notaInput),
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      if (!descInput.value.trim() || !valorInput.value || !mesInput.value) { UI.toast("Preencha descrição, valor total e mês da 1ª parcela."); return; }
      const payload = {
        descricao: descInput.value.trim(), tipo: tipoSel.value, divisao: divSel.value,
        valor_total: parseFloat(valorInput.value), parcelas: Math.max(1, parseInt(parcelasInput.value, 10) || 1),
        mes_inicio: mesInput.value, status: statusSel.value, nota: notaInput.value.trim(),
      };
      if (existing) Storage.updatePipelineItem(existing.id, payload); else Storage.addPipelineItem(payload);
      UI.toast("Previsão salva.");
      m.close();
      AppState.set({});
    });
  }

  window.Views = window.Views || {};
  window.Views.pipeline = render;
})();
