(function () {
  function kpiDelta(division, month, metricFn) {
    if (month === "acum" || /^\d{4}$/.test(month)) return null;
    const prev = Compute.previousMonth(month);
    if (!AppState.detailedMonths.includes(prev)) return null;
    const cur = metricFn(month);
    const prevVal = metricFn(prev);
    if (!prevVal) return null;
    return (cur - prevVal) / Math.abs(prevVal);
  }
  function periodFoot(month) {
    if (/^\d{4}$/.test(month)) return `Ano ${month} · totais mensais da planilha`;
    return UI.periodLabel(month);
  }

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: true, extra: [addBtn()] });

    const dre = Compute.dreForPeriod(st.division, st.month, "financeiro");
    const totalSaidas = dre.impostos + dre.custo_mercadorias + dre.despesas_total;
    const cf = Compute.cashflowSeries(st.division);
    const realized = cf.filter((r) => r.tipo === "realizado");
    const sparkSlice = (key) => realized.slice(-8).map((r) => r[key]);

    const kpis = UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({
        label: "Receita bruta", value: Fmt.money(dre.receita_bruta),
        delta: kpiDelta(st.division, st.month, (m) => Compute.dreForPeriod(st.division, m, "financeiro").receita_bruta),
        sparkValues: sparkSlice("entradas"),
        foot: periodFoot(st.month),
      }),
      UI.statTile({
        label: "Custos e despesas totais", value: Fmt.money(totalSaidas),
        delta: kpiDelta(st.division, st.month, (m) => { const d = Compute.dreForPeriod(st.division, m, "financeiro"); return d.impostos + d.custo_mercadorias + d.despesas_total; }),
        deltaOpts: { invert: true },
        sparkValues: sparkSlice("saidas"),
        foot: "Impostos + custo + despesas operacionais",
      }),
      UI.statTile({
        label: "Resultado operacional", value: Fmt.money(dre.resultado_operacional),
        delta: kpiDelta(st.division, st.month, (m) => Compute.dreForPeriod(st.division, m, "financeiro").resultado_operacional),
        sparkValues: sparkSlice("resultado"),
        foot: dre.resultado_operacional >= 0 ? "Superávit no período" : "Déficit no período",
      }),
      UI.statTile({
        label: "Margem líquida", value: Fmt.pct(dre.margem_liquida),
        delta: kpiDelta(st.division, st.month, (m) => Compute.dreForPeriod(st.division, m, "financeiro").margem_liquida),
        foot: "Resultado operacional / receita bruta",
      }),
    ]);
    container.appendChild(kpis);

    // ---- Fluxo de caixa (linha) ----
    const forecastIdx = cf.findIndex((r) => r.tipo === "previsao");
    const flowCard = UI.chartCardWithTable({
      title: "Fluxo de caixa — Entradas vs Saídas",
      subtitle: `${Fmt.monthLabel(cf[0].month)} até ${Fmt.monthLabel(cf[cf.length - 1].month)} (linha tracejada = previsão)`,
      draw: (wrap) => Charts.lineArea(wrap, {
        xKeys: cf.map((r) => r.month), xLabelFn: Fmt.monthLabel,
        series: [
          { key: "entradas", label: "Entradas", color: Charts.cssVar("--series-1"), values: cf.map((r) => r.entradas) },
          { key: "saidas", label: "Saídas", color: Charts.cssVar("--series-2"), values: cf.map((r) => r.saidas) },
        ],
        forecastFromIndex: forecastIdx >= 0 ? forecastIdx : null, height: 260,
      }),
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "entradas", label: "Entradas", align: "right", render: (r) => Fmt.money(r.entradas) },
        { key: "saidas", label: "Saídas", align: "right", render: (r) => Fmt.money(r.saidas) },
        { key: "tipo", label: "Situação", render: (r) => UI.badge(r.tipo === "previsao" ? "Previsão" : "Realizado", r.tipo === "previsao" ? "neutral" : "good") },
      ],
      rows: cf,
    });
    container.appendChild(UI.h("div", { class: "grid grid-2", style: "align-items:start;" }, [flowCard, resultCard(cf, forecastIdx)]));

    // ---- Comparação de divisões ----
    container.appendChild(UI.sectionTitle("Iluminação vs Importação", "Participação de cada divisão no período selecionado"));
    container.appendChild(divisionCompareCard(st));

    // ---- Resumo rápido (saúde, dívidas, contas, orçamento) ----
    container.appendChild(UI.sectionTitle("Resumo rápido", "Status atual — clique num cartão pra ver o detalhe"));
    container.appendChild(quickStatusRow(st));

    // ---- Insights em destaque ----
    const topInsights = Compute.insights().slice(0, 3);
    const insightsHead = UI.h("div", { class: "card-head" }, [
      UI.h("div", { class: "card-title" }, ["Principais alertas estratégicos"]),
      UI.h("a", { href: "#/estrategia", class: "btn btn-ghost btn-sm" }, ["Ver todos →"]),
    ]);
    const insightsWrap = UI.h("div", { style: "display:flex;flex-direction:column;gap:10px;" });
    topInsights.forEach((i) => insightsWrap.appendChild(UI.insightCard(i)));
    const insightsCard = UI.h("div", { class: "card" }, [insightsHead, insightsWrap]);
    container.appendChild(UI.h("div", { class: "section-title" }, []));
    container.appendChild(insightsCard);
  }

  function resultCard(cf, forecastIdx) {
    return UI.chartCardWithTable({
      title: "Resultado mensal (Entradas − Saídas)", subtitle: "Verde = superávit · vermelho = déficit",
      draw: (wrap) => Charts.divergingBar(wrap, {
        xKeys: cf.map((r) => r.month), xLabelFn: Fmt.monthLabel,
        values: cf.map((r) => r.resultado), forecastFromIndex: forecastIdx >= 0 ? forecastIdx : null, height: 260,
      }),
      columns: [
        { key: "month", label: "Mês", render: (r) => Fmt.monthLabel(r.month, "full") },
        { key: "resultado", label: "Resultado", align: "right", render: (r) => Fmt.money(r.resultado) },
        { key: "tipo", label: "Situação", render: (r) => UI.badge(r.tipo === "previsao" ? "Previsão" : "Realizado", r.tipo === "previsao" ? "neutral" : "good") },
      ],
      rows: cf,
    });
  }

  function divisionCompareCard(st) {
    const ilu = Compute.dreForPeriod("iluminacao", st.month, "financeiro");
    const imp = Compute.dreForPeriod("importacao", st.month, "financeiro");
    const card = UI.card([], { title: "Receita por divisão", subtitle: st.month === "acum" ? "Acumulado no período" : Fmt.monthLabel(st.month, "full") });
    const shareWrap = UI.h("div", {});
    card.appendChild(shareWrap);
    Charts.stackedShareBar(shareWrap, {
      items: [
        { label: "Max Led Iluminação", value: ilu.receita_bruta, color: Charts.cssVar("--series-1") },
        { label: "Max Led Importação", value: imp.receita_bruta, color: Charts.cssVar("--series-2") },
      ],
    });
    const grid = UI.h("div", { class: "grid grid-2", style: "margin-top:18px;" }, [
      miniDivisionStat("iluminacao", ilu), miniDivisionStat("importacao", imp),
    ]);
    card.appendChild(grid);
    return card;
  }

  function miniDivisionStat(division, dre) {
    return UI.h("div", { style: "border:1px solid var(--border);border-radius:10px;padding:12px 14px;" }, [
      UI.h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;" }, [
        UI.badgeDivision(division),
        UI.badge(Fmt.pct(dre.margem_liquida), dre.margem_liquida >= 0 ? "good" : "critical"),
      ]),
      UI.h("div", { class: "tabular", style: "font-size:19px;font-weight:700;" }, [Fmt.money(dre.receita_bruta)]),
      UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);margin-top:2px;" }, [`Resultado: ${Fmt.money(dre.resultado_operacional)}`]),
    ]);
  }

  function scoreBand(score) {
    if (score >= 80) return ["Excelente", "good"];
    if (score >= 60) return ["Bom", "good"];
    if (score >= 40) return ["Atenção", "warning"];
    return ["Crítico", "critical"];
  }

  function quickStatusRow(st) {
    const health = Compute.healthScore(st.division);
    const [bandLabel, bandKind] = scoreBand(health.score);

    const loans = Compute.loans(st.division);
    const loanTotals = Compute.loansTotals(st.division);
    const pctPago = loanTotals.valor_total ? loanTotals.valor_pago / loanTotals.valor_total : 0;

    const recv = Compute.receivablesPayables(st.division);
    const saldoProjetado = recv.reduce((s, r) => s + r.a_receber - r.a_pagar, 0);

    const budgets = Compute.budgetStatus(st.division, st.month);
    const estourados = budgets.filter((b) => b.pct >= 1).length;
    const atencao = budgets.filter((b) => b.pct >= 0.9 && b.pct < 1).length;
    const budgetKind = estourados ? "critical" : atencao ? "warning" : budgets.length ? "good" : "neutral";
    const budgetLabel = estourados ? `${estourados} estourado(s)` : atencao ? `${atencao} perto do limite` : budgets.length ? "Sob controle" : "Nenhum definido";

    return UI.h("div", { class: "grid grid-4" }, [
      quickCard("saude", "activity", "Saúde financeira", `${health.score}/100`, bandLabel, bandKind),
      quickCard("emprestimos", "banknote", "Dívida em aberto", Fmt.money(loanTotals.valor_restante, { compact: true }), `${Fmt.pct(pctPago)} já pago`, "neutral"),
      quickCard("contas", "calendarCheck", "Saldo projetado (a receber − a pagar)", Fmt.money(saldoProjetado, { compact: true }), saldoProjetado >= 0 ? "Positivo" : "Atenção", saldoProjetado >= 0 ? "good" : "critical"),
      quickCard("orcamento", "wallet", "Orçamento", budgetLabel, `${budgets.length} categoria(s) monitorada(s)`, budgetKind),
    ]);
  }

  function quickCard(route, icon, label, value, badgeLabel, badgeKind) {
    return UI.h("a", { href: `#/${route}`, class: "card", style: "display:block;text-decoration:none;color:inherit;" }, [
      UI.h("div", { style: "display:flex;align-items:center;gap:7px;color:var(--text-secondary);margin-bottom:10px;" }, [
        Icon(icon, { size: 14 }),
        UI.h("span", { style: "font-size:12px;font-weight:600;" }, [label]),
      ]),
      UI.h("div", { class: "tabular", style: "font-size:20px;font-weight:700;margin-bottom:8px;" }, [value]),
      UI.badge(badgeLabel, badgeKind),
    ]);
  }

  function addBtn() {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Novo lançamento"]);
    btn.addEventListener("click", () => window.Views.openLancamentoModal());
    return btn;
  }

  window.Views = window.Views || {};
  window.Views.overview = render;
})();
