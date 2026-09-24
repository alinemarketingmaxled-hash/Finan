// Como Analisar: guia em tópicos da metodologia de análise financeira --
// conteúdo educativo fixo, sem depender de nenhum dado (por isso não usa
// Compute). O link de cada card navega direto pra página citada.
(function () {
  const TOPICS = [
    { tc: "tc-1", title: "Caixa disponível é o primeiro indicador a analisar",
      body: "O lucro contábil não indica se existe dinheiro disponível para pagar as contas no prazo. Por isso, antes de qualquer decisão, verifique o resultado acumulado e o pior mês projetado, no início de <b>Visão Estratégica</b> e de <b>Visão Futura</b>.",
      link: "Visão Futura", href: "visaofutura" },
    { tc: "tc-2", title: "Diferença entre Realizado e Projetado",
      body: "Existem 4 níveis de confiança diferentes: Realizado, Confirmado, Estimado e Projetado. Cada um tem um grau de certeza distinto, e um número projetado deve ser tratado como estimativa, não como valor confirmado, ao tomar uma decisão.",
      link: "Forecast", href: "forecast" },
    { tc: "tc-3", title: "Verificação do mês de menor caixa",
      body: "A média anual pode não mostrar um mês específico em que o caixa fica mais apertado, como dezembro, por causa do 13º salário. Por isso, verifique o \"pior mês\" e a data em que ele ocorre, em <b>Visão Futura</b>.",
      link: "Visão Futura", href: "visaofutura" },
    { tc: "tc-1", title: "Diferença entre Saldo Devedor e Compromisso Futuro",
      body: "Saldo devedor é o valor que falta pagar na data de hoje. Compromisso futuro inclui também os juros que ainda vão vencer até o fim do contrato. Usar o número errado nessa análise pode indicar caixa disponível que na verdade não existe. Ver <b>Dívidas & Empréstimos</b>.",
      link: "Dívidas & Empréstimos", href: "emprestimos" },
    { tc: "tc-2", title: "Análise por divisão antes do número consolidado",
      body: "O resultado consolidado pode reunir uma divisão com resultado negativo e outra com resultado positivo, sem deixar isso visível. Por isso, analise Iluminação e Importação separadamente antes de considerar apenas o número da empresa inteira, em <b>Divisões</b>.",
      link: "Divisões", href: "divisoes" },
    { tc: "tc-3", title: "Teste de cenários antes de decisões grandes",
      body: "Antes de uma decisão grande, como contratar, investir ou tomar um empréstimo, calcule pelo menos o cenário Conservador em <b>Cenários</b>. Se o resultado permanece sustentável nesse cenário, a decisão tem uma margem de segurança maior.",
      link: "Cenários", href: "cenarios" },
    { tc: "tc-1", title: "Diferença entre Meta e Forecast",
      body: "Meta é o valor que se pretende alcançar. Forecast é o valor que a tendência atual indica como provável, se nada for alterado. Quando os dois números divergem em <b>Metas</b>, a ação recomendada é ajustar o Orçamento ou a operação, não o valor da meta.",
      link: "Metas", href: "metas" },
    { tc: "tc-2", title: "Verificação da capacidade antes de aprovar investimento",
      body: "Antes de comprometer um valor, verifique se a capacidade de investimento permanece positiva depois de reservar o caixa mínimo e as obrigações já assumidas, em <b>Investimentos</b>. O saldo disponível na conta não equivale à capacidade real de investir.",
      link: "Investimentos", href: "investimentos" },
    { tc: "tc-3", title: "O que significa \"dados insuficientes para projeção\"",
      body: "Quando um indicador aparece assim, isso indica a falta de histórico suficiente pra calcular uma tendência, não que o valor seja zero. Cadastrar mais lançamentos ou uma meta relacionada libera o cálculo desse número.",
      link: "Saúde Financeira", href: "saude" },
    { tc: "tc-1", title: "Revisão dos alertas no fechamento do mês",
      body: "Vermelho indica necessidade de decisão urgente, amarelo indica um ponto de atenção, e verde indica um resultado dentro do esperado. A <b>Visão Estratégica</b> reúne esses alertas em uma lista única, ao final da tela.",
      link: "Visão Estratégica", href: "visaoestrategica" },
    { tc: "tc-2", title: "Retorno mínimo antes de investir em marketing",
      body: "Divida o valor que pretende investir pela margem bruta do período: esse é o retorno mínimo em vendas pra campanha se pagar. Sem esse número, é fácil gastar mais do que a campanha consegue devolver. Ver <b>Marketing</b>.",
      link: "Marketing", href: "marketing" },
  ];

  function render(container) {
    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:22px;" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Um roteiro, não uma lista de telas"]),
        UI.h("div", { class: "insight-body" }, [UI.richText(
          "Cada tela do painel mostra uma parte da informação. Esta página é sobre a ordem e a lógica de como juntar essas partes numa decisão, com os mesmos dados que você já viu nas outras telas."
        )]),
      ]),
    ]));

    const grid = UI.h("div", { class: "grid grid-3", style: "gap:26px;" }, TOPICS.map((t, i) => topicCard(t, i)));
    container.appendChild(grid);
  }

  function topicCard(t, i) {
    const link = UI.h("button", { class: "topic-link" }, [`${t.link} →`]);
    link.addEventListener("click", () => { location.hash = `#/${t.href}`; });
    return UI.h("div", { class: `card topic-card ${t.tc}` }, [
      UI.h("div", { class: "topic-num" }, [String(i + 1)]),
      UI.h("div", { class: "topic-title" }, [t.title]),
      UI.h("div", { class: "topic-body" }, [UI.richText(t.body)]),
      link,
    ]);
  }

  window.Views = window.Views || {};
  window.Views.comoanalisar = render;
})();
