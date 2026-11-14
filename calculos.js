/* =====================================================
   Minhas Finanças — regras de cálculo (funções puras)
   Carregado antes de app.js no navegador e importado
   pelos testes em Node (tests/calculos.test.js).
   ===================================================== */

"use strict";

/* ---------- Constantes ---------- */

const CATEGORIAS_PADRAO = [
  "Alimentação", "Moradia", "Transporte", "Saúde", "Educação",
  "Lazer", "Assinaturas", "Vestuário", "Contas", "Outros",
];

const TIPOS_TRANSACAO = ["ganho", "despesa", "investimento"];

const FORMAS_PAGAMENTO = { debito: "Débito", credito: "Cartão de crédito", pix: "PIX" };

const PARCELAS_MAX = 12;

/** Prefixo da chave do Gemini que chegou a ser publicada no código; é descartada dos dados salvos. */
const PREFIXO_CHAVE_VAZADA = "AQ.Ab8RN6LS";

function dadosIniciais() {
  return {
    transacoes: [], // {id, tipo, descricao, valor, data:"YYYY-MM-DD", categoria?, ativo?, rendimentoMensal?, resgate?, formaPagamento?, parcelamentoId?, parcelaAtual?, parcelaTotal?, salarioAuto?, salarioEditado?}
    config: {
      salario: 0,
      diaSalario: 5,
      mesInicioSalario: null, // "YYYY-MM" do mês em que o salário foi configurado
      mesesFechados: [], // meses encerrados pelo usuário ("YYYY-MM")
      salarioMesesIgnorados: [], // meses em que o usuário excluiu o salário automático
      categorias: [...CATEGORIAS_PADRAO],
      geminiApiKey: "",
    },
  };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Datas ---------- */

function pad2(n) { return String(n).padStart(2, "0"); }

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function mesDe(dataISO) { return dataISO.slice(0, 7); } // "YYYY-MM"

function dataValida(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function mesValido(s) {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

function proximoMes(mesISO) {
  const [a, m] = mesISO.split("-").map(Number);
  const d = new Date(a, m, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Array de meses "YYYY-MM" terminando no mês base (inclusive). */
function mesesAtras(n, base) {
  const [ano, mes] = base.split("-").map(Number);
  const lista = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ano, mes - 1 - i, 1);
    lista.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  return lista;
}

/** Lista meses consecutivos de inicioISO até fimISO (inclusive). */
function mesesDeAte(inicioISO, fimISO) {
  const lista = [];
  for (let m = inicioISO; m <= fimISO; m = proximoMes(m)) lista.push(m);
  return lista;
}

/** Soma n meses a uma data ISO, mantendo o dia (ajustado ao último dia do mês, se necessário). */
function adicionarMeses(dataISO, n) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const alvo = new Date(ano, mes - 1 + n, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return `${alvo.getFullYear()}-${pad2(alvo.getMonth() + 1)}-${pad2(Math.min(dia, ultimoDia))}`;
}

/** Meses completos entre duas datas (YYYY-MM-DD), considerando apenas ano e mês. */
function mesesEntre(dataInicioISO, dataFimISO) {
  const [a1, m1] = dataInicioISO.split("-").map(Number);
  const [a2, m2] = dataFimISO.split("-").map(Number);
  return Math.max(0, (a2 - a1) * 12 + (m2 - m1));
}

function limitarDiaSalario(v) {
  return Math.min(28, Math.max(1, parseInt(v, 10) || 5));
}

/* ---------- Texto ---------- */

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Célula CSV: números em formato pt-BR; textos entre aspas quando preciso e protegidos contra fórmulas. */
function celulaCSV(v) {
  if (typeof v === "number") return v.toFixed(2).replace(".", ",");
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function linhaCSV(campos) {
  return campos.map(celulaCSV).join(";");
}

/* ---------- Resumos ---------- */

function valorInvestimento(t) {
  // resgate reduz o total investido
  return t.resgate ? -t.valor : t.valor;
}

function ehTransacaoSalario(t) {
  if (t.tipo !== "ganho") return false;
  if (t.salarioAuto) return true;
  return /sal[aá]rio/i.test(t.descricao || "") || /sal[aá]rio/i.test(t.categoria || "");
}

function transacoesDoMes(transacoes, mesISO) {
  return transacoes.filter((t) => mesDe(t.data) === mesISO);
}

function resumoDoMes(transacoes, mesISO) {
  const txs = transacoesDoMes(transacoes, mesISO);
  let ganhos = 0, despesas = 0, investido = 0, salario = 0;
  for (const t of txs) {
    if (t.tipo === "ganho") {
      ganhos += t.valor;
      if (ehTransacaoSalario(t)) salario += t.valor;
    } else if (t.tipo === "despesa") {
      despesas += t.valor;
    } else if (t.tipo === "investimento") {
      investido += valorInvestimento(t);
    }
  }
  return {
    ganhos,
    salario,
    outrosGanhos: ganhos - salario,
    despesas,
    investido,
    saldo: ganhos - despesas - investido,
    qtd: txs.length,
  };
}

function despesasPorCategoria(transacoes, meses) {
  const mapa = {};
  for (const t of transacoes) {
    if (t.tipo !== "despesa" || !meses.includes(mesDe(t.data))) continue;
    const cat = t.categoria || "Outros";
    mapa[cat] = (mapa[cat] || 0) + t.valor;
  }
  return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
}

/** % dos ganhos que foi investida ou sobrou; null quando não houve ganhos. */
function taxaPoupanca(r) {
  return r.ganhos > 0 ? ((r.investido + Math.max(0, r.saldo)) / r.ganhos) * 100 : null;
}

/* ---------- Carteira de investimentos ---------- */

function chaveProjeto(t) {
  return (t.descricao || "").trim() || "Sem descrição";
}

/**
 * Posição da carteira em dataRef. Cada projeto (agrupado pela descrição) é
 * simulado em ordem cronológica com juros compostos mensais pela taxa do
 * aporte mais recente: o saldo rende entre um evento e outro, aportes somam
 * e resgates subtraem. Lançamentos posteriores a dataRef são ignorados.
 */
function posicaoCarteira(transacoes, dataRef) {
  const grupos = new Map();
  for (const t of transacoes) {
    if (t.tipo !== "investimento" || t.data > dataRef) continue;
    const chave = chaveProjeto(t);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(t);
  }

  const projetos = [];
  for (const [descricao, txs] of grupos) {
    txs.sort((a, b) => a.data.localeCompare(b.data));

    let ativo = "Outros", taxa = 0;
    for (const t of txs) {
      if (t.resgate) continue;
      if (t.ativo) ativo = t.ativo;
      const r = Number(t.rendimentoMensal);
      if (t.rendimentoMensal != null && Number.isFinite(r) && r >= 0) taxa = r;
    }

    const fator = 1 + taxa / 100;
    let saldo = 0, aportado = 0, ultimaData = txs[0].data;
    for (const t of txs) {
      saldo *= Math.pow(fator, mesesEntre(ultimaData, t.data));
      ultimaData = t.data;
      if (t.resgate) {
        saldo = Math.max(0, saldo - t.valor);
        aportado -= t.valor;
      } else {
        saldo += t.valor;
        aportado += t.valor;
      }
    }
    saldo *= Math.pow(fator, mesesEntre(ultimaData, dataRef));
    if (saldo <= 0.005) continue;

    projetos.push({
      descricao,
      ativo,
      data: ultimaData,
      aportado,
      saldoAtual: saldo,
      rendimentoAcumulado: saldo - aportado,
      taxa,
      rendimentoMes: saldo * (taxa / 100),
    });
  }

  projetos.sort((a, b) => b.saldoAtual - a.saldoAtual);
  return {
    projetos,
    total: projetos.reduce((s, p) => s + p.saldoAtual, 0),
    aportado: projetos.reduce((s, p) => s + p.aportado, 0),
    rendimentoTotal: projetos.reduce((s, p) => s + p.rendimentoAcumulado, 0),
    rendimentoMesTotal: projetos.reduce((s, p) => s + p.rendimentoMes, 0),
  };
}

/* ---------- Salário automático ---------- */

/**
 * Lança o salário automático nos meses de mesInicioSalario até ateMes que
 * ainda não o têm, exceto meses fechados e meses em que o usuário o excluiu.
 * Retorna true se algo foi lançado.
 */
function sincronizarSalarios(dados, ateMes) {
  const { salario, diaSalario, mesInicioSalario } = dados.config;
  const fechados = dados.config.mesesFechados || [];
  const ignorados = dados.config.salarioMesesIgnorados || [];
  if (!(salario > 0) || !mesInicioSalario || ateMes < mesInicioSalario) return false;

  const dia = pad2(limitarDiaSalario(diaSalario));
  const jaLancados = new Set(dados.transacoes.filter((t) => t.salarioAuto).map((t) => mesDe(t.data)));
  let alterou = false;

  for (const mes of mesesDeAte(mesInicioSalario, ateMes)) {
    if (jaLancados.has(mes) || fechados.includes(mes) || ignorados.includes(mes)) continue;
    dados.transacoes.push({
      id: uid(),
      tipo: "ganho",
      descricao: "Salário",
      valor: salario,
      data: `${mes}-${dia}`,
      categoria: "Salário",
      salarioAuto: true,
    });
    alterou = true;
  }
  return alterou;
}

/**
 * Aplica um novo valor/dia de salário aos lançamentos automáticos do mês
 * atual em diante, em meses abertos e não editados manualmente. Com salário
 * zerado, esses lançamentos são removidos. Meses passados não mudam.
 */
function aplicarMudancaSalario(dados, mesHoje) {
  const { salario, diaSalario } = dados.config;
  const fechados = dados.config.mesesFechados || [];
  const afetado = (t) =>
    t.salarioAuto && !t.salarioEditado && mesDe(t.data) >= mesHoje && !fechados.includes(mesDe(t.data));

  if (!(salario > 0)) {
    dados.transacoes = dados.transacoes.filter((t) => !afetado(t));
    return;
  }
  const dia = pad2(limitarDiaSalario(diaSalario));
  for (const t of dados.transacoes) {
    if (!afetado(t)) continue;
    t.valor = salario;
    t.data = `${mesDe(t.data)}-${dia}`;
  }
}

/* ---------- Parcelamento ---------- */

/** Divide uma despesa em n parcelas mensais; a última absorve o arredondamento. */
function gerarParcelas(base, n) {
  const valorParcela = Math.floor((base.valor / n) * 100) / 100;
  const ultima = +(base.valor - valorParcela * (n - 1)).toFixed(2);
  const parcelamentoId = uid();
  return Array.from({ length: n }, (_, k) => ({
    ...base,
    id: uid(),
    descricao: `${base.descricao} (${k + 1}/${n})`,
    valor: k === n - 1 ? ultima : valorParcela,
    data: adicionarMeses(base.data, k),
    parcelamentoId,
    parcelaAtual: k + 1,
    parcelaTotal: n,
  }));
}

/* ---------- Validação de dados (localStorage e backups) ---------- */

const RE_ID = /^[a-z0-9]{1,40}$/i;

function textoLimpo(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function listaMeses(v) {
  return Array.isArray(v) ? [...new Set(v.filter(mesValido))].sort() : [];
}

function sanitizarTransacao(t, idsUsados) {
  if (!t || typeof t !== "object" || !TIPOS_TRANSACAO.includes(t.tipo)) return null;
  const valor = Number(t.valor);
  if (!Number.isFinite(valor) || valor <= 0 || !dataValida(t.data)) return null;

  const id = typeof t.id === "string" && RE_ID.test(t.id) && !idsUsados.has(t.id) ? t.id : uid();
  idsUsados.add(id);

  const tx = {
    id,
    tipo: t.tipo,
    descricao: textoLimpo(t.descricao, 200) || "Lançamento",
    valor: Math.round(valor * 100) / 100,
    data: t.data,
  };
  const categoria = textoLimpo(t.categoria, 60);
  if (categoria) tx.categoria = categoria;

  if (t.tipo === "despesa") {
    tx.formaPagamento = Object.hasOwn(FORMAS_PAGAMENTO, t.formaPagamento) ? t.formaPagamento : "debito";
    const total = parseInt(t.parcelaTotal, 10);
    const atual = parseInt(t.parcelaAtual, 10);
    if (typeof t.parcelamentoId === "string" && RE_ID.test(t.parcelamentoId) &&
        total >= 2 && total <= PARCELAS_MAX && atual >= 1 && atual <= total) {
      tx.parcelamentoId = t.parcelamentoId;
      tx.parcelaAtual = atual;
      tx.parcelaTotal = total;
    }
  }
  if (t.tipo === "investimento") {
    const ativo = textoLimpo(t.ativo, 60);
    if (ativo) tx.ativo = ativo;
    tx.resgate = t.resgate === true;
    const r = Number(t.rendimentoMensal);
    if (t.rendimentoMensal != null && Number.isFinite(r) && r >= 0) tx.rendimentoMensal = r;
  }
  if (t.tipo === "ganho" && t.salarioAuto === true) {
    tx.salarioAuto = true;
    if (t.salarioEditado === true) tx.salarioEditado = true;
  }
  return tx;
}

function sanitizarConfig(c, transacoes) {
  const cfg = {};
  const salario = Number(c.salario);
  cfg.salario = Number.isFinite(salario) && salario > 0 ? Math.round(salario * 100) / 100 : 0;
  cfg.diaSalario = limitarDiaSalario(c.diaSalario);

  if (c.mesInicioSalario === undefined && c.salarioAuto) {
    // Migração do modelo antigo (checkbox "salarioAuto"): começa no primeiro mês já lançado
    const meses = transacoes.filter((t) => t.salarioAuto).map((t) => mesDe(t.data)).sort();
    cfg.mesInicioSalario = meses[0] || mesDe(hojeISO());
  } else {
    cfg.mesInicioSalario = mesValido(c.mesInicioSalario) ? c.mesInicioSalario : null;
  }
  if (!(cfg.salario > 0)) cfg.mesInicioSalario = null;

  cfg.mesesFechados = listaMeses(c.mesesFechados);
  cfg.salarioMesesIgnorados = listaMeses(c.salarioMesesIgnorados);

  const categorias = [];
  for (const cat of Array.isArray(c.categorias) ? c.categorias : []) {
    const nome = textoLimpo(cat, 40);
    if (nome && !categorias.some((x) => x.toLowerCase() === nome.toLowerCase())) categorias.push(nome);
  }
  cfg.categorias = categorias.length ? categorias : [...CATEGORIAS_PADRAO];

  const chave = textoLimpo(c.geminiApiKey, 200);
  cfg.geminiApiKey = chave.startsWith(PREFIXO_CHAVE_VAZADA) ? "" : chave;
  return cfg;
}

/**
 * Valida e normaliza dados vindos do localStorage ou de um backup.
 * Lança erro se a estrutura básica for inválida; transações inválidas são descartadas.
 */
function sanitizarDados(obj) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.transacoes) ||
      !obj.config || typeof obj.config !== "object") {
    throw new Error("estrutura inválida");
  }
  const ids = new Set();
  const transacoes = [];
  let descartadas = 0;
  for (const t of obj.transacoes) {
    const tx = sanitizarTransacao(t, ids);
    if (tx) transacoes.push(tx);
    else descartadas++;
  }
  return { dados: { transacoes, config: sanitizarConfig(obj.config, transacoes) }, descartadas };
}

/* ---------- IA ---------- */

/** Sanitiza a resposta da IA antes de aplicá-la ao formulário. */
function validarSugestaoIA(s, categorias, hoje) {
  s = s && typeof s === "object" ? s : {};
  const valor = Number(s.valor);
  if (!(valor > 0)) throw new Error("A IA não identificou um valor válido. Inclua o valor no texto.");

  const categoria = categorias.includes(s.categoria)
    ? s.categoria
    : categorias.includes("Outros") ? "Outros" : categorias[0] || "Outros";

  return {
    tipo: s.tipo === "ganho" ? "ganho" : "despesa",
    descricao: textoLimpo(s.descricao, 200) || "Lançamento",
    valor: +valor.toFixed(2),
    data: dataValida(s.data) ? s.data : hoje,
    categoria,
    formaPagamento: Object.hasOwn(FORMAS_PAGAMENTO, s.formaPagamento) ? s.formaPagamento : "debito",
    parcelas: Math.min(PARCELAS_MAX, Math.max(1, parseInt(s.parcelas, 10) || 1)),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CATEGORIAS_PADRAO, FORMAS_PAGAMENTO, PARCELAS_MAX, PREFIXO_CHAVE_VAZADA,
    dadosIniciais, uid,
    hojeISO, mesDe, dataValida, mesValido, proximoMes, mesesAtras, mesesDeAte, adicionarMeses, mesesEntre,
    limitarDiaSalario, escapeHTML, celulaCSV, linhaCSV,
    valorInvestimento, ehTransacaoSalario, transacoesDoMes, resumoDoMes, despesasPorCategoria, taxaPoupanca,
    chaveProjeto, posicaoCarteira,
    sincronizarSalarios, aplicarMudancaSalario, gerarParcelas,
    sanitizarDados, validarSugestaoIA,
  };
}
