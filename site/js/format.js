// Formatação de números, moeda e datas (pt-BR) + helpers de mês.
(function (global) {
  const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  function monthLabel(monthKey, style) {
    if (!monthKey || typeof monthKey !== "string") return monthKey;
    const [y, m] = monthKey.split("-").map(Number);
    if (!m) return monthKey;
    const name = style === "full" ? MONTH_FULL[m - 1] : MONTH_ABBR[m - 1];
    return `${name}/${String(y).slice(2)}`;
  }

  function monthShort(monthKey) {
    const [, m] = monthKey.split("-").map(Number);
    return MONTH_ABBR[m - 1];
  }

  const currencyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const currencyFmtCents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

  function money(v, opts) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    opts = opts || {};
    if (opts.compact) return moneyCompact(v);
    return (opts.cents ? currencyFmtCents : currencyFmt).format(v);
  }

  function moneyCompact(v) {
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
    if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1).replace(".", ",")}K`;
    return `${sign}R$ ${abs.toFixed(0)}`;
  }

  function pct(v, opts) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    opts = opts || {};
    const digits = opts.digits ?? 1;
    return `${(v * 100).toFixed(digits).replace(".", ",")}%`;
  }

  function num(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return new Intl.NumberFormat("pt-BR").format(v);
  }

  function dateBR(iso) {
    if (!iso) return "—";
    const d = typeof iso === "string" ? new Date(iso + "T00:00:00") : iso;
    return d.toLocaleDateString("pt-BR");
  }

  function monthsBetween(startKey, endKey) {
    const out = [];
    let [y, m] = startKey.split("-").map(Number);
    const [ey, em] = endKey.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function titleCase(s) {
    if (!s) return s;
    return s.toString().toLowerCase().replace(/(^|\s|\/)([a-zà-ú])/g, (m0, sep, c) => sep + c.toUpperCase());
  }

  global.Fmt = { money, moneyCompact, pct, num, dateBR, monthLabel, monthShort, monthsBetween, titleCase, esc, MONTH_ABBR, MONTH_FULL };
})(window);
