// Gerenciar usuários: perfis com login próprio (nome + e-mail + senha),
// guardados no banco de dados do projeto -- substitui o antigo usuário/senha
// único compartilhado. Qualquer pessoa com uma conta pode adicionar, editar
// ou remover outras (mesmo nível de confiança que a senha compartilhada já
// dava antes).
(function () {
  function render(container) {
    const addBtn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Novo usuário"]);
    container.appendChild(UI.h("div", { style: "display:flex;justify-content:flex-end;margin-bottom:16px;" }, [addBtn]));

    const listWrap = UI.h("div", {});
    container.appendChild(listWrap);

    function refresh() {
      UI.clear(listWrap);
      listWrap.appendChild(loadingCard());
      fetch("/api/users")
        .then((r) => r.json())
        .then(({ users, error }) => {
          UI.clear(listWrap);
          if (error) { listWrap.appendChild(errorCard(error)); return; }
          listWrap.appendChild(usersTable(users, refresh));
        })
        .catch(() => { UI.clear(listWrap); listWrap.appendChild(errorCard("Não consegui carregar os usuários.")); });
    }
    addBtn.addEventListener("click", () => openUserModal(null, refresh));
    refresh();
  }

  function loadingCard() {
    return UI.h("div", { class: "card" }, [UI.h("div", { style: "font-size:12.5px;color:var(--text-muted);" }, ["Carregando…"])]);
  }
  function errorCard(msg) {
    return UI.h("div", { class: "card" }, [UI.h("div", { style: "font-size:12.5px;color:var(--critical-text);" }, [msg])]);
  }

  function usersTable(users, onChanged) {
    return UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "name", label: "Nome" },
        { key: "email", label: "E-mail" },
        { key: "created_at", label: "Conta criada em", render: (r) => Fmt.dateBR(r.created_at.slice(0, 10)) },
        { key: "actions", label: "", render: (r) => actionsCell(r, onChanged) },
      ],
      rows: users,
    })]);
  }

  function actionsCell(u, onChanged) {
    const editBtn = UI.h("button", { class: "icon-btn", title: "Editar" }, [Icon("edit", { size: 13 })]);
    editBtn.addEventListener("click", () => openUserModal(u, onChanged));
    const removeBtn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 13 })]);
    removeBtn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover o acesso de "${u.name}" (${u.email})? Essa pessoa não vai mais conseguir entrar.`);
      if (!ok) return;
      const res = await fetch("/api/users", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: u.id }) });
      const data = await res.json();
      if (!res.ok) { UI.toast(data.error || "Não consegui remover."); return; }
      UI.toast("Usuário removido.");
      onChanged();
    });
    return UI.h("div", { style: "display:flex;gap:5px;justify-content:flex-end;" }, [editBtn, removeBtn]);
  }

  function openUserModal(existing, onChanged) {
    const nameInput = UI.h("input", { class: "input", placeholder: "Nome" });
    const emailInput = UI.h("input", { class: "input", type: "email", placeholder: "email@exemplo.com" });
    const passInput = UI.h("input", { class: "input", type: "password", autocomplete: "new-password", placeholder: existing ? "Deixe em branco pra manter a atual" : "Mínimo 8 caracteres" });

    if (existing) {
      nameInput.value = existing.name;
      emailInput.value = existing.email;
    }

    const errorBox = UI.h("div", { style: "font-size:12px;color:var(--critical-text);display:none;" }, []);
    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, [existing ? "Salvar alterações" : "Criar usuário"]);
    const m = UI.modal({
      title: existing ? "Editar usuário" : "Novo usuário",
      body: [
        UI.field("Nome", nameInput),
        UI.field("E-mail", emailInput),
        UI.field(existing ? "Nova senha (opcional)" : "Senha", passInput),
        errorBox,
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", async () => {
      UI.clear(errorBox);
      errorBox.style.display = "none";
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passInput.value;
      if (!name || !email) { showError("Preencha nome e e-mail."); return; }
      if (!existing && !password) { showError("Senha é obrigatória pra um usuário novo."); return; }
      if (password && password.length < 8) { showError("Senha precisa ter pelo menos 8 caracteres."); return; }

      const payload = existing ? { id: existing.id, name, email } : { name, email, password };
      if (existing && password) payload.password = password;

      const res = await fetch("/api/users", {
        method: existing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Não consegui salvar."); return; }
      UI.toast(existing ? "Usuário atualizado." : "Usuário criado.");
      m.close();
      onChanged();
    });

    function showError(msg) {
      errorBox.appendChild(document.createTextNode(msg));
      errorBox.style.display = "block";
    }
  }

  window.Views = window.Views || {};
  window.Views.usuarios = render;
})();
