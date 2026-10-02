// Extração best-effort de dados de uma DANFE (PDF) pra pré-preencher o
// formulário de Nota Fiscal -- nunca salva sozinho, só joga os campos achados
// no modal de "Nova nota" pra revisão manual antes de gravar (mesmo princípio
// da importação de Excel em Lançamentos: nada entra sem passar pelos olhos
// de quem está lançando).
(function (global) {
  async function extractText(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    return text;
  }

  function firstMatch(text, patterns) {
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1]) return m[1].trim();
    }
    return null;
  }

  function parseMoney(str) {
    if (!str) return null;
    const cleaned = str.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  function parseDate(str) {
    if (!str) return null;
    const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  // Tenta achar o número da NF-e -- formatos comuns: "Nº 000.123.456",
  // "N. 123456", ou perto de "SÉRIE".
  function parseNumero(text) {
    const raw = firstMatch(text, [
      /N[º°o]\.?\s*[:.]?\s*([\d.]{4,15})\s*(?:SÉRIE|SERIE)/i,
      /N[º°o]\.?\s*[:.]?\s*([\d.]{4,15})/i,
      /NF-?e\s*N[º°o]?\.?\s*([\d.]{4,15})/i,
    ]);
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    const n = parseInt(digits, 10);
    return isNaN(n) ? null : n;
  }

  function parseValor(text) {
    const raw = firstMatch(text, [
      /VALOR TOTAL DA NOTA\s*[:.]?\s*R?\$?\s*([\d.,]+)/i,
      /VALOR TOTAL DA NF-?E\s*[:.]?\s*R?\$?\s*([\d.,]+)/i,
      /VALOR TOTAL DOS? PRODUTOS\s*[:.]?\s*R?\$?\s*([\d.,]+)/i,
    ]);
    return parseMoney(raw);
  }

  function parseData(text) {
    const raw = firstMatch(text, [
      /DATA DA EMISS[ÃA]O\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /EMISS[ÃA]O\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    ]);
    return parseDate(raw) || parseDate(firstMatch(text, [/(\d{2}\/\d{2}\/\d{4})/]));
  }

  // Emitente = quem vendeu (a Max Led, numa venda); destinatário = quem
  // comprou (a Max Led, numa compra). Comparando qual dos dois tem "MAX LED"
  // no nome dá pra inferir tipo e também pegar o nome da contraparte certa.
  function parseEmitenteDestinatario(text) {
    const emitente = firstMatch(text, [/EMITENTE\s*[:.]?\s*([A-ZÀ-Ú0-9][^\n]{3,80}?)(?:\s{2,}|CNPJ|$)/i]);
    const destinatario = firstMatch(text, [
      /DESTINAT[ÁA]RIO\s*\/?\s*REMETENTE\s*[:.]?\s*([A-ZÀ-Ú0-9][^\n]{3,80}?)(?:\s{2,}|CNPJ|$)/i,
      /DESTINAT[ÁA]RIO\s*[:.]?\s*([A-ZÀ-Ú0-9][^\n]{3,80}?)(?:\s{2,}|CNPJ|$)/i,
      /NOME\s*\/?\s*RAZ[ÃA]O SOCIAL\s*[:.]?\s*([A-ZÀ-Ú0-9][^\n]{3,80}?)(?:\s{2,}|CNPJ|$)/i,
    ]);
    const isMaxLed = (s) => s && /MAX\s*LED/i.test(s);
    if (isMaxLed(emitente) && !isMaxLed(destinatario)) return { tipo: "venda", nome: destinatario };
    if (isMaxLed(destinatario) && !isMaxLed(emitente)) return { tipo: "compra", nome: emitente };
    // Não deu pra confirmar quem é a Max Led -- deixa a pessoa escolher tipo e nome.
    return { tipo: null, nome: destinatario || emitente || null };
  }

  async function parseDanfe(file) {
    const text = await extractText(file);
    const numero = parseNumero(text);
    const valor = parseValor(text);
    const data = parseData(text);
    const { tipo, nome } = parseEmitenteDestinatario(text);
    return { numero, valor, data, tipo, nome, rawTextSample: text.slice(0, 4000) };
  }

  global.PdfNota = { parseDanfe };
})(window);
