(function () {
  function render(container) {
    container.appendChild(UI.sectionTitle("Aparência"));
    container.appendChild(themeCard());

    container.appendChild(UI.sectionTitle("Histórico de acessos", "Nome e horário de quem entrou no painel — só os logins feitos neste navegador/aparelho"));
    container.appendChild(loginLogCard());

    container.appendChild(UI.sectionTitle("Sobre os dados"));
    container.appendChild(aboutCard());
  }

  function loginLogCard() {
    const log = Storage.listLoginLog();
    if (!log.length) {
      return UI.card([UI.emptyState({
        icon: "activity", title: "Nenhum acesso registrado ainda neste aparelho",
        body: "A partir do próximo login (informando o nome na tela de entrada), ele aparece aqui.",
      })]);
    }
    const clearBtn = UI.h("button", { class: "btn btn-sm" }, ["Limpar histórico"]);
    clearBtn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog("Limpar o histórico de acessos deste navegador? Não afeta outros aparelhos.");
      if (ok) { Storage.clearLoginLog(); UI.toast("Histórico limpo."); AppState.set({}); }
    });
    const note = UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);margin-bottom:14px;line-height:1.5;" }, [
      "Este painel não tem servidor/banco de dados central, então esse histórico só mostra os acessos feitos aqui — não vê logins de outros computadores ou celulares.",
    ]);
    return UI.h("div", { class: "card" }, [
      note,
      UI.table({
        columns: [
          { key: "name", label: "Nome" },
          { key: "ts", label: "Data e hora", render: (r) => new Date(r.ts).toLocaleString("pt-BR") },
        ],
        rows: log,
      }),
      UI.h("div", { style: "margin-top:14px;" }, [clearBtn]),
    ]);
  }

  function themeCard() {
    const cfg = Storage.getConfig();
    const current = cfg.theme || "auto";
    const wrap = UI.h("div", { class: "card" }, [
      UI.h("div", { style: "font-weight:700;font-size:13.5px;margin-bottom:12px;" }, ["Tema"]),
    ]);
    const seg = UI.segmented([
      { value: "auto", label: "Automático" },
      { value: "light", label: "Claro" },
      { value: "dark", label: "Escuro" },
    ], current, (v) => {
      Storage.setConfig({ theme: v === "auto" ? null : v });
      document.documentElement.removeAttribute("data-theme");
      if (v !== "auto") document.documentElement.setAttribute("data-theme", v);
      AppState.set({});
    });
    wrap.appendChild(seg);
    return wrap;
  }

  function aboutCard() {
    const meta = MAXLED_DATA.meta;
    const rows = [
      ["Empresa", meta.company],
      ["Divisões", Object.values(meta.division_labels).filter((l) => !l.includes("Consolidado")).join(" · ")],
      ["Dados detalhados (transação a transação)", `${Fmt.monthLabel(meta.detailed_range.start, "full")} até ${Fmt.monthLabel(meta.detailed_range.end, "full")}`],
      ["Previsão (projeção automática)", `${Fmt.monthLabel(meta.forecast_range.start, "full")} até ${Fmt.monthLabel(meta.forecast_range.end, "full")}`],
      ["Última extração da planilha", new Date(meta.generated_at).toLocaleString("pt-BR")],
      ["Moeda", meta.currency],
    ];
    return UI.h("div", { class: "card" }, [
      UI.h("div", { style: "font-weight:700;font-size:13.5px;margin-bottom:14px;" }, ["Origem dos dados"]),
      UI.h("div", { style: "display:flex;flex-direction:column;gap:10px;" }, rows.map(([label, value]) =>
        UI.h("div", { style: "display:flex;justify-content:space-between;font-size:12.5px;border-bottom:1px solid var(--border);padding-bottom:8px;" }, [
          UI.h("span", { style: "color:var(--text-muted);" }, [label]),
          UI.h("span", { style: "font-weight:600;text-align:right;" }, [value]),
        ]))),
      UI.h("div", { style: "font-size:12px;color:var(--text-muted);margin-top:16px;line-height:1.6;" }, [
        "Este painel roda inteiramente no navegador (sem servidor). A base financeira vem da planilha Excel da Max Led; ",
        "lançamentos manuais, metas, orçamento e notas ficam salvos só neste navegador (localStorage) — use Backup & Exportação para levar para outro computador.",
      ]),
    ]);
  }

  window.Views = window.Views || {};
  window.Views.config = render;
})();
