// Investimentos: capacidade de investir (linha a linha, nunca só o
// resultado final) + registro de decisão (avaliando/aprovado/rejeitado/
// concluido) -- "Decisão" não é página própria, é um campo de status aqui,
// no mesmo padrão que Previsões já usa (status ativo/cancelado).
(function () {
  const STATUS_LABEL = { avaliando: "Avaliando", aprovado: "Aprovado", rejeitado: "Rejeitado", concluido: "Concluído" };
  const STATUS_KIND = { avaliando: "neutral", aprovado: "good", rejeitado: "critical", concluido: "muted" };
  const CATEGORIA_LABEL = {
    reserva_operacional: "Reserva operacional", investimentos_financeiros: "Investimentos financeiros",
    investimentos_empresa: "Investimentos na empresa", expansao: "Expansão", equipamentos: "Equipamentos",
    tecnologia: "Tecnologia", marketing: "Marketing", outros: "Outros",
  };

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false, extra: [addBtn(st)] });

    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:20px;" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Como é calculada a capacidade"]),
        UI.h("div", { class: "insight-body" }, [UI.richText(
          "Capacidade = Confirmado (Visão Futura) − Estimado (parcela de dívida) − caixa mínimo reservado − o que já foi aprovado antes. " +
          "O Projetado por tendência fica de fora de propósito: é conservador, não dimensiona investimento em cima de uma extrapolação estatística."
        )]),
      ]),
    ]));

    const cap = Compute.investmentCapacity(st.division, { monthsAhead: 6 });
    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Capacidade (6m)", value: Fmt.money(cap.capacidadeTotal), foot: cap.capacidadeTotal >= 0 ? "Positiva" : "Negativa -- reavaliar aprovações" }),
      UI.statTile({ label: "Já aprovado (6m)", value: Fmt.money(cap.jaAprovadoTotal) }),
      UI.statTile({ label: "Caixa mínimo reservado/mês", value: Fmt.money(cap.caixaMinimo), foot: cap.caixaMinimo ? "Configurado" : "Não configurado (0)" }),
      UI.statTile({ label: "Investimentos cadastrados", value: Fmt.num(Storage.listInvestimentos().length) }),
    ]));

    container.appendChild(UI.sectionTitle("Capacidade mês a mês", "Confirmado − Estimado (dívida) − caixa mínimo − já aprovado = capacidade"));
    container.appendChild(UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "confirmado", label: "Confirmado", align: "right", render: (r) => Fmt.money(r.confirmado) },
        { key: "estimadoDivida", label: "− Estimado (dívida)", align: "right", render: (r) => Fmt.money(r.estimadoDivida) },
        { key: "caixaMinimo", label: "− Caixa mínimo", align: "right", render: (r) => Fmt.money(r.caixaMinimo) },
        { key: "jaAprovado", label: "− Já aprovado", align: "right", render: (r) => Fmt.money(r.jaAprovado) },
        { key: "capacidade", label: "= Capacidade", align: "right", render: (r) => Fmt.money(r.capacidade) },
      ],
      rows: cap.rows,
    })]));

    const list = Storage.listInvestimentos();
    container.appendChild(UI.sectionTitle("Investimentos cadastrados", `${list.length} no total`));
    if (!list.length) {
      container.appendChild(UI.card([UI.emptyState({
        icon: "wallet", title: "Nenhum investimento cadastrado",
        body: "Clique em \"Novo investimento\" pra registrar uma decisão em avaliação.",
      })]));
      return;
    }
    container.appendChild(UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "nome", label: "Nome", wrap: true },
        { key: "divisao", label: "Divisão", render: (r) => (r.divisao ? UI.badgeDivision(r.divisao) : UI.badge("Todas", "muted")) },
        { key: "categoria", label: "Categoria", render: (r) => UI.badge(CATEGORIA_LABEL[r.categoria] || r.categoria, "muted") },
        { key: "valor", label: "Valor", align: "right", render: (r) => Fmt.money(r.valor) },
        { key: "data_prevista", label: "Data prevista", render: (r) => Fmt.dateBR(r.data_prevista) },
        { key: "status", label: "Status", render: (r) => UI.badge(STATUS_LABEL[r.status] || r.status, STATUS_KIND[r.status] || "muted") },
        { key: "actions", label: "", render: (r) => actionsCell(r) },
      ],
      rows: list.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    })]));
  }

  function actionsCell(inv) {
    const wrap = UI.h("div", { style: "display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap;" });
    if (inv.status === "avaliando") {
      const aprovarBtn = UI.h("button", { class: "btn btn-sm" }, ["Aprovar"]);
      aprovarBtn.addEventListener("click", () => { Storage.updateInvestimento(inv.id, { status: "aprovado", decisao_data: new Date().toISOString().slice(0, 10) }); UI.toast("Investimento aprovado -- já entra na capacidade e na Visão Futura."); AppState.set({}); });
      const rejeitarBtn = UI.h("button", { class: "btn btn-sm" }, ["Rejeitar"]);
      rejeitarBtn.addEventListener("click", () => { Storage.updateInvestimento(inv.id, { status: "rejeitado", decisao_data: new Date().toISOString().slice(0, 10) }); UI.toast("Investimento rejeitado."); AppState.set({}); });
      wrap.appendChild(aprovarBtn); wrap.appendChild(rejeitarBtn);
    }
    if (inv.status === "aprovado") {
      const concluirBtn = UI.h("button", { class: "btn btn-sm" }, ["Marcar concluído"]);
      concluirBtn.addEventListener("click", () => { Storage.updateInvestimento(inv.id, { status: "concluido" }); UI.toast("Investimento concluído."); AppState.set({}); });
      wrap.appendChild(concluirBtn);
    }
    const editBtn = UI.h("button", { class: "icon-btn", title: "Editar" }, [Icon("edit", { size: 13 })]);
    editBtn.addEventListener("click", () => openModal(inv));
    const removeBtn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 13 })]);
    removeBtn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover "${inv.nome}"?`);
      if (ok) { Storage.removeInvestimento(inv.id); UI.toast("Investimento removido."); AppState.set({}); }
    });
    wrap.appendChild(editBtn); wrap.appendChild(removeBtn);
    return wrap;
  }

  function addBtn(st) {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Novo investimento"]);
    btn.addEventListener("click", () => openModal(null, st));
    return btn;
  }

  function openModal(existing, st) {
    const nomeInput = UI.h("input", { class: "input", placeholder: "Ex: Novo maquinário de corte" });
    const divSel = UI.h("select", {}, [
      UI.h("option", { value: "" }, ["Todas as divisões"]),
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    const catSel = UI.h("select", {}, Object.entries(CATEGORIA_LABEL).map(([v, l]) => UI.h("option", { value: v }, [l])));
    const valorInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const dataInput = UI.h("input", { type: "date", class: "input" });
    const prioridadeSel = UI.h("select", {}, [
      UI.h("option", { value: "alta" }, ["Alta"]), UI.h("option", { value: "media" }, ["Média"]), UI.h("option", { value: "baixa" }, ["Baixa"]),
    ]);
    const notaInput = UI.h("textarea", { class: "input", rows: 2, placeholder: "Observação (opcional)" });

    if (existing) {
      nomeInput.value = existing.nome || "";
      divSel.value = existing.divisao || "";
      catSel.value = existing.categoria || "outros";
      valorInput.value = existing.valor || "";
      dataInput.value = existing.data_prevista || "";
      prioridadeSel.value = existing.prioridade || "media";
      notaInput.value = existing.nota || "";
    } else {
      divSel.value = st && st.division !== "consolidado" ? st.division : "";
      prioridadeSel.value = "media";
    }

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, [existing ? "Salvar alterações" : "Cadastrar"]);
    const m = UI.modal({
      title: existing ? "Editar investimento" : "Novo investimento",
      body: [
        UI.field("Nome", nomeInput),
        UI.h("div", { class: "field-row" }, [UI.field("Divisão", divSel), UI.field("Categoria", catSel)]),
        UI.h("div", { class: "field-row" }, [UI.field("Valor (R$)", valorInput), UI.field("Data prevista", dataInput)]),
        UI.field("Prioridade", prioridadeSel),
        UI.field("Observação", notaInput),
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      if (!nomeInput.value.trim() || !valorInput.value || !dataInput.value) { UI.toast("Preencha nome, valor e data prevista."); return; }
      const payload = {
        nome: nomeInput.value.trim(), divisao: divSel.value || null, categoria: catSel.value,
        valor: parseFloat(valorInput.value), data_prevista: dataInput.value,
        prioridade: prioridadeSel.value, nota: notaInput.value.trim(),
      };
      if (existing) Storage.updateInvestimento(existing.id, payload); else Storage.addInvestimento(payload);
      UI.toast("Investimento salvo.");
      m.close();
      AppState.set({});
    });
  }

  window.Views = window.Views || {};
  window.Views.investimentos = render;
})();
