// Barra flutuante de classificação rápida: aparece (em qualquer página) quando
// existem despesas sem categoria ou clientes sem categoria de cliente. O botão
// leva pra Lançamentos com o filtro "só sem categoria" já ativo, onde dá pra
// marcar vários de uma vez (checkbox) e aplicar uma categoria em lote.
(function (global) {
  let hiddenThisSession = false;

  function mount() {
    const wrap = document.querySelector('[data-role="classifybar"]');
    if (!wrap) return;
    UI.clear(wrap);
    if (hiddenThisSession) return;

    const { despesas, clientesTotalCount } = Compute.uncategorized();
    if (!despesas.length && !clientesTotalCount) return;

    const parts = [];
    if (despesas.length) parts.push(`${Fmt.num(despesas.length)} despesa(s) sem categoria`);
    if (clientesTotalCount) parts.push(`${Fmt.num(clientesTotalCount)} cliente(s) sem categoria`);

    const classifyBtn = UI.h("button", { class: "btn btn-accent btn-sm" }, ["Classificar agora"]);
    const closeBtn = UI.h("button", { class: "icon-btn", title: "Esconder por agora" }, [Icon("x", { size: 13 })]);
    classifyBtn.addEventListener("click", () => {
      if (global.Views && Views.presetUncategorizedFilter) Views.presetUncategorizedFilter();
      location.hash = "#/lancamentos";
    });
    closeBtn.addEventListener("click", () => { hiddenThisSession = true; UI.clear(wrap); });

    wrap.appendChild(UI.h("div", { class: "classify-bar" }, [
      Icon("alertTriangle", { size: 16 }),
      UI.h("span", {}, [parts.join(" · ")]),
      classifyBtn,
      closeBtn,
    ]));
  }

  global.ClassifyBar = { mount };
})(window);
