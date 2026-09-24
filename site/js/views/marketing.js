// Marketing: quanto um investimento em publicidade/marketing precisa trazer
// de volta em vendas pra se pagar. Calculadora ao vivo (Compute.marketingReturnNeeded),
// com opção de salvar a simulação pra comparar depois -- mesmo padrão de
// Cenários (simulação rápida + "salvar").
(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: true, showBasis: false });

    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:20px;", "data-tour": "mk-insight" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Como é calculado"]),
        UI.h("div", { class: "insight-body" }, [UI.richText(
          "O retorno mínimo é o valor investido dividido pela margem bruta do período selecionado (receita menos impostos e custo de mercadoria, antes das despesas fixas). " +
          "Uma venda gerada pela campanha ainda tem custo de mercadoria, mas normalmente não aumenta despesa fixa (aluguel, folha), por isso a margem bruta é a referência mais direta aqui. " +
          "A margem líquida aparece também, como uma referência mais conservadora, considerando todas as despesas do período."
        )]),
      ]),
    ]));

    calcSection(container, st);
    savedSection(container);
  }

  function calcSection(container, st) {
    const nomeInput = UI.h("input", { class: "input", placeholder: "Ex: Campanha Instagram outubro" });
    const valorInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const resultWrap = UI.h("div", { style: "margin-top:16px;" });
    const saveBtn = UI.h("button", { class: "btn btn-accent btn-sm" }, ["Salvar simulação"]);

    function currentCalc() {
      const valor = parseFloat(valorInput.value) || 0;
      return Compute.marketingReturnNeeded(st.division, st.month, valor);
    }

    function refresh() {
      const calc = currentCalc();
      UI.clear(resultWrap);
      if (!valorInput.value || calc.valorInvestido <= 0) {
        resultWrap.appendChild(UI.h("div", { style: "font-size:12px;color:var(--text-muted);" }, ["Informe o valor que pretende investir pra ver o retorno mínimo necessário."]));
        return;
      }
      if (calc.margemBruta <= 0) {
        resultWrap.appendChild(UI.badge("Margem bruta não positiva no período -- não dá pra calcular um retorno mínimo confiável", "critical"));
        return;
      }
      resultWrap.appendChild(UI.h("div", { class: "grid grid-3" }, [
        UI.statTile({ label: "Retorno mínimo (margem bruta)", value: Fmt.money(calc.retornoMinimoBruto), foot: `Margem bruta do período: ${Fmt.pct(calc.margemBruta)}` }),
        UI.statTile({ label: "Retorno mínimo (margem líquida)", value: calc.retornoMinimoLiquido === null ? "Dados insuficientes" : Fmt.money(calc.retornoMinimoLiquido), foot: calc.margemLiquida > 0 ? `Margem líquida do período: ${Fmt.pct(calc.margemLiquida)}` : "Margem líquida não positiva no período" }),
        UI.statTile({ label: "ROAS mínimo", value: calc.roasMinimo === null ? "—" : `${Fmt.num(calc.roasMinimo)}x`, foot: "Cada R$1 investido precisa voltar pelo menos isso em vendas" }),
      ]));
      const pctReceita = calc.receitaBrutaPeriodo ? calc.retornoMinimoBruto / calc.receitaBrutaPeriodo : null;
      if (pctReceita !== null) {
        resultWrap.appendChild(UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);margin-top:10px;" }, [
          `Isso representa ${Fmt.pct(pctReceita)} da receita bruta do período selecionado (${Fmt.money(calc.receitaBrutaPeriodo)}).`,
        ]));
      }
    }
    valorInput.addEventListener("input", refresh);
    refresh();

    saveBtn.addEventListener("click", () => {
      const calc = currentCalc();
      if (!nomeInput.value.trim() || calc.valorInvestido <= 0) { UI.toast("Dê um nome e informe o valor investido antes de salvar."); return; }
      Storage.addMarketingSimulacao({
        nome: nomeInput.value.trim(), divisao: st.division, mes: st.month,
        valorInvestido: calc.valorInvestido, margemBruta: calc.margemBruta, margemLiquida: calc.margemLiquida,
        retornoMinimoBruto: calc.retornoMinimoBruto, retornoMinimoLiquido: calc.retornoMinimoLiquido,
      });
      UI.toast("Simulação salva.");
      nomeInput.value = ""; valorInput.value = "";
      refresh();
      AppState.set({});
    });

    container.appendChild(UI.sectionTitle("Simulação", `${UI.divisionLabel(st.division)} · ${UI.periodLabel(st.month)}`));
    container.appendChild(UI.h("div", { class: "card", "data-tour": "mk-calc" }, [
      UI.h("div", { class: "field-row" }, [
        UI.field("Nome da campanha (opcional, pra salvar)", nomeInput),
        UI.field("Valor a investir (R$)", valorInput),
      ]),
      resultWrap,
      UI.h("div", { style: "display:flex;justify-content:flex-end;margin-top:14px;" }, [saveBtn]),
    ]));
  }

  function savedSection(container) {
    const list = Storage.listMarketingSimulacoes();
    if (!list.length) return;
    container.appendChild(UI.sectionTitle("Simulações salvas", `${list.length} no total`));
    container.appendChild(UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "nome", label: "Campanha", wrap: true },
        { key: "divisao", label: "Divisão", render: (r) => UI.badgeDivision(r.divisao) },
        { key: "mes", label: "Período", render: (r) => UI.periodLabel(r.mes) },
        { key: "valorInvestido", label: "Investido", align: "right", render: (r) => Fmt.money(r.valorInvestido) },
        { key: "retornoMinimoBruto", label: "Retorno mínimo", align: "right", render: (r) => Fmt.money(r.retornoMinimoBruto) },
        { key: "actions", label: "", render: (r) => removeBtn(r) },
      ],
      rows: list.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    })]));
  }

  function removeBtn(sim) {
    const btn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 13 })]);
    btn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover a simulação "${sim.nome}"?`);
      if (ok) { Storage.removeMarketingSimulacao(sim.id); UI.toast("Simulação removida."); AppState.set({}); }
    });
    return btn;
  }

  window.Views = window.Views || {};
  window.Views.marketing = render;
})();
