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

    dailySection(container, st);
  }

  function monthRange(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return [`${monthKey}-01`, `${monthKey}-${String(lastDay).padStart(2, "0")}`];
  }

  // Fluxo de caixa dia a dia, com data escolhida pelo usuário (De/Até) — a
  // visão mensal acima é ótima pra tendência, mas às vezes você quer ver
  // exatamente que dias entrou/saiu dinheiro dentro de um período.
  function dailySection(container, st) {
    const months = AppState.detailedMonths;
    container.appendChild(UI.sectionTitle("Fluxo de caixa diário", "Escolha um período pra ver dia a dia — só cobre meses com lançamento detalhado (jan/26 em diante; 2025 só tem total mensal)."));

    if (!months.length) {
      container.appendChild(UI.card([UI.emptyState({ icon: "calendarCheck", title: "Sem lançamentos detalhados disponíveis" })]));
      return;
    }

    const [minDate] = monthRange(months[0]);
    const [, maxDate] = monthRange(months[months.length - 1]);
    const [defFrom, defTo] = monthRange(months[months.length - 1]);

    const fromInput = UI.h("input", { type: "date", class: "input", min: minDate, max: maxDate });
    const toInput = UI.h("input", { type: "date", class: "input", min: minDate, max: maxDate });
    fromInput.value = defFrom;
    toInput.value = defTo;
    container.appendChild(UI.h("div", { class: "filter-row" }, [
      UI.field("De", fromInput), UI.field("Até", toInput),
    ]));

    const resultWrap = UI.h("div", {});
    container.appendChild(resultWrap);

    function refresh() {
      UI.clear(resultWrap);
      if (!fromInput.value || !toInput.value || fromInput.value > toInput.value) {
        resultWrap.appendChild(UI.card([UI.emptyState({ icon: "calendarCheck", title: "Período inválido", body: "A data \"De\" precisa ser igual ou anterior à data \"Até\"." })]));
        return;
      }
      const rows = Compute.dailyCashflow(st.division, fromInput.value, toInput.value);
      if (!rows.length) {
        resultWrap.appendChild(UI.card([UI.emptyState({
          icon: "calendarCheck", title: "Sem lançamentos nesse período",
          body: "Tente um intervalo dentro dos meses com dado detalhado (jan/26 em diante).",
        })]));
        return;
      }
      resultWrap.appendChild(UI.chartCardWithTable({
        title: "Entradas vs Saídas por dia",
        subtitle: `${Fmt.dateBR(rows[0].date)} até ${Fmt.dateBR(rows[rows.length - 1].date)} · ${UI.divisionLabel(st.division)}`,
        draw: (wrap) => Charts.lineArea(wrap, {
          xKeys: rows.map((r) => r.date), xLabelFn: (d) => Fmt.dateBR(d).slice(0, 5),
          series: [
            { key: "entradas", label: "Entradas", color: Charts.cssVar("--series-1"), values: rows.map((r) => r.entradas) },
            { key: "saidas", label: "Saídas", color: Charts.cssVar("--series-2"), values: rows.map((r) => r.saidas) },
          ],
          height: 260,
        }),
        columns: [
          { key: "date", label: "Data", render: (r) => Fmt.dateBR(r.date) },
          { key: "entradas", label: "Entradas", align: "right", render: (r) => Fmt.money(r.entradas) },
          { key: "saidas", label: "Saídas", align: "right", render: (r) => Fmt.money(r.saidas) },
          { key: "resultado", label: "Resultado", align: "right", render: (r) => Fmt.money(r.resultado) },
        ],
        rows,
      }));
    }
    fromInput.addEventListener("change", refresh);
    toInput.addEventListener("change", refresh);
    refresh();
  }

  window.Views = window.Views || {};
  window.Views.fluxocaixa = render;
})();
