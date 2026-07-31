(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: true });
    const cats = Compute.expenseCategoriesAgg(st.division, st.month);
    const totalDespesas = cats.reduce((s, c) => s + c.valor, 0);

    if (!cats.length) {
      container.appendChild(UI.card([UI.emptyState({ icon: "tag", title: "Sem despesas categorizadas nesse período" })]));
      return;
    }

    container.appendChild(UI.h("div", { class: "grid grid-2", style: "align-items:start;" }, [
      rankedCard(cats), groupCard(cats),
    ]));

    container.appendChild(UI.sectionTitle("Fornecedores e clientes", "Maiores contrapartes no período selecionado (base Financeiro)"));
    container.appendChild(UI.h("div", { class: "grid grid-2", style: "align-items:start;" }, [
      counterpartyCard("Maiores fornecedores / destinos", "saida", st),
      counterpartyCard("Maiores clientes", "entrada", st),
    ]));

    container.appendChild(UI.sectionTitle("Detalhamento completo"));
    container.appendChild(UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "categoria", label: "Categoria", wrap: true, render: (r) => Fmt.titleCase(r.categoria) },
        { key: "grupo", label: "Grupo" },
        { key: "valor", label: "Valor", align: "right", render: (r) => Fmt.money(r.valor) },
        { key: "pct_total", label: "% despesas", align: "right", render: (r) => Fmt.pct(totalDespesas ? r.valor / totalDespesas : 0) },
        { key: "pct_receita", label: "% receita", align: "right", render: (r) => Fmt.pct(r.pct_receita) },
      ],
      rows: cats,
    })]));
  }

  function rankedCard(cats) {
    const card = UI.card([], { title: "Despesas por categoria", subtitle: "Ordenado do maior para o menor" });
    const wrap = UI.h("div", {});
    card.appendChild(wrap);
    Charts.barListRanked(wrap, {
      items: cats.slice(0, 14).map((c) => ({ label: Fmt.titleCase(c.categoria), value: c.valor, color: Categories.groupColor(c.grupo), sub: `${Fmt.pct(c.pct_receita)} da receita` })),
      formatValue: (v) => Fmt.money(v, { compact: true }),
    });
    return card;
  }

  function groupCard(cats) {
    const card = UI.card([], { title: "Por grupo de natureza", subtitle: "Custo de mercadorias, pessoal, dívida, logística…" });
    const map = new Map();
    cats.forEach((c) => map.set(c.grupo, (map.get(c.grupo) || 0) + c.valor));
    const items = Array.from(map.entries()).map(([grupo, valor]) => ({ label: grupo, value: valor, color: Categories.groupColor(grupo) })).sort((a, b) => b.value - a.value);
    const wrap = UI.h("div", { style: "margin-top:6px;" });
    card.appendChild(wrap);
    Charts.stackedShareBar(wrap, { items, formatValue: Fmt.money });
    return card;
  }

  function counterpartyCard(title, flow, st) {
    const list = Compute.topCounterparties(st.division, flow, "financeiro", 10, st.month);
    const card = UI.card([], { title, subtitle: `${list.length} contraparte(s)` });
    if (!list.length) {
      card.appendChild(UI.emptyState({ icon: "users", title: "Sem registros no período" }));
      return card;
    }
    const wrap = UI.h("div", {});
    card.appendChild(wrap);
    const color = flow === "saida" ? Charts.cssVar("--series-2") : Charts.cssVar("--series-1");
    Charts.barListRanked(wrap, {
      items: list.map((c) => ({ label: Fmt.titleCase(c.nome), value: c.valor, color, sub: `${c.n_transacoes} transação(ões)` })),
      formatValue: (v) => Fmt.money(v, { compact: true }),
    });
    return card;
  }

  window.Views = window.Views || {};
  window.Views.categorias = render;
})();
