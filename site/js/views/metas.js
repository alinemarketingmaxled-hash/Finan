(function () {
  const TIPOS = {
    receita_mensal: "Receita mensal",
    margem_liquida: "Margem líquida",
    quitacao_divida: "Quitação de dívida",
    personalizada: "Personalizada",
  };

  function currentValue(meta) {
    const lastMonth = AppState.detailedMonths[AppState.detailedMonths.length - 1];
    if (meta.tipo === "receita_mensal") {
      return Compute.dreForPeriod(meta.divisao, lastMonth, "financeiro").receita_bruta;
    }
    if (meta.tipo === "margem_liquida") {
      return Compute.dreForPeriod(meta.divisao, lastMonth, "financeiro").margem_liquida;
    }
    if (meta.tipo === "quitacao_divida") {
      const t = Compute.loansTotals(meta.divisao);
      return t.valor_total ? t.valor_pago / t.valor_total : 0;
    }
    return Number(meta.currentValue) || 0;
  }

  function render(container) {
    const metas = Storage.listMetas();
    const head = UI.h("div", { style: "display:flex;justify-content:flex-end;margin-bottom:16px;" }, [addBtn()]);
    container.appendChild(head);

    if (!metas.length) {
      container.appendChild(UI.card([UI.emptyState({
        icon: "target", title: "Nenhuma meta cadastrada ainda",
        body: "Crie metas de receita, margem, quitação de dívida ou personalizadas para acompanhar o progresso da empresa.",
      })]));
      return;
    }

    container.appendChild(UI.h("div", { class: "grid grid-2", style: "align-items:start;" }, metas.map(metaCard)));
  }

  function metaCard(meta) {
    const cur = currentValue(meta);
    const isPct = meta.tipo === "margem_liquida" || meta.tipo === "quitacao_divida";
    const target = Number(meta.targetValue) || 1;
    const pct = Math.max(0, Math.min(100, (cur / target) * 100));
    const fmt = (v) => (isPct ? Fmt.pct(v) : Fmt.money(v));

    const card = UI.h("div", { class: "card" }, [
      UI.h("div", { style: "display:flex;justify-content:space-between;align-items:flex-start;gap:8px;" }, [
        UI.h("div", {}, [
          UI.h("div", { style: "font-weight:700;font-size:14px;" }, [meta.title]),
          UI.h("div", { style: "display:flex;gap:6px;margin-top:6px;" }, [UI.badge(TIPOS[meta.tipo], "muted"), meta.divisao ? UI.badgeDivision(meta.divisao) : null]),
        ]),
        UI.h("div", { style: "display:flex;gap:6px;" }, [editBtn(meta), removeBtn(meta)]),
      ]),
      UI.h("div", { style: "margin-top:16px;" }, [
        UI.h("div", { style: "display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;" }, [
          UI.h("span", {}, [`${fmt(cur)} de ${fmt(target)}`]),
          UI.h("span", { class: "tabular" }, [`${Math.round(pct)}%`]),
        ]),
        UI.h("div", { class: "meter-track" }, [UI.h("div", { class: `meter-fill ${pct >= 100 ? "good" : pct >= 50 ? "" : "warning"}`, style: `width:${pct}%;` })]),
      ]),
      meta.targetDate ? UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);margin-top:10px;" }, [`Prazo: ${Fmt.dateBR(meta.targetDate)}`]) : null,
    ]);
    return card;
  }

  function editBtn(meta) {
    const btn = UI.h("button", { class: "icon-btn", title: "Editar" }, [Icon("settings", { size: 14 })]);
    btn.addEventListener("click", () => openMetaModal(meta));
    return btn;
  }
  function removeBtn(meta) {
    const btn = UI.h("button", { class: "icon-btn", title: "Excluir" }, [Icon("trash", { size: 14 })]);
    btn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Excluir a meta "${meta.title}"?`);
      if (ok) { Storage.removeMeta(meta.id); UI.toast("Meta removida."); AppState.set({}); }
    });
    return btn;
  }
  function addBtn() {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Nova meta"]);
    btn.addEventListener("click", () => openMetaModal());
    return btn;
  }

  function openMetaModal(existing) {
    const titleInput = UI.h("input", { class: "input", placeholder: "Ex: Aumentar receita da Iluminação" });
    titleInput.value = existing ? existing.title : "";
    const tipoSel = UI.h("select", {}, Object.entries(TIPOS).map(([v, l]) => UI.h("option", { value: v }, [l])));
    const divSel = UI.h("select", {}, [
      UI.h("option", { value: "consolidado" }, ["Consolidado"]),
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    const targetInput = UI.h("input", { type: "number", step: "0.01", class: "input", placeholder: "Ex: 300000 ou 0.15 para 15%" });
    const dateInput = UI.h("input", { type: "date", class: "input" });
    const curInput = UI.h("input", { type: "number", step: "0.01", class: "input", placeholder: "Valor atual (apenas metas personalizadas)" });
    const curField = UI.field("Valor atual", curInput);

    if (existing) {
      tipoSel.value = existing.tipo; divSel.value = existing.divisao || "consolidado";
      targetInput.value = existing.targetValue; dateInput.value = existing.targetDate || "";
      curInput.value = existing.currentValue || 0;
    }
    function sync() { curField.style.display = tipoSel.value === "personalizada" ? "" : "none"; }
    tipoSel.addEventListener("change", sync); sync();

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, ["Salvar"]);
    const m = UI.modal({
      title: existing ? "Editar meta" : "Nova meta",
      body: [
        UI.field("Título", titleInput),
        UI.h("div", { class: "field-row" }, [UI.field("Tipo", tipoSel), UI.field("Divisão", divSel)]),
        UI.h("div", { class: "field-row" }, [UI.field("Valor alvo", targetInput), UI.field("Prazo (opcional)", dateInput)]),
        curField,
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      if (!titleInput.value.trim() || !targetInput.value) { UI.toast("Preencha título e valor alvo."); return; }
      const payload = {
        title: titleInput.value.trim(), tipo: tipoSel.value, divisao: divSel.value,
        targetValue: parseFloat(targetInput.value), targetDate: dateInput.value || null,
        currentValue: tipoSel.value === "personalizada" ? parseFloat(curInput.value || 0) : undefined,
      };
      if (existing) Storage.updateMeta(existing.id, payload); else Storage.addMeta(payload);
      UI.toast("Meta salva.");
      m.close();
      AppState.set({});
    });
  }

  window.Views = window.Views || {};
  window.Views.metas = render;
})();
