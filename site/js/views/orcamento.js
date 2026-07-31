(function () {
  function statusFor(pct) {
    if (pct >= 1) return ["critical", "Estourado"];
    if (pct >= 0.9) return ["warning", "Perto do limite"];
    if (pct >= 0.7) return ["warning", "Atenção"];
    return ["good", "Sob controle"];
  }

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: true, extra: [addBtn(st)] });
    const rows = Compute.budgetStatus(st.division, st.month);

    if (!rows.length) {
      container.appendChild(UI.card([UI.emptyState({
        icon: "wallet", title: "Nenhum orçamento definido para essa divisão",
        body: "Defina um limite mensal por categoria e acompanhe o quanto já foi gasto — com alerta em 70%, 90% e 100%.",
      })]));
      return;
    }

    const grid = UI.h("div", { class: "grid grid-2", style: "align-items:start;" }, rows.map((r) => budgetCard(r, st)));
    container.appendChild(grid);
  }

  function budgetCard(r, st) {
    const pct = r.limite ? r.atual / r.limite : 0;
    const [kind, label] = statusFor(pct);
    const card = UI.h("div", { class: "card" }, [
      UI.h("div", { style: "display:flex;justify-content:space-between;align-items:flex-start;" }, [
        UI.h("div", { style: "font-weight:700;font-size:13.5px;" }, [Fmt.titleCase(r.categoria)]),
        UI.h("div", { style: "display:flex;gap:6px;" }, [UI.badge(label, kind), removeBtn(r)]),
      ]),
      UI.h("div", { style: "margin-top:14px;" }, [
        UI.h("div", { style: "display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;" }, [
          UI.h("span", { class: "tabular" }, [`${Fmt.money(r.atual)} de ${Fmt.money(r.limite)}`]),
          UI.h("span", { class: "tabular" }, [Fmt.pct(pct)]),
        ]),
        UI.h("div", { class: "meter-track" }, [UI.h("div", { class: `meter-fill ${kind}`, style: `width:${Math.min(100, pct * 100)}%;` })]),
      ]),
    ]);
    return card;
  }

  function removeBtn(r) {
    const btn = UI.h("button", { class: "icon-btn", title: "Remover orçamento" }, [Icon("trash", { size: 13 })]);
    btn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover o orçamento de "${Fmt.titleCase(r.categoria)}"?`);
      if (ok) { Storage.setOrcamentoLimite(r.division, r.categoria, null); UI.toast("Orçamento removido."); AppState.set({}); }
    });
    return btn;
  }

  function addBtn(st) {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Definir orçamento"]);
    btn.addEventListener("click", () => openModal(st));
    return btn;
  }

  function openModal(st) {
    const divSel = UI.h("select", {}, [
      UI.h("option", { value: "consolidado" }, ["Consolidado"]),
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    divSel.value = st.division;
    const catSel = UI.h("select", {}, Categories.list.map((c) => UI.h("option", { value: c }, [Fmt.titleCase(c)])));
    const limiteInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "Ex: 5000" });

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, ["Salvar"]);
    const m = UI.modal({
      title: "Definir orçamento mensal",
      body: [
        UI.h("div", { class: "field-row" }, [UI.field("Divisão", divSel), UI.field("Categoria", catSel)]),
        UI.field("Limite mensal (R$)", limiteInput),
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      const limite = parseFloat(limiteInput.value);
      if (!limite || limite <= 0) { UI.toast("Informe um limite válido."); return; }
      Storage.setOrcamentoLimite(divSel.value, catSel.value, limite);
      UI.toast("Orçamento salvo.");
      m.close();
      AppState.set({});
    });
  }

  window.Views = window.Views || {};
  window.Views.orcamento = render;
})();
