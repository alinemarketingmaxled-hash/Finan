// Plano de Ação: diferente de Estratégia & Insights (que aponta o que está
// errado), aqui a régua é "o que fazer a respeito" — cada item cita números
// reais tirados dos dados atuais, não é conselho genérico.
(function () {
  const PRIORITY_LABEL = { alta: "Prioridade alta", media: "Prioridade média", baixa: "Prioridade baixa" };
  const PRIORITY_KIND = { alta: "critical", media: "warning", baixa: "neutral" };

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false });

    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:20px;" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Como funciona"]),
        UI.h("div", { class: "insight-body" }, [
          "Gerado automaticamente a partir dos seus dados: sempre que uma divisão está com margem negativa, endividamento caro, saldo projetado negativo ou concentração de risco, aparece aqui uma ação concreta pra resolver — com o número real por trás, não conselho genérico. " +
          "Conforme os números melhoram (ou você corrige algo), o item some sozinho da lista.",
        ]),
      ]),
    ]));

    const all = Compute.actionPlan();
    const actions = st.division === "consolidado" ? all : all.filter((a) => !a.divisao || a.divisao === st.division);

    if (!actions.length) {
      container.appendChild(UI.card([UI.emptyState({
        icon: "checkCircle", title: "Nenhuma ação crítica no momento",
        body: "Margens positivas, sem saldo projetado negativo e sem dívida com custo alto pendente nessa seleção. Continue acompanhando.",
      })]));
      return;
    }

    ["alta", "media", "baixa"].forEach((priority) => {
      const items = actions.filter((a) => a.priority === priority);
      if (!items.length) return;
      container.appendChild(UI.sectionTitle(PRIORITY_LABEL[priority], `${items.length} ação(ões)`));
      const wrap = UI.h("div", { style: "display:flex;flex-direction:column;gap:10px;margin-bottom:8px;" });
      items.forEach((a) => wrap.appendChild(actionCard(a)));
      container.appendChild(wrap);
    });
  }

  function actionCard(a) {
    return UI.h("div", { class: "card" }, [
      UI.h("div", { style: "display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px;" }, [
        UI.h("div", { style: "font-weight:700;font-size:13.5px;" }, [a.title]),
        UI.h("div", { style: "display:flex;gap:6px;flex:none;" }, [
          a.divisao ? UI.badgeDivision(a.divisao) : UI.badge("Consolidado", "muted"),
          UI.badge(PRIORITY_LABEL[a.priority].replace("Prioridade ", ""), PRIORITY_KIND[a.priority]),
        ]),
      ]),
      UI.h("div", { style: "font-size:12.5px;color:var(--text-secondary);line-height:1.55;" }, [a.body]),
      a.impacto ? UI.h("div", { style: "margin-top:10px;" }, [
        UI.badge(`Impacto estimado: ${Fmt.money(a.impacto, { compact: true })}`, "good"),
      ]) : null,
    ]);
  }

  window.Views = window.Views || {};
  window.Views.planoacao = render;
})();
