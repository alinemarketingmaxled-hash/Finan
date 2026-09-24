// Visão Futura: junta numa única tabela mensal o que já é compromisso
// documentado (CONFIRMADO: Previsões + A Receber/A Pagar), a obrigação de
// dívida projetada (ESTIMADO, mostrado à parte -- nunca somado ao
// combinado, porque o Projetado por tendência já embute implicitamente um
// nível "típico" de pagamento de dívida no histórico) e a tendência
// estatística (PROJETADO: Forecast). "Resultado acumulado" segue a mesma
// convenção já usada em Fluxo de Caixa: soma corrida desde o início do
// histórico -- não é saldo bancário real (a base não guarda saldo inicial
// de caixa).
(function () {
  const HORIZONTE = 6;

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false });

    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:20px;", "data-tour": "vf-insight" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Como ler esta tela"]),
        UI.h("div", { class: "insight-body" }, [UI.richText(
          "<b>Confirmado</b> vem de Previsões e de A Receber/A Pagar -- compromisso já documentado. " +
          "<b>Estimado</b> aparece em duas linhas, sempre à parte do combinado: parcela de empréstimo esperada, e investimento já aprovado em Investimentos (a tendência do Projetado já reflete implicitamente o nível histórico de pagamento de dívida, então somar de novo contaria em dobro). " +
          "<b>Projetado</b> é a tendência estatística do Forecast. " +
          "<b>Resultado acumulado</b> é a soma corrida do resultado desde o início do histórico (mesma conta do Fluxo de Caixa) -- não é o saldo real do banco, porque a base de dados não registra um saldo inicial de caixa."
        )]),
      ]),
    ]));

    const vf = Compute.visaoFutura(st.division, { monthsAhead: HORIZONTE });
    const rows = vf.rows;

    const combinadoTotal = round2sum(rows.map((r) => r.combinado));
    const estimadoTotal = round2sum(rows.map((r) => r.estimadoDivida));

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: `Resultado combinado (${HORIZONTE}m)`, value: Fmt.money(combinadoTotal), foot: "Confirmado + Projetado" }),
      UI.statTile({ label: "Pior mês (acumulado)", value: vf.piorMes ? Fmt.money(vf.piorMes.acumulado) : "—", foot: vf.piorMes ? Fmt.monthLabel(vf.piorMes.month, "full") : "Sem dado" }),
      UI.statTile({ label: `Estimado em dívida (${HORIZONTE}m)`, value: Fmt.money(estimadoTotal), foot: "Parcelas de empréstimo, à parte do combinado" }),
      UI.statTile({ label: "Vencido (não recebido/pago)", value: Fmt.money(vf.overdue.saldo), foot: vf.overdue.months.length ? vf.overdue.months.map((m) => Fmt.monthLabel(m)).join(", ") : "Nada vencido" }),
    ]));

    container.appendChild(UI.sectionTitle("Resultado combinado por mês", "Confirmado + Projetado -- barra tracejada mostra participação do Confirmado"));
    container.appendChild(UI.h("div", { style: "margin-bottom:12px;" }, [UI.statusLegend()]));
    const vfChartCard = UI.chartCardWithTable({
      title: "Confirmado vs Projetado",
      subtitle: UI.divisionLabel(st.division),
      draw: (wrap) => Charts.lineArea(wrap, {
        xKeys: rows.map((r) => r.month), xLabelFn: Fmt.monthLabel,
        series: [
          { key: "confirmado", label: "Confirmado", color: Charts.cssVar("--series-1"), values: rows.map((r) => r.confirmado) },
          { key: "combinado", label: "Combinado (c/ Projetado)", color: Charts.cssVar("--accent"), values: rows.map((r) => r.combinado) },
        ],
        height: 260,
      }),
      columns: tableColumns(),
      rows,
    });
    vfChartCard.setAttribute("data-tour", "vf-chart");
    container.appendChild(vfChartCard);

    container.appendChild(UI.sectionTitle("Resultado acumulado projetado", "Soma corrida desde o início do histórico -- não é saldo bancário real"));
    container.appendChild(UI.chartCardWithTable({
      title: "Acumulado",
      subtitle: UI.divisionLabel(st.division),
      draw: (wrap) => Charts.lineArea(wrap, {
        xKeys: rows.map((r) => r.month), xLabelFn: Fmt.monthLabel,
        series: [{ key: "acumulado", label: "Acumulado", color: rows[rows.length - 1] && rows[rows.length - 1].acumulado >= 0 ? Charts.cssVar("--good") : Charts.cssVar("--critical"), values: rows.map((r) => r.acumulado) }],
        height: 220, area: true,
      }),
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "acumulado", label: "Acumulado", align: "right", render: (r) => Fmt.money(r.acumulado) },
      ],
      rows,
    }));

    container.appendChild(UI.sectionTitle("Detalhe mensal", "Confirmado, Estimado (à parte) e Projetado lado a lado"));
    container.appendChild(UI.h("div", { class: "card", "data-tour": "vf-table" }, [UI.table({ columns: tableColumns(), rows })]));
  }

  function tableColumns() {
    return [
      { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
      { key: "confirmadoEntrada", label: "Confirmado (entrada)", align: "right", render: (r) => Fmt.money(r.confirmadoEntrada) },
      { key: "confirmadoSaida", label: "Confirmado (saída)", align: "right", render: (r) => Fmt.money(r.confirmadoSaida) },
      { key: "confirmado", label: "Confirmado (saldo)", align: "right", render: (r) => Fmt.money(r.confirmado) },
      { key: "estimadoDivida", label: "Estimado (dívida)", align: "right", render: (r) => Fmt.money(r.estimadoDivida) },
      { key: "estimadoInvestimento", label: "Estimado (investimento aprovado)", align: "right", render: (r) => Fmt.money(r.estimadoInvestimento) },
      { key: "projetado", label: "Projetado", align: "right", render: (r) => (r.projetado === null ? "—" : Fmt.money(r.projetado)) },
      { key: "combinado", label: "Combinado", align: "right", render: (r) => Fmt.money(r.combinado) },
      { key: "acumulado", label: "Acumulado", align: "right", render: (r) => Fmt.money(r.acumulado) },
    ];
  }

  function round2sum(list) { return Math.round((list.reduce((s, v) => s + v, 0) + Number.EPSILON) * 100) / 100; }

  window.Views = window.Views || {};
  window.Views.visaofutura = render;
})();
