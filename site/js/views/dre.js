(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: true, showBasis: true });
    const dre = Compute.dreForPeriod(st.division, st.month, st.basis);
    const periodLabel = st.month === "acum" ? `Acumulado (${Fmt.monthLabel(AppState.detailedMonths[0])}–${Fmt.monthLabel(AppState.detailedMonths[AppState.detailedMonths.length - 1])})` : Fmt.monthLabel(st.month, "full");

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Receita bruta", value: Fmt.money(dre.receita_bruta), foot: periodLabel }),
      UI.statTile({ label: "Lucro bruto", value: Fmt.money(dre.lucro_bruto), foot: `Margem bruta ${Fmt.pct(dre.margem_bruta)}` }),
      UI.statTile({ label: "Resultado operacional", value: Fmt.money(dre.resultado_operacional), foot: dre.resultado_operacional >= 0 ? "Superávit" : "Déficit" }),
      UI.statTile({ label: "Margem líquida", value: Fmt.pct(dre.margem_liquida), foot: "Resultado / receita bruta" }),
    ]));

    if (st.basis === "nfe") {
      container.appendChild(nfeReconciliation(st));
    }

    container.appendChild(UI.sectionTitle(
      st.basis === "financeiro" ? "Demonstrativo de Resultado (Financeiro / Caixa)" : "Faturamento por Nota Fiscal",
      UI.divisionLabel(st.division) + " · " + periodLabel
    ));
    container.appendChild(statementCard(dre));

    if (dre.despesas.length) {
      container.appendChild(UI.sectionTitle("Composição das despesas operacionais", "Agrupadas por natureza do gasto"));
      const shareCard = UI.h("div", { class: "card" }, []);
      const shareWrap = UI.h("div", {});
      shareCard.appendChild(shareWrap);
      const byGroup = groupSum(dre.despesas);
      Charts.stackedShareBar(shareWrap, {
        items: byGroup.map((g) => ({ label: g.grupo, value: g.valor, color: Categories.groupColor(g.grupo) })),
        formatValue: Fmt.money,
      });
      container.appendChild(shareCard);
    }
  }

  function groupSum(despesas) {
    const map = new Map();
    despesas.forEach((d) => map.set(d.grupo, (map.get(d.grupo) || 0) + d.valor));
    return Array.from(map.entries()).map(([grupo, valor]) => ({ grupo, valor })).sort((a, b) => b.valor - a.valor);
  }

  function line(label, value, opts) {
    opts = opts || {};
    return UI.h("div", { style: `display:flex;align-items:center;justify-content:space-between;padding:${opts.strong ? "12px 0" : "7px 0"};${opts.indent ? "padding-left:18px;" : ""}${opts.border ? "border-top:1px solid var(--border);margin-top:4px;" : ""}` }, [
      UI.h("span", { style: `font-size:${opts.strong ? "13.5px" : "13px"};font-weight:${opts.strong ? "700" : "500"};color:${opts.muted ? "var(--text-secondary)" : "var(--text-primary)"};` }, [label]),
      UI.h("span", { class: "tabular", style: `font-size:${opts.strong ? "14px" : "13px"};font-weight:${opts.strong ? "700" : "600"};color:${opts.color || "var(--text-primary)"};` }, [value]),
    ]);
  }

  function statementCard(dre) {
    const card = UI.h("div", { class: "card" }, []);
    card.appendChild(line("RECEITA BRUTA", Fmt.money(dre.receita_bruta), { strong: true }));
    if (dre.basis === "financeiro") {
      card.appendChild(line("(-) Impostos (Simples Nacional)", Fmt.money(dre.impostos), { muted: true }));
      card.appendChild(line("RECEITA LÍQUIDA", Fmt.money(dre.receita_liquida), { strong: true, border: true }));
    }
    card.appendChild(line("(-) Custo das mercadorias (fornecedores)", Fmt.money(dre.custo_mercadorias), { muted: true }));
    card.appendChild(line("LUCRO BRUTO", Fmt.money(dre.lucro_bruto), { strong: true, border: true }));

    if (dre.despesas.length) {
      card.appendChild(line("(-) DESPESAS OPERACIONAIS", Fmt.money(dre.despesas_total), { strong: true }));
      dre.despesas.forEach((d) => {
        card.appendChild(line(Fmt.titleCase(d.categoria), Fmt.money(d.valor), { indent: true, muted: true }));
      });
    }
    card.appendChild(line("RESULTADO OPERACIONAL", Fmt.money(dre.resultado_operacional), {
      strong: true, border: true, color: dre.resultado_operacional >= 0 ? "var(--good-text)" : "var(--critical-text)",
    }));
    return card;
  }

  function nfeReconciliation(st) {
    const nfe = Compute.dreForPeriod(st.division, st.month, "nfe");
    const fin = Compute.dreForPeriod(st.division, st.month, "financeiro");
    const gap = nfe.receita_bruta - fin.receita_bruta;
    return UI.h("div", { class: "insight info", style: "margin-bottom:20px;" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Faturado (NFe) vs recebido em caixa (Financeiro)"]),
        UI.h("div", { class: "insight-body" }, [
          `Vendas faturadas: ${Fmt.money(nfe.receita_bruta)} · Entradas de caixa no mesmo período: ${Fmt.money(fin.receita_bruta)}. `,
          gap > 0
            ? `Isso indica ${Fmt.money(gap)} ainda não convertidos em caixa (vendas a prazo/recebíveis em aberto).`
            : `O caixa recebido superou o faturado no período — provável recebimento de vendas de meses anteriores.`,
          " Nota: no controle original, despesas operacionais só são detalhadas na base Financeiro — por isso não aparecem aqui.",
        ]),
      ]),
    ]);
  }

  window.Views = window.Views || {};
  window.Views.dre = render;
})();
