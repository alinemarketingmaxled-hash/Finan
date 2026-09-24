// Cenários: aplica variação percentual de receita/despesa sobre a linha
// Projetada do Forecast. Base/Conservador/Crescimento são fixos (definidos
// em Compute.scenariosSummary); a simulação rápida é ad-hoc (não salva nada
// até clicar em "Salvar como cenário").
(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false });

    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:20px;" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Como funciona"]),
        UI.h("div", { class: "insight-body" }, [UI.richText(
          "Cada cenário aplica uma variação percentual de receita e despesa sobre a linha <b>Projetado</b> do Forecast (nunca sobre Realizado ou Confirmado). " +
          "Base é a tendência atual, sem ajuste. Use a simulação rápida para testar uma hipótese na hora, sem salvar nada."
        )]),
      ]),
    ]));

    quickSimSection(container, st);

    const scenarios = Compute.scenariosSummary(st.division, { monthsAhead: 12 });
    container.appendChild(UI.sectionTitle("Cenários", "Base, Conservador, Crescimento e os que você salvar"));
    container.appendChild(UI.h("div", { class: "grid grid-3", style: "align-items:start;" }, scenarios.map(scenarioCard)));

    const saved = Storage.listCenarios();
    if (saved.length) {
      container.appendChild(UI.sectionTitle("Cenários salvos", `${saved.length} no total`));
      container.appendChild(UI.h("div", { class: "card" }, [UI.table({
        columns: [
          { key: "nome", label: "Nome" },
          { key: "divisao", label: "Divisão", render: (r) => (r.divisao ? UI.badgeDivision(r.divisao) : UI.badge("Todas", "muted")) },
          { key: "receita_pct", label: "Receita", align: "right", render: (r) => Fmt.pct(r.premissas.receita_pct || 0) },
          { key: "despesa_pct", label: "Despesa", align: "right", render: (r) => Fmt.pct(r.premissas.despesa_pct || 0) },
          { key: "actions", label: "", render: (r) => removeBtn(r) },
        ],
        rows: saved,
      })]));
    }
  }

  function scenarioCard(sc) {
    const kind = sc.resultado >= 0 ? "good" : "critical";
    return UI.h("div", { class: "card" }, [
      UI.h("div", { style: "display:flex;justify-content:space-between;align-items:flex-start;" }, [
        UI.h("div", {}, [
          UI.h("div", { style: "font-weight:700;font-size:14px;" }, [sc.nome]),
          sc.isSistema ? UI.badge("Padrão", "muted") : UI.badge("Salvo", "neutral"),
        ]),
      ]),
      sc.descricao ? UI.h("div", { style: "font-size:12px;color:var(--text-secondary);margin-top:8px;" }, [sc.descricao]) : null,
      UI.h("div", { class: "grid grid-2", style: "margin-top:14px;gap:10px;" }, [
        stat("Receita", Fmt.pct(sc.premissas.receita_pct || 0)),
        stat("Despesa", Fmt.pct(sc.premissas.despesa_pct || 0)),
      ]),
      UI.h("div", { style: "margin-top:14px;padding-top:12px;border-top:1px solid var(--border);" }, [
        UI.h("div", { style: "font-size:11px;color:var(--text-muted);" }, ["Resultado projetado (12m)"]),
        UI.h("div", { class: "tabular", style: `font-size:17px;font-weight:700;color:var(--${kind}-text,inherit);` }, [Fmt.money(sc.resultado)]),
      ]),
    ]);
  }

  function stat(label, value) {
    return UI.h("div", {}, [
      UI.h("div", { style: "font-size:11px;color:var(--text-muted);margin-bottom:2px;" }, [label]),
      UI.h("div", { class: "tabular", style: "font-size:13px;font-weight:700;" }, [value]),
    ]);
  }

  function removeBtn(sc) {
    const btn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 13 })]);
    btn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover o cenário "${sc.nome}"?`);
      if (ok) { Storage.removeCenario(sc.id); UI.toast("Cenário removido."); AppState.set({}); }
    });
    return btn;
  }

  // Simulação rápida: não usa Storage.cenarios -- é Compute.applyScenario()
  // chamado ad-hoc a cada movimento do slider, comparado contra a linha Base.
  function quickSimSection(container, st) {
    const receitaInput = UI.h("input", { type: "range", min: "-50", max: "50", step: "1", value: "-15" });
    const despesaInput = UI.h("input", { type: "range", min: "-50", max: "50", step: "1", value: "0" });
    const receitaLabel = UI.h("span", { class: "tabular", style: "font-weight:700;" }, ["-15%"]);
    const despesaLabel = UI.h("span", { class: "tabular", style: "font-weight:700;" }, ["0%"]);
    const resultWrap = UI.h("div", {});
    const nomeInput = UI.h("input", { class: "input", placeholder: "Nome do cenário (para salvar)" });
    const saveBtn = UI.h("button", { class: "btn btn-accent btn-sm" }, ["Salvar como cenário"]);

    function refresh() {
      const receita_pct = Number(receitaInput.value) / 100;
      const despesa_pct = Number(despesaInput.value) / 100;
      receitaLabel.textContent = `${receitaInput.value}%`;
      despesaLabel.textContent = `${despesaInput.value}%`;

      const baseRows = Compute.forecast(st.division, { monthsAhead: 12 }).filter((r) => r.status === Compute.STATUS.PROJETADO);
      const simRows = Compute.applyScenario(baseRows, { receita_pct, despesa_pct });
      const baseResultado = round2sum(baseRows.map((r) => r.resultado));
      const simResultado = round2sum(simRows.map((r) => r.resultado));
      const delta = round2sum([simResultado, -baseResultado]);

      UI.clear(resultWrap);
      resultWrap.appendChild(UI.h("div", { class: "grid grid-3" }, [
        UI.statTile({ label: "Resultado Base (12m)", value: Fmt.money(baseResultado) }),
        UI.statTile({ label: "Resultado simulado (12m)", value: Fmt.money(simResultado) }),
        UI.statTile({ label: "Diferença vs Base", value: Fmt.money(delta), foot: delta >= 0 ? "Melhora" : "Piora" }),
      ]));
    }
    receitaInput.addEventListener("input", refresh);
    despesaInput.addEventListener("input", refresh);
    refresh();

    saveBtn.addEventListener("click", () => {
      if (!nomeInput.value.trim()) { UI.toast("Dê um nome pro cenário antes de salvar."); return; }
      Storage.addCenario({
        nome: nomeInput.value.trim(),
        divisao: st.division === "consolidado" ? null : st.division,
        descricao: "Criado pela simulação rápida.",
        premissas: { receita_pct: Number(receitaInput.value) / 100, despesa_pct: Number(despesaInput.value) / 100 },
      });
      UI.toast("Cenário salvo.");
      nomeInput.value = "";
      AppState.set({});
    });

    container.appendChild(UI.sectionTitle("Simulação rápida", "Não salva nada até você clicar em \"Salvar como cenário\""));
    container.appendChild(UI.h("div", { class: "card", style: "margin-bottom:20px;" }, [
      UI.h("div", { class: "field-row" }, [
        UI.field("Variação de receita", UI.h("div", { style: "display:flex;align-items:center;gap:10px;" }, [receitaInput, receitaLabel])),
        UI.field("Variação de despesa", UI.h("div", { style: "display:flex;align-items:center;gap:10px;" }, [despesaInput, despesaLabel])),
      ]),
      resultWrap,
      UI.h("div", { class: "field-row", style: "margin-top:8px;align-items:end;" }, [
        UI.h("div", { style: "flex:1;" }, [nomeInput]),
        saveBtn,
      ]),
    ]));
  }

  function round2sum(list) { return Math.round((list.reduce((s, v) => s + v, 0) + Number.EPSILON) * 100) / 100; }

  window.Views = window.Views || {};
  window.Views.cenarios = render;
})();
