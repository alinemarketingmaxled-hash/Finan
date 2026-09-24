// Visão Estratégica: resumo executivo de 1 tela. Zero cálculo novo -- cada
// número aqui vem de uma função de Compute já usada em outra tela (Dívidas,
// Forecast, Divisões, Metas, Investimentos, Cenários); esta página só
// recompõe e resume, pra bater exatamente com a tela de origem.
(function () {
  const HORIZONTE = 6;

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false });

    const realized = Compute.realizedMonthlySeries(st.division);
    const acumuladoAtual = round2sum(realized.map((r) => r.resultado));
    const vf = Compute.visaoFutura(st.division, { monthsAhead: HORIZONTE });
    const fc = Compute.forecast(st.division, { monthsAhead: 1 }).filter((r) => r.status === Compute.STATUS.PROJETADO)[0] || null;
    const lastMonth = AppState.detailedMonths[AppState.detailedMonths.length - 1];
    const dreAtual = lastMonth ? Compute.dreForPeriod(st.division, lastMonth, "financeiro") : null;
    const loanTotals = Compute.loansTotals(st.division);
    const loanInst = Compute.loanInstallmentsForecast(st.division, HORIZONTE);
    const compromissoFuturo = round2sum(loanInst.map((r) => r.valor));
    const cap = Compute.investmentCapacity(st.division, { monthsAhead: HORIZONTE });
    const scenarios = Compute.scenariosSummary(st.division, { monthsAhead: 12 });
    const base = scenarios.find((s) => s.id === "sistema-base");
    const conservador = scenarios.find((s) => s.id === "sistema-conservador");
    const receitaMeta = Storage.listMetas().find((m) => m.tipo === "receita_mensal" && (m.divisao === st.division || m.divisao === "consolidado"));

    container.appendChild(UI.sectionTitle("Caixa", "Resultado acumulado -- não é saldo bancário real (a base não guarda saldo inicial de caixa)"));
    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Acumulado até hoje", value: Fmt.money(acumuladoAtual), foot: "Soma corrida desde o início do histórico" }),
      UI.statTile({ label: `Pior mês projetado (${HORIZONTE}m)`, value: vf.piorMes ? Fmt.money(vf.piorMes.acumulado) : "—", foot: vf.piorMes ? Fmt.monthLabel(vf.piorMes.month, "full") : "Sem dado" }),
      UI.statTile({ label: "Vencido (não recebido/pago)", value: Fmt.money(vf.overdue.saldo) }),
      UI.statTile({ label: `Capacidade de investir (${HORIZONTE}m)`, value: Fmt.money(cap.capacidadeTotal), foot: cap.capacidadeTotal >= 0 ? "Positiva" : "Negativa" }),
    ]));

    container.appendChild(UI.sectionTitle("Receita e resultado", lastMonth ? `Último mês fechado: ${Fmt.monthLabel(lastMonth, "full")}` : "Sem mês fechado ainda"));
    container.appendChild(UI.h("div", { class: "grid grid-3" }, [
      UI.statTile({ label: "Receita realizada (último mês)", value: dreAtual ? Fmt.money(dreAtual.receita_bruta) : "—" }),
      UI.statTile({ label: "Receita projetada (mês que vem)", value: fc ? Fmt.money(fc.entradas) : "—", foot: "Forecast por tendência" }),
      UI.statTile({ label: "Meta de receita", value: receitaMeta ? Fmt.money(Number(receitaMeta.targetValue) || 0) : "—", foot: receitaMeta ? receitaMeta.title : "Nenhuma meta de receita cadastrada" }),
    ]));

    container.appendChild(UI.sectionTitle("Dívida", "Ver detalhe em Dívidas & Empréstimos"));
    container.appendChild(UI.h("div", { class: "grid grid-3" }, [
      UI.statTile({ label: "Saldo devedor", value: Fmt.money(loanTotals.valor_restante), foot: "O que falta pagar hoje" }),
      UI.statTile({ label: `Compromisso futuro (${HORIZONTE}m)`, value: Fmt.money(compromissoFuturo), foot: "Parcelas estimadas -- inclui juros embutidos na parcela" }),
      UI.statTile({ label: "Custo total em juros/encargos", value: Fmt.money(loanTotals.custo_total_juros) }),
    ]));

    container.appendChild(UI.sectionTitle("Cenário rápido", "Base vs Conservador -- resultado projetado 12 meses"));
    container.appendChild(UI.h("div", { class: "grid grid-2" }, [
      UI.statTile({ label: "Base (tendência atual)", value: base ? Fmt.money(base.resultado) : "—" }),
      UI.statTile({ label: "Conservador (receita -10%, despesa +5%)", value: conservador ? Fmt.money(conservador.resultado) : "—", foot: base && conservador ? `${Fmt.money(round2sum([conservador.resultado, -base.resultado]))} vs Base` : "" }),
    ]));

    const alerts = buildAlerts({ vf, cap, loanTotals, conservador, dreAtual, receitaMeta, fc });
    container.appendChild(UI.sectionTitle("Alertas", "Resumo do que precisa de atenção -- sempre no fim da tela"));
    if (!alerts.length) {
      container.appendChild(UI.card([UI.emptyState({ icon: "checkCircle", title: "Nada fora do esperado nos números resumidos acima" })]));
    } else {
      const wrap = UI.h("div", { style: "display:flex;flex-direction:column;gap:10px;" });
      alerts.forEach((a) => wrap.appendChild(UI.insightCard(a)));
      container.appendChild(wrap);
    }

    container.appendChild(UI.h("div", { style: "margin-top:20px;padding-top:14px;border-top:1px solid var(--border);color:var(--text-muted);font-size:11.5px;" }, [
      "Cada número desta tela vem de outra tela já existente (Dívidas, Forecast, Visão Futura, Metas, Investimentos, Cenários) -- nada é calculado de novo só pra este resumo.",
    ]));
  }

  // Composição pura sobre valores já calculados por Compute -- nenhum cálculo
  // novo aqui, só limiares de apresentação (crítico/atenção/informativo).
  function buildAlerts(d) {
    const out = [];
    if (d.vf.piorMes && d.vf.piorMes.acumulado < 0) {
      out.push({ level: "critical", icon: "alertTriangle", title: `Acumulado projetado fica negativo em ${Fmt.monthLabel(d.vf.piorMes.month, "full")}`, body: `Resultado acumulado projetado de <b>${Fmt.money(d.vf.piorMes.acumulado)}</b> nesse mês. Ver Visão Futura.` });
    }
    if (d.vf.overdue.saldo < 0) {
      out.push({ level: "warning", icon: "calendarCheck", title: "Há saldo vencido não recebido/pago", body: `${Fmt.money(Math.abs(d.vf.overdue.saldo))} em meses já vencidos. Ver A Receber/A Pagar.` });
    }
    if (d.cap.capacidadeTotal < 0) {
      out.push({ level: "warning", icon: "wallet", title: "Capacidade de investimento negativa", body: `Considerando obrigações já assumidas, a capacidade projetada é de ${Fmt.money(d.cap.capacidadeTotal)}. Ver Investimentos.` });
    }
    if (d.conservador && d.conservador.resultado < 0) {
      out.push({ level: "warning", icon: "fork", title: "Resultado fica negativo no cenário Conservador", body: `Projeção de ${Fmt.money(d.conservador.resultado)} em 12 meses se a receita cair 10% e a despesa subir 5%. Ver Cenários.` });
    }
    if (d.dreAtual && d.dreAtual.margem_liquida < 0) {
      out.push({ level: "critical", icon: "alertTriangle", title: "Margem líquida negativa no último mês fechado", body: `Margem de ${Fmt.pct(d.dreAtual.margem_liquida)}. Ver DRE.` });
    }
    if (d.receitaMeta && d.fc) {
      const target = Number(d.receitaMeta.targetValue) || 0;
      if (d.fc.entradas < target) {
        out.push({ level: "info", icon: "target", title: "Forecast de receita abaixo da meta", body: `Forecast de ${Fmt.money(d.fc.entradas)} contra meta de ${Fmt.money(target)} ("${d.receitaMeta.title}"). Ver Metas.` });
      }
    }
    const order = { critical: 0, warning: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  function round2sum(list) { return Math.round((list.reduce((s, v) => s + v, 0) + Number.EPSILON) * 100) / 100; }

  window.Views = window.Views || {};
  window.Views.visaoestrategica = render;
})();
