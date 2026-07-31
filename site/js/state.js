// Estado global da UI: filtros (divisão, base, período) e view ativa.
(function (global) {
  const listeners = [];
  const state = {
    division: "consolidado",
    basis: "financeiro",
    month: "acum",
    view: "overview",
  };

  function get() { return Object.assign({}, state); }
  function set(patch) {
    Object.assign(state, patch);
    listeners.slice().forEach((fn) => fn(get()));
  }
  function subscribe(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  const AppState = { get, set, subscribe, meta: MAXLED_DATA.meta };
  // getter (não snapshot): reflete lançamentos manuais/importados assim que existirem,
  // sem depender da ordem de carregamento dos scripts (Compute só existe depois deste arquivo).
  Object.defineProperty(AppState, "detailedMonths", { get: () => Compute.detailedMonths() });
  // anos com apenas totais mensais agregados (sem detalhe de transação/categoria) — hoje só 2025.
  Object.defineProperty(AppState, "aggregateYears", {
    get: () => Array.from(new Set(
      MAXLED_DATA.cashflow
        .filter((r) => r.tipo === "realizado" && !Compute.detailedMonths().includes(r.month))
        .map((r) => r.month.slice(0, 4))
    )).sort(),
  });
  global.AppState = AppState;
})(window);
