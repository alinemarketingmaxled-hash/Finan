// Camada de derivação: combina a base do Excel (MAXLED_DATA) com o que o
// usuário adiciona no navegador (Storage) e expõe funções prontas para as views.
(function (global) {
  const DIVISIONS = ["iluminacao", "importacao"];
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const sumVal = (list) => list.reduce((s, t) => s + t.value, 0);

  function manualAsTx(m) {
    return {
      id: m.id, date: m.date, division: m.division, basis: m.basis || "financeiro",
      flow: m.flow, category: m.category || null, counterparty: m.counterparty || null,
      value: Number(m.value) || 0, manual: true, origin: m.origin || null, note: m.note || "",
    };
  }

  function allTransactions() {
    const manual = Storage.listLancamentos().map(manualAsTx);
    return manual.length ? MAXLED_DATA.transactions.concat(manual) : MAXLED_DATA.transactions;
  }

  function detailedMonths() {
    return Array.from(new Set(allTransactions().map((t) => t.date.slice(0, 7)))).sort();
  }

  function filterTx(opts) {
    opts = opts || {};
    return allTransactions().filter((t) => {
      if (opts.division && opts.division !== "consolidado" && t.division !== opts.division) return false;
      if (opts.basis && t.basis !== opts.basis) return false;
      if (opts.flow && t.flow !== opts.flow) return false;
      if (opts.month && t.date.slice(0, 7) !== opts.month) return false;
      if (opts.from && t.date.slice(0, 7) < opts.from) return false;
      if (opts.to && t.date.slice(0, 7) > opts.to) return false;
      if (opts.category && t.category !== opts.category) return false;
      if (opts.search) {
        const s = opts.search.toLowerCase();
        const hay = `${t.counterparty || ""} ${t.category || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }

  function previousMonth(monthKey) {
    let [y, m] = monthKey.split("-").map(Number);
    m -= 1; if (m < 1) { m = 12; y -= 1; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  // ---------------------------------------------------------------------
  // Cashflow (financeiro): realizado = 2025 pré-agregado + meses detalhados
  // (base+manual/importado). Previsão = regressão linear própria sobre a
  // tendência dos últimos meses reais, recalculada a cada vez — sempre
  // acompanha o dado mais recente (inclusive o que for importado depois).
  // ---------------------------------------------------------------------
  function nextMonthKey(monthKey) {
    let [y, m] = monthKey.split("-").map(Number);
    m += 1; if (m > 12) { m = 1; y += 1; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  function linearRegression(values) {
    const n = values.length;
    if (n === 0) return { slope: 0, intercept: 0 };
    if (n === 1) return { slope: 0, intercept: values[0] };
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    values.forEach((y, x) => { sumX += x; sumY += y; sumXY += x * y; sumXX += x * x; });
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }

  function forecastNext(values, monthsAhead, trailing) {
    const window = values.slice(-trailing);
    const { slope, intercept } = linearRegression(window);
    const out = [];
    for (let k = 1; k <= monthsAhead; k++) {
      const x = window.length - 1 + k;
      out.push(Math.max(0, round2(slope * x + intercept)));
    }
    return out;
  }

  function cashflowSeries(division, forecastMonths) {
    forecastMonths = forecastMonths === undefined ? 4 : forecastMonths;
    const dMonths = new Set(detailedMonths());
    const out = new Map();
    MAXLED_DATA.cashflow.filter((r) => r.division === division && r.tipo === "realizado").forEach((r) => {
      if (!dMonths.has(r.month)) out.set(r.month, { entradas: r.entradas, saidas: r.saidas });
    });
    filterTx({ division, basis: "financeiro" }).forEach((t) => {
      const m = t.date.slice(0, 7);
      if (!out.has(m)) out.set(m, { entradas: 0, saidas: 0 });
      const rec = out.get(m);
      if (t.flow === "entrada") rec.entradas += t.value; else if (t.flow === "saida") rec.saidas += t.value;
    });
    const rows = Array.from(out.entries())
      .map(([month, v]) => ({ month, entradas: round2(v.entradas), saidas: round2(v.saidas), resultado: round2(v.entradas - v.saidas), tipo: "realizado" }))
      .sort((a, b) => a.month.localeCompare(b.month));

    if (rows.length && forecastMonths > 0) {
      const fEntradas = forecastNext(rows.map((r) => r.entradas), forecastMonths, 6);
      const fSaidas = forecastNext(rows.map((r) => r.saidas), forecastMonths, 6);
      let month = rows[rows.length - 1].month;
      for (let k = 0; k < forecastMonths; k++) {
        month = nextMonthKey(month);
        rows.push({ month, entradas: fEntradas[k], saidas: fSaidas[k], resultado: round2(fEntradas[k] - fSaidas[k]), tipo: "previsao" });
      }
    }
    return rows;
  }

  // ---------------------------------------------------------------------
  // DRE por ano-calendário sem detalhe de transação (hoje: 2025) — só dá pra
  // somar entradas/saídas mensais já agregadas na planilha; sem categoria,
  // impostos ou custo de mercadorias separados (a fonte não distingue isso).
  // ---------------------------------------------------------------------
  function dreForYear(division, year, basis) {
    if (basis !== "financeiro") {
      return {
        division, month: year, basis, receita_bruta: 0, impostos: null, receita_liquida: null,
        custo_mercadorias: null, lucro_bruto: null, despesas: [], despesas_total: 0,
        resultado_operacional: 0, margem_bruta: null, margem_liquida: null,
        limited: true, noData: true,
      };
    }
    const rows = MAXLED_DATA.cashflow.filter((r) => r.division === division && r.tipo === "realizado" && r.month.startsWith(year));
    const receita_bruta = round2(rows.reduce((s, r) => s + r.entradas, 0));
    const saidas_total = round2(rows.reduce((s, r) => s + r.saidas, 0));
    const resultado_operacional = round2(receita_bruta - saidas_total);
    return {
      division, month: year, basis, receita_bruta, impostos: null, receita_liquida: null,
      custo_mercadorias: null, lucro_bruto: null, despesas: [], despesas_total: saidas_total,
      resultado_operacional, margem_bruta: null,
      margem_liquida: receita_bruta ? resultado_operacional / receita_bruta : 0,
      limited: true,
    };
  }

  // ---------------------------------------------------------------------
  // DRE (financeiro completo / nfe simplificado — sem categoria, ver README)
  // ---------------------------------------------------------------------
  function dreForPeriod(division, month, basis) {
    basis = basis || "financeiro";
    if (/^\d{4}$/.test(month)) return dreForYear(division, month, basis);
    const monthOpt = month === "acum" ? {} : { month };
    const flowIn = basis === "financeiro" ? "entrada" : "venda";
    const flowOut = basis === "financeiro" ? "saida" : "compra";

    const entradas = filterTx(Object.assign({ division, basis, flow: flowIn }, monthOpt));
    const receita_bruta = sumVal(entradas);
    const saidasAll = filterTx(Object.assign({ division, basis, flow: flowOut }, monthOpt));

    if (basis !== "financeiro") {
      const custo = sumVal(saidasAll);
      return {
        division, month, basis, receita_bruta: round2(receita_bruta), impostos: 0,
        receita_liquida: round2(receita_bruta), custo_mercadorias: round2(custo),
        lucro_bruto: round2(receita_bruta - custo), despesas: [], despesas_total: 0,
        resultado_operacional: round2(receita_bruta - custo),
        margem_bruta: receita_bruta ? (receita_bruta - custo) / receita_bruta : 0,
        margem_liquida: receita_bruta ? (receita_bruta - custo) / receita_bruta : 0,
        n_entradas: entradas.length, n_saidas: saidasAll.length,
      };
    }

    const impostos = sumVal(saidasAll.filter((t) => t.category === "IMPOSTOS"));
    const custo_mercadorias = sumVal(saidasAll.filter((t) => t.category === "FORNECEDORES"));
    const receita_liquida = receita_bruta - impostos;
    const lucro_bruto = receita_liquida - custo_mercadorias;

    const catMap = new Map();
    saidasAll.forEach((t) => {
      if (t.category === "IMPOSTOS" || t.category === "FORNECEDORES") return;
      const key = t.category || "OUTRAS DESPESAS";
      catMap.set(key, (catMap.get(key) || 0) + t.value);
    });
    const despesas = Array.from(catMap.entries())
      .map(([categoria, valor]) => ({ categoria, grupo: Categories.groupOf(categoria), valor: round2(valor) }))
      .sort((a, b) => b.valor - a.valor);
    const despesas_total = despesas.reduce((s, d) => s + d.valor, 0);
    const resultado_operacional = lucro_bruto - despesas_total;

    return {
      division, month, basis, receita_bruta: round2(receita_bruta), impostos: round2(impostos),
      receita_liquida: round2(receita_liquida), custo_mercadorias: round2(custo_mercadorias),
      lucro_bruto: round2(lucro_bruto), despesas, despesas_total: round2(despesas_total),
      resultado_operacional: round2(resultado_operacional),
      margem_bruta: receita_liquida ? lucro_bruto / receita_liquida : 0,
      margem_liquida: receita_bruta ? resultado_operacional / receita_bruta : 0,
      n_entradas: entradas.length, n_saidas: saidasAll.length,
    };
  }

  // ---------------------------------------------------------------------
  // Categorias de despesa agregadas no período detalhado inteiro
  // ---------------------------------------------------------------------
  function expenseCategoriesAgg(division, month) {
    const monthOpt = month && month !== "acum" ? { month } : {};
    const receita_total = sumVal(filterTx(Object.assign({ division, basis: "financeiro", flow: "entrada" }, monthOpt)));
    const saidas = filterTx(Object.assign({ division, basis: "financeiro", flow: "saida" }, monthOpt))
      .filter((t) => t.category !== "IMPOSTOS" && t.category !== "FORNECEDORES");
    const map = new Map();
    saidas.forEach((t) => {
      const key = t.category || "OUTRAS DESPESAS";
      if (!map.has(key)) map.set(key, 0);
      map.set(key, map.get(key) + t.value);
    });
    return Array.from(map.entries())
      .map(([categoria, valor]) => ({
        categoria, grupo: Categories.groupOf(categoria), valor: round2(valor),
        pct_receita: receita_total ? valor / receita_total : 0,
      }))
      .sort((a, b) => b.valor - a.valor);
  }

  function topCounterparties(division, flow, basis, n, month) {
    basis = basis || "financeiro";
    const monthOpt = month && month !== "acum" ? { month } : {};
    const map = new Map();
    filterTx(Object.assign({ division, basis, flow }, monthOpt)).forEach((t) => {
      if (!t.counterparty) return;
      if (t.category === "IMPOSTOS") return; // tributo, não é relação de fornecedor
      if (!map.has(t.counterparty)) map.set(t.counterparty, { valor: 0, n: 0 });
      const rec = map.get(t.counterparty);
      rec.valor += t.value; rec.n += 1;
    });
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, valor: round2(v.valor), n_transacoes: v.n }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, n || 12);
  }

  // ---------------------------------------------------------------------
  // Empréstimos
  // ---------------------------------------------------------------------
  function loans(division) {
    const list = division && division !== "consolidado" ? MAXLED_DATA.loans.filter((l) => l.divisao === division) : MAXLED_DATA.loans;
    return list.map((l) => Object.assign({}, l, {
      pct_pago: l.valor_total ? l.valor_pago / l.valor_total : 0,
      custo_efetivo_pct: l.valor_total ? (l.valor_final_com_acrescimo - l.valor_total) / l.valor_total : 0,
      pct_parcelas: l.parcelas_total ? l.parcelas_pagas / l.parcelas_total : 0,
    }));
  }
  function loansTotals(division) {
    const list = loans(division);
    return {
      valor_total: round2(list.reduce((s, l) => s + l.valor_total, 0)),
      valor_pago: round2(list.reduce((s, l) => s + l.valor_pago, 0)),
      valor_restante: round2(list.reduce((s, l) => s + l.valor_restante, 0)),
      custo_total_juros: round2(list.reduce((s, l) => s + (l.valor_final_com_acrescimo - l.valor_total), 0)),
    };
  }

  function receivablesPayables(division) {
    if (!division || division === "consolidado") {
      const map = new Map();
      MAXLED_DATA.receivablesPayables.forEach((r) => {
        if (!map.has(r.month)) map.set(r.month, { month: r.month, a_receber: 0, a_pagar: 0 });
        const rec = map.get(r.month);
        rec.a_receber += r.a_receber; rec.a_pagar += r.a_pagar;
      });
      return Array.from(map.values()).map((r) => Object.assign(r, { saldo: round2(r.a_receber - r.a_pagar) }));
    }
    return MAXLED_DATA.receivablesPayables.filter((r) => r.division === division);
  }

  // ---------------------------------------------------------------------
  // Indicador de saúde financeira (0-100)
  // ---------------------------------------------------------------------
  function clampScore(v) { return Math.max(0, Math.min(100, v)); }
  function lerp(v, x0, x1, y0, y1) {
    if (x1 === x0) return y0;
    const t = (v - x0) / (x1 - x0);
    return y0 + (y1 - y0) * Math.max(0, Math.min(1, t));
  }

  function healthScore(division) {
    const months = detailedMonths();
    const dres = months.map((m) => dreForPeriod(division, m, "financeiro"));
    const avgMargin = dres.reduce((s, d) => s + d.margem_liquida, 0) / (dres.length || 1);
    const positiveMonths = cashflowSeries(division).filter((r) => r.tipo === "realizado").filter((r) => r.resultado >= 0).length;
    const realizedMonths = cashflowSeries(division).filter((r) => r.tipo === "realizado").length || 1;
    const liquidezPct = positiveMonths / realizedMonths;

    const receitaAcum = dreForPeriod(division, "acum", "financeiro").receita_bruta;
    const receitaAnualizada = (receitaAcum / (months.length || 1)) * 12;
    const debt = loansTotals(division).valor_restante;
    const debtRatio = receitaAnualizada ? debt / receitaAnualizada : 0;

    const suppliers = topCounterparties(division, "saida", "financeiro", 1);
    const totalSaidas = sumVal(filterTx({ division, basis: "financeiro", flow: "saida" }));
    const concentration = totalSaidas && suppliers[0] ? suppliers[0].valor / totalSaidas : 0;

    const compMargem = clampScore(lerp(avgMargin, -0.15, 0.15, 0, 100));
    const compLiquidez = clampScore(liquidezPct * 100);
    const compDivida = clampScore(lerp(debtRatio, 1.5, 0.3, 0, 100));
    const compConcentracao = clampScore(lerp(concentration, 0.6, 0.15, 0, 100));

    const score = compMargem * 0.30 + compLiquidez * 0.25 + compDivida * 0.25 + compConcentracao * 0.20;

    return {
      score: Math.round(score),
      components: [
        { label: "Margem líquida média", score: Math.round(compMargem), detail: Fmt.pct(avgMargin) },
        { label: "Meses com fluxo positivo", score: Math.round(compLiquidez), detail: `${positiveMonths}/${realizedMonths} meses` },
        { label: "Endividamento vs receita anual", score: Math.round(compDivida), detail: Fmt.pct(debtRatio) },
        { label: "Concentração (maior fornecedor)", score: Math.round(compConcentracao), detail: suppliers[0] ? `${Fmt.pct(concentration)} · ${suppliers[0].nome}` : "—" },
      ],
    };
  }

  // ---------------------------------------------------------------------
  // Insights / estratégia
  // ---------------------------------------------------------------------
  function insights() {
    const out = [];
    const months = detailedMonths();
    const lastMonth = months[months.length - 1];

    // Comparação de margem entre divisões
    const dreIlu = dreForPeriod("iluminacao", "acum", "financeiro");
    const dreImp = dreForPeriod("importacao", "acum", "financeiro");
    if (dreImp.margem_liquida < 0) {
      out.push({
        level: "critical", icon: "alertTriangle",
        title: `Max Led Importação opera no negativo`,
        body: `Margem líquida acumulada de <b>${Fmt.pct(dreImp.margem_liquida)}</b> no período analisado (receita ${Fmt.money(dreImp.receita_bruta)}, resultado ${Fmt.money(dreImp.resultado_operacional)}). Já a Iluminação está em ${Fmt.pct(dreIlu.margem_liquida)}. Vale revisar preço/custo de importação ou redirecionar caixa para a divisão mais rentável.`,
      });
    } else if (dreIlu.margem_liquida < 0) {
      out.push({
        level: "critical", icon: "alertTriangle",
        title: `Max Led Iluminação opera no negativo`,
        body: `Margem líquida acumulada de <b>${Fmt.pct(dreIlu.margem_liquida)}</b> no período. Importação está em ${Fmt.pct(dreImp.margem_liquida)}.`,
      });
    } else {
      const winner = dreIlu.margem_liquida >= dreImp.margem_liquida ? "Iluminação" : "Importação";
      out.push({
        level: "info", icon: "sparkles",
        title: `Max Led ${winner} é a divisão mais rentável`,
        body: `Margem líquida: Iluminação ${Fmt.pct(dreIlu.margem_liquida)} vs Importação ${Fmt.pct(dreImp.margem_liquida)} no período acumulado.`,
      });
    }

    // Custo efetivo dos empréstimos
    const lt = loansTotals("consolidado");
    const worstLoan = loans("consolidado").slice().sort((a, b) => b.custo_efetivo_pct - a.custo_efetivo_pct)[0];
    if (worstLoan) {
      out.push({
        level: "warning", icon: "banknote",
        title: `Dívida ativa custa ${Fmt.money(lt.custo_total_juros, { compact: true })} em juros/encargos`,
        body: `Os 4 empréstimos somam ${Fmt.money(lt.valor_total, { compact: true })} tomados, mas custarão ${Fmt.money(lt.valor_total + lt.custo_total_juros, { compact: true })} ao final — um acréscimo médio de ${Fmt.pct(lt.custo_total_juros / lt.valor_total)}. O mais caro é <b>${worstLoan.nome}</b>, com acréscimo de ${Fmt.pct(worstLoan.custo_efetivo_pct)} sobre o valor tomado. Priorizar sua quitação antecipada reduz o custo financeiro total.`,
      });
    }

    // Concentração de fornecedores/clientes
    ["iluminacao", "importacao"].forEach((div) => {
      const label = MAXLED_DATA.meta.division_labels[div];
      const supTop = topCounterparties(div, "saida", "financeiro", 1)[0];
      const totalSaidas = sumVal(filterTx({ division: div, basis: "financeiro", flow: "saida" }));
      if (supTop && totalSaidas && supTop.valor / totalSaidas > 0.12) {
        out.push({
          level: "warning", icon: "users",
          title: `${label}: concentração em ${Fmt.titleCase(supTop.nome)}`,
          body: `Esse fornecedor/destino responde por <b>${Fmt.pct(supTop.valor / totalSaidas)}</b> de tudo que saiu de caixa na divisão (${Fmt.money(supTop.valor)}). Vale diversificar para reduzir dependência.`,
        });
      }
    });

    // Fluxo de caixa projetado negativo (contas a receber/pagar)
    ["iluminacao", "importacao"].forEach((div) => {
      const rows = receivablesPayables(div).filter((r) => r.month !== "TOTAL");
      const negatives = rows.filter((r) => r.saldo < 0);
      if (negatives.length) {
        const label = MAXLED_DATA.meta.division_labels[div];
        const worst = negatives.slice().sort((a, b) => a.saldo - b.saldo)[0];
        out.push({
          level: "critical", icon: "calendarCheck",
          title: `${label}: saldo projetado fica negativo`,
          body: `Nas contas a receber/pagar previstas, o pior mês é <b>${worst.month}</b> com saldo de ${Fmt.money(worst.saldo)} (a receber ${Fmt.money(worst.a_receber)} vs a pagar ${Fmt.money(worst.a_pagar)}). Vale antecipar recebíveis ou negociar prazos de pagamento nesse período.`,
        });
      }
    });

    // Pipeline vazio
    out.push({
      level: "info", icon: "target",
      title: "Pipeline de vendas ainda não é usado",
      body: `A aba de pipeline da planilha original não tem nenhuma oportunidade cadastrada. Acompanhar previsão de vendas por status (aberto/ganho/perdido) ajudaria a antecipar receita futura — hoje as projeções usam apenas médias históricas.`,
    });

    // Mês mais recente vs anterior
    if (months.length >= 2) {
      const cf = cashflowSeries("consolidado");
      const cur = cf.find((r) => r.month === lastMonth);
      const prev = cf.find((r) => r.month === previousMonth(lastMonth));
      if (cur && prev && prev.resultado !== 0) {
        const delta = (cur.resultado - prev.resultado);
        out.push({
          level: cur.resultado >= 0 ? "good" : "critical",
          icon: cur.resultado >= 0 ? "checkCircle" : "alertTriangle",
          title: `Resultado consolidado de ${Fmt.monthLabel(lastMonth)}: ${Fmt.money(cur.resultado)}`,
          body: `${delta >= 0 ? "Melhora" : "Queda"} de ${Fmt.money(Math.abs(delta))} frente a ${Fmt.monthLabel(prev.month)} (${Fmt.money(prev.resultado)}).`,
        });
      }
    }

    const order = { critical: 0, warning: 1, info: 2, good: 3 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  // ---------------------------------------------------------------------
  // Orçamento (localStorage) vs realizado
  // ---------------------------------------------------------------------
  function budgetStatus(division, month) {
    const budgets = Storage.listOrcamento().filter((b) => b.division === division);
    const cats = expenseCategoriesAgg(division);
    const monthCats = month === "acum" ? cats : (() => {
      const dre = dreForPeriod(division, month, "financeiro");
      return dre.despesas.map((d) => ({ categoria: d.categoria, valor: d.valor, grupo: d.grupo }));
    })();
    return budgets.map((b) => {
      const actual = (monthCats.find((c) => c.categoria === b.categoria) || { valor: 0 }).valor;
      const pct = b.limite ? actual / b.limite : 0;
      return { division: b.division, categoria: b.categoria, limite: b.limite, atual: round2(actual), pct };
    }).sort((a, b) => b.pct - a.pct);
  }

  global.Compute = {
    DIVISIONS, round2,
    allTransactions, detailedMonths, filterTx, previousMonth,
    cashflowSeries, dreForPeriod, expenseCategoriesAgg, topCounterparties,
    loans, loansTotals, receivablesPayables, healthScore, insights, budgetStatus,
  };
})(window);
