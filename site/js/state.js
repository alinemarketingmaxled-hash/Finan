// Estado global da UI: filtros (divisão, base, período) e view ativa.
(function (global) {
  const listeners = [];
  const months = Array.from(new Set(MAXLED_DATA.transactions.map((t) => t.date.slice(0, 7)))).sort();
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

  global.AppState = { get, set, subscribe, detailedMonths: months, meta: MAXLED_DATA.meta };
})(window);
