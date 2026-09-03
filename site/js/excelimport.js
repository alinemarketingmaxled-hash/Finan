// Importação de Excel direto no navegador (SheetJS) — lê as mesmas 8 abas de
// transações que o scripts/extract_xlsx.py usa para montar a base original,
// com o mesmo mapeamento de colunas, para que dados novos (meses seguintes)
// possam ser adicionados sem precisar gerar um novo data.js.
//
// js/vendor/xlsx.full.min.js tem um patch manual (o arquivo não tem gerenciador
// de dependência/build pra reaplicar em upgrade -- se trocar esse vendor file,
// checar se ainda precisa): o parser de .ods original lança uma exceção e
// derruba a leitura do arquivo INTEIRO quando uma célula tem
// office:value-type que não é nenhum dos padrão (boolean/float/percentage/
// currency/date/time/string) -- acontece, por exemplo, com célula de fórmula
// quebrada (#REF!, #DIV/0! etc.) que o programa que gerou o .ods marcou com
// um tipo não padrão. O patch trata esse caso igual a uma célula de texto
// (mesma coisa que já fazia pra string/text/vazio) em vez de derrubar a
// leitura -- a célula em si fica sem valor numérico (a linha dela é ignorada
// normalmente, como qualquer linha sem Data+Valor), mas o resto do arquivo
// continua sendo lido certinho.
(function (global) {
  // ---------------------------------------------------------------------
  // .ods de verdade (LibreOffice/Excel exportando pra .ods) costuma marcar
  // trechos vazios de uma linha/coluna com table:number-rows-repeated e
  // table:number-columns-repeated apontando pro limite máximo da planilha
  // (>1 milhão) em vez de escrever célula por célula -- é a forma padrão e
  // compacta do formato ODF de dizer "o resto está vazio". O parser de .ods
  // do SheetJS, ao processar isso, materializa cada uma dessas células
  // "vazias" de verdade (uma entrada por célula), o que trava o navegador e
  // estoura memória pra qualquer planilha real com dados (visto com um
  // arquivo de 268KB que virava dezenas de milhões de células antes de
  // travar). Não tem opção do SheetJS (nem sheetRows) que evite isso.
  //
  // Corrige antes de entregar pro SheetJS: abre o .ods como zip (sem
  // biblioteca -- é só um zip comum), lê o content.xml, baixa esses números
  // absurdos pra um teto bem maior que qualquer planilha real precisaria
  // (mantém o significado -- "resto vazio" -- só que um "resto" bem menor),
  // e reembala um zip mínimo só com mimetype+manifest+content.xml (não
  // precisamos de estilo/imagem/gráfico embutido pra ler os valores das
  // células). Se o arquivo não é .ods (não tem content.xml) ou não tem
  // nenhum desses números grandes, devolve o buffer original sem mexer.
  const REPEAT_CAP = 500; // bem mais que qualquer planilha real de lançamentos

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // Lê as entradas de um zip a partir do Central Directory (aponta pro
  // header local de cada uma, sem descomprimir nada ainda).
  function readZipEntries(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    const searchStart = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= searchStart; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    const entryCount = dv.getUint16(eocd + 10, true);
    const cdOffset = dv.getUint32(eocd + 16, true);
    const entries = [];
    let p = cdOffset;
    for (let i = 0; i < entryCount; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) return null;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOffset = dv.getUint32(p + 42, true);
      const name = new TextDecoder("utf-8").decode(bytes.subarray(p + 46, p + 46 + nameLen));
      entries.push({ name, method, compSize, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function extractZipEntry(bytes, entry) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const lp = entry.localOffset;
    if (dv.getUint32(lp, true) !== 0x04034b50) throw new Error("local file header inválido");
    const nameLen = dv.getUint16(lp + 26, true);
    const extraLen = dv.getUint16(lp + 28, true);
    const dataStart = lp + 30 + nameLen + extraLen;
    const compData = bytes.subarray(dataStart, dataStart + entry.compSize);
    if (entry.method === 0) return compData; // stored
    if (entry.method !== 8) throw new Error("método de compressão " + entry.method + " não suportado");
    const stream = new Blob([compData]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Reembala um zip mínimo, sem compressão (STORED) -- não precisa de
  // CompressionStream, e o tamanho maior em memória não importa aqui.
  function buildZipStored(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const encoder = new TextEncoder();
    files.forEach(({ name, data }) => {
      const nameBytes = encoder.encode(name);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(10, 0, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, nameBytes.length, true);
      const localHeader = new Uint8Array(lh.buffer);
      localParts.push(localHeader, nameBytes, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, nameBytes.length, true);
      ch.setUint32(42, offset, true);
      centralParts.push(new Uint8Array(ch.buffer), nameBytes);

      offset += localHeader.length + nameBytes.length + data.length;
    });
    const centralStart = offset;
    let centralSize = 0;
    centralParts.forEach((p) => { centralSize += p.length; });
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, centralStart, true);
    const out = new Uint8Array(offset + centralSize + 22);
    let w = 0;
    localParts.forEach((p) => { out.set(p, w); w += p.length; });
    centralParts.forEach((p) => { out.set(p, w); w += p.length; });
    out.set(new Uint8Array(eocd.buffer), w);
    return out;
  }

  // opts.value-type não padrão dentro de table:number-*-repeated não existe
  // (são atributos numéricos simples) -- troca direto por regex no texto,
  // sem precisar parsear XML de verdade.
  function sanitizeContentXml(xmlText, cap) {
    let changed = false;
    const out = xmlText.replace(/table:(number-rows-repeated|number-columns-repeated)="(\d+)"/g, (m, attr, numStr) => {
      if (parseInt(numStr, 10) > cap) { changed = true; return `table:${attr}="${cap}"`; }
      return m;
    });
    return { xml: out, changed };
  }

  async function sanitizeOdsIfNeeded(arrayBuffer) {
    try {
      const bytes = new Uint8Array(arrayBuffer);
      const entries = readZipEntries(bytes);
      if (!entries) return arrayBuffer;
      const contentEntry = entries.find((e) => e.name === "content.xml");
      if (!contentEntry) return arrayBuffer; // não é .ods (não tem essa entrada) -- devolve como veio
      const contentBytes = await extractZipEntry(bytes, contentEntry);
      const xmlText = new TextDecoder("utf-8").decode(contentBytes);
      const { xml: sanitized, changed } = sanitizeContentXml(xmlText, REPEAT_CAP);
      if (!changed) return arrayBuffer;
      const encoder = new TextEncoder();
      const zipBytes = buildZipStored([
        { name: "mimetype", data: encoder.encode("application/vnd.oasis.opendocument.spreadsheet") },
        { name: "META-INF/manifest.xml", data: encoder.encode('<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>') },
        { name: "content.xml", data: encoder.encode(sanitized) },
      ]);
      return zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength);
    } catch (e) {
      // Qualquer problema na sanitização (zip com formato inesperado etc.):
      // não trava a importação por causa disso -- devolve o buffer original
      // e deixa o SheetJS tentar do jeito normal (na pior das hipóteses volta
      // o erro de antes, não piora).
      console.warn("Sanitização de .ods não pôde rodar, usando arquivo original:", e);
      return arrayBuffer;
    }
  }
  // ---------------------------------------------------------------------

  // .xlsx/.xlsm/.xls são binário (ZIP ou OLE) e vão pro SheetJS como array de
  // bytes; qualquer outra coisa (.csv, .txt) é texto puro, e sem isso o
  // SheetJS lê como Latin-1 -- "Divisão" vira "DivisÃ£o" e nada bate mais com
  // as listas de sinônimo (acento nunca reconhecido). Decodifica como UTF-8
  // antes de entregar, então.
  async function readWorkbook(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer, 0, Math.min(8, arrayBuffer.byteLength));
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // PK.. (xlsx/xlsm/xlsb/ods)
    const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0; // xls antigo
    if (isZip) {
      const sanitized = await sanitizeOdsIfNeeded(arrayBuffer);
      return XLSX.read(sanitized, { type: "array", cellDates: true });
    }
    if (isOle) return XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    // csv/tsv/texto puro: sem indicar o codepage o SheetJS assume Latin-1 e
    // "Divisão" vira "DivisÃ£o" (nunca bate com as listas de sinônimo depois).
    // codepage 65001 = UTF-8. Mantém "array" (não "string") pra não perder a
    // conversão automática de data/número que só existe nesse modo.
    return XLSX.read(arrayBuffer, { type: "array", cellDates: true, codepage: 65001 });
  }

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

  async function parseWorkbook(arrayBuffer) {
    const wb = await readWorkbook(arrayBuffer);
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
  // Led) -- lê TODAS as abas, detecta as colunas Data/Contraparte/Valor/Nota
  // pelo texto do cabeçalho (sem acento, sem caixa) e a Divisão/Base/Tipo de
  // cada linha pelo que a própria planilha trouxer (coluna, colunas de valor
  // separadas, ou nome da aba); Divisão/Base/Tipo escolhidos no modal só
  // valem de reserva, pra linha/aba que não trouxer nenhuma pista disso.
  // ---------------------------------------------------------------------
  const HEADER_SYNONYMS = {
    date: ["data", "date", "dia", "dt"],
    divisao: ["divisao", "unidade", "filial"],
    tipo: ["tipo"],
    categoria: ["categoria", "grupo"],
    counterparty: ["contraparte", "cliente", "fornecedor", "nome", "empresa", "descricao", "historico", "favorecido", "destino", "origem"],
    value: ["valor", "value", "total", "montante", "quantia"],
    // Planilha com entrada e saída (financeiro) ou venda e compra (nota
    // fiscal) em colunas de valor separadas (uma preenchida, outra em
    // branco, por linha) em vez de uma coluna "Valor" + uma coluna "Tipo" --
    // comum em extrato bancário simples (débito/crédito) ou controle de NFe
    // com as duas operações juntas na mesma planilha.
    entradaValor: ["entrada", "credito", "recebimento"],
    saidaValor: ["saida", "debito", "pagamento"],
    vendaValor: ["venda"],
    compraValor: ["compra"],
    nota: ["nota fiscal", "nota", "nf", "numero", "num"],
  };
  const FLOW_SIMPLE_SYNONYMS = {
    financeiro: { entrada: ["entrada", "receita", "recebimento"], saida: ["saida", "despesa", "pagamento"] },
    nfe: { venda: ["venda"], compra: ["compra"] },
  };

  function normHeader(s) {
    const noAccents = String(s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return noAccents;
  }

  // Reconhece o texto de uma célula/nome de aba como Entrada/Saída/Venda/Compra
  // -- olha as DUAS bases (não só a escolhida no modal) e devolve qual base +
  // tipo bateu, pra planilha poder trazer financeiro e nota fiscal juntos
  // (ex: aba "Vendas" e aba "Entradas" no mesmo arquivo) sem precisar que a
  // pessoa escolha uma Base fixa pro arquivo inteiro -- mesma ideia de
  // normDivisaoConta/normTipoConta abaixo, só que pro par valor/base daqui.
  function detectBasisFlow(raw) {
    const s = normHeader(raw);
    if (!s) return null;
    const bases = Object.keys(FLOW_SIMPLE_SYNONYMS);
    for (let b = 0; b < bases.length; b++) {
      const table = FLOW_SIMPLE_SYNONYMS[bases[b]];
      const keys = Object.keys(table);
      for (let i = 0; i < keys.length; i++) {
        if (table[keys[i]].some((syn) => s.includes(syn))) return { basis: bases[b], flow: keys[i] };
      }
    }
    return null;
  }

  // Uma linha de cabeçalho de verdade é só texto -- se a linha 0 já tem uma
  // data ou número reais em alguma célula, é dado (ex: uma contraparte cujo
  // nome contém "Fornecedor" não pode virar falso positivo de cabeçalho).
  function looksLikeDataRow(row) {
    return (row || []).some((cell) => toIsoDate(cell) || typeof cell === "number");
  }

  // Lê TODAS as abas do arquivo (não só a primeira) -- planilha simples pode
  // vir com mais de uma aba (ex: "Vendas" + "Compras", ou "Entradas" +
  // "Saídas"), cada uma com sua própria tabela. Cada aba passa pela mesma
  // detecção de cabeçalho/colunas de sempre; abas sem nenhuma linha
  // reconhecível (data + valor) simplesmente não contribuem linha nenhuma,
  // sem precisar de nenhum tratamento especial (é o caso, por exemplo, da
  // aba oculta "Categorias" do nosso próprio modelo de importação).
  //
  // Quando uma aba não tem coluna "Tipo" nem colunas de valor separadas pra
  // decidir o Tipo linha a linha, o NOME da aba serve de pista adicional
  // antes de cair no Tipo escolhido no modal -- mesma ideia (e mesmo texto
  // reconhecido) das abas fixas "SAÍDA NFE ILUMI"/"ENTRADAS - FIN - ilumi"
  // do modelo de 8 abas, só que aqui o nome pode ser qualquer coisa.
  async function parseSimpleSheet(arrayBuffer, opts) {
    const wb = await readWorkbook(arrayBuffer);
    const sheetNames = wb.SheetNames || [];
    const perSheet = [];
    const rows = [];
    sheetNames.forEach((sheetName) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return;
      const sheetBasisFlow = detectBasisFlow(sheetName);
      const result = parseOneSheetGrid(ws, opts, sheetBasisFlow);
      // sheetName vai junto em cada linha só pra dar pra filtrar por aba
      // (ex: "só quero o mês de Agosto") na tela de revisão antes de
      // confirmar -- removido de novo antes de gravar (Storage.addLancamentosBulk
      // ganha só o que sobrou depois do filtro, sem esse campo a mais).
      if (result.rows.length) rows.push(...result.rows.map((r) => Object.assign({}, r, { sheetName })));
      perSheet.push({ sheetName, count: result.rows.length, usedHeader: result.usedHeader, unrecognized: result.unrecognized });
    });
    return { rows, sheetNames, perSheet };
  }

  const FIELD_KEYS = ["date", "divisao", "tipo", "categoria", "counterparty", "value", "entradaValor", "saidaValor", "vendaValor", "compraValor", "nota"];
  function emptyCols() {
    const cols = {};
    FIELD_KEYS.forEach((k) => { cols[k] = null; });
    return cols;
  }

  // Detecta as colunas de um cabeçalho pelo texto (sem acento, sem caixa),
  // devolvendo TODAS as colunas que batem com cada campo (não só a primeira)
  // -- é o que permite reconhecer quando a aba tem mais de uma "tabela" lado
  // a lado (ver detectColumnGroups logo abaixo).
  function detectAllColumns(headerRow) {
    const all = {};
    FIELD_KEYS.forEach((k) => { all[k] = []; });
    (headerRow || []).forEach((cell, idx) => {
      const h = normHeader(cell);
      if (!h) return;
      FIELD_KEYS.forEach((key) => {
        if (HEADER_SYNONYMS[key].some((syn) => h.includes(syn))) all[key].push(idx);
      });
    });
    return all;
  }

  // Algumas planilhas de nota fiscal trazem duas (ou mais) tabelas lado a
  // lado na MESMA faixa de linhas -- típico: "Compras" nas colunas 0-3 e
  // "Vendas" nas colunas 5-8, cada bloco com seu próprio Data/Nfe/Nome/Valor,
  // em vez de uma coluna "Tipo" por linha. Ignorar isso faz o detector normal
  // (uma ocorrência só por campo) enxergar apenas o primeiro bloco e jogar
  // fora o resto da planilha em silêncio.
  //
  // Ancora um grupo por ocorrência de "Data" no cabeçalho (cada bloco tem a
  // sua). As outras colunas encontradas (contraparte/valor/nota/categoria/...)
  // são física e contiguamente parte de UM bloco -- então entram no grupo
  // cujo intervalo [Data desse grupo, Data do próximo grupo) contém a coluna
  // (não "o Data mais perto por distância": um "Valor" no fim de um bloco de
  // 4 colunas largo fica mais perto, em distância pura, do PRÓXIMO Data do
  // que do seu próprio -- só o intervalo dá o bloco certo). Já o rótulo do
  // grupo (Compras/Vendas, Entrada/Saída) fica em linhas ACIMA do cabeçalho e
  // não é parte física do bloco, então esse sim usa o Data mais perto por
  // distância (procurando um texto que bata com Entrada/Saída/Venda/Compra).
  // Só 1 (ou 0) "Data" no cabeçalho: continua sendo o caminho de sempre, um
  // grupo só com a primeira ocorrência de cada campo.
  function detectColumnGroups(grid, headerRowIndex, detected) {
    const anchors = detected.date.slice().sort((a, b) => a - b);
    if (anchors.length <= 1) {
      const cols = emptyCols();
      FIELD_KEYS.forEach((key) => { cols[key] = detected[key].length ? detected[key][0] : null; });
      return [{ cols, basisFlow: null }];
    }

    const groups = anchors.map(() => ({ cols: emptyCols(), basisFlow: null }));
    function groupIndexForColumn(colIdx) {
      let gi = 0;
      for (let i = 0; i < anchors.length; i++) if (anchors[i] <= colIdx) gi = i; else break;
      return gi;
    }
    FIELD_KEYS.forEach((key) => {
      detected[key].forEach((colIdx) => {
        const gi = groupIndexForColumn(colIdx);
        if (groups[gi].cols[key] === null) groups[gi].cols[key] = colIdx; // mais à esquerda vence, dentro do grupo
      });
    });

    const labelCandidates = [];
    for (let i = 0; i < headerRowIndex; i++) {
      const row = grid[i];
      if (!row) continue;
      row.forEach((cell, idx) => {
        const bf = detectBasisFlow(cell);
        if (bf) labelCandidates.push({ col: idx, basisFlow: bf });
      });
    }
    groups.forEach((g, gi) => {
      const anchorCol = anchors[gi];
      let best = null, bestDist = Infinity;
      labelCandidates.forEach((c) => {
        const d = Math.abs(c.col - anchorCol);
        if (d < bestDist) { bestDist = d; best = c.basisFlow; }
      });
      g.basisFlow = best;
    });
    return groups;
  }

  // Extrai as linhas de UM grupo de colunas (um bloco da planilha) no
  // intervalo [startRow, grid.length) -- reaproveitada uma vez por grupo
  // quando a aba tem mais de uma tabela lado a lado.
  function parseRowsForGroup(grid, startRow, cols, groupBasisFlow, sheetBasisFlow, opts) {
    const rows = [];
    for (let i = startRow; i < grid.length; i++) {
      const row = grid[i];
      if (!row) continue;
      const iso = toIsoDate(row[cols.date]);
      // Valor: coluna única (Valor), ou -- se a planilha não tiver uma --
      // colunas separadas de um dos dois pares (Entrada/Saída ou
      // Venda/Compra), olhando qual das duas veio preenchida na linha (a
      // base+tipo já saem determinados disso também). Testa os dois pares
      // (não só o da Base escolhida no modal) -- é o que permite a planilha
      // trazer financeiro e nota fiscal juntos, cada linha com sua própria base.
      let valueVal = cols.value !== null ? row[cols.value] : null;
      let colBasisFlow = null;
      if (typeof valueVal !== "number") {
        if (cols.vendaValor !== null || cols.compraValor !== null) {
          const vv = cols.vendaValor !== null ? row[cols.vendaValor] : null;
          const cv = cols.compraValor !== null ? row[cols.compraValor] : null;
          if (typeof vv === "number" && vv !== 0) { valueVal = vv; colBasisFlow = { basis: "nfe", flow: "venda" }; }
          else if (typeof cv === "number" && cv !== 0) { valueVal = cv; colBasisFlow = { basis: "nfe", flow: "compra" }; }
        }
        if (typeof valueVal !== "number" && (cols.entradaValor !== null || cols.saidaValor !== null)) {
          const ev = cols.entradaValor !== null ? row[cols.entradaValor] : null;
          const sv = cols.saidaValor !== null ? row[cols.saidaValor] : null;
          if (typeof ev === "number" && ev !== 0) { valueVal = ev; colBasisFlow = { basis: "financeiro", flow: "entrada" }; }
          else if (typeof sv === "number" && sv !== 0) { valueVal = sv; colBasisFlow = { basis: "financeiro", flow: "saida" }; }
        }
      }
      // Sem data não dá pra importar de jeito nenhum (não tem mês/dia pra
      // colocar a linha em lugar nenhum do sistema) -- essa continua pulando.
      // Sem valor utilizável (célula de fórmula quebrada, valor ilegível,
      // planilha sem nenhuma coluna de valor reconhecida) NÃO pula mais: a
      // pedido, entra do mesmo jeito com R$0,00 e marcada pra revisar, em vez
      // de sumir sem deixar rastro -- fica fácil de achar depois (filtro
      // "revisar" na lista de conferência, e destacada na tela de Lançamentos).
      if (!iso) continue;
      const needsReview = typeof valueVal !== "number";
      if (needsReview) valueVal = 0;
      const division = (cols.divisao !== null && row[cols.divisao] != null ? normDivisaoConta(row[cols.divisao]) : null) || opts.division;
      // Ordem de prioridade pra Base+Tipo da linha: coluna "Tipo" da própria
      // linha -> colunas de valor separadas (colBasisFlow) -> rótulo do
      // bloco/grupo dentro da aba (groupBasisFlow, ex: seção "Compras" lado a
      // lado com "Vendas" na mesma aba) -> nome da aba inteira (sheetBasisFlow,
      // ex: aba "Compras") -> Base/Tipo escolhidos no modal (opts.*, só quando
      // nada acima deu pista nenhuma). Cada uma dessas pistas já resolve base
      // E tipo juntos -- não trava mais numa base fixa pro arquivo inteiro.
      const resolved = (cols.tipo !== null && row[cols.tipo] != null ? detectBasisFlow(row[cols.tipo]) : null)
        || colBasisFlow || groupBasisFlow || sheetBasisFlow || { basis: opts.basis, flow: opts.flow };
      const basis = resolved.basis;
      const flow = resolved.flow;
      const isExpenseLike = (basis === "financeiro" && flow === "saida") || (basis === "nfe" && flow === "compra");
      const category = isExpenseLike
        ? ((cols.categoria !== null && row[cols.categoria] != null ? normCat(row[cols.categoria]) : null) || opts.category || null)
        : null;
      rows.push({
        date: iso, division, basis, flow, category,
        counterparty: row[cols.counterparty] !== null && row[cols.counterparty] !== undefined ? String(row[cols.counterparty]).trim() : null,
        value: Math.round(Math.abs(valueVal) * 100) / 100,
        nota_fiscal: cols.nota !== null ? fmtNota(row[cols.nota]) : null,
        needsReview,
      });
    }
    return rows;
  }

  function parseOneSheetGrid(ws, opts, sheetBasisFlow) {
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    if (!grid.length) return { rows: [], usedHeader: false };

    // O cabeçalho de verdade nem sempre é a linha 0 -- um modelo pra preencher
    // pode ter título/instruções acima da tabela (é o caso do nosso próprio
    // modelo de importação). Procura nas primeiras linhas até achar uma que
    // pareça cabeçalho (não parece dado, e bate com Data/Contraparte/Valor);
    // não achando em nenhuma das primeiras linhas, cai no comportamento de
    // sempre (sem cabeçalho, 3 primeiras colunas na ordem Data/Contraparte/Valor).
    //
    // De propósito NÃO aceita a linha só por causa de Entrada/Saída
    // detectadas (cols.entradaValor/saidaValor): essas palavras aparecem
    // fácil dentro de uma frase de instrução (ex: "...em linhas de Saída...",
    // como no nosso próprio modelo) e não só como cabeçalho de coluna -- um
    // arquivo de verdade com colunas de Entrada/Saída separadas quase sempre
    // também tem Data ou Contraparte/Descrição na mesma linha, que já basta.
    let headerRowIndex = -1;
    let detected = null;
    const scanLimit = Math.min(grid.length, 10);
    for (let i = 0; i < scanLimit; i++) {
      const row = grid[i];
      if (!row || looksLikeDataRow(row)) continue;
      const d = detectAllColumns(row);
      if (d.date.length || d.counterparty.length || d.value.length) { headerRowIndex = i; detected = d; break; }
    }

    let groups;
    let startRow;
    let unrecognized = false;
    if (headerRowIndex >= 0) {
      groups = detectColumnGroups(grid, headerRowIndex, detected);
      // Os chutes posicionais (contraparte = coluna 1, valor = coluna 2)
      // seguem a convenção "sem cabeçalho reconhecível, assume Data/
      // Contraparte/Valor nas 3 primeiras colunas" -- faz sentido pra UMA
      // tabela simples, mas não pra dentro de um grupo específico de uma aba
      // com várias tabelas lado a lado: lá a coluna 1 do grupo pode ser
      // qualquer coisa (ex: um dos números da própria "Entrada"/"Saída" numa
      // aba de conciliação bancária por dia, sem coluna de nome nenhuma) --
      // chutar contraparte ali lê um número como se fosse nome de cliente.
      // Só chuta quando é mesmo uma tabela única (0 ou 1 "Data" no cabeçalho).
      const isSingleGroup = groups.length === 1;
      // Cabeçalho de uma tabela única sem NENHUM campo de nome (contraparte)
      // e sem coluna "Valor" de verdade (só sobraria o chute posicional pros
      // dois, ou colunas de Entrada/Saída sem contraparte nenhuma) é sinal de
      // uma tabela de totais/conciliação (ex: resumo bancário por dia, "Data
      // | Entrada | Saída | Saldo", sem coluna de cliente/fornecedor) -- não
      // é lançamento individual de verdade, então nem tenta: melhor não trazer
      // nada dessa aba do que importar linha sem contraparte nenhuma como se
      // fosse um lançamento reconhecível.
      if (isSingleGroup && detected.counterparty.length === 0 && detected.value.length === 0) {
        unrecognized = true;
        groups = [];
      }
      groups.forEach((g) => {
        const cols = g.cols;
        if (cols.date === null) cols.date = 0;
        if (isSingleGroup && cols.counterparty === null) cols.counterparty = 1;
        // Só chuta a coluna 2 como "Valor" se esse grupo também não tiver
        // duas colunas separadas pra nenhum dos dois pares (Entrada/Saída ou
        // Venda/Compra) -- senão essa posição quase sempre É uma das colunas
        // separadas (ex: "Venda" na coluna 2), e chutar "Valor" ali rouba a
        // linha do caminho de detecção por coluna separada mais abaixo, fazendo
        // cada linha cair no Tipo escolhido no modal em vez do que a própria
        // coluna diz. Não trava mais numa base fixa -- a planilha pode trazer
        // qualquer um dos dois pares, com ou sem a Base do modal bater.
        const hasSplitCols = cols.vendaValor !== null || cols.compraValor !== null || cols.entradaValor !== null || cols.saidaValor !== null;
        if (isSingleGroup && cols.value === null && !hasSplitCols) cols.value = 2;
      });
      startRow = headerRowIndex + 1;
    } else {
      // Nenhuma linha nas primeiras 10 pareceu um cabeçalho reconhecível.
      // O chute posicional (Data/Contraparte/Valor nas 3 primeiras colunas)
      // só faz sentido pra planilha realmente simples (poucas colunas) -- numa
      // aba larga (muitas colunas) é sinal de um layout mais complexo que a
      // gente não entendeu de verdade (ex: várias mini-tabelas emaranhadas
      // numa mesma aba, sem uma linha de cabeçalho limpa em lugar nenhum), e
      // chutar Data/Contraparte/Valor nas 3 primeiras colunas nesse caso só
      // produz lixo (lê número de nota fiscal como se fosse contraparte,
      // nome como se fosse valor, etc.) em vez de simplesmente não achar nada.
      const maxCols = grid.slice(0, scanLimit).reduce((m, row) => Math.max(m, row ? row.length : 0), 0);
      if (maxCols > 6) {
        unrecognized = true;
        groups = [];
      } else {
        groups = [{ cols: Object.assign(emptyCols(), { date: 0, counterparty: 1, value: 2 }), basisFlow: null }];
      }
      startRow = 0;
    }

    // Divisão/Tipo/Categoria: se a planilha trouxer essas colunas, valem
    // linha a linha; senão (ou se a célula da linha vier vazia), cai no que
    // foi escolhido nos selects do modal (opts.*) -- mesmo esquema de
    // fallback do import de notas fiscais, só que aqui sempre tem um valor
    // de reserva, então nunca precisa pular a linha por falta de divisão/tipo.
    const rows = [];
    groups.forEach((g) => { rows.push(...parseRowsForGroup(grid, startRow, g.cols, g.basisFlow, sheetBasisFlow, opts)); });
    return { rows, usedHeader: headerRowIndex >= 0, unrecognized };
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
  async function parseNotasFiscais(arrayBuffer, opts) {
    opts = opts || {};
    const empty = { rows: [], sheetName: null, usedHeader: false, skipped: { data: 0, valor: 0, tipo: 0, divisao: 0 } };
    const wb = await readWorkbook(arrayBuffer);
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

  // Conta ocorrências por fingerprint (não só presença) -- duas vendas
  // diferentes pro mesmo cliente, no mesmo dia, mesmo valor, têm a mesma
  // fingerprint, mas são lançamentos de verdade, não a mesma linha duas
  // vezes. Cada ocorrência na planilha nova só vira "duplicata" se já existir
  // uma correspondente ainda não "consumida" -- a partir da (N+1)-ésima igual
  // (N = quantas já existem), entra como novo lançamento de qualquer forma.
  function dedupe(newRows) {
    const existingCounts = new Map();
    function bump(map, fp) { map.set(fp, (map.get(fp) || 0) + 1); }
    MAXLED_DATA.transactions.forEach((t) => bump(existingCounts, fingerprint(t)));
    Storage.listLancamentos().forEach((t) => bump(existingCounts, fingerprint(t)));

    const toAdd = [];
    const duplicates = [];
    const seenInBatch = new Map();
    newRows.forEach((r) => {
      const fp = fingerprint(r);
      const already = existingCounts.get(fp) || 0;
      const seenCount = (seenInBatch.get(fp) || 0) + 1;
      seenInBatch.set(fp, seenCount);
      if (seenCount <= already) duplicates.push(r);
      else toAdd.push(r);
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
