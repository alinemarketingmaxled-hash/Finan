// Camada de derivação: combina a base do Excel (MAXLED_DATA) com o que o
// usuário adiciona no navegador (Storage) e expõe funções prontas para as views.
(function (global) {
  const DIVISIONS = ["iluminacao", "importacao"];
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const sumVal = (list) => list.reduce((s, t) => s + t.value, 0);

  // Classificação de confiança usada em todo o módulo de Planejamento
  // (Forecast, Visão Futura, Cenários, Investimentos, Visão Estratégica):
  // REALIZADO já aconteceu; CONFIRMADO é compromisso documentado (Previsões,
  // A Receber/A Pagar); ESTIMADO vem de uma obrigação/premissa real (parcela
  // de empréstimo, retorno esperado de investimento); PROJETADO é tendência
  // estatística (regressão), sem lastro documentado.
  const STATUS = { REALIZADO: "realizado", CONFIRMADO: "confirmado", ESTIMADO: "estimado", PROJETADO: "projetado" };

  function manualAsTx(m) {
    return {
      id: m.id, date: m.date, division: m.division, basis: m.basis || "financeiro",
      flow: m.flow, category: m.category || null, counterparty: m.counterparty || null,
      value: Number(m.value) || 0, manual: true, origin: m.origin || null, note: m.note || "",
      nota_fiscal: m.nota_fiscal || null, cancelled: !!m.cancelled, needsReview: !!m.needsReview,
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
    return Storage.getClienteCategoria(nome);
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

  // Série mensal só do realizado (base 2025 pré-agregada + meses detalhados) --
  // extraída de cashflowSeries pra ser reaproveitada por forecast()/visaoFutura()
  // sem duplicar a lógica de junção. Saída idêntica às linhas tipo:"realizado"
  // que cashflowSeries já devolvia.
  function realizedMonthlySeries(division) {
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
    return Array.from(out.entries())
      .map(([month, v]) => ({ month, entradas: round2(v.entradas), saidas: round2(v.saidas), resultado: round2(v.entradas - v.saidas), tipo: "realizado" }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  function cashflowSeries(division, forecastMonths) {
    forecastMonths = forecastMonths === undefined ? 4 : forecastMonths;
    const rows = realizedMonthlySeries(division);

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

  // Clientes que só compraram uma vez no período todo (não olha o filtro de
  // mês da página -- "comprou uma vez" só faz sentido olhando o histórico
  // inteiro) -- candidatos a reativação, ordenados pelo valor da compra.
  function oneTimeClients(division) {
    const map = new Map();
    filterTx({ division, basis: "financeiro", flow: "entrada" }).forEach((t) => {
      if (!t.counterparty || t.category === "IMPOSTOS") return;
      if (!map.has(t.counterparty)) map.set(t.counterparty, { nome: t.counterparty, valor: 0, n: 0, data: t.date });
      const rec = map.get(t.counterparty);
      rec.valor += t.value; rec.n += 1;
      if (t.date > rec.data) rec.data = t.date;
    });
    return Array.from(map.values())
      .filter((c) => c.n === 1)
      .map((c) => Object.assign({}, c, { valor: round2(c.valor), categoria: clienteCategoria(c.nome) }))
      .sort((a, b) => b.valor - a.valor);
  }

  // ---------------------------------------------------------------------
  // Empréstimos
  // ---------------------------------------------------------------------
  // Empréstimos: base da planilha (com edição por id guardada à parte, mesmo
  // esquema de overrides de lançamentos) + contratos novos cadastrados na
  // mão -- assim dá pra manter o pagamento em dia sem depender de uma nova
  // extração completa da planilha.
  function loansAll() {
    const overrides = Storage.getLoanOverrides();
    const base = MAXLED_DATA.loans.map((l) => (overrides[l.id] ? Object.assign({}, l, overrides[l.id]) : l));
    return base.concat(Storage.listLoansExtras());
  }
  function loans(division) {
    const all = loansAll();
    const list = division && division !== "consolidado" ? all.filter((l) => l.divisao === division) : all;
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

  // Notas fiscais adicionadas manualmente/importadas na tela de Contas somam
  // por mês (do vencimento) + divisão, por cima do que já veio da extração
  // da planilha -- mantém a conta em dia entre uma importação completa e outra.
  function contasExtrasByMonthDivision() {
    const map = new Map();
    Storage.listContasExtras().forEach((e) => {
      const month = (e.vencimento || "").slice(0, 7);
      if (!month) return;
      const key = month + "|" + e.division;
      if (!map.has(key)) map.set(key, { month, division: e.division, a_receber: 0, a_pagar: 0 });
      const rec = map.get(key);
      if (e.tipo === "a_receber") rec.a_receber += e.valor;
      else if (e.tipo === "a_pagar") rec.a_pagar += e.valor;
    });
    return map;
  }

  function receivablesPayablesByDivision() {
    const base = new Map();
    MAXLED_DATA.receivablesPayables.forEach((r) => {
      base.set(r.month + "|" + r.division, { month: r.month, division: r.division, a_receber: r.a_receber, a_pagar: r.a_pagar });
    });
    contasExtrasByMonthDivision().forEach((extra, key) => {
      if (!base.has(key)) base.set(key, { month: extra.month, division: extra.division, a_receber: 0, a_pagar: 0 });
      const rec = base.get(key);
      rec.a_receber = round2(rec.a_receber + extra.a_receber);
      rec.a_pagar = round2(rec.a_pagar + extra.a_pagar);
    });
    return Array.from(base.values()).map((r) => Object.assign(r, { saldo: round2(r.a_receber - r.a_pagar) }));
  }

  function receivablesPayables(division) {
    const merged = receivablesPayablesByDivision();
    if (!division || division === "consolidado") {
      const map = new Map();
      merged.forEach((r) => {
        if (!map.has(r.month)) map.set(r.month, { month: r.month, a_receber: 0, a_pagar: 0 });
        const rec = map.get(r.month);
        rec.a_receber += r.a_receber; rec.a_pagar += r.a_pagar;
      });
      return Array.from(map.values()).map((r) => Object.assign(r, { saldo: round2(r.a_receber - r.a_pagar) }));
    }
    return merged.filter((r) => r.division === division);
  }

  // Janela fixa de N meses a partir do mês atual (real, hoje) -- sempre "os
  // próximos N meses", recalculada a cada chamada, então rola sozinha quando
  // o mês vira, sem precisar reimportar a planilha. Meses sem nenhum dado
  // (ainda não cobertos pela extração ou por nota fiscal manual) aparecem
  // zerados, pra manter a faixa sempre com N meses. O que ficou pra trás (mês
  // anterior ao atual) não desaparece: vira "vencido", separado.
  function receivablesPayablesWindow(division, monthsAhead) {
    monthsAhead = monthsAhead || 5;
    const all = receivablesPayables(division);
    const byMonth = new Map(all.map((r) => [r.month, r]));
    const now = new Date();
    const months = [];
    for (let i = 0; i < monthsAhead; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
    }
    const currentKey = months[0];
    const overdueRows = all.filter((r) => r.month < currentKey);
    const rows = months.map((m) => byMonth.get(m) || { month: m, a_receber: 0, a_pagar: 0, saldo: 0 });
    return {
      rows,
      overdue: {
        months: overdueRows.map((r) => r.month).sort(),
        a_receber: round2(overdueRows.reduce((s, r) => s + r.a_receber, 0)),
        a_pagar: round2(overdueRows.reduce((s, r) => s + r.a_pagar, 0)),
        saldo: round2(overdueRows.reduce((s, r) => s + r.saldo, 0)),
      },
    };
  }

  // ---------------------------------------------------------------------
  // Forecast: mesma regressão linear de cashflowSeries, mas rotulada por
  // STATUS e com horizonte configurável (a página Forecast usa 12 meses;
  // cashflowSeries continua com o padrão de 4 usado no Fluxo de Caixa).
  // ---------------------------------------------------------------------
  function forecast(division, opts) {
    opts = opts || {};
    const monthsAhead = opts.monthsAhead || 12;
    const trailing = opts.trailing || 6;
    const realized = realizedMonthlySeries(division);
    const rows = realized.map((r) => Object.assign({ status: STATUS.REALIZADO }, r));
    if (realized.length && monthsAhead > 0) {
      const fEntradas = forecastNext(realized.map((r) => r.entradas), monthsAhead, trailing);
      const fSaidas = forecastNext(realized.map((r) => r.saidas), monthsAhead, trailing);
      let month = realized[realized.length - 1].month;
      for (let k = 0; k < monthsAhead; k++) {
        month = nextMonthKey(month);
        rows.push({
          month, entradas: fEntradas[k], saidas: fSaidas[k], resultado: round2(fEntradas[k] - fSaidas[k]),
          tipo: "previsao", status: STATUS.PROJETADO,
        });
      }
    }
    return rows;
  }

  // Parcelas de empréstimo ainda não pagas, projetadas mês a mês -- a base de
  // dados não guarda o dia de vencimento nem o mês de cada parcela futura, só
  // o valor da parcela atual e quantas ainda restam. Por isso essa é uma
  // ESTIMATIVA explícita: presume cadência mensal regular a partir do mês que
  // vem, usando o valor de parcela já registrado no contrato (nunca inventa
  // valor). Usado por visaoFutura() para a linha "Estimado (dívida)".
  function loanInstallmentsForecast(division, monthsAhead) {
    monthsAhead = monthsAhead || 12;
    const now = new Date();
    const months = [];
    for (let i = 1; i <= monthsAhead; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
    }
    const byMonth = new Map(months.map((m) => [m, 0]));
    loans(division).filter((l) => l.parcelas_restantes > 0 && l.parcela_com_juros > 0).forEach((l) => {
      const n = Math.min(l.parcelas_restantes, monthsAhead);
      for (let i = 0; i < n; i++) {
        const key = months[i];
        byMonth.set(key, byMonth.get(key) + l.parcela_com_juros);
      }
    });
    return months.map((month) => ({ month, valor: round2(byMonth.get(month)) }));
  }

  // ---------------------------------------------------------------------
  // Visão Futura: uma única tabela mensal juntando o que já é compromisso
  // documentado (CONFIRMADO: Previsões + A Receber/A Pagar), o que é
  // obrigação real projetada (ESTIMADO: parcelas de empréstimo -- mostrado à
  // parte do combinado, nunca somado, porque o PROJETADO por tendência já
  // embute implicitamente um nível "típico" de pagamento de dívida no
  // histórico) e a tendência estatística (PROJETADO: forecast()). O
  // "acumulado" continua a mesma convenção já usada em Fluxo de Caixa (soma
  // corrida do resultado desde o início do histórico) -- não é saldo
  // bancário real, porque a base de dados não registra um saldo inicial de
  // caixa; nunca rotular como "caixa hoje" na tela.
  // ---------------------------------------------------------------------
  function visaoFutura(division, opts) {
    opts = opts || {};
    const monthsAhead = opts.monthsAhead || 6;
    const pipe = pipelineSummary(division);
    const rp = receivablesPayablesWindow(division, monthsAhead);
    const loanInst = loanInstallmentsForecast(division, monthsAhead);
    const investInst = committedInvestments(division, monthsAhead);
    const fc = forecast(division, { monthsAhead });
    const projRows = fc.filter((r) => r.status === STATUS.PROJETADO);

    const now = new Date();
    const months = [];
    for (let i = 0; i < monthsAhead; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
    }

    const pipeByMonth = new Map(pipe.monthly.map((r) => [r.mes, r]));
    const rpByMonth = new Map(rp.rows.map((r) => [r.month, r]));
    const loanByMonth = new Map(loanInst.map((r) => [r.month, r.valor]));
    const investByMonth = new Map(investInst.map((r) => [r.month, r.valor]));
    const projByMonth = new Map(projRows.map((r) => [r.month, r]));

    const rows = months.map((month) => {
      const p = pipeByMonth.get(month) || { entrada: 0, saida: 0 };
      const rpx = rpByMonth.get(month) || { a_receber: 0, a_pagar: 0 };
      const confirmadoEntrada = round2(p.entrada + rpx.a_receber);
      const confirmadoSaida = round2(p.saida + rpx.a_pagar);
      const confirmado = round2(confirmadoEntrada - confirmadoSaida);
      const estimadoDivida = round2(loanByMonth.get(month) || 0);
      // Investimento já aprovado (Compute.investmentCapacity) -- mesmo
      // tratamento da parcela de dívida: ESTIMADO à parte, nunca somado ao
      // combinado (fecha a mão-dupla entre Investimentos e Visão Futura).
      const estimadoInvestimento = round2(investByMonth.get(month) || 0);
      const proj = projByMonth.get(month) || null;
      const projetado = proj ? proj.resultado : null;
      const combinado = proj !== null ? round2(confirmado + projetado) : confirmado;
      return { month, confirmadoEntrada, confirmadoSaida, confirmado, estimadoDivida, estimadoInvestimento, projetado, combinado };
    });

    let running = round2(realizedMonthlySeries(division).reduce((s, r) => s + r.resultado, 0));
    const rowsWithAccum = rows.map((r) => {
      running = round2(running + r.combinado);
      return Object.assign({}, r, { acumulado: running });
    });

    const piorMes = rowsWithAccum.length ? rowsWithAccum.slice().sort((a, b) => a.acumulado - b.acumulado)[0] : null;

    return { rows: rowsWithAccum, piorMes, overdue: rp.overdue };
  }

  // ---------------------------------------------------------------------
  // Cenários: aplica premissas percentuais (variação de receita/despesa)
  // sobre a linha PROJETADO do Forecast -- nunca sobre Realizado/Confirmado.
  // Sempre parte do mesmo forecast() já usado em Forecast/Visão Futura, então
  // um cenário com premissas zeradas reproduz a linha Base idêntica.
  // ---------------------------------------------------------------------
  const SYSTEM_SCENARIOS = [
    { id: "sistema-conservador", nome: "Conservador", isSistema: true, descricao: "Queda de receita e alta de despesa -- teste de resistência.", premissas: { receita_pct: -0.10, despesa_pct: 0.05 } },
    { id: "sistema-crescimento", nome: "Crescimento", isSistema: true, descricao: "Receita acelerando acima da tendência atual.", premissas: { receita_pct: 0.15, despesa_pct: 0.08 } },
  ];

  function applyScenario(rows, premissas) {
    premissas = premissas || {};
    const rp = Number(premissas.receita_pct) || 0;
    const dp = Number(premissas.despesa_pct) || 0;
    return rows.map((r) => {
      const entradas = round2(r.entradas * (1 + rp));
      const saidas = round2(r.saidas * (1 + dp));
      return Object.assign({}, r, { entradas, saidas, resultado: round2(entradas - saidas) });
    });
  }

  function scenariosList(division) {
    const saved = Storage.listCenarios().filter((c) => !c.divisao || c.divisao === "consolidado" || c.divisao === division || division === "consolidado");
    return [{ id: "sistema-base", nome: "Base", isSistema: true, descricao: "Tendência atual, sem nenhum ajuste (igual ao Forecast).", premissas: {} }]
      .concat(SYSTEM_SCENARIOS, saved);
  }

  function scenariosSummary(division, opts) {
    opts = opts || {};
    const monthsAhead = opts.monthsAhead || 12;
    const baseRows = forecast(division, { monthsAhead }).filter((r) => r.status === STATUS.PROJETADO);
    return scenariosList(division).map((c) => {
      const rows = applyScenario(baseRows, c.premissas);
      const totalEntradas = round2(rows.reduce((s, r) => s + r.entradas, 0));
      const totalSaidas = round2(rows.reduce((s, r) => s + r.saidas, 0));
      return {
        id: c.id, nome: c.nome, isSistema: !!c.isSistema, premissas: c.premissas,
        divisao: c.divisao, descricao: c.descricao || "",
        rows, totalEntradas, totalSaidas, resultado: round2(totalEntradas - totalSaidas),
      };
    });
  }

  // ---------------------------------------------------------------------
  // Investimentos: capacidade = caixa que sobra depois de proteger o
  // combinado de Visão Futura (Confirmado+Projetado) e as parcelas de
  // dívida (Estimado) -- exclui o Projetado por tendência por completo do
  // "já comprometido" (conservador: não dimensiona investimento em cima de
  // uma extrapolação estatística), e desconta o que já foi aprovado antes.
  // ---------------------------------------------------------------------
  function committedInvestments(division, monthsAhead) {
    monthsAhead = monthsAhead || 6;
    const now = new Date();
    const months = [];
    for (let i = 0; i < monthsAhead; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
    }
    const approved = Storage.listInvestimentos().filter((inv) => inv.status === "aprovado" && inv.data_prevista);
    const byMonth = new Map(months.map((m) => [m, 0]));
    approved.forEach((inv) => {
      if (!inv.divisao || inv.divisao === division || division === "consolidado") {
        const m = String(inv.data_prevista).slice(0, 7);
        if (byMonth.has(m)) byMonth.set(m, round2(byMonth.get(m) + (Number(inv.valor) || 0)));
      }
    });
    return months.map((month) => ({ month, valor: byMonth.get(month) }));
  }

  function investmentCapacity(division, opts) {
    opts = opts || {};
    const monthsAhead = opts.monthsAhead || 6;
    const caixaMinimo = opts.caixaMinimo !== undefined ? (Number(opts.caixaMinimo) || 0) : (Number(Storage.getConfig().caixaMinimo) || 0);
    const vf = visaoFutura(division, { monthsAhead });
    const aprovados = committedInvestments(division, monthsAhead);
    const aprovadosByMonth = new Map(aprovados.map((a) => [a.month, a.valor]));

    const rows = vf.rows.map((r) => {
      const jaAprovado = aprovadosByMonth.get(r.month) || 0;
      // Conservador por design: exclui o Projetado por completo (só Confirmado),
      // desconta a parcela de dívida estimada, o caixa mínimo reservado (se
      // configurado) e o que já foi aprovado antes.
      const capacidade = round2(r.confirmado - r.estimadoDivida - caixaMinimo - jaAprovado);
      return { month: r.month, confirmado: r.confirmado, estimadoDivida: r.estimadoDivida, jaAprovado, caixaMinimo, capacidade };
    });
    const capacidadeTotal = round2(rows.reduce((s, r) => s + r.capacidade, 0));
    const jaAprovadoTotal = round2(aprovados.reduce((s, a) => s + a.valor, 0));
    return { rows, capacidadeTotal, jaAprovadoTotal, caixaMinimo };
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

    // Previsões (entradas/saídas futuras cadastradas manualmente)
    const pipe = pipelineSummary("consolidado");
    if (!pipe.items.length) {
      out.push({
        level: "info", icon: "users",
        title: "Previsões ainda não é usado",
        body: `Cadastre um pedido, compra ou parcelamento futuro na página Previsões (valor, nº de parcelas, mês de início) pra ver antecipadamente o que vai entrar e sair de caixa — além do histórico e da projeção por média.`,
      });
    } else if (pipe.saldo !== 0 || pipe.totalEntrada > 0 || pipe.totalSaida > 0) {
      out.push({
        level: pipe.saldo >= 0 ? "info" : "warning", icon: "users",
        title: `Previsões cadastradas: ${Fmt.money(pipe.totalEntrada, { compact: true })} a entrar, ${Fmt.money(pipe.totalSaida, { compact: true })} a sair`,
        body: `Saldo previsto entre essas entradas e saídas ainda não realizadas: ${Fmt.money(pipe.saldo)}. Nenhum desses valores conta no DRE ou no fluxo de caixa realizado até você registrar o lançamento de verdade.`,
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
      const cf = categoryForecast(division, b.categoria, { monthsAhead: 1 });
      const forecastValor = cf.insufficientData ? null : (cf.projected[0] ? cf.projected[0].valor : null);
      return { division: b.division, categoria: b.categoria, limite: b.limite, atual: round2(actual), pct, forecast: forecastValor };
    }).sort((a, b) => b.pct - a.pct);
  }

  // ---------------------------------------------------------------------
  // Marketing: quanto um investimento em publicidade/marketing precisa
  // trazer de volta em vendas pra pelo menos se pagar. Usa a margem bruta
  // real do período (receita menos impostos e custo de mercadoria, antes
  // das despesas fixas) -- é o número certo pra isso, porque uma venda
  // extra gerada pela campanha ainda tem custo de mercadoria, mas não
  // costuma aumentar despesa fixa (aluguel, folha etc.). Margem líquida
  // também é mostrada, como referência mais conservadora. Sem margem
  // positiva no período, não dá pra calcular um retorno mínimo honesto.
  // ---------------------------------------------------------------------
  function marketingReturnNeeded(division, month, valorInvestido) {
    const dre = dreForPeriod(division, month, "financeiro");
    const valor = Number(valorInvestido) || 0;
    const margemBruta = dre.margem_bruta;
    const margemLiquida = dre.margem_liquida;
    return {
      valorInvestido: round2(valor),
      margemBruta, margemLiquida,
      receitaBrutaPeriodo: dre.receita_bruta,
      retornoMinimoBruto: margemBruta > 0 ? round2(valor / margemBruta) : null,
      retornoMinimoLiquido: margemLiquida > 0 ? round2(valor / margemLiquida) : null,
      roasMinimo: margemBruta > 0 ? round2(1 / margemBruta) : null,
    };
  }

  // Série mensal de uma categoria de despesa -- só existe pra meses com
  // lançamento detalhado (a base agregada de 2025 não guarda categoria por
  // mês, só total; ver dreForYear). Base de categoryForecast().
  function categoryMonthlySeries(division, categoria) {
    return detailedMonths().map((month) => {
      const saidas = filterTx({ division, basis: "financeiro", flow: "saida", month }).filter((t) => (t.category || "OUTRAS DESPESAS") === categoria);
      return { month, valor: round2(sumVal(saidas)) };
    });
  }

  // Mesmo motor de regressão do forecast(), aplicado a uma categoria (usado
  // por Orçamento). Exige pelo menos 2 meses com valor > 0 pra projetar --
  // menos que isso, devolve insufficientData:true (nunca inventa número).
  function categoryForecast(division, categoria, opts) {
    opts = opts || {};
    const monthsAhead = opts.monthsAhead || 3;
    const series = categoryMonthlySeries(division, categoria);
    const nonZero = series.filter((r) => r.valor > 0).length;
    if (nonZero < 2) return { history: series, projected: [], insufficientData: true };
    const trailing = Math.min(opts.trailing || 6, series.length);
    const proj = forecastNext(series.map((r) => r.valor), monthsAhead, trailing);
    let month = series[series.length - 1].month;
    const projected = proj.map((valor) => { month = nextMonthKey(month); return { month, valor }; });
    return { history: series, projected, insufficientData: false };
  }

  // Série mensal de margem líquida (financeiro) -- reaproveita dreForPeriod
  // por mês detalhado; base de metaStatus() pra metas do tipo margem_liquida.
  function marginMonthlySeries(division) {
    return detailedMonths().map((month) => ({ month, valor: dreForPeriod(division, month, "financeiro").margem_liquida }));
  }

  // ---------------------------------------------------------------------
  // Status de meta: {valorAtual, forecast, desvio, provavelAtingir} --
  // "provavelAtingir" só existe quando há uma projeção real derivável pro
  // tipo da meta (receita e margem, via regressão); quitação de dívida e
  // meta personalizada não têm uma série pra regredir de forma honesta, então
  // devolvem forecast:null + insufficientData:true em vez de inventar.
  // Nunca marca com base no valor parcial de hoje -- sempre contra o forecast.
  // ---------------------------------------------------------------------
  function metaStatus(meta) {
    const months = detailedMonths();
    const lastMonth = months[months.length - 1];
    const target = Number(meta.targetValue) || 0;
    let valorAtual = 0, forecastValor = null, insufficientData = true;

    if (meta.tipo === "receita_mensal" && lastMonth) {
      valorAtual = dreForPeriod(meta.divisao, lastMonth, "financeiro").receita_bruta;
      const fc = forecast(meta.divisao, { monthsAhead: 1 }).filter((r) => r.status === STATUS.PROJETADO)[0];
      if (fc) { forecastValor = fc.entradas; insufficientData = false; }
    } else if (meta.tipo === "margem_liquida" && lastMonth) {
      valorAtual = dreForPeriod(meta.divisao, lastMonth, "financeiro").margem_liquida;
      const series = marginMonthlySeries(meta.divisao);
      if (series.length >= 2) {
        const proj = forecastNext(series.map((r) => r.valor), 1, Math.min(6, series.length));
        forecastValor = proj[0]; insufficientData = false;
      }
    } else if (meta.tipo === "quitacao_divida") {
      const t = loansTotals(meta.divisao);
      valorAtual = t.valor_total ? t.valor_pago / t.valor_total : 0;
    } else {
      valorAtual = Number(meta.currentValue) || 0;
    }

    const desvio = forecastValor !== null ? round2(forecastValor - target) : null;
    const provavelAtingir = forecastValor !== null ? (target >= 0 ? forecastValor >= target : forecastValor <= target) : null;
    return { valorAtual: round2(valorAtual), forecast: forecastValor !== null ? round2(forecastValor) : null, desvio, provavelAtingir, insufficientData };
  }

  // ---------------------------------------------------------------------
  // Previsões: entrada ou saída futura cadastrada manualmente, dividida em
  // parcelas (ex: pedido de R$5.000 em 3x) -- a planilha original tinha uma
  // aba "Piperline" pra isso mas nunca foi preenchida. Puramente
  // planejamento: não conta no DRE/fluxo de caixa realizado.
  // ---------------------------------------------------------------------
  function pipelineInstallments(item) {
    const n = Math.max(1, parseInt(item.parcelas, 10) || 1);
    const total = Number(item.valor_total) || 0;
    const base = Math.floor((total / n) * 100) / 100;
    const out = [];
    let mes = item.mes_inicio;
    let acumulado = 0;
    for (let i = 0; i < n; i++) {
      const valor = i === n - 1 ? round2(total - acumulado) : base;
      out.push({ mes, valor });
      acumulado += valor;
      mes = nextMonthKey(mes);
    }
    return out;
  }

  function pipelineSummary(division) {
    const all = Storage.listPipeline();
    const items = (!division || division === "consolidado") ? all : all.filter((p) => p.divisao === division);
    const active = items.filter((p) => p.status !== "cancelado" && p.mes_inicio);

    const byMonth = new Map();
    active.forEach((p) => {
      pipelineInstallments(p).forEach(({ mes, valor }) => {
        if (!byMonth.has(mes)) byMonth.set(mes, { entrada: 0, saida: 0 });
        const rec = byMonth.get(mes);
        if (p.tipo === "saida") rec.saida += valor; else rec.entrada += valor;
      });
    });
    const monthly = Array.from(byMonth.keys()).sort().map((mes) => {
      const v = byMonth.get(mes);
      return { mes, entrada: round2(v.entrada), saida: round2(v.saida), saldo: round2(v.entrada - v.saida) };
    });

    const totalEntrada = round2(active.filter((p) => p.tipo !== "saida").reduce((s, p) => s + (Number(p.valor_total) || 0), 0));
    const totalSaida = round2(active.filter((p) => p.tipo === "saida").reduce((s, p) => s + (Number(p.valor_total) || 0), 0));

    return { items, monthly, totalEntrada, totalSaida, saldo: round2(totalEntrada - totalSaida) };
  }

  global.Compute = {
    DIVISIONS, round2, STATUS,
    allTransactions, detailedMonths, filterTx, previousMonth, clienteCategoria, uncategorized, oneTimeClients,
    realizedMonthlySeries, cashflowSeries, dailyCashflow, dreForPeriod, expenseCategoriesAgg, topCounterparties,
    loans, loansTotals, receivablesPayables, receivablesPayablesWindow, healthScore, insights, actionPlan, budgetStatus, pipelineSummary, pipelineInstallments,
    forecast, loanInstallmentsForecast, visaoFutura,
    applyScenario, scenariosSummary, committedInvestments, investmentCapacity,
    categoryForecast, metaStatus, marketingReturnNeeded,
  };
})(window);
