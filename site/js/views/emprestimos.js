(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false });
    const loans = Compute.loans(st.division);
    const totals = Compute.loansTotals(st.division);

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Total tomado", value: Fmt.money(totals.valor_total), foot: `${loans.length} contrato(s) ativo(s)` }),
      UI.statTile({ label: "Já pago", value: Fmt.money(totals.valor_pago), foot: Fmt.pct(totals.valor_total ? totals.valor_pago / totals.valor_total : 0) + " do total" }),
      UI.statTile({ label: "Saldo devedor", value: Fmt.money(totals.valor_restante), foot: "Principal ainda restante" }),
      UI.statTile({ label: "Custo em juros/encargos", value: Fmt.money(totals.custo_total_juros), foot: Fmt.pct(totals.valor_total ? totals.custo_total_juros / totals.valor_total : 0) + " de acréscimo médio" }),
    ]));

    if (!loans.length) {
      container.appendChild(UI.card([UI.emptyState({ icon: "banknote", title: "Nenhum empréstimo nessa divisão" })]));
      return;
    }

    container.appendChild(UI.sectionTitle("Contratos ativos", "Capital de giro e financiamentos — quanto falta pagar e quanto o crédito realmente custa"));
    container.appendChild(UI.h("div", { class: "grid grid-2", style: "align-items:start;" }, loans.map(loanCard)));
  }

  function loanCard(loan) {
    const pctPago = Math.round(loan.pct_pago * 100);
    const costLevel = loan.custo_efetivo_pct >= 0.9 ? "critical" : loan.custo_efetivo_pct >= 0.5 ? "warning" : "good";
    const meterClass = pctPago >= 90 ? "good" : pctPago >= 40 ? "" : "warning";
    return UI.h("div", { class: "card" }, [
      UI.h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;" }, [
        UI.h("div", {}, [
          UI.h("div", { style: "font-weight:700;font-size:14.5px;" }, [loan.nome]),
          UI.h("div", {}, [UI.badgeDivision(loan.divisao)]),
        ]),
        UI.badge(`+${Fmt.pct(loan.custo_efetivo_pct)} de custo`, costLevel),
      ]),
      UI.h("div", { style: "margin-top:14px;" }, [
        UI.h("div", { style: "display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;" }, [
          UI.h("span", {}, [`${Fmt.money(loan.valor_pago, { compact: true })} pago de ${Fmt.money(loan.valor_total, { compact: true })}`]),
          UI.h("span", { class: "tabular" }, [`${pctPago}%`]),
        ]),
        UI.h("div", { class: "meter-track" }, [UI.h("div", { class: `meter-fill ${meterClass}`, style: `width:${pctPago}%;` })]),
      ]),
      UI.h("div", { class: "grid grid-2", style: "margin-top:16px;gap:10px;" }, [
        stat("Saldo devedor", Fmt.money(loan.valor_restante)),
        stat("Parcela com juros", Fmt.money(loan.parcela_com_juros)),
        stat("Parcelas", `${loan.parcelas_pagas} / ${loan.parcelas_total}`),
        stat("Valor final c/ acréscimo", Fmt.money(loan.valor_final_com_acrescimo)),
        stat("Início do contrato", Fmt.dateBR(loan.data_inicial)),
        stat("Quitação prevista", Fmt.dateBR(loan.data_final_prevista)),
      ]),
    ]);
  }

  function stat(label, value) {
    return UI.h("div", {}, [
      UI.h("div", { style: "font-size:11px;color:var(--text-muted);margin-bottom:2px;" }, [label]),
      UI.h("div", { class: "tabular", style: "font-size:13px;font-weight:700;" }, [value]),
    ]);
  }

  window.Views = window.Views || {};
  window.Views.emprestimos = render;
})();
