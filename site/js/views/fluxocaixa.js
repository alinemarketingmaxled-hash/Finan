(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false });
    const cf = Compute.cashflowSeries(st.division);
    const forecastIdx = cf.findIndex((r) => r.tipo === "previsao");
    const realized = cf.filter((r) => r.tipo === "realizado");

    const totalEntradas = realized.reduce((s, r) => s + r.entradas, 0);
    const totalSaidas = realized.reduce((s, r) => s + r.saidas, 0);
    const acumulado = totalEntradas - totalSaidas;
    const mediaResultado = realized.length ? (totalEntradas - totalSaidas) / realized.length : 0;
    const positivos = realized.filter((r) => r.resultado >= 0).length;

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Entradas acumuladas", value: Fmt.money(totalEntradas), foot: `${Fmt.monthLabel(realized[0].month)} até ${Fmt.monthLabel(realized[realized.length - 1].month)}` }),
      UI.statTile({ label: "Saídas acumuladas", value: Fmt.money(totalSaidas) }),
      UI.statTile({ label: "Resultado acumulado", value: Fmt.money(acumulado), foot: acumulado >= 0 ? "Caixa gerado no período" : "Caixa consumido no período" }),
      UI.statTile({ label: "Média mensal do resultado", value: Fmt.money(mediaResultado), foot: `${positivos}/${realized.length} meses positivos` }),
    ]));

    container.appendChild(UI.sectionTitle("Entradas vs Saídas", "Linha tracejada = previsão (meses sem dado real ainda)"));
    container.appendChild(UI.chartCardWithTable({
      title: "Fluxo de caixa mensal",
      subtitle: UI.divisionLabel(st.division),
      draw: (wrap) => Charts.lineArea(wrap, {
        xKeys: cf.map((r) => r.month), xLabelFn: Fmt.monthLabel,
        series: [
          { key: "entradas", label: "Entradas", color: Charts.cssVar("--series-1"), values: cf.map((r) => r.entradas) },
          { key: "saidas", label: "Saídas", color: Charts.cssVar("--series-2"), values: cf.map((r) => r.saidas) },
        ],
        forecastFromIndex: forecastIdx >= 0 ? forecastIdx : null, height: 280,
      }),
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "entradas", label: "Entradas", align: "right", render: (r) => Fmt.money(r.entradas) },
        { key: "saidas", label: "Saídas", align: "right", render: (r) => Fmt.money(r.saidas) },
        { key: "resultado", label: "Resultado", align: "right", render: (r) => Fmt.money(r.resultado) },
        { key: "tipo", label: "Situação", render: (r) => UI.badge(r.tipo === "previsao" ? "Previsão" : "Realizado", r.tipo === "previsao" ? "neutral" : "good") },
      ],
      rows: cf,
    }));

    // Saldo acumulado (soma corrida do resultado mensal)
    let running = 0;
    const acumSeries = cf.map((r) => { running += r.resultado; return running; });
    const acumRows = cf.map((r, i) => ({ month: r.month, acumulado: acumSeries[i] }));
    container.appendChild(UI.sectionTitle("Saldo acumulado", "Soma corrida do resultado mensal desde Jan/25 — mostra a tendência de geração ou consumo de caixa, não o saldo bancário real (a planilha não registra um saldo inicial de caixa)"));
    container.appendChild(UI.chartCardWithTable({
      title: "Resultado acumulado",
      subtitle: UI.divisionLabel(st.division),
      draw: (wrap) => Charts.lineArea(wrap, {
        xKeys: cf.map((r) => r.month), xLabelFn: Fmt.monthLabel,
        series: [{ key: "acumulado", label: "Acumulado", color: acumSeries[acumSeries.length - 1] >= 0 ? Charts.cssVar("--good") : Charts.cssVar("--critical"), values: acumSeries }],
        forecastFromIndex: forecastIdx >= 0 ? forecastIdx : null, height: 240, area: true,
      }),
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "acumulado", label: "Acumulado", align: "right", render: (r) => Fmt.money(r.acumulado) },
      ],
      rows: acumRows,
    }));

    container.appendChild(UI.sectionTitle("Resultado mensal", "Verde = superávit · vermelho = déficit"));
    container.appendChild(UI.chartCardWithTable({
      title: "Resultado (Entradas − Saídas)",
      draw: (wrap) => Charts.divergingBar(wrap, {
        xKeys: cf.map((r) => r.month), xLabelFn: Fmt.monthLabel,
        values: cf.map((r) => r.resultado), forecastFromIndex: forecastIdx >= 0 ? forecastIdx : null, height: 240,
      }),
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "resultado", label: "Resultado", align: "right", render: (r) => Fmt.money(r.resultado) },
      ],
      rows: cf,
    }));
  }

  window.Views = window.Views || {};
  window.Views.fluxocaixa = render;
})();
