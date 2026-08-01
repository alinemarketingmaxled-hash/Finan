// Pipeline de vendas: a planilha original tem uma aba pra isso (Empresa, Mês
// Previsto, Valor Previsto, Status) mas nunca foi preenchida. Aqui vira uma
// lista editável (localStorage) de oportunidades em aberto/ganhas/perdidas,
// pra enxergar receita futura potencial além do histórico realizado.
(function () {
  const STATUS_LABEL = { aberto: "Em aberto", ganho: "Ganho", perdido: "Perdido" };
  const STATUS_KIND = { aberto: "neutral", ganho: "good", perdido: "critical" };

  function render(container) {
    const st = AppState.get();
    UI.filterBar(container, { showMonth: false, extra: [addBtn(st)] });

    container.appendChild(UI.h("div", { class: "insight info", style: "margin-bottom:20px;" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("info", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, ["Como funciona"]),
        UI.h("div", { class: "insight-body" }, [
          "Cadastre aqui negociações em andamento: empresa, divisão, mês em que espera fechar, valor previsto e status. " +
          "Enquanto está em negociação, deixe como <b>Em aberto</b> — entra na previsão de receita potencial abaixo. " +
          "Quando fechar ou cair, marque como <b>Ganho</b> ou <b>Perdido</b>: sai da previsão e passa a contar na taxa de conversão. " +
          "É só um planejamento manual — não vira lançamento nem entra no DRE automaticamente; quando a venda acontecer de verdade, registre o lançamento normalmente em Lançamentos.",
        ]),
      ]),
    ]));

    const summary = Compute.pipelineSummary(st.division);
    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Em aberto", value: Fmt.money(summary.totalAberto), foot: `${summary.aberto.length} oportunidade(s)` }),
      UI.statTile({ label: "Ganho", value: Fmt.money(summary.totalGanho), foot: `${summary.ganho.length} oportunidade(s)` }),
      UI.statTile({ label: "Perdido", value: Fmt.money(summary.totalPerdido), foot: `${summary.perdido.length} oportunidade(s)` }),
      UI.statTile({
        label: "Taxa de conversão", value: summary.taxaConversao === null ? "—" : Fmt.pct(summary.taxaConversao),
        foot: summary.taxaConversao === null ? "Sem oportunidades decididas ainda" : `${summary.ganho.length} ganha(s) de ${summary.ganho.length + summary.perdido.length} decidida(s)`,
      }),
    ]));

    if (!summary.items.length) {
      container.appendChild(UI.card([UI.emptyState({
        icon: "users", title: "Nenhuma oportunidade cadastrada",
        body: "Clique em \"Nova oportunidade\" pra começar a acompanhar negociações em andamento.",
      })]));
      return;
    }

    if (summary.aberto.length) {
      container.appendChild(UI.sectionTitle("Previsão por mês (em aberto)", "Valor previsto de oportunidades ainda não decididas"));
      const chartCard = UI.card([], {});
      const wrap = UI.h("div", {});
      chartCard.appendChild(wrap);
      Charts.barListRanked(wrap, {
        items: abertoPorMes(summary.aberto),
        formatValue: (v) => Fmt.money(v, { compact: true }),
      });
      container.appendChild(chartCard);
    }

    container.appendChild(UI.sectionTitle("Oportunidades", `${summary.items.length} no total`));
    container.appendChild(UI.h("div", { class: "card" }, [UI.table({
      columns: [
        { key: "empresa", label: "Empresa", wrap: true },
        { key: "divisao", label: "Divisão", render: (r) => UI.badgeDivision(r.divisao) },
        { key: "mes_previsto", label: "Mês previsto", render: (r) => r.mes_previsto ? Fmt.monthLabel(r.mes_previsto, "full") : "—" },
        { key: "valor_previsto", label: "Valor previsto", align: "right", render: (r) => Fmt.money(r.valor_previsto) },
        { key: "status", label: "Status", render: (r) => UI.badge(STATUS_LABEL[r.status] || r.status, STATUS_KIND[r.status] || "muted") },
        { key: "actions", label: "", render: (r) => actionsCell(r) },
      ],
      rows: summary.items.slice().sort((a, b) => (b.mes_previsto || "").localeCompare(a.mes_previsto || "")),
    })]));
  }

  function abertoPorMes(aberto) {
    const map = new Map();
    aberto.forEach((p) => {
      const k = p.mes_previsto || "Sem mês definido";
      map.set(k, (map.get(k) || 0) + (Number(p.valor_previsto) || 0));
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] || "").localeCompare(b[0] || ""))
      .map(([mes, valor]) => ({
        label: mes === "Sem mês definido" ? mes : Fmt.monthLabel(mes, "full"),
        value: valor, color: Charts.cssVar("--series-1"),
      }));
  }

  function actionsCell(p) {
    return UI.h("div", { style: "display:flex;gap:5px;justify-content:flex-end;" }, [editBtn(p), removeBtn(p)]);
  }
  function editBtn(p) {
    const btn = UI.h("button", { class: "icon-btn", title: "Editar" }, [Icon("edit", { size: 13 })]);
    btn.addEventListener("click", () => openPipelineModal(p));
    return btn;
  }
  function removeBtn(p) {
    const btn = UI.h("button", { class: "icon-btn", title: "Remover" }, [Icon("trash", { size: 13 })]);
    btn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog(`Remover a oportunidade "${p.empresa}"?`);
      if (ok) { Storage.removePipelineItem(p.id); UI.toast("Oportunidade removida."); AppState.set({}); }
    });
    return btn;
  }
  function addBtn(st) {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("plus", { size: 14 }), "Nova oportunidade"]);
    btn.addEventListener("click", () => openPipelineModal(null, st));
    return btn;
  }

  function openPipelineModal(existing, st) {
    const empresaInput = UI.h("input", { class: "input", placeholder: "Ex: Cliente Prospect LTDA" });
    const divSel = UI.h("select", {}, [
      UI.h("option", { value: "iluminacao" }, ["Max Led Iluminação"]),
      UI.h("option", { value: "importacao" }, ["Max Led Importação"]),
    ]);
    const mesInput = UI.h("input", { type: "month", class: "input" });
    const valorInput = UI.h("input", { type: "number", step: "0.01", min: "0", class: "input", placeholder: "0,00" });
    const statusSel = UI.h("select", {}, Object.entries(STATUS_LABEL).map(([v, l]) => UI.h("option", { value: v }, [l])));
    const notaInput = UI.h("textarea", { class: "input", rows: 2, placeholder: "Observação (opcional)" });

    if (existing) {
      empresaInput.value = existing.empresa || "";
      divSel.value = existing.divisao || "iluminacao";
      mesInput.value = existing.mes_previsto || "";
      valorInput.value = existing.valor_previsto || "";
      statusSel.value = existing.status || "aberto";
      notaInput.value = existing.nota || "";
    } else {
      divSel.value = st && st.division !== "consolidado" ? st.division : "iluminacao";
      statusSel.value = "aberto";
    }

    const cancelBtn = UI.h("button", { class: "btn" }, ["Cancelar"]);
    const saveBtn = UI.h("button", { class: "btn btn-accent" }, [existing ? "Salvar alterações" : "Salvar oportunidade"]);
    const m = UI.modal({
      title: existing ? "Editar oportunidade" : "Nova oportunidade",
      body: [
        UI.field("Empresa", empresaInput),
        UI.h("div", { class: "field-row" }, [UI.field("Divisão", divSel), UI.field("Status", statusSel)]),
        UI.h("div", { class: "field-row" }, [UI.field("Mês previsto", mesInput), UI.field("Valor previsto (R$)", valorInput)]),
        UI.field("Observação", notaInput),
      ],
      footer: [cancelBtn, saveBtn],
    });
    cancelBtn.addEventListener("click", () => m.close());
    saveBtn.addEventListener("click", () => {
      if (!empresaInput.value.trim() || !valorInput.value) { UI.toast("Preencha ao menos empresa e valor previsto."); return; }
      const payload = {
        empresa: empresaInput.value.trim(), divisao: divSel.value,
        mes_previsto: mesInput.value || null, valor_previsto: parseFloat(valorInput.value),
        status: statusSel.value, nota: notaInput.value.trim(),
      };
      if (existing) Storage.updatePipelineItem(existing.id, payload); else Storage.addPipelineItem(payload);
      UI.toast("Oportunidade salva.");
      m.close();
      AppState.set({});
    });
  }

  window.Views = window.Views || {};
  window.Views.pipeline = render;
})();
