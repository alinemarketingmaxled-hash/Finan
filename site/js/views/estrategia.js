(function () {
  function render(container) {
    const insights = Compute.insights();
    const counts = { critical: 0, warning: 0, info: 0, good: 0 };
    insights.forEach((i) => counts[i.level]++);

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Alertas críticos", value: String(counts.critical), foot: "Exigem ação imediata" }),
      UI.statTile({ label: "Pontos de atenção", value: String(counts.warning), foot: "Vale monitorar de perto" }),
      UI.statTile({ label: "Leituras informativas", value: String(counts.info), foot: "Contexto e oportunidades" }),
      UI.statTile({ label: "Sinais positivos", value: String(counts.good), foot: "O que está funcionando" }),
    ]));

    container.appendChild(UI.sectionTitle("Leituras automáticas", "Geradas a partir dos dados reais da planilha — sem filtro de período, olhando o quadro completo"));
    const wrap = UI.h("div", { style: "display:flex;flex-direction:column;gap:10px;" });
    insights.forEach((i) => wrap.appendChild(UI.insightCard(i)));
    container.appendChild(wrap);

    container.appendChild(UI.sectionTitle("Suas anotações estratégicas", "Fica salvo neste navegador — use para registrar decisões e próximos passos"));
    container.appendChild(notesCard());
  }

  function notesCard() {
    const cfg = Storage.getConfig();
    const textarea = UI.h("textarea", { class: "input", rows: 8, placeholder: "Ex: negociar redução de juros do empréstimo Bradesco até dezembro; revisar preço da linha de importação; iniciar uso do pipeline de vendas…" });
    textarea.value = cfg.notasEstrategicas || "";
    let status = UI.h("span", { style: "font-size:11.5px;color:var(--text-muted);" }, ["Salvo automaticamente"]);
    let t = null;
    textarea.addEventListener("input", () => {
      clearTimeout(t);
      status.textContent = "Salvando…";
      t = setTimeout(() => { Storage.setConfig({ notasEstrategicas: textarea.value }); status.textContent = "Salvo automaticamente"; }, 500);
    });
    return UI.h("div", { class: "card" }, [
      textarea,
      UI.h("div", { style: "margin-top:8px;" }, [status]),
    ]);
  }

  window.Views = window.Views || {};
  window.Views.estrategia = render;
})();
