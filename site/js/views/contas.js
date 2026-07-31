(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false });
    const rows = Compute.receivablesPayables(st.division).slice().sort((a, b) => a.month.localeCompare(b.month));

    if (!rows.length) {
      container.appendChild(UI.card([UI.emptyState({ icon: "calendarCheck", title: "Sem previsão de contas para essa divisão" })]));
      return;
    }

    const totalReceber = rows.reduce((s, r) => s + r.a_receber, 0);
    const totalPagar = rows.reduce((s, r) => s + r.a_pagar, 0);
    const saldoFinal = totalReceber - totalPagar;
    const piorMes = rows.slice().sort((a, b) => a.saldo - b.saldo)[0];

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Total a receber (previsto)", value: Fmt.money(totalReceber) }),
      UI.statTile({ label: "Total a pagar (previsto)", value: Fmt.money(totalPagar) }),
      UI.statTile({ label: "Saldo projetado", value: Fmt.money(saldoFinal), foot: saldoFinal >= 0 ? "Positivo no período" : "Atenção: negativo" }),
      UI.statTile({ label: "Pior mês", value: Fmt.monthLabel(piorMes.month), foot: `Saldo de ${Fmt.money(piorMes.saldo)}` }),
    ]));

    const chartCard = UI.card([], { title: "A Receber vs A Pagar por mês", class: "chart-card" });
    const chartWrap = UI.h("div", {});
    chartCard.appendChild(chartWrap);
    Charts.lineArea(chartWrap, {
      xKeys: rows.map((r) => r.month), xLabelFn: Fmt.monthLabel,
      series: [
        { label: "A receber", color: Charts.cssVar("--series-1"), values: rows.map((r) => r.a_receber) },
        { label: "A pagar", color: Charts.cssVar("--series-2"), values: rows.map((r) => r.a_pagar) },
      ],
      height: 240,
    });
    const balCard = UI.card([], { title: "Saldo projetado", subtitle: "A receber − a pagar", class: "chart-card" });
    const balWrap = UI.h("div", {});
    balCard.appendChild(balWrap);
    Charts.divergingBar(balWrap, { xKeys: rows.map((r) => r.month), xLabelFn: Fmt.monthLabel, values: rows.map((r) => r.saldo), height: 240 });

    container.appendChild(UI.h("div", { class: "grid grid-2", style: "align-items:start;" }, [chartCard, balCard]));

    if (rows.some((r) => r.saldo < 0)) {
      container.appendChild(UI.insightCard({
        level: "critical", icon: "alertTriangle", title: "Existem meses com saldo previsto negativo",
        body: `O mês mais crítico é <b>${Fmt.monthLabel(piorMes.month)}</b>, com saldo de ${Fmt.money(piorMes.saldo)}. Considere antecipar recebíveis, renegociar prazos com fornecedores ou reservar caixa com antecedência.`,
      }));
    }

    container.appendChild(UI.sectionTitle("Detalhamento por mês"));
    container.appendChild(UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "a_receber", label: "A receber", align: "right", render: (r) => Fmt.money(r.a_receber) },
        { key: "a_pagar", label: "A pagar", align: "right", render: (r) => Fmt.money(r.a_pagar) },
        { key: "saldo", label: "Saldo", align: "right", render: (r) => Fmt.money(r.saldo) },
        { key: "status", label: "Status", render: (r) => UI.badge(r.saldo >= 0 ? "Positivo" : "Atenção", r.saldo >= 0 ? "good" : "critical") },
      ],
      rows,
    })]));
  }

  window.Views = window.Views || {};
  window.Views.contas = render;
})();
