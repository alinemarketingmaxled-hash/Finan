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

    container.appendChild(UI.sectionTitle("Exportar", "Baixe tudo (base do Excel + o que você adicionou) para guardar ou levar para outro computador"));
    container.appendChild(UI.h("div", { class: "grid grid-3" }, [
      actionCard("download", "Exportar backup (JSON)", "Inclui lançamentos manuais, metas, orçamento e configurações — use para restaurar depois ou mover de navegador.", "Baixar JSON", () => {
        download(`maxled-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(Storage.exportAll(), null, 2), "application/json");
        UI.toast("Backup exportado.");
      }),
      actionCard("fileText", "Exportar lançamentos (CSV)", "Base completa do Excel + lançamentos manuais, em uma planilha CSV para abrir no Excel/Sheets.", "Baixar CSV", () => {
        download(`maxled-lancamentos-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(Compute.allTransactions()), "text/csv");
        UI.toast("CSV exportado.");
      }),
      actionCard("printer", "Imprimir / salvar PDF", "Abre a página atual em modo de impressão, sem menus — ótimo para levar a uma reunião.", "Imprimir", () => window.print()),
    ]));

    container.appendChild(UI.sectionTitle("Importar", "Restaura um backup exportado anteriormente deste painel"));
    container.appendChild(importCard());

    container.appendChild(UI.sectionTitle("Zona de risco"));
    container.appendChild(resetCard());
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
