// Metadados de categorias de despesa: grupo + cor (mesma taxonomia usada no ETL).
(function (global) {
  const GROUPS = {
    "FORNECEDORES": "Custo de Mercadorias",
    "IMPOSTOS": "Impostos",
    "BANCO": "Financeiro/Bancário",
    "CARTÃO DE CRÉDITO": "Financeiro/Bancário",
    "CONTABILIDADE": "Financeiro/Bancário",
    "MOVIMENTO": "Financeiro/Bancário",
    "MATERIAL DE ESCRITÓRIO": "Administrativo",
    "GASTOS FIXOS": "Administrativo",
    "MANUTENÇÃO": "Administrativo",
    "CONSUMO": "Administrativo",
    "INVESTIMENTO": "Administrativo",
    "FUNCIONÁRIOS": "Pessoal",
    "FUNCIONÁRIOS (VR)": "Pessoal",
    "SÓCIOS": "Pessoal",
    "PLANO DE SAÚDE": "Pessoal",
    "SEGURO DE VIDA SÓCIO": "Pessoal",
    "SEGURO SÓCIO CARRO": "Pessoal",
    "EMPRÉSTIMO CAPITAL DE GIRO BRADESCO": "Dívida/Empréstimos",
    "EMPRÉSTIMO CAPITAL DE GIRO ITAÚ": "Dívida/Empréstimos",
    "EMPRÉSTIMO PRONAMP": "Dívida/Empréstimos",
    "EMPRÉSTIMO FGI": "Dívida/Empréstimos",
    "SEGURO DE EMPRÉSTIMO": "Dívida/Empréstimos",
    "MARKETING": "Marketing & Vendas",
    "PUBLICIDADE": "Marketing & Vendas",
    "BRINDES": "Marketing & Vendas",
    "IMPORTAÇÃO": "Logística/Importação",
    "TRANSPORTES": "Logística/Importação",
    "TRANSPORTES IMPORTAÇÃO": "Logística/Importação",
    "DEVOLUÇÃO": "Outras",
    "INSUMOS": "Outras",
    "SERVIÇOS": "Outras",
    "OUTRAS DESPESAS": "Outras",
  };

  const GROUP_COLOR_VAR = {
    "Custo de Mercadorias": "--series-1",
    "Pessoal": "--series-2",
    "Dívida/Empréstimos": "--series-3",
    "Logística/Importação": "--series-4",
    "Financeiro/Bancário": "--series-5",
    "Administrativo": "--series-6",
    "Marketing & Vendas": "--series-7",
    "Impostos": "--series-8",
    "Outras": "--text-muted",
  };
  const GROUP_ORDER = ["Custo de Mercadorias", "Pessoal", "Dívida/Empréstimos", "Logística/Importação",
    "Financeiro/Bancário", "Administrativo", "Marketing & Vendas", "Impostos", "Outras"];

  function groupOf(categoria) { return GROUPS[categoria] || "Outras"; }
  function colorOf(categoria) {
    const g = groupOf(categoria);
    return Charts.cssVar(GROUP_COLOR_VAR[g] || "--text-muted", "#898781");
  }
  function groupColor(group) { return Charts.cssVar(GROUP_COLOR_VAR[group] || "--text-muted", "#898781"); }

  global.Categories = {
    GROUPS, GROUP_ORDER,
    list: Object.keys(GROUPS).sort(),
    groupOf, colorOf, groupColor,
  };
})(window);
