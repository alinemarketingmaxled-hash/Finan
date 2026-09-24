// Forecast: projeção estatística pura (regressão linear sobre a tendência
// recente de entradas/saídas), sem misturar com Previsões/A Receber/A Pagar
// -- essa mistura acontece em Visão Futura. Aqui o horizonte é fixo em 12
// meses e a fonte é sempre Compute.forecast() (mesmo motor do Fluxo de
// Caixa, só que com mais meses à frente e rotulado por status).
(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false });

    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:20px;", "data-tour": "fc-insight" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["O que é este número"]),
        UI.h("div", { class: "insight-body" }, [UI.richText(
          "Forecast é uma projeção estatística pura: pega a tendência dos últimos meses reais (regressão linear) e estende pra frente. " +
          "Não inclui Previsões, A Receber/A Pagar nem parcela de empréstimo específica -- isso é o que a página <b>Visão Futura</b> combina, com o Forecast como uma das camadas. " +
          "Quanto menos meses de histórico, menos confiável a tendência -- trate como uma referência, não como um número garantido."
        )]),
      ]),
    ]));

    const rows = Compute.forecast(st.division, { monthsAhead: 12 });
    const realized = rows.filter((r) => r.status === Compute.STATUS.REALIZADO);
    const projected = rows.filter((r) => r.status === Compute.STATUS.PROJETADO);
    const forecastIdx = rows.findIndex((r) => r.status === Compute.STATUS.PROJETADO);

    if (!realized.length) {
      container.appendChild(UI.card([UI.emptyState({
        icon: "trendingUp", title: "Sem histórico suficiente para projetar",
        body: "É preciso pelo menos um mês de dado realizado para calcular uma tendência.",
      })]));
      return;
    }

    const totalEntradasProj = round2sum(projected.map((r) => r.entradas));
    const totalSaidasProj = round2sum(projected.map((r) => r.saidas));
    const resultadoProj = round2sum(projected.map((r) => r.resultado));
    const mesesTrail = Math.min(6, realized.length);

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Receita projetada (12m)", value: Fmt.money(totalEntradasProj), foot: `Tendência dos últimos ${mesesTrail} meses reais` }),
      UI.statTile({ label: "Despesa projetada (12m)", value: Fmt.money(totalSaidasProj) }),
      UI.statTile({ label: "Resultado projetado (12m)", value: Fmt.money(resultadoProj), foot: resultadoProj >= 0 ? "Tendência positiva" : "Tendência negativa" }),
      UI.statTile({ label: "Meses de histórico usados", value: Fmt.num(realized.length), foot: "Realizado, base 2025 em diante" }),
    ]));

    container.appendChild(UI.sectionTitle("Realizado vs Projetado", "Linha tracejada = projeção por tendência"));
    const fcLegend = UI.h("div", { style: "margin-bottom:12px;", "data-tour": "fc-legend" }, [UI.statusLegend()]);
    container.appendChild(fcLegend);
    const fcChartCard = UI.chartCardWithTable({
      title: "Entradas vs Saídas",
      subtitle: UI.divisionLabel(st.division),
      draw: (wrap) => Charts.lineArea(wrap, {
        xKeys: rows.map((r) => r.month), xLabelFn: Fmt.monthLabel,
        series: [
          { key: "entradas", label: "Entradas", color: Charts.cssVar("--series-1"), values: rows.map((r) => r.entradas) },
          { key: "saidas", label: "Saídas", color: Charts.cssVar("--series-2"), values: rows.map((r) => r.saidas) },
        ],
        forecastFromIndex: forecastIdx >= 0 ? forecastIdx : null, height: 280,
      }),
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "entradas", label: "Entradas", align: "right", render: (r) => Fmt.money(r.entradas) },
        { key: "saidas", label: "Saídas", align: "right", render: (r) => Fmt.money(r.saidas) },
        { key: "resultado", label: "Resultado", align: "right", render: (r) => Fmt.money(r.resultado) },
        { key: "status", label: "Situação", render: (r) => UI.statusBadge(r.status) },
      ],
      rows,
    });
    fcChartCard.setAttribute("data-tour", "fc-chart");
    container.appendChild(fcChartCard);

    container.appendChild(UI.sectionTitle("Resultado mensal projetado", "Verde = superávit · vermelho = déficit"));
    container.appendChild(UI.chartCardWithTable({
      title: "Resultado (Entradas − Saídas)",
      draw: (wrap) => Charts.divergingBar(wrap, {
        xKeys: rows.map((r) => r.month), xLabelFn: Fmt.monthLabel,
        values: rows.map((r) => r.resultado), forecastFromIndex: forecastIdx >= 0 ? forecastIdx : null, height: 240,
      }),
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "resultado", label: "Resultado", align: "right", render: (r) => Fmt.money(r.resultado) },
      ],
      rows,
    }));
  }

  function round2sum(list) { return Math.round((list.reduce((s, v) => s + v, 0) + Number.EPSILON) * 100) / 100; }

  window.Views = window.Views || {};
  window.Views.forecast = render;
})();
