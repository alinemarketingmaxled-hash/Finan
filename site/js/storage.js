// Persistência local (localStorage) — tudo que o usuário adiciona/edita no
// navegador (lançamentos manuais, metas, orçamento, config) fica salvo aqui,
// por cima da base vinda do Excel (somente leitura, em data.js).
(function (global) {
  const NS = "maxled:v1:";
  const KEYS = {
    lancamentos: NS + "lancamentos",
    metas: NS + "metas",
    orcamento: NS + "orcamento",
    config: NS + "config",
    overrides: NS + "overrides",
    clienteCategorias: NS + "clienteCategorias",
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn("storage: falha ao ler", key, e);
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("storage: falha ao gravar", key, e);
      return false;
    }
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const Storage = {
    KEYS,
    uid,

    // ---- lançamentos manuais ----
    listLancamentos() { return read(KEYS.lancamentos, []); },
    addLancamento(entry) {
      const list = this.listLancamentos();
      const row = Object.assign({ id: uid(), manual: true, createdAt: new Date().toISOString() }, entry);
      list.push(row);
      write(KEYS.lancamentos, list);
      return row;
    },
    removeLancamento(id) {
      const list = this.listLancamentos().filter((r) => r.id !== id);
      write(KEYS.lancamentos, list);
    },
    updateLancamento(id, patch) {
      const list = this.listLancamentos().map((r) => (r.id === id ? Object.assign({}, r, patch) : r));
      write(KEYS.lancamentos, list);
    },
    addLancamentosBulk(entries, origin) {
      const list = this.listLancamentos();
      const now = new Date().toISOString();
      const rows = entries.map((entry) => Object.assign({ id: uid(), manual: true, origin: origin || "import", createdAt: now }, entry));
      write(KEYS.lancamentos, list.concat(rows));
      return rows;
    },
    removeByOrigin(origin) {
      const list = this.listLancamentos().filter((r) => r.origin !== origin);
      write(KEYS.lancamentos, list);
    },

    // ---- overrides (edição/cancelamento de lançamentos da base Excel ou importados) ----
    getOverrides() { return read(KEYS.overrides, {}); },
    setOverride(id, patch) {
      const map = this.getOverrides();
      map[id] = Object.assign({}, map[id], patch);
      write(KEYS.overrides, map);
    },
    clearOverride(id) {
      const map = this.getOverrides();
      delete map[id];
      write(KEYS.overrides, map);
    },

    // ---- categoria de cliente (por contraparte — vale pra todos os lançamentos dela) ----
    getClienteCategorias() { return read(KEYS.clienteCategorias, {}); },
    setClienteCategoria(nome, categoria) {
      if (!nome) return;
      const map = this.getClienteCategorias();
      if (categoria) map[nome] = categoria; else delete map[nome];
      write(KEYS.clienteCategorias, map);
    },

    // ---- metas ----
    listMetas() { return read(KEYS.metas, []); },
    saveMetas(list) { write(KEYS.metas, list); },
    addMeta(meta) {
      const list = this.listMetas();
      const row = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, meta);
      list.push(row);
      write(KEYS.metas, list);
      return row;
    },
    updateMeta(id, patch) {
      const list = this.listMetas().map((m) => (m.id === id ? Object.assign({}, m, patch) : m));
      write(KEYS.metas, list);
    },
    removeMeta(id) {
      write(KEYS.metas, this.listMetas().filter((m) => m.id !== id));
    },

    // ---- orçamento (limite mensal por divisão+categoria) ----
    listOrcamento() { return read(KEYS.orcamento, []); },
    setOrcamentoLimite(division, categoria, limite) {
      const list = this.listOrcamento();
      const idx = list.findIndex((o) => o.division === division && o.categoria === categoria);
      if (limite === null || limite === undefined || limite === "") {
        if (idx >= 0) list.splice(idx, 1);
      } else if (idx >= 0) {
        list[idx].limite = limite;
      } else {
        list.push({ division, categoria, limite });
      }
      write(KEYS.orcamento, list);
    },

    // ---- config ----
    getConfig() { return read(KEYS.config, {}); },
    setConfig(patch) {
      const cfg = Object.assign(this.getConfig(), patch);
      write(KEYS.config, cfg);
      return cfg;
    },

    // ---- backup ----
    exportAll() {
      return {
        exportedAt: new Date().toISOString(),
        lancamentos: this.listLancamentos(),
        metas: this.listMetas(),
        orcamento: this.listOrcamento(),
        config: this.getConfig(),
        overrides: this.getOverrides(),
        clienteCategorias: this.getClienteCategorias(),
      };
    },
    importAll(payload) {
      if (!payload || typeof payload !== "object") throw new Error("Arquivo inválido");
      if (Array.isArray(payload.lancamentos)) write(KEYS.lancamentos, payload.lancamentos);
      if (Array.isArray(payload.metas)) write(KEYS.metas, payload.metas);
      if (Array.isArray(payload.orcamento)) write(KEYS.orcamento, payload.orcamento);
      if (payload.config) write(KEYS.config, payload.config);
      if (payload.overrides) write(KEYS.overrides, payload.overrides);
      if (payload.clienteCategorias) write(KEYS.clienteCategorias, payload.clienteCategorias);
    },
    resetAll() {
      Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    },
  };

  global.Storage = Storage;
})(window);
