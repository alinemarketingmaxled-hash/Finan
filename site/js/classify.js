// Barra flutuante de classificação rápida: aparece (em qualquer página) quando
// existem despesas sem categoria ou clientes sem categoria de cliente, com um
// atalho pra classificar tudo num modal só, sem precisar caçar lançamento por
// lançamento na tela de Lançamentos.
(function (global) {
  let hiddenThisSession = false;

  function mount() {
    const wrap = document.querySelector('[data-role="classifybar"]');
    if (!wrap) return;
    UI.clear(wrap);
    if (hiddenThisSession) return;

    const { despesas, clientesTop, clientesTotalCount } = Compute.uncategorized();
    if (!despesas.length && !clientesTotalCount) return;

    const parts = [];
    if (despesas.length) parts.push(`${Fmt.num(despesas.length)} despesa(s) sem categoria`);
    if (clientesTotalCount) parts.push(`${Fmt.num(clientesTotalCount)} cliente(s) sem categoria`);

    const classifyBtn = UI.h("button", { class: "btn btn-accent btn-sm" }, ["Classificar agora"]);
    const closeBtn = UI.h("button", { class: "icon-btn", title: "Esconder por agora" }, [Icon("x", { size: 13 })]);
    classifyBtn.addEventListener("click", () => openClassifyModal(despesas, clientesTop, clientesTotalCount));
    closeBtn.addEventListener("click", () => { hiddenThisSession = true; UI.clear(wrap); });

    wrap.appendChild(UI.h("div", { class: "classify-bar" }, [
      Icon("alertTriangle", { size: 16 }),
      UI.h("span", {}, [parts.join(" · ")]),
      classifyBtn,
      closeBtn,
    ]));
  }

  function clientCategoryOptions() {
    const used = Object.values(Storage.getClienteCategorias());
    const all = Array.from(new Set(Categories.clientList.concat(used)));
    return all.map((c) => UI.h("option", { value: c }, []));
  }

  function openClassifyModal(despesas, clientesTop, clientesTotalCount) {
    const body = [];
    const despesaRows = [];
    const clienteRows = [];

    if (despesas.length) {
      body.push(UI.h("div", { class: "section-title", style: "font-size:12.5px;margin:0 0 2px;" }, ["Despesas sem categoria"]));
      despesas.forEach((tx) => {
        const sel = UI.h("select", {}, [UI.h("option", { value: "" }, ["— selecione —"])].concat(
          Categories.list.map((c) => UI.h("option", { value: c }, [Fmt.titleCase(c)]))
        ));
        despesaRows.push({ tx, select: sel });
        body.push(UI.field(`${Fmt.dateBR(tx.date)} · ${Fmt.titleCase(tx.counterparty || "—")} · ${Fmt.money(tx.value)}`, sel));
      });
    }

    if (clientesTop.length) {
      body.push(UI.h("div", { class: "section-title", style: "font-size:12.5px;margin:14px 0 2px;" }, ["Clientes sem categoria"]));
      const note = clientesTotalCount > clientesTop.length
        ? `Mostrando os ${clientesTop.length} maiores clientes sem categoria (de ${Fmt.num(clientesTotalCount)} no total). O resto pode ser classificado aos poucos, direto na tela de Lançamentos.`
        : "Categoria vale pra esse cliente inteiro (todos os lançamentos dele), não só esse.";
      body.push(UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);margin-bottom:8px;" }, [note]));
      const datalistId = "classifyClienteCatList";
      clientesTop.forEach((c) => {
        const inp = UI.h("input", { class: "input", list: datalistId, placeholder: "Ex: Atacado, Distribuidor… (opcional)" });
        clienteRows.push({ nome: c.nome, input: inp });
        body.push(UI.field(`${Fmt.titleCase(c.nome)} · ${Fmt.money(c.valor, { compact: true })} · ${c.n} transação(ões)`, inp));
      });
      body.push(UI.h("datalist", { id: datalistId }, clientCategoryOptions()));
    }

    const cancelBtn = UI.h("button", { class: "btn" }, ["Fechar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, ["Salvar classificações"]);
    const m = UI.modal({ title: "Classificação rápida", body, footer: [cancelBtn, saveBtn] });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      let n = 0;
      despesaRows.forEach(({ tx, select }) => {
        if (!select.value) return;
        if (tx.manual) Storage.updateLancamento(tx.id, { category: select.value });
        else Storage.setOverride(tx.id, { category: select.value });
        n++;
      });
      clienteRows.forEach(({ nome, input }) => {
        const v = input.value.trim();
        if (!v) return;
        Storage.setClienteCategoria(nome, v.toUpperCase());
        n++;
      });
      UI.toast(n ? `${Fmt.num(n)} classificação(ões) salva(s).` : "Nada selecionado — nenhuma alteração.");
      m.close();
      AppState.set({});
    });
  }

  global.ClassifyBar = { mount };
})(window);
