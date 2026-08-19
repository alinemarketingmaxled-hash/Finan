(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: true });
    const cats = Compute.expenseCategoriesAgg(st.division, st.month);
    const totalDespesas = cats.reduce((s, c) => s + c.valor, 0);

    if (!cats.length) {
      const body = /^\d{4}$/.test(st.month)
        ? `A planilha só registra totais mensais para ${st.month} — sem categoria por lançamento. Escolha um mês de 2026 ou "Acumulado" para ver o detalhamento.`
        : "Sem despesas categorizadas nesse período.";
      container.appendChild(UI.card([UI.emptyState({ icon: "tag", title: "Sem detalhamento por categoria", body })]));
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

    container.appendChild(oneTimeClientsSection(st));

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

  // Clientes que só compraram uma vez em toda a base (não muda com o filtro
  // de mês da página — "compra única" olha o histórico inteiro) -- lista de
  // reativação: quem já comprou antes e não voltou, do maior valor pro menor.
  function oneTimeClientsSection(st) {
    const list = Compute.oneTimeClients(st.division);
    const total = list.reduce((s, c) => s + c.valor, 0);
    const wrap = UI.h("div", {}, [
      UI.sectionTitle("Clientes para reativar", `${Fmt.num(list.length)} cliente(s) que compraram só uma vez, somando ${Fmt.money(total)} — candidatos a contato de retorno`),
    ]);
    if (!list.length) {
      wrap.appendChild(UI.card([UI.emptyState({ icon: "users", title: "Nenhum cliente de compra única nessa divisão" })]));
      return wrap;
    }
    wrap.appendChild(UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "nome", label: "Cliente", wrap: true, render: (r) => Fmt.titleCase(r.nome) },
        { key: "categoria", label: "Categoria", render: (r) => (r.categoria ? UI.badge(Fmt.titleCase(r.categoria), "muted") : "—") },
        { key: "data", label: "Data da compra", render: (r) => Fmt.dateBR(r.data) },
        { key: "valor", label: "Valor", align: "right", render: (r) => Fmt.money(r.valor) },
      ],
      rows: list,
    })]));
    return wrap;
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
      items: list.map((c) => ({
        label: Fmt.titleCase(c.nome), value: c.valor, color,
        sub: c.categoria ? `${c.n_transacoes} transação(ões) · ${Fmt.titleCase(c.categoria)}` : `${c.n_transacoes} transação(ões)`,
      })),
      formatValue: (v) => Fmt.money(v, { compact: true }),
    });
    return card;
  }

  window.Views = window.Views || {};
  window.Views.categorias = render;
})();
