// Importação de Excel direto no navegador (SheetJS) — lê as mesmas 8 abas de
// transações que o scripts/extract_xlsx.py usa para montar a base original,
// com o mesmo mapeamento de colunas, para que dados novos (meses seguintes)
// possam ser adicionados sem precisar gerar um novo data.js.
(function (global) {
  // sheet: [division, basis, flow, dateCol, catCol, cpCol, valCol, notaCol] (índices 0-based, iguais ao ETL em Python)
  // ENTRADA NFE ILUMI: os cabeçalhos "Cliente"/"Nota" estão trocados em relação ao
  // conteúdo real da planilha — col. 1 é o número da nota, col. 2 é o nome do cliente.
  const SHEETS = [
    ["ENTRADAS - FIN - ilumi", "iluminacao", "financeiro", "entrada", 0, null, 1, 3, 2],
    ["SAIDAS-FIN-ilumi", "iluminacao", "financeiro", "saida", 0, 2, 1, 3, null],
    ["ENTRADA NFE ILUMI", "iluminacao", "nfe", "compra", 0, null, 2, 3, 1],
    ["SAÍDA NFE ILUMI", "iluminacao", "nfe", "venda", 0, null, 2, 3, 1],
    ["Entradas- fin- import", "importacao", "financeiro", "entrada", 0, null, 1, 3, 2],
    ["Saidas-fin-import", "importacao", "financeiro", "saida", 0, 2, 1, 3, null],
    ["Entradas-NFE-Import", "importacao", "nfe", "compra", 0, null, 2, 3, 1],
    ["Saídas-NFE-import", "importacao", "nfe", "venda", 0, null, 2, 3, 1],
  ];
  const ALIASES = {
    "EMPRÉSTIMOS FGI": "EMPRÉSTIMO FGI",
    "IMPORTAÇÕES": "IMPORTAÇÃO",
    "SEGURO SÓCIOS CARRO": "SEGURO SÓCIO CARRO",
    "OUTROS": "OUTRAS DESPESAS",
    "EMPRESTIMO": "EMPRÉSTIMO",
    "EMPRESTIMOS": "EMPRÉSTIMO",
    "EMPRÉSTIMOS": "EMPRÉSTIMO",
    "IMPOSTO": "IMPOSTOS",
    "GASTOS FICOS": "GASTOS FIXOS",
    "INSUMO": "INSUMOS",
    "SÓCIO": "SÓCIOS",
    "SEGURO": "SEGURO SAÚDE",
    "ANUAL": "OUTRAS DESPESAS",
  };

  function normCat(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    let s = String(raw).trim().toUpperCase().replace(/\s+/g, " ");
    if (ALIASES[s]) return ALIASES[s];
    const learned = Storage.getCategoriaAliases();
    return learned[s] || s;
  }

  function toIsoDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function fmtNota(v) {
    if (v === null || v === undefined || v === "") return null;
    return String(v).trim() || null;
  }

  function fingerprint(t) {
    return [t.date, t.division, t.basis, t.flow, t.category || "", (t.counterparty || "").trim().toUpperCase(), t.value.toFixed(2)].join("|");
  }

  function parseWorkbook(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    const found = [];
    const missingSheets = [];
    const rows = [];

    SHEETS.forEach(([sheetName, division, basis, flow, dateCol, catCol, cpCol, valCol, notaCol]) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) { missingSheets.push(sheetName); return; }
      found.push(sheetName);
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      for (let i = 1; i < grid.length; i++) {
        const row = grid[i];
        if (!row) continue;
        const dateVal = row[dateCol];
        const valueVal = row[valCol];
        const iso = toIsoDate(dateVal);
        if (!iso || typeof valueVal !== "number") continue;
        rows.push({
          date: iso, division, basis, flow,
          category: catCol !== null ? normCat(row[catCol]) : null,
          counterparty: cpCol !== null && row[cpCol] !== null && row[cpCol] !== undefined ? String(row[cpCol]).trim() : null,
          value: Math.round(valueVal * 100) / 100,
          nota_fiscal: notaCol !== null && notaCol !== undefined ? fmtNota(row[notaCol]) : null,
        });
      }
    });

    return { rows, found, missingSheets };
  }

  // ---------------------------------------------------------------------
  // Importação simples: planilha qualquer (não o modelo de 8 abas da Max
  // Led) -- lê só a 1ª aba, detecta as colunas Data/Contraparte/Valor/Nota
  // pelo texto do cabeçalho (sem acento, sem caixa) e usa Divisão/Tipo/Base
  // escolhidos manualmente (valem pra todas as linhas do arquivo).
  // ---------------------------------------------------------------------
  const HEADER_SYNONYMS = {
    date: ["data", "date", "dia", "dt"],
    counterparty: ["contraparte", "cliente", "fornecedor", "nome", "empresa", "descricao", "historico", "favorecido"],
    value: ["valor", "value", "total", "montante", "quantia"],
    nota: ["nota fiscal", "nota", "nf", "numero", "num"],
  };

  function normHeader(s) {
    const noAccents = String(s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return noAccents;
  }

  function detectColumns(headerRow) {
    const cols = { date: null, counterparty: null, value: null, nota: null };
    (headerRow || []).forEach((cell, idx) => {
      const h = normHeader(cell);
      if (!h) return;
      Object.keys(HEADER_SYNONYMS).forEach((key) => {
        if (cols[key] === null && HEADER_SYNONYMS[key].some((syn) => h.includes(syn))) cols[key] = idx;
      });
    });
    return cols;
  }

  // Uma linha de cabeçalho de verdade é só texto -- se a linha 0 já tem uma
  // data ou número reais em alguma célula, é dado (ex: uma contraparte cujo
  // nome contém "Fornecedor" não pode virar falso positivo de cabeçalho).
  function looksLikeDataRow(row) {
    return (row || []).some((cell) => toIsoDate(cell) || typeof cell === "number");
  }

  function parseSimpleSheet(arrayBuffer, opts) {
    const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : null;
    if (!ws) return { rows: [], sheetName: null };
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    if (!grid.length) return { rows: [], sheetName };

    const detected = detectColumns(grid[0]);
    const hasHeader = !looksLikeDataRow(grid[0]) && (detected.date !== null || detected.counterparty !== null || detected.value !== null);
    let cols;
    let startRow;
    if (hasHeader) {
      cols = detected;
      if (cols.date === null) cols.date = 0;
      if (cols.counterparty === null) cols.counterparty = 1;
      if (cols.value === null) cols.value = 2;
      startRow = 1;
    } else {
      cols = { date: 0, counterparty: 1, value: 2, nota: null };
      startRow = 0;
    }

    const rows = [];
    for (let i = startRow; i < grid.length; i++) {
      const row = grid[i];
      if (!row) continue;
      const iso = toIsoDate(row[cols.date]);
      const valueVal = row[cols.value];
      if (!iso || typeof valueVal !== "number") continue;
      rows.push({
        date: iso, division: opts.division, basis: opts.basis, flow: opts.flow,
        category: opts.category || null,
        counterparty: row[cols.counterparty] !== null && row[cols.counterparty] !== undefined ? String(row[cols.counterparty]).trim() : null,
        value: Math.round(Math.abs(valueVal) * 100) / 100,
        nota_fiscal: cols.nota !== null ? fmtNota(row[cols.nota]) : null,
      });
    }
    return { rows, sheetName, usedHeader: hasHeader };
  }

  // ---------------------------------------------------------------------
  // Notas fiscais (a receber/a pagar) pra tela de Contas -- planilha própria
  // (data de vencimento, tipo, divisão, valor, contraparte, nota, obs),
  // separada dos lançamentos normais. Detecta colunas pelo cabeçalho; tipo e
  // divisão caem no valor escolhido manualmente (opts) quando a planilha não
  // trouxer uma coluna reconhecível ou o texto da célula não bater com nada.
  // ---------------------------------------------------------------------
  const NF_HEADER_SYNONYMS = {
    vencimento: ["vencimento", "vencto", "data"],
    tipo: ["tipo"],
    divisao: ["divisao", "empresa", "unidade", "filial"],
    valor: ["valor", "total", "montante"],
    contraparte: ["cliente", "fornecedor", "contraparte", "favorecido", "nome"],
    nota: ["nota fiscal", "numero da nota", "numero nf", "num nota", "nfe", "nf-e"],
    observacao: ["observacao", "obs", "descricao", "historico"],
  };
  const TIPO_CONTA_SYNONYMS = {
    a_receber: ["receber", "entrada", "receita", "recebimento"],
    a_pagar: ["pagar", "saida", "despesa", "pagamento"],
  };
  const DIVISAO_CONTA_SYNONYMS = {
    iluminacao: ["iluminacao", "ilumi", "led"],
    importacao: ["importacao", "import"],
  };
  function normTipoConta(raw) {
    const s = normHeader(raw);
    if (!s) return null;
    if (TIPO_CONTA_SYNONYMS.a_receber.some((syn) => s.includes(syn))) return "a_receber";
    if (TIPO_CONTA_SYNONYMS.a_pagar.some((syn) => s.includes(syn))) return "a_pagar";
    return null;
  }
  function normDivisaoConta(raw) {
    const s = normHeader(raw);
    if (!s) return null;
    if (DIVISAO_CONTA_SYNONYMS.iluminacao.some((syn) => s.includes(syn))) return "iluminacao";
    if (DIVISAO_CONTA_SYNONYMS.importacao.some((syn) => s.includes(syn))) return "importacao";
    return null;
  }
  function detectNfColumns(headerRow) {
    const cols = { vencimento: null, tipo: null, divisao: null, valor: null, contraparte: null, nota: null, observacao: null };
    (headerRow || []).forEach((cell, idx) => {
      const h = normHeader(cell);
      if (!h) return;
      Object.keys(NF_HEADER_SYNONYMS).forEach((key) => {
        if (cols[key] === null && NF_HEADER_SYNONYMS[key].some((syn) => h.includes(syn))) cols[key] = idx;
      });
    });
    return cols;
  }

  // opts: { tipoFallback: 'a_receber'|'a_pagar'|null, divisionFallback: 'iluminacao'|'importacao'|null }
  function parseNotasFiscais(arrayBuffer, opts) {
    opts = opts || {};
    const empty = { rows: [], sheetName: null, usedHeader: false, skipped: { data: 0, valor: 0, tipo: 0, divisao: 0 } };
    const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : null;
    if (!ws) return empty;
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    if (!grid.length) return Object.assign({}, empty, { sheetName });

    const detected = detectNfColumns(grid[0]);
    const hasHeader = !looksLikeDataRow(grid[0]) && (detected.vencimento !== null || detected.valor !== null);
    let cols, startRow;
    if (hasHeader) {
      cols = detected;
      if (cols.vencimento === null) cols.vencimento = 0;
      if (cols.valor === null) cols.valor = 1;
      startRow = 1;
    } else {
      // Mesma ordem-padrão do parseSimpleSheet (data/contraparte/valor), pra
      // planilha sem cabeçalho se comportar de forma previsível nos dois casos.
      cols = { vencimento: 0, contraparte: 1, valor: 2, tipo: null, divisao: null, nota: null, observacao: null };
      startRow = 0;
    }

    const rows = [];
    const skipped = { data: 0, valor: 0, tipo: 0, divisao: 0 };
    for (let i = startRow; i < grid.length; i++) {
      const row = grid[i];
      if (!row) continue;
      const iso = toIsoDate(row[cols.vencimento]);
      if (!iso) { skipped.data += 1; continue; }
      const valorRaw = row[cols.valor];
      if (typeof valorRaw !== "number") { skipped.valor += 1; continue; }
      const tipo = (cols.tipo !== null ? normTipoConta(row[cols.tipo]) : null) || opts.tipoFallback || null;
      if (!tipo) { skipped.tipo += 1; continue; }
      const division = (cols.divisao !== null ? normDivisaoConta(row[cols.divisao]) : null) || opts.divisionFallback || null;
      if (!division) { skipped.divisao += 1; continue; }
      rows.push({
        vencimento: iso, tipo, division,
        valor: Math.round(Math.abs(valorRaw) * 100) / 100,
        contraparte: cols.contraparte !== null && row[cols.contraparte] !== null && row[cols.contraparte] !== undefined ? String(row[cols.contraparte]).trim() : null,
        nota_fiscal: cols.nota !== null ? fmtNota(row[cols.nota]) : null,
        observacao: cols.observacao !== null && row[cols.observacao] !== null && row[cols.observacao] !== undefined ? String(row[cols.observacao]).trim() : null,
      });
    }
    return { rows, sheetName, usedHeader: hasHeader, skipped };
  }

  function dedupe(newRows) {
    const existing = new Set();
    MAXLED_DATA.transactions.forEach((t) => existing.add(fingerprint(t)));
    Storage.listLancamentos().forEach((t) => existing.add(fingerprint(t)));

    const toAdd = [];
    const duplicates = [];
    const seenInBatch = new Set();
    newRows.forEach((r) => {
      const fp = fingerprint(r);
      if (existing.has(fp) || seenInBatch.has(fp)) { duplicates.push(r); return; }
      seenInBatch.add(fp);
      toAdd.push(r);
    });
    return { toAdd, duplicates };
  }

  // Categorias que a planilha trouxe mas não batem com nenhum grupo conhecido
  // (nem direto, nem via ALIASES/aprendidas) — o usuário classifica antes de
  // confirmar a importação, em vez de cair silenciosamente em "Outras despesas".
  // Nota fiscal não tem uma lista fechada pra validar contra (é texto livre),
  // então só sinalizamos quando o valor não parece um número/referência normal
  // (tem letra no meio, ex: "SNF", "DEVOLUÇÃO") pra revisão manual depois.
  function analyzeUnknowns(rows) {
    const catMap = new Map();
    let weirdNotas = 0;
    rows.forEach((r) => {
      if (r.category && !(global.Categories && global.Categories.GROUPS[r.category])) {
        if (!catMap.has(r.category)) catMap.set(r.category, { categoria: r.category, count: 0, sum: 0 });
        const rec = catMap.get(r.category);
        rec.count += 1;
        rec.sum += r.value;
      }
      if (r.nota_fiscal && /[a-zA-Z]/.test(r.nota_fiscal)) weirdNotas += 1;
    });
    const categories = Array.from(catMap.values()).sort((a, b) => b.count - a.count);
    return { categories, weirdNotas };
  }

  // Aplica a classificação escolhida pelo usuário (raw -> categoria válida) nas
  // linhas a importar, e memoriza em Storage pra próximas importações já virem
  // reconhecidas automaticamente.
  function applyCategoriaClassification(rows, mapping) {
    if (!mapping) return rows;
    const keys = Object.keys(mapping);
    if (!keys.length) return rows;
    keys.forEach((raw) => Storage.setCategoriaAlias(raw, mapping[raw]));
    return rows.map((r) => (r.category && mapping[r.category]) ? Object.assign({}, r, { category: mapping[r.category] }) : r);
  }

  function summarize(rows) {
    const byDivision = {};
    let minDate = null, maxDate = null;
    rows.forEach((r) => {
      byDivision[r.division] = (byDivision[r.division] || 0) + 1;
      if (!minDate || r.date < minDate) minDate = r.date;
      if (!maxDate || r.date > maxDate) maxDate = r.date;
    });
    return { byDivision, minDate, maxDate, total: rows.length };
  }

  global.ExcelImport = { parseWorkbook, parseSimpleSheet, parseNotasFiscais, dedupe, summarize, fingerprint, analyzeUnknowns, applyCategoriaClassification };
})(window);
