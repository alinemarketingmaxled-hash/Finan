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

  global.ExcelImport = { parseWorkbook, dedupe, summarize, fingerprint, analyzeUnknowns, applyCategoriaClassification };
})(window);
