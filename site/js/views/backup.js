(function () {
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toCsv(rows) {
    if (!rows.length) return "";
    const cols = ["date", "division", "basis", "flow", "category", "counterparty", "value", "note"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.join(";")];
    rows.forEach((r) => lines.push(cols.map((c) => esc(r[c])).join(";")));
    return lines.join("\n");
  }

  function markBackedUp() {
    Storage.setConfig({ lastBackupAt: new Date().toISOString() });
  }

  // Uma planilha .xlsx só, com uma aba por tipo de dado -- tudo que existe
  // além da base original do Excel (lançamentos manuais já mesclados com a
  // base, metas, orçamento, categoria de clientes, previsões, acessos).
  async function buildWorkbook() {
    const wb = XLSX.utils.book_new();
    const addSheet = (name, rows) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet("Lançamentos", Compute.allTransactions().map((t) => ({
      Data: t.date, Divisão: t.division, Base: t.basis, Tipo: t.flow,
      Categoria: t.category || "", "Categoria do cliente": (t.flow === "entrada" || t.flow === "venda") ? (Compute.clienteCategoria(t.counterparty) || "") : "",
      Contraparte: t.counterparty || "", Valor: t.value, "Nota Fiscal": t.nota_fiscal || "",
      Observação: t.note || "", Origem: t.manual ? (t.origin === "import" ? "Importado" : "Manual") : "Excel (base)",
      Cancelado: t.cancelled ? "Sim" : "Não",
    })));

    addSheet("Metas", Storage.listMetas().map((m) => ({
      Título: m.title, Tipo: m.tipo, Divisão: m.divisao || "", "Valor alvo": m.targetValue,
      Prazo: m.targetDate || "", "Valor atual (personalizada)": m.currentValue ?? "", "Criada em": m.createdAt || "",
    })));

    addSheet("Orçamento", Storage.listOrcamento().map((o) => ({
      Divisão: o.division, Categoria: o.categoria, Limite: o.limite,
    })));

    addSheet("Categoria de clientes", Object.entries(Storage.getClienteCategorias()).map(([nome, categoria]) => ({
      Cliente: nome, Categoria: categoria,
    })));

    addSheet("Previsões", Storage.listPipeline().map((p) => ({
      Descrição: p.descricao, Tipo: p.tipo, Divisão: p.divisao, "Valor total": p.valor_total,
      Parcelas: p.parcelas, "Mês início": p.mes_inicio || "", Status: p.status, Observação: p.nota || "",
    })));

    const loginLog = await fetch("/api/login-log").then((r) => (r.ok ? r.json() : { log: [] })).then((d) => d.log || []).catch(() => []);
    addSheet("Histórico de acessos", loginLog.map((l) => ({
      Nome: l.name, "Data e hora": new Date(l.ts).toLocaleString("pt-BR"),
    })));

    return wb;
  }

  function render(container) {
    const manualCount = Storage.listLancamentos().length;
    const metasCount = Storage.listMetas().length;
    const orcCount = Storage.listOrcamento().length;

    container.appendChild(UI.h("div", { class: "grid grid-4" }, [
      UI.statTile({ label: "Lançamentos manuais", value: String(manualCount), foot: "Salvos neste navegador" }),
      UI.statTile({ label: "Metas cadastradas", value: String(metasCount) }),
      UI.statTile({ label: "Orçamentos definidos", value: String(orcCount) }),
      UI.statTile({ label: "Lançamentos da base Excel", value: Fmt.num(MAXLED_DATA.transactions.length), foot: "Somente leitura" }),
    ]));

    container.appendChild(backupReminderCard());

    container.appendChild(UI.sectionTitle("Exportar", "Baixe tudo (base do Excel + o que você adicionou) para guardar ou levar para outro computador"));
    container.appendChild(UI.h("div", { class: "grid grid-3" }, [
      actionCard("fileText", "Planilha completa (.xlsx)", "Uma aba por tipo de dado: lançamentos (base + manuais), metas, orçamento, categoria de clientes, previsões e histórico de acessos.", "Baixar planilha", async () => {
        XLSX.writeFile(await buildWorkbook(), `maxled-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
        markBackedUp();
        UI.toast("Planilha exportada.");
        AppState.set({});
      }),
      actionCard("download", "Backup técnico (JSON)", "O mesmo conteúdo, em formato pra restaurar depois pelo botão Importar abaixo (a planilha .xlsx é só leitura).", "Baixar JSON", () => {
        download(`maxled-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(Storage.exportAll(), null, 2), "application/json");
        markBackedUp();
        UI.toast("Backup exportado.");
        AppState.set({});
      }),
      actionCard("printer", "Imprimir / salvar PDF", "Abre a página atual em modo de impressão, sem menus — ótimo para levar a uma reunião.", "Imprimir", () => window.print()),
    ]));

    container.appendChild(UI.sectionTitle("Importar", "Restaura um backup exportado anteriormente deste painel"));
    container.appendChild(importCard());

    container.appendChild(UI.sectionTitle("Zona de risco"));
    container.appendChild(resetCard());
  }

  // Não tem como isso rodar sozinho todo dia: os dados só existem no
  // localStorage deste navegador, sem servidor nem banco de dados guardando
  // nada -- por isso o lembrete aqui é visual, não um backup automático de
  // verdade. Ver nota abaixo do card.
  function backupReminderCard() {
    const lastIso = Storage.getConfig().lastBackupAt;
    const days = lastIso ? Math.floor((Date.now() - new Date(lastIso).getTime()) / 86400000) : null;
    const kind = days === null || days >= 3 ? "warning" : days === 0 ? "good" : "neutral";
    const statusText = days === null ? "Nenhum backup exportado ainda neste navegador"
      : days === 0 ? "Backup exportado hoje"
      : days === 1 ? "Último backup: ontem"
      : `Último backup: há ${Fmt.num(days)} dias`;

    return UI.h("div", { class: "insight " + (kind === "good" ? "good" : kind === "warning" ? "warning" : "info"), style: "margin-bottom:20px;" }, [
      UI.h("div", { class: "insight-icon" }, [Icon("download", { size: 17 })]),
      UI.h("div", {}, [
        UI.h("div", { class: "insight-title" }, [statusText]),
        UI.h("div", { class: "insight-body" }, [
          "Esse painel não tem servidor nem banco de dados — os dados existem só no navegador de cada aparelho, então não tem como um backup rodar sozinho todo dia sem alguém abrir o site. " +
          "O mais próximo disso: exporte a planilha completa regularmente (ideal: sempre que mexer em algo importante). Se você quiser backup automático de verdade, precisa de um banco de dados no projeto — me avisa que eu configuro.",
        ]),
      ]),
    ]);
  }

  function actionCard(icon, title, body, btnLabel, onClick) {
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [btnLabel]);
    btn.addEventListener("click", onClick);
    return UI.h("div", { class: "card" }, [
      Icon(icon, { size: 20 }),
      UI.h("div", { style: "font-weight:700;font-size:13.5px;margin-top:10px;" }, [title]),
      UI.h("div", { style: "font-size:12px;color:var(--text-muted);margin:6px 0 14px;line-height:1.5;" }, [body]),
      btn,
    ]);
  }

  function importCard() {
    const fileInput = UI.h("input", { type: "file", accept: "application/json", style: "display:none;" });
    const btn = UI.h("button", { class: "btn btn-accent btn-sm" }, [Icon("upload", { size: 14 }), "Selecionar arquivo .json"]);
    btn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const ok = await UI.confirmDialog("Importar esse backup vai substituir seus lançamentos manuais, metas e orçamento salvos neste navegador. Continuar?");
      if (!ok) { fileInput.value = ""; return; }
      try {
        const text = await file.text();
        Storage.importAll(JSON.parse(text));
        UI.toast("Backup importado com sucesso.");
        AppState.set({});
      } catch (e) {
        UI.toast("Não foi possível ler esse arquivo.");
      }
      fileInput.value = "";
    });
    return UI.h("div", { class: "card", style: "display:flex;align-items:center;gap:14px;" }, [fileInput, btn,
      UI.h("span", { style: "font-size:12px;color:var(--text-muted);" }, ["Aceita apenas arquivos exportados por este painel."])]);
  }

  function resetCard() {
    const btn = UI.h("button", { class: "btn btn-danger btn-sm" }, [Icon("trash", { size: 14 }), "Apagar dados locais"]);
    btn.addEventListener("click", async () => {
      const ok = await UI.confirmDialog("Isso apaga lançamentos manuais, metas, orçamento e preferências salvas neste navegador. A base vinda do Excel não é afetada. Deseja continuar?");
      if (ok) { Storage.resetAll(); UI.toast("Dados locais apagados."); AppState.set({}); }
    });
    return UI.h("div", { class: "card" }, [
      UI.h("div", { style: "font-weight:700;font-size:13.5px;margin-bottom:6px;" }, ["Apagar tudo o que foi adicionado neste navegador"]),
      UI.h("div", { style: "font-size:12px;color:var(--text-muted);margin-bottom:14px;" }, ["Remove lançamentos manuais, metas, orçamento e notas estratégicas. A planilha original nunca é alterada — exporte um backup antes, se quiser guardar."]),
      btn,
    ]);
  }

  window.Views = window.Views || {};
  window.Views.backup = render;
})();
