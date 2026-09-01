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
    categoriaAliases: NS + "categoriaAliases",
    pipeline: NS + "pipeline",
    contasExtras: NS + "contasExtras",
    loanOverrides: NS + "loanOverrides",
    loansExtras: NS + "loansExtras",
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
  // "config" (tema etc.) é preferência do aparelho, não entra no salvamento
  // automático compartilhado. suppressSyncNotify existe pra quando o próprio
  // Sync.pull() grava localmente o que já veio do servidor -- nesse caso não
  // faz sentido agendar um novo salvamento (seria salvar de volta a mesma
  // coisa que acabou de chegar).
  let suppressSyncNotify = false;
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (!suppressSyncNotify && key !== KEYS.config && global.Sync && global.Sync.notifyLocalChange) {
        global.Sync.notifyLocalChange();
      }
      return true;
    } catch (e) {
      console.warn("storage: falha ao gravar", key, e);
      return false;
    }
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function normName(s) {
    return String(s || "").trim().toUpperCase().replace(/\s+/g, " ");
  }

  const Storage = {
    KEYS,
    uid,

    // Executa fn() sem disparar o salvamento automático compartilhado --
    // usado pelo Sync.pull() ao aplicar localmente o que já veio do servidor.
    runWithoutSync(fn) {
      const prev = suppressSyncNotify;
      suppressSyncNotify = true;
      try { return fn(); } finally { suppressSyncNotify = prev; }
    },

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
    // Um "lote" de importação = todo lançamento que caiu no mesmo
    // addLancamentosBulk (mesmo createdAt, atribuído uma vez por chamada, não
    // por linha) -- usado na tela de Importações pra remover uma planilha
    // inteira de uma vez, sem precisar apagar lançamento por lançamento.
    removeLancamentosByBatch(createdAt) {
      const list = this.listLancamentos().filter((r) => r.createdAt !== createdAt);
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

    // ---- empréstimos: edição dos que vieram da planilha (por id) + os
    // adicionados na mão (novo contrato) -- mesma lógica de overrides que já
    // existe pra lançamentos, aplicada a empréstimos ----
    getLoanOverrides() { return read(KEYS.loanOverrides, {}); },
    setLoanOverride(id, patch) {
      const map = this.getLoanOverrides();
      map[id] = Object.assign({}, map[id], patch);
      write(KEYS.loanOverrides, map);
    },
    listLoansExtras() { return read(KEYS.loansExtras, []); },
    addLoanExtra(loan) {
      const row = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, loan);
      write(KEYS.loansExtras, this.listLoansExtras().concat([row]));
      return row;
    },
    updateLoanExtra(id, patch) {
      const list = this.listLoansExtras().map((l) => (l.id === id ? Object.assign({}, l, patch) : l));
      write(KEYS.loansExtras, list);
    },
    removeLoanExtra(id) {
      write(KEYS.loansExtras, this.listLoansExtras().filter((l) => l.id !== id));
    },

    // ---- categoria de cliente (por contraparte — vale pra todos os lançamentos dela) ----
    // Chave é o nome normalizado (maiúsculo, sem espaço duplicado) pra "SIMPLES
    // CONECT" e "Simples Conect" (digitado à mão num lançamento novo, por
    // exemplo) caírem na mesma classificação em vez de virar dois clientes.
    getClienteCategorias() { return read(KEYS.clienteCategorias, {}); },
    getClienteCategoria(nome) {
      if (!nome) return null;
      const map = this.getClienteCategorias();
      return map[normName(nome)] || map[nome] || null; // 2º fallback: dado salvo antes dessa normalização existir
    },
    setClienteCategoria(nome, categoria) {
      if (!nome) return;
      const key = normName(nome);
      if (!key) return;
      const map = this.getClienteCategorias();
      if (categoria) map[key] = categoria; else delete map[key];
      write(KEYS.clienteCategorias, map);
    },

    // ---- categoria "aprendida" pra texto de categoria que a planilha trouxe e
    // a gente não reconheceu (ex: digitado diferente) — usuário classifica uma
    // vez na importação e todo lançamento igual (dessa vez e das próximas) usa
    // a mesma categoria automaticamente ----
    getCategoriaAliases() { return read(KEYS.categoriaAliases, {}); },
    setCategoriaAlias(raw, categoria) {
      if (!raw) return;
      const map = this.getCategoriaAliases();
      if (categoria) map[raw] = categoria; else delete map[raw];
      write(KEYS.categoriaAliases, map);
    },

    // ---- pipeline de vendas (oportunidades em aberto/ganhas/perdidas) ----
    listPipeline() { return read(KEYS.pipeline, []); },
    addPipelineItem(item) {
      const list = this.listPipeline();
      const row = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, item);
      list.push(row);
      write(KEYS.pipeline, list);
      return row;
    },
    updatePipelineItem(id, patch) {
      const list = this.listPipeline().map((p) => (p.id === id ? Object.assign({}, p, patch) : p));
      write(KEYS.pipeline, list);
    },
    removePipelineItem(id) {
      write(KEYS.pipeline, this.listPipeline().filter((p) => p.id !== id));
    },

    // ---- notas fiscais a receber/a pagar (tela de Contas) -- complementa a
    // previsão que vem da base do Excel (extração periódica), pra manter a
    // conta em dia entre uma importação completa e outra ----
    listContasExtras() { return read(KEYS.contasExtras, []); },
    addContaExtra(entry) {
      const row = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, entry);
      write(KEYS.contasExtras, this.listContasExtras().concat([row]));
      return row;
    },
    addContasExtrasBulk(entries) {
      const now = new Date().toISOString();
      const rows = entries.map((entry) => Object.assign({ id: uid(), createdAt: now, origin: "import" }, entry));
      write(KEYS.contasExtras, this.listContasExtras().concat(rows));
      return rows;
    },
    removeContaExtra(id) {
      write(KEYS.contasExtras, this.listContasExtras().filter((c) => c.id !== id));
    },
    updateContaExtra(id, patch) {
      const list = this.listContasExtras().map((c) => (c.id === id ? Object.assign({}, c, patch) : c));
      write(KEYS.contasExtras, list);
    },
    removeContasExtrasByBatch(createdAt) {
      const list = this.listContasExtras().filter((c) => c.createdAt !== createdAt);
      write(KEYS.contasExtras, list);
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
        categoriaAliases: this.getCategoriaAliases(),
        pipeline: this.listPipeline(),
        contasExtras: this.listContasExtras(),
        loanOverrides: this.getLoanOverrides(),
        loansExtras: this.listLoansExtras(),
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
      if (payload.categoriaAliases) write(KEYS.categoriaAliases, payload.categoriaAliases);
      if (Array.isArray(payload.pipeline)) write(KEYS.pipeline, payload.pipeline);
      if (Array.isArray(payload.contasExtras)) write(KEYS.contasExtras, payload.contasExtras);
      if (payload.loanOverrides) write(KEYS.loanOverrides, payload.loanOverrides);
      if (Array.isArray(payload.loansExtras)) write(KEYS.loansExtras, payload.loansExtras);
    },
    resetAll() {
      Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    },
  };

  global.Storage = Storage;
})(window);
