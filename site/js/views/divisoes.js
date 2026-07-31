(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showDivision: false, showMonth: true });

    container.appendChild(UI.h("div", { class: "grid grid-2", style: "align-items:start;" }, [
      divisionCard("iluminacao", st), divisionCard("importacao", st),
    ]));

    container.appendChild(UI.sectionTitle("Comparativo de DRE", "Financeiro (caixa) · " + (st.month === "acum" ? "acumulado no período" : Fmt.monthLabel(st.month, "full"))));
    container.appendChild(compareTable(st));
  }

  function divisionCard(division, st) {
    const dre = Compute.dreForPeriod(division, st.month, "financeiro");
    const cf = Compute.cashflowSeries(division);
    const forecastIdx = cf.findIndex((r) => r.tipo === "previsao");
    const cats = Compute.expenseCategoriesAgg(division, st.month).slice(0, 5);
    const topSup = Compute.topCounterparties(division, "saida", "financeiro", 1, st.month)[0];
    const topCli = Compute.topCounterparties(division, "entrada", "financeiro", 1, st.month)[0];

    const card = UI.h("div", { class: "card" }, [
      UI.h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;" }, [
        UI.badgeDivision(division),
        UI.badge(Fmt.pct(dre.margem_liquida), dre.margem_liquida >= 0 ? "good" : "critical"),
      ]),
      UI.h("div", { class: "tabular", style: "font-size:24px;font-weight:700;margin-top:8px;" }, [Fmt.money(dre.receita_bruta)]),
      UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);margin-bottom:14px;" }, ["Receita bruta · resultado operacional " + Fmt.money(dre.resultado_operacional)]),
    ]);

    const chartWrap = UI.h("div", {});
    card.appendChild(chartWrap);
    Charts.lineArea(chartWrap, {
      xKeys: cf.map((r) => r.month), xLabelFn: Fmt.monthLabel,
      series: [
        { key: "entradas", label: "Entradas", color: Charts.cssVar("--series-1"), values: cf.map((r) => r.entradas) },
        { key: "saidas", label: "Saídas", color: Charts.cssVar("--series-2"), values: cf.map((r) => r.saidas) },
      ],
      forecastFromIndex: forecastIdx >= 0 ? forecastIdx : null, height: 200,
    });

    card.appendChild(UI.h("div", { class: "section-title", style: "font-size:12.5px;margin:18px 0 8px;" }, ["Maiores categorias de despesa"]));
    const rankWrap = UI.h("div", {});
    card.appendChild(rankWrap);
    if (cats.length) {
      Charts.barListRanked(rankWrap, {
        items: cats.map((c) => ({ label: Fmt.titleCase(c.categoria), value: c.valor, color: Categories.groupColor(c.grupo) })),
        formatValue: (v) => Fmt.money(v, { compact: true }),
      });
    } else {
      rankWrap.appendChild(UI.h("div", { style: "font-size:12px;color:var(--text-muted);" }, ["Sem detalhamento por categoria disponível para esse período."]));
    }

    const foot = UI.h("div", { style: "display:flex;justify-content:space-between;margin-top:16px;font-size:11.5px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:12px;" }, [
      UI.h("span", {}, [topCli ? `Maior cliente: ${Fmt.titleCase(topCli.nome)}` : "Sem clientes no período"]),
      UI.h("span", {}, [topSup ? `Maior fornecedor: ${Fmt.titleCase(topSup.nome)}` : ""]),
    ]);
    card.appendChild(foot);
    return card;
  }

  function compareTable(st) {
    const ilu = Compute.dreForPeriod("iluminacao", st.month, "financeiro");
    const imp = Compute.dreForPeriod("importacao", st.month, "financeiro");
    const cons = Compute.dreForPeriod("consolidado", st.month, "financeiro");
    const lines = [
      ["Receita bruta", "receita_bruta", "money"],
      ["(-) Impostos", "impostos", "money"],
      ["Receita líquida", "receita_liquida", "money"],
      ["(-) Custo das mercadorias", "custo_mercadorias", "money"],
      ["Lucro bruto", "lucro_bruto", "money"],
      ["(-) Despesas operacionais", "despesas_total", "money"],
      ["Resultado operacional", "resultado_operacional", "money"],
      ["Margem bruta", "margem_bruta", "pct"],
      ["Margem líquida", "margem_liquida", "pct"],
    ];
    const rows = lines.map(([label, key, kind]) => ({ label, ilu: ilu[key], imp: imp[key], cons: cons[key], kind }));
    const fmt = (v, kind) => (kind === "pct" ? Fmt.pct(v) : Fmt.money(v));
    return UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "label", label: "Linha do DRE", wrap: true },
        { key: "ilu", label: "Iluminação", align: "right", render: (r) => fmt(r.ilu, r.kind) },
        { key: "imp", label: "Importação", align: "right", render: (r) => fmt(r.imp, r.kind) },
        { key: "cons", label: "Consolidado", align: "right", render: (r) => fmt(r.cons, r.kind) },
      ],
      rows,
    })]);
  }

  window.Views = window.Views || {};
  window.Views.divisoes = render;
})();
