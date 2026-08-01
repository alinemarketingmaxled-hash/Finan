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
      nota_fiscal: m.nota_fiscal || null, cancelled: !!m.cancelled,
    };
  }

  // Lançamentos da base Excel/importados podem ter sido editados ou cancelados
  // pelo usuário depois — isso fica guardado à parte (Storage.overrides, por id)
  // em vez de reescrever a base, pra sempre dar pra reverter.
  function allTransactions() {
    const manual = Storage.listLancamentos().map(manualAsTx);
    const overrides = Storage.getOverrides();
    const hasOverrides = Object.keys(overrides).length > 0;
    const base = hasOverrides
      ? MAXLED_DATA.transactions.map((t) => (overrides[t.id] ? Object.assign({}, t, overrides[t.id]) : t))
      : MAXLED_DATA.transactions;
    return manual.length ? base.concat(manual) : base;
  }

  function detailedMonths() {
    return Array.from(new Set(allTransactions().map((t) => t.date.slice(0, 7)))).sort();
  }

  function filterTx(opts) {
    opts = opts || {};
    return allTransactions().filter((t) => {
      if (!opts.includeCancelled && t.cancelled) return false;
      if (opts.division && opts.division !== "consolidado" && t.division !== opts.division) return false;
      if (opts.basis && t.basis !== opts.basis) return false;
      if (opts.flow && t.flow !== opts.flow) return false;
      if (opts.month && t.date.slice(0, 7) !== opts.month) return false;
      if (opts.from && t.date.slice(0, 7) < opts.from) return false;
      if (opts.to && t.date.slice(0, 7) > opts.to) return false;
      if (opts.dateFrom && t.date < opts.dateFrom) return false;
      if (opts.dateTo && t.date > opts.dateTo) return false;
      if (opts.category && t.category !== opts.category) return false;
      if (opts.search) {
        const s = opts.search.toLowerCase();
        const hay = `${t.counterparty || ""} ${t.category || ""} ${t.nota_fiscal || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }

  // Categoria de cliente: não é um campo por lançamento, é um rótulo por
  // contraparte (definido manualmente pelo usuário) — vale pra tudo que já
  // veio e pra tudo que vier depois daquele mesmo cliente.
  function clienteCategoria(nome) {
    if (!nome) return null;
    return Storage.getClienteCategorias()[nome] || null;
  }

  // Lançamentos/clientes sem classificação — alimenta a barra flutuante de
  // classificação rápida. Cliente é por nome (não por lançamento), então só
  // devolve os maiores por valor: com centenas de contrapartes pequenas,
  // pedir pra classificar todas de uma vez não seria "rápido".
  function uncategorized() {
    const despesas = allTransactions().filter((t) => !t.cancelled && t.basis === "financeiro" && t.flow === "saida" && !t.category);

    const clientMap = new Map();
    allTransactions().forEach((t) => {
      if (t.cancelled || !t.counterparty) return;
      const isClientSide = (t.basis === "financeiro" && t.flow === "entrada") || (t.basis === "nfe" && t.flow === "venda");
      if (!isClientSide || clienteCategoria(t.counterparty)) return;
      if (!clientMap.has(t.counterparty)) clientMap.set(t.counterparty, { nome: t.counterparty, valor: 0, n: 0 });
      const rec = clientMap.get(t.counterparty);
      rec.valor += t.value; rec.n += 1;
    });
    const clientesAll = Array.from(clientMap.values()).sort((a, b) => b.valor - a.valor).map((c) => Object.assign({}, c, { valor: round2(c.valor) }));

    return {
      despesas,
      clientesAll,
      clientesTop: clientesAll.slice(0, 20),
      clientesTotalCount: clientesAll.length,
      clientesTotalValor: round2(clientesAll.reduce((s, c) => s + c.valor, 0)),
    };
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

  // Fluxo de caixa por dia (financeiro), num intervalo de datas — só existe
  // pra dentro da janela com lançamento detalhado (2025 é só total mensal).
  function dailyCashflow(division, dateFrom, dateTo) {
    const map = new Map();
    filterTx({ division, basis: "financeiro", dateFrom, dateTo }).forEach((t) => {
      if (!map.has(t.date)) map.set(t.date, { date: t.date, entradas: 0, saidas: 0 });
      const rec = map.get(t.date);
      if (t.flow === "entrada") rec.entradas += t.value; else if (t.flow === "saida") rec.saidas += t.value;
    });
    return Array.from(map.values())
      .map((r) => ({ date: r.date, entradas: round2(r.entradas), saidas: round2(r.saidas), resultado: round2(r.entradas - r.saidas) }))
      .sort((a, b) => a.date.localeCompare(b.date));
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
    const isClientSide = flow === "entrada" || flow === "venda";
    const map = new Map();
    filterTx(Object.assign({ division, basis, flow }, monthOpt)).forEach((t) => {
      if (!t.counterparty) return;
      if (t.category === "IMPOSTOS") return; // tributo, não é relação de fornecedor
      if (!map.has(t.counterparty)) map.set(t.counterparty, { valor: 0, n: 0 });
      const rec = map.get(t.counterparty);
      rec.valor += t.value; rec.n += 1;
    });
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, valor: round2(v.valor), n_transacoes: v.n, categoria: isClientSide ? clienteCategoria(nome) : null }))
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

    // Pipeline de vendas
    const pipe = pipelineSummary("consolidado");
    if (!pipe.items.length) {
      out.push({
        level: "info", icon: "users",
        title: "Pipeline de vendas ainda não é usado",
        body: `Cadastre oportunidades em aberto (empresa, mês previsto, valor, status) na página Pipeline pra acompanhar previsão de vendas além do histórico — ajuda a antecipar receita futura em vez de só projetar por média.`,
      });
    } else if (pipe.totalAberto > 0) {
      out.push({
        level: "info", icon: "users",
        title: `Pipeline em aberto: ${Fmt.money(pipe.totalAberto, { compact: true })} em ${pipe.aberto.length} oportunidade(s)`,
        body: `Se convertidas, essas oportunidades somam ${Fmt.money(pipe.totalAberto)} em receita potencial ainda não contabilizada nas projeções.${pipe.taxaConversao !== null ? ` Taxa de conversão histórica: ${Fmt.pct(pipe.taxaConversao)} (${pipe.ganho.length} ganha(s) de ${pipe.ganho.length + pipe.perdido.length} decidida(s)).` : ""}`,
      });
    }

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
  // Plano de ação: diferente de insights() (que aponta problemas), aqui a
  // ideia é sugerir o que fazer a respeito — sempre citando números reais,
  // nunca conselho genérico. Só gera ação pra divisão/situação que está
  // efetivamente no negativo ou em risco; se está tudo bem, a lista vem vazia.
  // ---------------------------------------------------------------------
  const DISCRETIONARY_CATS = ["MARKETING", "PUBLICIDADE", "BRINDES", "CONSUMO", "INVESTIMENTO"];

  function actionPlan() {
    const actions = [];
    const push = (priority, divisao, title, body, impacto) => actions.push({ priority, divisao, title, body, impacto: impacto || null });

    DIVISIONS.forEach((div) => {
      const label = MAXLED_DATA.meta.division_labels[div];
      const dre = dreForPeriod(div, "acum", "financeiro");
      if (dre.margem_liquida >= 0) return;

      const topCat = dre.despesas[0];
      if (topCat) {
        const corte = round2(topCat.valor * 0.1);
        push("alta", div, `${label}: revisar "${Fmt.titleCase(topCat.categoria)}"`,
          `Maior despesa da divisão no período: ${Fmt.money(topCat.valor)} (${Fmt.pct(dre.receita_bruta ? topCat.valor / dre.receita_bruta : 0)} da receita bruta). Uma redução de 10% aí já melhoraria o resultado em ${Fmt.money(corte)}.`,
          corte);
      }

      if (dre.receita_liquida > 0 && dre.custo_mercadorias / dre.receita_liquida > 0.5) {
        push("alta", div, `${label}: revisar precificação`,
          `Custo das mercadorias consome ${Fmt.pct(dre.custo_mercadorias / dre.receita_liquida)} da receita líquida (${Fmt.money(dre.custo_mercadorias)} de ${Fmt.money(dre.receita_liquida)}). Reajustar preço de venda ou renegociar custo de compra recupera margem rápido.`);
      }

      const topSup = topCounterparties(div, "saida", "financeiro", 1)[0];
      if (topSup) {
        push("media", div, `${label}: renegociar com ${Fmt.titleCase(topSup.nome)}`,
          `Maior saída de caixa da divisão: ${Fmt.money(topSup.valor)} em ${topSup.n_transacoes} transação(ões). Buscar desconto por volume, prazo maior ou uma segunda fonte reduz custo e risco de dependência.`);
      }

      const disc = dre.despesas.filter((d) => DISCRETIONARY_CATS.includes(d.categoria));
      const discTotal = round2(disc.reduce((s, d) => s + d.valor, 0));
      if (discTotal > 0) {
        push("media", div, `${label}: pausar gastos discricionários`,
          `${disc.map((d) => Fmt.titleCase(d.categoria)).join(", ")} somam ${Fmt.money(discTotal)} no período — são despesas mais fáceis de reduzir temporariamente (ao contrário de folha ou fornecedores) até a divisão voltar a ficar positiva.`,
          discTotal);
      }
    });

    const worstLoan = loans("consolidado").slice().sort((a, b) => b.custo_efetivo_pct - a.custo_efetivo_pct)[0];
    if (worstLoan && worstLoan.valor_restante > 0 && worstLoan.custo_efetivo_pct > 0.15) {
      push(worstLoan.custo_efetivo_pct > 0.3 ? "alta" : "media", null, `Priorizar quitação: ${worstLoan.nome}`,
        `Custo efetivo de ${Fmt.pct(worstLoan.custo_efetivo_pct)} sobre o saldo devedor de ${Fmt.money(worstLoan.valor_restante)}. Quanto antes quitar, menos juros/encargos acumulam.`);
    }

    DIVISIONS.forEach((div) => {
      const label = MAXLED_DATA.meta.division_labels[div];
      const negatives = receivablesPayables(div).filter((r) => r.saldo < 0);
      if (negatives.length) {
        const worst = negatives.slice().sort((a, b) => a.saldo - b.saldo)[0];
        push("alta", div, `${label}: cobrir saldo projetado negativo`,
          `Mês mais crítico nas contas a receber/pagar previstas: ${Fmt.monthLabel(worst.month)}, saldo de ${Fmt.money(worst.saldo)}. Antecipar recebíveis ou negociar prazo com fornecedores nesse período evita aperto de caixa.`);
      }
    });

    const pipe = pipelineSummary("consolidado");
    if (pipe.totalAberto > 0) {
      push("baixa", null, "Acelerar oportunidades em aberto no pipeline",
        `${Fmt.money(pipe.totalAberto)} em ${pipe.aberto.length} oportunidade(s) ainda não decidida(s). Focar em fechar as de maior valor ajuda a reverter o resultado mais rápido que só cortar custo.`);
    }

    const order = { alta: 0, media: 1, baixa: 2 };
    return actions.sort((a, b) => order[a.priority] - order[b.priority]);
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

  // ---------------------------------------------------------------------
  // Pipeline de vendas (oportunidades cadastradas manualmente — a planilha
  // original tem a aba mas não tinha nenhum lançamento).
  // ---------------------------------------------------------------------
  function pipelineSummary(division) {
    const all = Storage.listPipeline();
    const items = (!division || division === "consolidado") ? all : all.filter((p) => p.divisao === division);
    const aberto = items.filter((p) => p.status === "aberto");
    const ganho = items.filter((p) => p.status === "ganho");
    const perdido = items.filter((p) => p.status === "perdido");
    const sum = (list) => round2(list.reduce((s, p) => s + (Number(p.valor_previsto) || 0), 0));
    const decididas = ganho.length + perdido.length;
    return {
      items, aberto, ganho, perdido,
      totalAberto: sum(aberto), totalGanho: sum(ganho), totalPerdido: sum(perdido),
      taxaConversao: decididas ? ganho.length / decididas : null,
    };
  }

  global.Compute = {
    DIVISIONS, round2,
    allTransactions, detailedMonths, filterTx, previousMonth, clienteCategoria, uncategorized,
    cashflowSeries, dailyCashflow, dreForPeriod, expenseCategoriesAgg, topCounterparties,
    loans, loansTotals, receivablesPayables, healthScore, insights, actionPlan, budgetStatus, pipelineSummary,
  };
})(window);
