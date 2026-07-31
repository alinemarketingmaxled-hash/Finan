(function () {
  function scoreBand(score) {
    if (score >= 80) return ["Excelente", "good"];
    if (score >= 60) return ["Bom", "good"];
    if (score >= 40) return ["Atenção", "warning"];
    return ["Crítico", "critical"];
  }

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false });
    const health = Compute.healthScore(st.division);
    const [bandLabel, bandKind] = scoreBand(health.score);

    const top = UI.h("div", { class: "grid grid-2", style: "align-items:stretch;" }, []);
    const gaugeCard = UI.h("div", { class: "card", style: "display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;" }, [
      UI.h("div", { class: "card-title", style: "margin-bottom:14px;" }, ["Score de saúde financeira"]),
    ]);
    const gaugeWrap = UI.h("div", {});
    gaugeCard.appendChild(gaugeWrap);
    Charts.gauge(gaugeWrap, { value: health.score, size: 220 });
    gaugeCard.appendChild(UI.badge(bandLabel, bandKind));
    gaugeCard.appendChild(UI.h("div", { style: "font-size:12px;color:var(--text-muted);margin-top:10px;max-width:280px;" }, [
      "Combina margem líquida, regularidade do fluxo de caixa, endividamento e concentração de risco em fornecedores.",
    ]));
    top.appendChild(gaugeCard);

    const compWrap = UI.h("div", { style: "display:flex;flex-direction:column;gap:12px;" }, []);
    health.components.forEach((c) => compWrap.appendChild(componentRow(c)));
    top.appendChild(UI.h("div", { class: "card" }, [UI.h("div", { class: "card-title", style: "margin-bottom:14px;" }, ["Componentes do score"]), compWrap]));

    container.appendChild(top);

    container.appendChild(UI.sectionTitle("Como interpretar", ""));
    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      legendCard("80–100", "Excelente", "good", "Negócio saudável: margens positivas, caixa estável, dívida sob controle."),
      legendCard("60–79", "Bom", "good", "Fundamentos sólidos, com pontos específicos para melhorar."),
      legendCard("40–59", "Atenção", "warning", "Existem riscos reais que merecem plano de ação nos próximos meses."),
      legendCard("0–39", "Crítico", "critical", "Múltiplos indicadores no vermelho — priorize caixa e renegociação de dívida."),
    ]));
  }

  function componentRow(c) {
    const kind = c.score >= 70 ? "good" : c.score >= 40 ? "warning" : "critical";
    return UI.h("div", {}, [
      UI.h("div", { style: "display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;" }, [
        UI.h("span", { style: "font-weight:600;" }, [c.label]),
        UI.h("span", { class: "tabular", style: "color:var(--text-secondary);" }, [`${c.score}/100`]),
      ]),
      UI.h("div", { class: "meter-track" }, [UI.h("div", { class: `meter-fill ${kind}`, style: `width:${c.score}%;` })]),
      UI.h("div", { style: "font-size:11.5px;color:var(--text-muted);margin-top:4px;" }, [c.detail]),
    ]);
  }

  function legendCard(range, label, kind, body) {
    return UI.h("div", { class: "card" }, [
      UI.h("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;" }, [
        UI.h("span", { class: "tabular", style: "font-weight:700;font-size:13px;" }, [range]),
        UI.badge(label, kind),
      ]),
      UI.h("div", { style: "font-size:12px;color:var(--text-secondary);" }, [body]),
    ]);
  }

  window.Views = window.Views || {};
  window.Views.saude = render;
})();
