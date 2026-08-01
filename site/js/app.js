// Shell da aplicação: sidebar, topbar, roteamento por hash e tema.
(function () {
  const NAV = [
    { group: "Principal", items: [
      { id: "overview", label: "Visão Geral", icon: "home" },
      { id: "fluxocaixa", label: "Fluxo de Caixa", icon: "trendingUp" },
      { id: "lancamentos", label: "Lançamentos", icon: "list" },
      { id: "divisoes", label: "Divisões", icon: "layers" },
    ] },
    { group: "Análise", items: [
      { id: "dre", label: "DRE", icon: "fileText" },
      { id: "categorias", label: "Categorias & Fornecedores", icon: "tag" },
      { id: "saude", label: "Saúde Financeira", icon: "activity" },
      { id: "estrategia", label: "Estratégia & Insights", icon: "bulb" },
      { id: "planoacao", label: "Plano de Ação", icon: "checkCircle" },
    ] },
    { group: "Obrigações", items: [
      { id: "emprestimos", label: "Dívidas & Empréstimos", icon: "banknote" },
      { id: "contas", label: "A Receber / A Pagar", icon: "calendarCheck" },
    ] },
    { group: "Planejamento", items: [
      { id: "metas", label: "Metas", icon: "target" },
      { id: "orcamento", label: "Orçamento", icon: "wallet" },
      { id: "pipeline", label: "Pipeline", icon: "users" },
    ] },
    { group: "Sistema", items: [
      { id: "backup", label: "Backup & Exportação", icon: "download" },
      { id: "config", label: "Configurações", icon: "settings" },
    ] },
  ];
  const TITLES = {
    overview: ["Visão Geral", "Resumo consolidado da Max Led"],
    fluxocaixa: ["Fluxo de Caixa", "Entradas, saídas e saldo acumulado ao longo do tempo"],
    lancamentos: ["Lançamentos", "Todas as entradas e saídas, financeiro e nota fiscal"],
    divisoes: ["Divisões", "Max Led Iluminação vs Max Led Importação"],
    dre: ["DRE", "Demonstrativo de resultado do exercício"],
    categorias: ["Categorias & Fornecedores", "Para onde vai o dinheiro"],
    saude: ["Saúde Financeira", "Score consolidado de saúde do negócio"],
    estrategia: ["Estratégia & Insights", "Leituras automáticas sobre os dados"],
    planoacao: ["Plano de Ação", "Ideias concretas pra sair do negativo, com números reais"],
    emprestimos: ["Dívidas & Empréstimos", "Capital de giro e financiamentos ativos"],
    contas: ["A Receber / A Pagar", "Calendário de recebimentos e pagamentos"],
    metas: ["Metas", "Objetivos financeiros da empresa"],
    orcamento: ["Orçamento", "Limite mensal por categoria vs realizado"],
    pipeline: ["Pipeline", "Oportunidades de venda em aberto, ganhas e perdidas"],
    backup: ["Backup & Exportação", "Exportar, importar e imprimir seus dados"],
    config: ["Configurações", "Tema, empresa e preferências"],
  };

  const sidebarEl = document.querySelector('[data-role="sidebar"]');
  const topbarEl = document.querySelector('[data-role="topbar"]');
  const contentEl = document.querySelector('[data-role="content"]');
  const scrimEl = document.querySelector('[data-role="scrim"]');
  const shellEl = document.getElementById("app");

  function applyTheme() {
    const cfg = Storage.getConfig();
    if (cfg.theme === "dark" || cfg.theme === "light") {
      document.documentElement.setAttribute("data-theme", cfg.theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }
  applyTheme();

  function buildSidebar() {
    UI.clear(sidebarEl);
    const state = AppState.get();
    sidebarEl.appendChild(UI.h("div", { class: "brand" }, [
      UI.h("div", { class: "brand-mark" }, ["ML"]),
      UI.h("div", {}, [
        UI.h("div", { class: "brand-name" }, ["Max Led"]),
        UI.h("div", { class: "brand-sub" }, ["Painel Financeiro"]),
      ]),
    ]));
    NAV.forEach((grp) => {
      sidebarEl.appendChild(UI.h("div", { class: "nav-group-label" }, [grp.group]));
      grp.items.forEach((item) => {
        const a = UI.h("a", { href: `#/${item.id}`, class: "nav-item" + (state.view === item.id ? " active" : "") }, [
          Icon(item.icon, { size: 18 }),
          UI.h("span", { class: "nav-label" }, [item.label]),
        ]);
        a.addEventListener("click", () => { shellEl.classList.remove("nav-open"); });
        sidebarEl.appendChild(a);
      });
    });
    const footer = UI.h("div", { class: "sidebar-footer" }, []);
    const logoutBtn = UI.h("a", { href: "/logout", class: "collapse-btn" }, [Icon("x", { size: 16 }), UI.h("span", { class: "nav-label" }, ["Sair"])]);
    footer.appendChild(logoutBtn);
    const collapseBtn = UI.h("button", { class: "collapse-btn" }, [Icon("chevronLeft", { size: 16 }), UI.h("span", { class: "nav-label" }, ["Recolher menu"])]);
    collapseBtn.addEventListener("click", () => {
      shellEl.classList.toggle("is-collapsed");
      Storage.setConfig({ sidebarCollapsed: shellEl.classList.contains("is-collapsed") });
    });
    footer.appendChild(collapseBtn);
    sidebarEl.appendChild(footer);

    if (Storage.getConfig().sidebarCollapsed) shellEl.classList.add("is-collapsed");
  }

  function buildTopbar() {
    UI.clear(topbarEl);
    const state = AppState.get();
    const [title, subtitle] = TITLES[state.view] || ["Max Led", ""];
    const menuBtn = UI.h("button", { class: "icon-btn menu-toggle" }, [Icon("menu", { size: 17 })]);
    menuBtn.addEventListener("click", () => shellEl.classList.toggle("nav-open"));

    const left = UI.h("div", { class: "topbar-left" }, [
      UI.h("div", { style: "display:flex;align-items:center;gap:10px;" }, [menuBtn, UI.h("div", { class: "page-title" }, [title])]),
      UI.h("div", { class: "muted" }, [subtitle]),
    ]);

    const themeBtn = UI.h("button", { class: "icon-btn", title: "Alternar tema" }, [Icon(currentIsDark() ? "sun" : "moon", { size: 16 })]);
    themeBtn.addEventListener("click", () => {
      const nowDark = currentIsDark();
      Storage.setConfig({ theme: nowDark ? "light" : "dark" });
      applyTheme();
      render();
    });
    const printBtn = UI.h("button", { class: "icon-btn no-print", title: "Imprimir / exportar PDF" }, [Icon("printer", { size: 16 })]);
    printBtn.addEventListener("click", () => window.print());

    const right = UI.h("div", { class: "topbar-right" }, [printBtn, themeBtn]);
    topbarEl.appendChild(left);
    topbarEl.appendChild(right);
  }

  function currentIsDark() {
    const cfg = Storage.getConfig();
    if (cfg.theme === "dark") return true;
    if (cfg.theme === "light") return false;
    return window.matchMedia ? matchMedia("(prefers-color-scheme: dark)").matches : true;
  }

  function render() {
    UI.closeAllModals();
    buildSidebar();
    buildTopbar();
    UI.clear(contentEl);
    const state = AppState.get();
    const view = window.Views && window.Views[state.view];
    if (view) view(contentEl);
    else contentEl.appendChild(UI.emptyState({ icon: "info", title: "Página não encontrada" }));
    window.scrollTo({ top: 0 });
    ClassifyBar.mount();
  }

  function routeFromHash() {
    const id = (location.hash || "#/overview").replace("#/", "");
    if (TITLES[id]) AppState.set({ view: id });
    else { location.hash = "#/overview"; }
  }

  // Login acabou de confirmar (middleware redireciona pra cá com ?welcome=Nome)
  // -- registra no histórico de acessos e limpa a URL.
  function captureLoginWelcome() {
    const params = new URLSearchParams(location.search);
    const name = params.get("welcome");
    if (!name) return;
    Storage.logLogin(name);
    history.replaceState(null, "", location.pathname + location.hash);
  }
  captureLoginWelcome();

  window.addEventListener("hashchange", routeFromHash);
  scrimEl.addEventListener("click", () => shellEl.classList.remove("nav-open"));
  AppState.subscribe(render);

  routeFromHash();
  render();
})();
