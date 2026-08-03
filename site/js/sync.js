// Sincroniza os dados que o usuário adiciona/edita (lançamentos manuais,
// metas, orçamento, categoria de clientes, previsões) com o banco central --
// assim o que um perfil adiciona aparece pros outros também, em vez de ficar
// só no navegador de quem adicionou. "config" (tema etc.) fica de fora, é
// preferência de cada aparelho. Puxa ao abrir o app; salva sozinho pouco
// depois de qualquer alteração (debounce, pra não disparar uma chamada por
// tecla/clique) -- o botão no topo mostra o status e serve pra forçar/tentar
// de novo na hora.
(function (global) {
  const AUTOSAVE_DELAY_MS = 1500;

  let lastUpdatedAt = null;
  let lastUpdatedBy = null;
  let lastSavedSnapshot = null; // string: última cópia confirmada como igual ao servidor
  let pulling = false;
  let saving = false;
  let lastError = null;
  let debounceTimer = null;
  let onChangeCb = null;

  function sharedPayload() {
    const all = Storage.exportAll();
    delete all.config;
    delete all.exportedAt;
    return all;
  }

  function isDirty() {
    return lastSavedSnapshot === null || JSON.stringify(sharedPayload()) !== lastSavedSnapshot;
  }

  function status() {
    return {
      pulling,
      saving,
      pending: !!debounceTimer,
      updatedAt: lastUpdatedAt,
      updatedBy: lastUpdatedBy,
      dirty: isDirty(),
      error: lastError,
    };
  }

  function onChange(cb) { onChangeCb = cb; }
  function emit() { if (onChangeCb) onChangeCb(status()); }

  async function pull() {
    pulling = true;
    emit();
    try {
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error("falha ao buscar dados compartilhados");
      const body = await res.json();
      if (body.data) {
        Storage.runWithoutSync(() => Storage.importAll(body.data));
        lastUpdatedAt = body.updatedAt;
        lastUpdatedBy = body.updatedBy;
        lastSavedSnapshot = JSON.stringify(sharedPayload());
      }
      lastError = null;
      return { ok: true, hadData: !!body.data };
    } catch (e) {
      lastError = String(e.message || e);
      console.warn("Sync.pull:", e);
      return { ok: false, error: lastError };
    } finally {
      pulling = false;
      emit();
    }
  }

  async function push() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    saving = true;
    emit();
    try {
      const payload = sharedPayload();
      const res = await fetch("/api/data", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: payload, expectedUpdatedAt: lastUpdatedAt }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = body.error || "não consegui salvar";
        return { ok: false, conflict: !!body.conflict, error: lastError };
      }
      lastUpdatedAt = body.updatedAt;
      lastUpdatedBy = body.updatedBy;
      lastSavedSnapshot = JSON.stringify(payload);
      lastError = null;
      return { ok: true, updatedAt: body.updatedAt, updatedBy: body.updatedBy };
    } catch (e) {
      lastError = String(e.message || e);
      return { ok: false, error: lastError };
    } finally {
      saving = false;
      emit();
    }
  }

  // Chamado pelo storage.js toda vez que algo é gravado localmente (exceto
  // "config"). Reagenda o timer a cada chamada, então uma sequência rápida de
  // alterações (ex.: classificar vários clientes em lote) vira um salvamento
  // só, feito pouco depois da última.
  function notifyLocalChange() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      push();
    }, AUTOSAVE_DELAY_MS);
    emit();
  }

  global.Sync = { pull, push, status, onChange, notifyLocalChange };
})(window);
