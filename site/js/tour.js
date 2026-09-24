// Tour com spotlight: realça um elemento real da página (box-shadow gigante
// escurece o resto, sem precisar de overlay/coordenadas) e mostra uma barra
// fixa com o texto do passo. Um tour por página nova; nunca atravessa
// navegação (troca de página encerra o tour em andamento).
(function (global) {
  const TOUR_STEPS = {
    visaoestrategica: [
      { sel: '[data-tour="ve-caixa"]', title: "Caixa", body: "Resultado acumulado desde o início do histórico e o pior mês projetado nos próximos 6 meses. Não é o saldo real do banco -- a base não guarda saldo inicial de caixa." },
      { sel: '[data-tour="ve-divida"]', title: "Dívida", body: "Saldo devedor é o que falta pagar hoje. Compromisso futuro são as parcelas estimadas dos próximos 6 meses, já com os juros embutidos." },
      { sel: '[data-tour="ve-cenario"]', title: "Cenário rápido", body: "Compara o resultado projetado em 12 meses no cenário Base com o cenário Conservador. Mais detalhes em Cenários." },
      { sel: '[data-tour="ve-alertas"]', title: "Alertas", body: "Resumo do que precisa de atenção, sempre no fim da tela. Vem dos mesmos números mostrados acima, sem cálculo novo." },
    ],
    visaofutura: [
      { sel: '[data-tour="vf-insight"]', title: "Como ler esta tela", body: "Confirmado, Estimado e Projetado são níveis de confiança diferentes. Estimado nunca é somado ao combinado, pra não contar a dívida em dobro." },
      { sel: '[data-tour="vf-chart"]', title: "Confirmado vs Projetado", body: "A linha combinada soma Confirmado (documentado) com Projetado (tendência). Compare com a linha só de Confirmado." },
      { sel: '[data-tour="vf-table"]', title: "Detalhe mensal", body: "Cada coluna mostra a origem do número: Confirmado, Estimado (dívida e investimento, à parte) e Projetado." },
    ],
    forecast: [
      { sel: '[data-tour="fc-insight"]', title: "O que é este número", body: "Forecast é só tendência estatística: pega os últimos meses reais e projeta 12 meses à frente. Não inclui Previsões nem A Receber/A Pagar." },
      { sel: '[data-tour="fc-legend"]', title: "Classificação", body: "Realizado já aconteceu. Projetado é a tendência calculada por regressão sobre os últimos meses." },
      { sel: '[data-tour="fc-chart"]', title: "Realizado vs Projetado", body: "A parte tracejada é projeção. Quanto menos meses de histórico, menos confiável a tendência." },
    ],
    cenarios: [
      { sel: '[data-tour="cn-quicksim"]', title: "Simulação rápida", body: "Mova os controles pra testar uma variação de receita/despesa na hora. Não salva nada até você clicar em salvar." },
      { sel: '[data-tour="cn-cards"]', title: "Cenários", body: "Base é a tendência atual, sem ajuste. Conservador e Crescimento já vêm com premissas pré-definidas -- e você pode salvar os seus." },
    ],
    investimentos: [
      { sel: '[data-tour="iv-formula"]', title: "Capacidade", body: "Confirmado menos a parcela de dívida estimada, o caixa mínimo reservado e o que já foi aprovado antes. O Projetado por tendência fica de fora de propósito." },
      { sel: '[data-tour="iv-list"]', title: "Investimentos cadastrados", body: "Aprovar um investimento aqui já reflete na capacidade dos próximos meses e aparece também na Visão Futura." },
    ],
    marketing: [
      { sel: '[data-tour="mk-insight"]', title: "Como é calculado", body: "Retorno mínimo = valor investido dividido pela margem bruta do período. É o valor em vendas que a campanha precisa gerar só pra se pagar." },
      { sel: '[data-tour="mk-calc"]', title: "Simulação", body: "Informe o valor que pretende investir. Dá pra salvar a simulação com um nome pra comparar várias campanhas depois." },
    ],
  };

  let state = null; // { pageId, step }

  function clearHighlight() {
    document.querySelectorAll(".tour-highlight").forEach((el) => el.classList.remove("tour-highlight"));
  }

  function removeBar() {
    const bar = document.querySelector('[data-role="tourbar"]');
    if (bar) bar.remove();
  }

  function renderBar() {
    removeBar();
    if (!state) return;
    const steps = TOUR_STEPS[state.pageId] || [];
    const step = steps[state.step];
    if (!step) return;

    const counter = document.createElement("div");
    counter.className = "tour-counter";
    counter.textContent = `${state.step + 1} / ${steps.length}`;

    const text = UI.h("div", { class: "tour-text" }, [
      UI.h("div", { class: "tour-title" }, [step.title]),
      UI.h("div", { class: "tour-body" }, [step.body]),
    ]);

    const prevBtn = UI.h("button", { class: "icon-btn", title: "Anterior" }, [Icon("chevronLeft", { size: 14 })]);
    prevBtn.disabled = state.step === 0;
    prevBtn.addEventListener("click", () => { state.step = Math.max(0, state.step - 1); highlightCurrent(); });

    const isLast = state.step === steps.length - 1;
    const nextBtn = UI.h("button", { class: "btn btn-accent btn-sm" }, [isLast ? "Encerrar" : "Próximo"]);
    nextBtn.addEventListener("click", () => { if (isLast) end(); else { state.step += 1; highlightCurrent(); } });

    const closeBtn = UI.h("button", { class: "icon-btn", title: "Pular tour" }, [Icon("x", { size: 14 })]);
    closeBtn.addEventListener("click", end);

    const bar = UI.h("div", { class: "tour-bar" }, [counter, text, prevBtn, nextBtn, closeBtn]);
    bar.setAttribute("data-role", "tourbar");
    document.body.appendChild(bar);
  }

  function highlightCurrent() {
    clearHighlight();
    if (!state) return;
    const steps = TOUR_STEPS[state.pageId] || [];
    const step = steps[state.step];
    if (!step) { end(); return; }
    const el = document.querySelector(step.sel);
    if (el) {
      el.classList.add("tour-highlight");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    renderBar();
  }

  function markSeen(pageId) {
    const cfg = Storage.getConfig();
    const seen = Object.assign({}, cfg.tourSeen, { [pageId]: true });
    Storage.setConfig({ tourSeen: seen });
  }

  function start(pageId) {
    if (!TOUR_STEPS[pageId] || !TOUR_STEPS[pageId].length) return;
    state = { pageId, step: 0 };
    markSeen(pageId);
    highlightCurrent();
  }

  function end() {
    clearHighlight();
    removeBar();
    state = null;
  }

  // Encerra o tour se a navegação mudou de página -- nunca deixa um
  // destaque "grudado" numa tela que não é mais a atual.
  function onNavigate(pageId) {
    if (state && state.pageId !== pageId) end();
  }

  function isAvailable(pageId) { return !!(TOUR_STEPS[pageId] && TOUR_STEPS[pageId].length); }
  function wasSeen(pageId) { return !!(Storage.getConfig().tourSeen || {})[pageId]; }
  function isActive() { return !!state; }

  // O prompt automático ("quer um tour?") só aparece uma vez por página por
  // sessão de navegador -- não persiste em Storage, senão um simples
  // recarregar de página já bastaria pra "resetar" o prompt indefinidamente.
  // Terminar o tour de verdade (Tour.start -> markSeen) é o que suprime pra
  // sempre; só dispensar o prompt permite ver de novo numa próxima sessão.
  const promptedThisSession = new Set();
  function shouldPrompt(pageId) {
    return isAvailable(pageId) && !wasSeen(pageId) && !promptedThisSession.has(pageId);
  }
  function markPrompted(pageId) { promptedThisSession.add(pageId); }

  global.Tour = { start, end, onNavigate, isAvailable, wasSeen, isActive, shouldPrompt, markPrompted };
})(window);
