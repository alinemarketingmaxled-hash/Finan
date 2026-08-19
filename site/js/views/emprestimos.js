// Dívidas & Empréstimos: contratos vindos da planilha (editáveis por aqui,
// guardando só a diferença -- mesmo esquema de overrides de lançamentos) +
// contratos novos cadastrados na mão. valor_restante, parcelas_restantes e
// acrescimo são sempre derivados (valor_total - valor_pago, etc.), nunca
// pedidos direto no formulário, pra não desalinhar.
(function () {
  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false, extra: [addLoanBtn(st)] });
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
    const editBtn = UI.h("button", { class: "icon-btn", title: "Atualizar empréstimo" }, [Icon("edit", { size: 13 })]);
    editBtn.addEventListener("click", () => openLoanModal(loan));
    return UI.h("div", { class: "card" }, [
      UI.h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;" }, [
        UI.h("div", {}, [
          UI.h("div", { style: "font-weight:700;font-size:14.5px;" }, [loan.nome]),
          UI.h("div", {}, [UI.badgeDivision(loan.divisao)]),
        ]),
        UI.h("div", { style: "display:flex;align-items:center;gap:6px;" }, [
          UI.badge(`+${Fmt.pct(loan.custo_efetivo_pct)} de custo`, costLevel),
          editBtn,
        ]),
      ]),
      UI.h("div", { style: "margin-top:14px;" }, [
        UI.h("div", { style: "display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;" }, [
          UI.h("span", {}, [`${Fmt.money(loan.valor_pago, { compact: true })} pago de ${Fmt.money(loan.valor_total, { compact: true })}`]),
          UI.h("span", { class: "tabular" }, [`${pctPago}%`]),
        ]),
        UI.h("div", { class: "meter-track" }, [UI.h("div", { class: `meter-fill ${meterClass}`, style: `width:${Math.min(100, pctPago)}%;` })]),
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

  function addLoanBtn(st) {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Novo empréstimo"]);
    btn.addEventListener("click", () => openLoanModal(null, st));
    return btn;
  }

  // existing: o empréstimo (com os campos já calculados por Compute.loans) a
  // editar, ou null pra cadastrar um novo. Empréstimo da planilha -> vira
  // override (guarda só o que mudou, por id); cadastrado na mão -> edita
  // direto o registro dele.
  function openLoanModal(existing, st) {
    const isNew = !existing;
    const isBaseLoan = existing && MAXLED_DATA.loans.some((l) => l.id === existing.id);

    const nomeInput = UI.h("input", { class: "input", placeholder: "Ex: Capital de Giro Santander" });
    const bancoInput = UI.h("input", { class: "input", placeholder: "Ex: Santander" });
    const divSel = UI.h("select", {}, [
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    const valorTotalInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const parcelasTotalInput = UI.h("input", { type: "number", step: "1", min: "1", class: "input" });
    const parcelasPagasInput = UI.h("input", { type: "number", step: "1", min: "0", class: "input" });
    const parcelaJurosInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const valorPagoInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const valorFinalInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const dataInicialInput = UI.h("input", { type: "date", class: "input" });
    const dataFinalInput = UI.h("input", { type: "date", class: "input" });

    if (existing) {
      nomeInput.value = existing.nome || "";
      bancoInput.value = existing.banco || "";
      divSel.value = existing.divisao || "iluminacao";
      valorTotalInput.value = existing.valor_total ?? "";
      parcelasTotalInput.value = existing.parcelas_total ?? "";
      parcelasPagasInput.value = existing.parcelas_pagas ?? 0;
      parcelaJurosInput.value = existing.parcela_com_juros ?? "";
      valorPagoInput.value = existing.valor_pago ?? 0;
      valorFinalInput.value = existing.valor_final_com_acrescimo ?? "";
      dataInicialInput.value = existing.data_inicial || "";
      dataFinalInput.value = existing.data_final_prevista || "";
    } else {
      divSel.value = st && st.division !== "consolidado" ? st.division : "iluminacao";
      parcelasPagasInput.value = 0;
      valorPagoInput.value = 0;
    }

    // Atalho pro uso mensal: informa o valor da parcela paga agora e o
    // formulário já soma em "Valor pago" e avança "Parcelas pagas" -- sem
    // precisar calcular na mão. Só preenche os campos; ainda precisa Salvar.
    const parcelaRegistrarInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "Valor pago agora" });
    const registrarBtn = UI.h("button", { class: "btn btn-sm" }, ["Aplicar ao formulário"]);
    registrarBtn.addEventListener("click", () => {
      const valor = parseFloat(parcelaRegistrarInput.value);
      if (!valor) { UI.toast("Informe o valor da parcela paga."); return; }
      parcelasPagasInput.value = (parseInt(parcelasPagasInput.value, 10) || 0) + 1;
      valorPagoInput.value = Math.round(((parseFloat(valorPagoInput.value) || 0) + valor) * 100) / 100;
      parcelaJurosInput.value = valor;
      parcelaRegistrarInput.value = "";
      UI.toast("Aplicado abaixo — confira os campos e clique em Salvar.");
    });
    const quickBox = isNew ? null : UI.h("div", { class: "card", style: "background:var(--surface-2);margin-bottom:14px;" }, [
      UI.h("div", { style: "font-weight:700;font-size:12.5px;margin-bottom:8px;" }, ["Registrar parcela paga este mês"]),
      UI.h("div", { style: "display:flex;gap:8px;align-items:end;" }, [
        UI.h("div", { style: "flex:1;" }, [parcelaRegistrarInput]),
        registrarBtn,
      ]),
    ]);

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, [isNew ? "Criar empréstimo" : "Salvar alterações"]);
    const body = [
      UI.field("Nome do contrato", nomeInput),
      UI.h("div", { class: "field-row" }, [UI.field("Banco", bancoInput), UI.field("Divisão", divSel)]),
      UI.h("div", { class: "field-row" }, [UI.field("Valor total (principal)", valorTotalInput), UI.field("Valor final c/ acréscimo", valorFinalInput)]),
      UI.h("div", { class: "field-row" }, [UI.field("Parcelas (total)", parcelasTotalInput), UI.field("Parcelas pagas", parcelasPagasInput)]),
      UI.h("div", { class: "field-row" }, [UI.field("Parcela com juros (atual)", parcelaJurosInput), UI.field("Valor pago (acumulado)", valorPagoInput)]),
      UI.h("div", { class: "field-row" }, [UI.field("Início do contrato", dataInicialInput), UI.field("Quitação prevista", dataFinalInput)]),
    ];
    if (quickBox) body.unshift(quickBox);

    const m = UI.modal({
      title: isNew ? "Novo empréstimo" : `Atualizar: ${existing.nome}`,
      body,
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      const valor_total = parseFloat(valorTotalInput.value);
      const parcelas_total = parseInt(parcelasTotalInput.value, 10);
      const valor_final_com_acrescimo = parseFloat(valorFinalInput.value);
      if (!nomeInput.value.trim() || !valor_total || !parcelas_total || !valor_final_com_acrescimo || !dataInicialInput.value) {
        UI.toast("Preencha nome, valor total, nº de parcelas, valor final e início do contrato.");
        return;
      }
      const valor_pago = Math.max(0, parseFloat(valorPagoInput.value) || 0);
      const parcelas_pagas = Math.max(0, parseInt(parcelasPagasInput.value, 10) || 0);
      const patch = {
        nome: nomeInput.value.trim(),
        banco: bancoInput.value.trim(),
        divisao: divSel.value,
        valor_total, parcelas_total, parcelas_pagas,
        parcela_com_juros: parseFloat(parcelaJurosInput.value) || 0,
        valor_pago,
        valor_restante: Math.max(0, round2(valor_total - valor_pago)),
        acrescimo: round2(valor_final_com_acrescimo - valor_total),
        valor_final_com_acrescimo,
        parcelas_restantes: Math.max(0, parcelas_total - parcelas_pagas),
        data_inicial: dataInicialInput.value,
        data_final_prevista: dataFinalInput.value || null,
      };
      if (isNew) {
        Storage.addLoanExtra(patch);
        UI.toast("Empréstimo criado.");
      } else if (isBaseLoan) {
        Storage.setLoanOverride(existing.id, patch);
        UI.toast("Empréstimo atualizado.");
      } else {
        Storage.updateLoanExtra(existing.id, patch);
        UI.toast("Empréstimo atualizado.");
      }
      m.close();
      AppState.set({});
    });
  }
  function round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

  window.Views = window.Views || {};
  window.Views.emprestimos = render;
})();
