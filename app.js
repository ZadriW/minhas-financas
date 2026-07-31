/* =====================================================
   Minhas Finanças — controle pessoal de despesas
   Dados salvos em localStorage (somente neste navegador)
   ===================================================== */

"use strict";

/* ---------- Estado e persistência ---------- */

const STORAGE_KEY = "financas.dados.v1";

const CATEGORIAS_PADRAO = [
  "Alimentação", "Moradia", "Transporte", "Saúde", "Educação",
  "Lazer", "Assinaturas", "Vestuário", "Contas", "Outros",
];

let dados = carregar();

/**
 * Migra configurações antigas de salário (checkbox "salarioAuto") para o novo
 * modelo: o salário passa a ser lançado automaticamente a partir do mês em
 * que o usuário o configurou (config.mesInicioSalario).
 */
function migrarConfigSalario(config, transacoes) {
  if (config.mesInicioSalario !== undefined) return false;

  if (config.salarioAuto) {
    const mesesAuto = transacoes
      .filter((t) => t.salarioAuto)
      .map((t) => mesDe(t.data))
      .sort();
    config.mesInicioSalario = mesesAuto.length ? mesesAuto[0] : mesDe(hojeISO());
  } else {
    config.mesInicioSalario = null;
  }
  delete config.salarioAuto;
  return true;
}

function carregar() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.transacoes) && d.config) {
        let alterou = migrarConfigSalario(d.config, d.transacoes);
        if (garantirMesesFechados(d.config)) alterou = true;
        if (alterou) localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
        return d;
      }
    }
  } catch (e) { /* dados corrompidos: recomeça */ }
  return {
    transacoes: [], // {id, tipo: ganho|despesa|investimento, descricao, valor, data:"YYYY-MM-DD", categoria?, ativo?, rendimentoMensal?, resgate?, salarioAuto?}
    config: {
      salario: 0,
      diaSalario: 5,
      mesInicioSalario: null, // "YYYY-MM" do mês em que o salário foi configurado
      mesesFechados: [], // meses encerrados manualmente pelo usuário ("YYYY-MM")
      categorias: [...CATEGORIAS_PADRAO],
    },
  };
}

function salvar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Utilitários ---------- */

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function moeda(v) { return fmtBRL.format(v || 0); }

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mesDe(dataISO) { return dataISO.slice(0, 7); } // "YYYY-MM"

function nomeMes(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function nomeMesCurto(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function mesAbrev(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const abrev = new Date(ano, mes - 1, dia || 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "")
    .trim();
  return abrev.charAt(0).toUpperCase() + abrev.slice(1);
}

function dataBR(dataISO) {
  const [a, m, d] = dataISO.split("-");
  return `${d}/${m}/${a}`;
}

function mesesAtras(n, base) {
  // Retorna array de meses "YYYY-MM" terminando no mês base (inclusive)
  const [ano, mes] = base.split("-").map(Number);
  const lista = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ano, mes - 1 - i, 1);
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return lista;
}

function proximoMes(mesISO) {
  const [a, m] = mesISO.split("-").map(Number);
  const d = new Date(a, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Soma n meses a uma data ISO, mantendo o dia (ajustado ao último dia do mês, se necessário). */
function adicionarMeses(dataISO, n) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const alvo = new Date(ano, mes - 1 + n, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const diaFinal = Math.min(dia, ultimoDia);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
}

const FORMAS_PAGAMENTO = { debito: "Débito", credito: "Cartão de crédito", pix: "PIX" };

function garantirMesesFechados(config) {
  if (!Array.isArray(config.mesesFechados)) {
    config.mesesFechados = [];
    return true;
  }
  return false;
}

function mesFechado(mesISO) {
  return Array.isArray(dados.config.mesesFechados) && dados.config.mesesFechados.includes(mesISO);
}

/** Limite superior para navegação com › (considera meses já fechados). */
function mesLimiteAvanco() {
  const mesHoje = mesDe(hojeISO());
  const fechados = dados.config.mesesFechados;
  if (!Array.isArray(fechados) || fechados.length === 0) return mesHoje;
  const ultimoFechado = fechados[fechados.length - 1];
  const mesAposUltimoFechado = proximoMes(ultimoFechado);
  return mesAposUltimoFechado > mesHoje ? mesAposUltimoFechado : mesHoje;
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
}

/* ---------- Salário automático ---------- */

/** Lista meses consecutivos de inicioISO até fimISO (inclusive). */
function mesesDeAte(inicioISO, fimISO) {
  if (fimISO < inicioISO) return [];
  const lista = [];
  let m = inicioISO;
  while (m <= fimISO) {
    lista.push(m);
    if (m === fimISO) break;
    m = proximoMes(m);
  }
  return lista;
}

/** Garante lançamento automático de salário em todos os meses elegíveis até ateMes. */
function garantirSalariosAutomaticos(ateMes) {
  const { salario, diaSalario, mesInicioSalario } = dados.config;
  if (!salario || salario <= 0) return;
  if (!mesInicioSalario) return;
  if (ateMes < mesInicioSalario) return;

  const dia = Math.min(Math.max(1, diaSalario || 5), 28);
  let alterou = false;

  for (const mesISO of mesesDeAte(mesInicioSalario, ateMes)) {
    const jaExiste = dados.transacoes.some(
      (t) => t.salarioAuto && mesDe(t.data) === mesISO
    );
    if (jaExiste) continue;

    dados.transacoes.push({
      id: uid(),
      tipo: "ganho",
      descricao: "Salário",
      valor: salario,
      data: `${mesISO}-${String(dia).padStart(2, "0")}`,
      categoria: "Salário",
      salarioAuto: true,
    });
    alterou = true;
  }

  if (alterou) salvar();
}

/* ---------- Cálculos ---------- */

function transacoesDoMes(mesISO) {
  return dados.transacoes.filter((t) => mesDe(t.data) === mesISO);
}

function valorInvestimento(t) {
  // resgate reduz o total investido
  return t.resgate ? -t.valor : t.valor;
}

function ehTransacaoSalario(t) {
  if (t.tipo !== "ganho") return false;
  if (t.salarioAuto) return true;
  if (/sal[aá]rio/i.test(t.descricao || "")) return true;
  if (/sal[aá]rio/i.test(t.categoria || "")) return true;
  return false;
}

function resumoDoMes(mesISO) {
  const txs = transacoesDoMes(mesISO);
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
  const outrosGanhos = ganhos - salario;
  return {
    ganhos,
    salario,
    salarioMes: salario,
    outrosGanhos,
    despesas,
    investido,
    saldo: ganhos - despesas - investido,
    qtd: txs.length,
  };
}

function despesasPorCategoria(meses) {
  const mapa = {};
  for (const t of dados.transacoes) {
    if (t.tipo !== "despesa") continue;
    if (!meses.includes(mesDe(t.data))) continue;
    const cat = t.categoria || "Outros";
    mapa[cat] = (mapa[cat] || 0) + t.valor;
  }
  return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
}

function investimentoPorAtivo() {
  const mapa = {};
  for (const t of dados.transacoes) {
    if (t.tipo !== "investimento") continue;
    const chave = (t.descricao || "").trim() || "Sem descrição";
    mapa[chave] = (mapa[chave] || 0) + valorInvestimento(t);
  }
  return Object.entries(mapa).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
}

/** Meses completos entre duas datas (YYYY-MM-DD). */
function mesesEntre(dataInicioISO, dataFimISO) {
  const [a1, m1] = dataInicioISO.split("-").map(Number);
  const [a2, m2] = dataFimISO.split("-").map(Number);
  return Math.max(0, (a2 - a1) * 12 + (m2 - m1));
}

/** Data de referência para cálculos da carteira (mês selecionado ou hoje). */
function dataRefCarteira() {
  const hoje = hojeISO();
  const mesHoje = mesDe(hoje);
  if (mesSelecionado > mesHoje) return `${mesSelecionado}-01`;
  if (mesSelecionado === mesHoje) return hoje;
  const [a, m] = mesSelecionado.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${mesSelecionado}-${String(ultimo).padStart(2, "0")}`;
}

/** Rendimentos acumulados (juros compostos) com base na % ao mês informada. */
function rendimentosRecebidosAcumulados() {
  const ref = dataRefCarteira();
  let total = 0;
  for (const t of dados.transacoes) {
    if (t.tipo !== "investimento" || t.resgate) continue;
    const taxa = Number(t.rendimentoMensal);
    if (!taxa || taxa <= 0) continue;
    const meses = mesesEntre(t.data, ref);
    if (meses <= 0) continue;
    total += t.valor * (Math.pow(1 + taxa / 100, meses) - 1);
  }
  return total;
}

/** Rendimento mensal estimado (R$) com base no saldo líquido de cada projeto e na % ao mês. */
function rendimentoEstimadoMensal() {
  return carteiraProjetos().reduce((s, p) => s + p.rendimento, 0);
}

/** Projetos da carteira (mesma ordem/cores do gráfico de distribuição). */
function carteiraProjetos() {
  const projetos = {};
  for (const t of dados.transacoes) {
    if (t.tipo !== "investimento") continue;
    const chave = (t.descricao || "").trim() || "Sem descrição";
    if (!projetos[chave]) {
      projetos[chave] = {
        descricao: chave,
        ativo: t.ativo || "Outros",
        data: t.data,
        saldo: 0,
        taxa: 0,
        ids: [],
      };
    }
    const p = projetos[chave];
    p.saldo += valorInvestimento(t);
    p.ids.push(t.id);
    if (t.data > p.data) p.data = t.data;
    if (!t.resgate) {
      if (t.ativo) p.ativo = t.ativo;
      if (t.rendimentoMensal != null && !Number.isNaN(Number(t.rendimentoMensal))) {
        p.taxa = Number(t.rendimentoMensal);
      }
    }
  }

  return Object.values(projetos)
    .filter((p) => p.saldo > 0.005)
    .sort((a, b) => b.saldo - a.saldo)
    .map((p, i) => ({
      ...p,
      cor: CORES[i % CORES.length],
      rendimento: p.saldo * (p.taxa / 100),
    }));
}

/* ---------- Estado da interface ---------- */

let mesSelecionado = mesDe(hojeISO());
let secaoAtiva = "dashboard";
const charts = {}; // instâncias Chart.js por id de canvas

const TITULOS = {
  dashboard: "Dashboard",
  transacoes: "Transações",
  investimentos: "Investimentos",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
};

const CORES = ["#4f7cff", "#2ecc8f", "#ff5c74", "#f5b545", "#a06bff", "#3fd0d4", "#ff8f5c", "#7f8fb3", "#e05cff", "#9fd45c"];

/* ---------- Navegação ---------- */

function irPara(secao) {
  secaoAtiva = secao;
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.section === secao)
  );
  document.querySelectorAll(".section").forEach((s) =>
    s.classList.toggle("active", s.id === `section-${secao}`)
  );
  document.getElementById("section-title").textContent = TITULOS[secao];
  renderizar();
}

/* ---------- Gráficos ---------- */

function desenharGrafico(canvasId, config) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, config);
}

const chartDefaults = {
  color: "#8b95ab",
  borderColor: "#2a3550",
};
Chart.defaults.color = chartDefaults.color;
Chart.defaults.borderColor = chartDefaults.borderColor;
Chart.defaults.font.family = "'Inter', sans-serif";

/** Plugin genérico para desenhar um texto (e subtexto) no centro de gráficos doughnut. */
const centerTextPlugin = {
  id: "centerText",
  afterDraw(chart, _args, opts) {
    if (!opts || !opts.text) return;
    const { ctx, chartArea } = chart;
    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = opts.color || "#e8ecf5";
    ctx.font = `800 ${opts.fontSize || 22}px 'Inter', sans-serif`;
    ctx.fillText(opts.text, centerX, centerY - (opts.subtext ? 11 : 0));
    if (opts.subtext) {
      ctx.font = `600 ${opts.subFontSize || 12}px 'Inter', sans-serif`;
      ctx.fillStyle = opts.subColor || "#8b95ab";
      ctx.fillText(opts.subtext, centerX, centerY + 13);
    }
    ctx.restore();
  },
};
Chart.register(centerTextPlugin);

function tooltipMoeda() {
  return {
    callbacks: {
      label: (ctx) => `${ctx.dataset.label ? ctx.dataset.label + ": " : ""}${moeda(ctx.parsed.y ?? ctx.parsed)}`,
    },
  };
}

function graficoInvestimentosPorAtivo(canvasId, entradas, msgVazio) {
  const total = entradas.reduce((s, [, v]) => s + v, 0);
  const mobile = window.matchMedia("(max-width: 800px)").matches;
  const cutout = mobile ? "72%" : "62%";
  const centerText = {
    text: moeda(total),
    subtext: "investido total",
    color: "#a06bff",
    ...(mobile && { fontSize: 19, subFontSize: 11 }),
  };

  if (!entradas.length) {
    desenharGrafico(canvasId, {
      type: "doughnut",
      data: { labels: [msgVazio], datasets: [{ data: [1], backgroundColor: ["#2a3550"], borderWidth: 0 }] },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          centerText: { ...centerText, text: moeda(0) },
        },
        cutout: mobile ? "74%" : "68%",
        layout: mobile ? { padding: { top: 8, bottom: 4 } } : {},
        responsive: true,
        maintainAspectRatio: false,
      },
    });
    return;
  }

  desenharGrafico(canvasId, {
    type: "doughnut",
    data: {
      labels: entradas.map(([k]) => k),
      datasets: [{
        data: entradas.map(([, v]) => v),
        backgroundColor: entradas.map((_, i) => CORES[i % CORES.length]),
        borderWidth: 2,
        borderColor: "#1a2236",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout,
      layout: mobile ? { padding: { top: 8, bottom: 4 } } : {},
      plugins: {
        legend: opcoesLegendaRosca(total, mobile),
        tooltip: tooltipMoeda(),
        centerText,
      },
    },
  });
}

/**
 * Gráfico de despesas por categoria do Dashboard: mostra o total gasto no
 * centro do círculo e, em cada item da legenda, a porcentagem e o valor
 * gasto naquela categoria.
 */
function opcoesLegendaRosca(total, mobile) {
  const generateLabels = (chart) => {
    const { labels, datasets } = chart.data;
    const cores = datasets[0].backgroundColor;
    return labels.map((label, i) => {
      const valor = datasets[0].data[i];
      const pct = total > 0 ? (valor / total) * 100 : 0;
      return {
        text: `${label}  ·  ${pct.toFixed(0)}%  ·  ${moeda(valor)}`,
        fillStyle: cores[i],
        strokeStyle: cores[i],
        fontColor: "#ffffff",
        hidden: false,
        index: i,
      };
    });
  };

  if (mobile) {
    return {
      position: "bottom",
      align: "center",
      labels: {
        boxWidth: 10,
        padding: 10,
        color: "#ffffff",
        font: { size: 11 },
        generateLabels,
      },
    };
  }

  return {
    position: "right",
    labels: {
      boxWidth: 12,
      padding: 14,
      color: "#ffffff",
      font: { size: 13 },
      generateLabels,
    },
  };
}

function graficoCategoriasDashboard(canvasId, entradas, msgVazio) {
  const total = entradas.reduce((s, [, v]) => s + v, 0);
  const mobile = window.matchMedia("(max-width: 800px)").matches;
  const cutout = mobile ? "72%" : "62%";
  const centerText = {
    text: moeda(total),
    subtext: "gasto total",
    color: "#ff5c74",
    ...(mobile && { fontSize: 19, subFontSize: 11 }),
  };

  if (!entradas.length) {
    desenharGrafico(canvasId, {
      type: "doughnut",
      data: { labels: [msgVazio], datasets: [{ data: [1], backgroundColor: ["#2a3550"], borderWidth: 0 }] },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          centerText: { ...centerText, text: moeda(0) },
        },
        cutout: mobile ? "74%" : "68%",
        layout: mobile ? { padding: { top: 8, bottom: 4 } } : {},
        responsive: true,
        maintainAspectRatio: false,
      },
    });
    return;
  }

  desenharGrafico(canvasId, {
    type: "doughnut",
    data: {
      labels: entradas.map(([k]) => k),
      datasets: [{
        data: entradas.map(([, v]) => v),
        backgroundColor: entradas.map((_, i) => CORES[i % CORES.length]),
        borderWidth: 2,
        borderColor: "#1a2236",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout,
      layout: mobile ? { padding: { top: 8, bottom: 4 } } : {},
      plugins: {
        legend: opcoesLegendaRosca(total, mobile),
        tooltip: tooltipMoeda(),
        centerText,
      },
    },
  });
}

/** Gráfico de despesas por categoria em barras horizontais (% do total). */
function graficoCategoriasPercentual(containerId, entradas, msgVazio) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Remove instância Chart.js antiga, se existir (migração do gráfico circular)
  if (charts["chart-rel-categorias"]) {
    charts["chart-rel-categorias"].destroy();
    delete charts["chart-rel-categorias"];
  }

  const total = entradas.reduce((s, [, v]) => s + v, 0);
  if (!entradas.length) {
    el.innerHTML = `<div class="cat-bars-empty">${escapeHTML(msgVazio)}</div>`;
    return;
  }

  el.innerHTML = entradas.map(([cat, valor], i) => {
    const pct = total > 0 ? (valor / total) * 100 : 0;
    const cor = CORES[i % CORES.length];
    return `<div class="cat-bar-row">
      <div class="cat-bar-header">
        <span class="cat-bar-name">${escapeHTML(cat)}</span>
        <span class="cat-bar-meta">${pct.toFixed(0)}% · ${moeda(valor)}</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${pct.toFixed(1)}%;background:${cor}"></div>
      </div>
    </div>`;
  }).join("");
}

/* ---------- Renderização: Dashboard ---------- */

function linhaTransacaoHTML(t, comAcoes) {
  const tagTipo = { ganho: "tag-ganho", despesa: "tag-despesa", investimento: "tag-invest" }[t.tipo];
  const nomeTipo = { ganho: "Ganho", despesa: "Despesa", investimento: t.resgate ? "Resgate" : "Investimento" }[t.tipo];
  const cat = t.tipo === "investimento" ? (t.ativo || "—") : (t.categoria || "—");
  const classeValor = t.tipo === "ganho" ? "positive" : t.tipo === "despesa" ? "negative" : "invest";
  const sinal = t.tipo === "ganho" ? "+" : t.tipo === "investimento" && t.resgate ? "+" : "−";

  let extraTags = "";
  if (t.tipo === "despesa" && t.formaPagamento && t.formaPagamento !== "debito") {
    extraTags += `<span class="tag tag-categoria">${escapeHTML(FORMAS_PAGAMENTO[t.formaPagamento] || "")}</span>`;
  }
  if (t.parcelaTotal > 1) {
    extraTags += `<span class="tag tag-categoria">${t.parcelaAtual}/${t.parcelaTotal}</span>`;
  }
  const acoes = comAcoes
    ? `<td class="right">
         <button class="btn btn-ghost btn-icon" data-editar="${t.id}" title="Editar">
           <i class="fa-solid fa-pen" aria-hidden="true"></i>
         </button>
         <button class="btn btn-ghost btn-icon" data-excluir="${t.id}" title="Excluir">
           <i class="fa-solid fa-trash" aria-hidden="true"></i>
         </button>
       </td>`
    : "";
  return `<tr>
    <td>${dataBR(t.data)}</td>
    <td>${escapeHTML(t.descricao)}</td>
    <td><span class="tag tag-categoria">${escapeHTML(cat)}</span>${extraTags}</td>
    <td><span class="tag ${tagTipo}">${nomeTipo}</span></td>
    <td class="right ${classeValor}">${sinal} ${moeda(t.valor)}</td>
    ${acoes}
  </tr>`;
}

function linhaTransacaoMobileHTML(t) {
  const cat = t.tipo === "investimento" ? (t.ativo || "—") : (t.categoria || "—");
  const classeValor = t.tipo === "ganho" ? "positive" : t.tipo === "despesa" ? "negative" : "invest";
  const sinal = t.tipo === "ganho" ? "+" : t.tipo === "investimento" && t.resgate ? "+" : "−";
  let meta = `${escapeHTML(cat)} · ${escapeHTML(diaMesAbreviado(t.data))}`;
  if (t.tipo === "despesa" && t.formaPagamento && t.formaPagamento !== "debito") {
    meta += ` · ${escapeHTML(FORMAS_PAGAMENTO[t.formaPagamento])}`;
  }
  if (t.parcelaTotal > 1) {
    meta += ` · ${t.parcelaAtual}/${t.parcelaTotal}`;
  }
  return `<div class="tx-mobile-item">
    <div class="tx-icon tx-${t.tipo}">${iconeTransacao(t)}</div>
    <div class="tx-mobile-info">
      <div class="tx-desc">${escapeHTML(t.descricao)}</div>
      <div class="tx-meta">${meta}</div>
    </div>
    <div class="tx-valor ${classeValor}">${sinal} ${moeda(t.valor)}</div>
    <div class="tx-mobile-acoes">
      <button class="btn btn-ghost btn-icon" data-editar="${t.id}" title="Editar">
        <i class="fa-solid fa-pen" aria-hidden="true"></i>
      </button>
      <button class="btn btn-ghost btn-icon" data-excluir="${t.id}" title="Excluir">
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
      </button>
    </div>
  </div>`;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const ICONES_DESPESA = {
  Transporte: "fa-solid fa-car",
  Contas: "fa-solid fa-rectangle-list",
  Lazer: "fa-solid fa-face-laugh",
  Alimentação: "fa-solid fa-burger",
  Saúde: "fa-solid fa-plus",
  Assinaturas: "fa-solid fa-pen",
  Vestuário: "fa-solid fa-shirt",
  Outros: "fa-solid fa-chart-pie",
};

function iconeTransacao(t) {
  if (t.tipo === "ganho") {
    const fa = ehTransacaoSalario(t) ? "fa-solid fa-money-bill" : "fa-solid fa-sack-dollar";
    return `<i class="${fa}" aria-hidden="true"></i>`;
  }
  if (t.tipo === "despesa") {
    const fa = ICONES_DESPESA[t.categoria];
    return fa ? `<i class="${fa}" aria-hidden="true"></i>` : "🧾";
  }
  if (t.tipo === "investimento") {
    return t.resgate
      ? "↩️"
      : `<i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i>`;
  }
  return "•";
}

function diaMesAbreviado(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const mesAbrev = new Date(ano, mes - 1, dia)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");
  return `${dia} de ${mesAbrev}`;
}

function linhaTransacaoResumoHTML(t) {
  const cat = t.tipo === "investimento" ? (t.ativo || "—") : (t.categoria || "—");
  const classeValor = t.tipo === "ganho" ? "positive" : t.tipo === "despesa" ? "negative" : "invest";
  const sinal = t.tipo === "ganho" ? "+" : t.tipo === "investimento" && t.resgate ? "+" : "−";
  return `<div class="tx-item">
    <div class="tx-icon tx-${t.tipo}">${iconeTransacao(t)}</div>
    <div class="tx-info">
      <div class="tx-desc">${escapeHTML(t.descricao)}</div>
      <div class="tx-meta">${escapeHTML(cat)} · ${diaMesAbreviado(t.data)}</div>
    </div>
    <div class="tx-valor ${classeValor}">${sinal} ${moeda(t.valor)}</div>
  </div>`;
}

function renderDashboard() {
  const r = resumoDoMes(mesSelecionado);

  document.getElementById("stat-salario").textContent = moeda(r.salario);
  document.getElementById("stat-salario-sub").textContent = dados.config.mesInicioSalario
    ? `renda fixa / ${nomeMes(dados.config.mesInicioSalario)}`
    : "não configurado — defina em Configurações";

  document.getElementById("stat-ganhos").textContent = moeda(r.ganhos);
  document.getElementById("stat-ganhos-sub").textContent =
    r.salarioMes > 0 ? `${moeda(r.salarioMes)} de salário` : "incluindo salário";
  document.getElementById("stat-despesas").textContent = moeda(r.despesas);
  document.getElementById("stat-despesas-sub").textContent =
    r.ganhos > 0 ? `${((r.despesas / r.ganhos) * 100).toFixed(0)}% da renda` : "\u00a0";
  document.getElementById("stat-investido").textContent = moeda(r.investido);
  document.getElementById("stat-investido-sub").textContent =
    r.ganhos > 0 ? `${((r.investido / r.ganhos) * 100).toFixed(0)}% dos ganhos` : "\u00a0";

  const elSaldo = document.getElementById("stat-saldo");
  elSaldo.textContent = moeda(r.saldo);
  elSaldo.className = "stat-value " + (r.saldo >= 0 ? "positive" : "negative");

  const elBadge = document.getElementById("stat-saldo-badge");
  const positivo = r.saldo >= 0;
  elBadge.textContent = positivo ? "Positivo" : "Negativo";
  elBadge.className = "stat-badge " + (positivo ? "positive" : "negative");

  document.getElementById("dash-mes-label").textContent = nomeMes(mesSelecionado);

  graficoCategoriasDashboard("chart-categorias", despesasPorCategoria([mesSelecionado]), "Sem despesas no mês");

  const ultimas = transacoesDoMes(mesSelecionado)
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 8);
  document.getElementById("dash-ultimas").innerHTML =
    ultimas.length
      ? ultimas.map(linhaTransacaoResumoHTML).join("")
      : `<div class="tx-empty">Nenhuma transação neste mês</div>`;
}

/* ---------- Renderização: Transações ---------- */

function renderTransacoes() {
  const tipo = document.getElementById("filtro-tipo").value;
  const categoria = document.getElementById("filtro-categoria").value;
  const busca = document.getElementById("filtro-busca").value.trim().toLowerCase();

  let txs = transacoesDoMes(mesSelecionado);
  if (tipo) txs = txs.filter((t) => t.tipo === tipo);
  if (categoria) txs = txs.filter((t) => (t.categoria || t.ativo) === categoria);
  if (busca) txs = txs.filter((t) => t.descricao.toLowerCase().includes(busca));
  txs.sort((a, b) => b.data.localeCompare(a.data));

  const corpo = document.getElementById("tabela-transacoes");
  const listaMobile = document.getElementById("transacoes-lista-mobile");
  corpo.innerHTML = txs.map((t) => linhaTransacaoHTML(t, true)).join("");
  listaMobile.innerHTML = txs.length
    ? txs.map(linhaTransacaoMobileHTML).join("")
    : "";
  document.getElementById("transacoes-vazio").classList.toggle("hidden", txs.length > 0);

  const total = txs.reduce((s, t) => {
    if (t.tipo === "ganho") return s + t.valor;
    if (t.tipo === "despesa") return s - t.valor;
    return s - valorInvestimento(t);
  }, 0);
  document.getElementById("transacoes-resumo").textContent =
    txs.length ? `${txs.length} transação(ões) · efeito no saldo: ${moeda(total)}` : "";
}

function preencherFiltroCategorias() {
  const sel = document.getElementById("filtro-categoria");
  const atual = sel.value;
  const cats = new Set(dados.config.categorias);
  for (const t of dados.transacoes) {
    if (t.categoria) cats.add(t.categoria);
    if (t.ativo) cats.add(t.ativo);
  }
  sel.innerHTML =
    '<option value="">Todas as categorias</option>' +
    [...cats].sort().map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
  sel.value = atual;
}

/* ---------- Renderização: Investimentos ---------- */

function renderInvestimentos() {
  const todas = dados.transacoes.filter((t) => t.tipo === "investimento");
  const totalAcumulado = todas.reduce((s, t) => s + valorInvestimento(t), 0);
  const rMes = resumoDoMes(mesSelecionado);
  const rendimentosRecebidos = rendimentosRecebidosAcumulados();

  document.getElementById("inv-total").textContent = moeda(totalAcumulado + rendimentosRecebidos);
  document.getElementById("inv-mes").textContent = moeda(rMes.investido);
  document.getElementById("inv-mes-sub").textContent = nomeMes(mesSelecionado);
  document.getElementById("inv-rendimentos-recebidos").textContent = moeda(rendimentosRecebidos);
  document.getElementById("inv-rendimento").textContent = moeda(rendimentoEstimadoMensal());

  graficoInvestimentosPorAtivo("chart-inv-tipos", investimentoPorAtivo(), "Sem investimentos");

  const carteira = carteiraProjetos();
  const elCarteira = document.getElementById("carteira-lista");
  if (!carteira.length) {
    elCarteira.innerHTML = `<div class="carteira-empty">Nenhum investimento na carteira</div>`;
  } else {
    elCarteira.innerHTML = carteira.map((p) => {
      const taxaFmt = Number.isInteger(p.taxa) ? String(p.taxa) : p.taxa.toFixed(2).replace(".", ",");
      const meta = `${escapeHTML(p.ativo)} · ${escapeHTML(mesAbrev(p.data))} · ${escapeHTML(taxaFmt)}% ao mês`;
      return `<div class="carteira-item">
        <span class="carteira-dot" style="background:${p.cor}" aria-hidden="true"></span>
        <div class="carteira-info">
          <div class="carteira-nome">${escapeHTML(p.descricao)}</div>
          <div class="carteira-meta">${meta}</div>
        </div>
        <div class="carteira-valores">
          <div class="carteira-saldo">${moeda(p.saldo)}</div>
          <div class="carteira-rendimento">+${moeda(p.rendimento)}/mês</div>
        </div>
        <button type="button" class="carteira-excluir" data-excluir-projeto="${escapeHTML(p.descricao)}" title="Remover da carteira">
          <i class="fa-solid fa-trash" aria-hidden="true"></i>
        </button>
      </div>`;
    }).join("");
  }
}

function salvarInvestimentoCarteira(e) {
  e.preventDefault();
  if (mesFechado(mesSelecionado)) {
    toast("Este mês está fechado. Não é possível adicionar investimentos.");
    return;
  }

  const descricao = document.getElementById("inv-projeto-nome").value.trim();
  const ativo = document.getElementById("inv-projeto-ativo").value;
  const valor = parseFloat(document.getElementById("inv-projeto-valor").value);
  const rendimentoMensal = parseFloat(document.getElementById("inv-projeto-rendimento").value);

  if (!descricao || !(valor > 0)) {
    toast("Preencha o nome do projeto e o valor aplicado.");
    return;
  }
  if (!(rendimentoMensal >= 0)) {
    toast("Informe um % ao mês válido.");
    return;
  }

  const hoje = hojeISO();
  const data = mesDe(hoje) === mesSelecionado ? hoje : `${mesSelecionado}-01`;

  dados.transacoes.push({
    id: uid(),
    tipo: "investimento",
    descricao,
    valor,
    data,
    ativo,
    rendimentoMensal,
    resgate: false,
  });

  salvar();
  document.getElementById("form-investimento-carteira").reset();
  toast("Investimento adicionado à carteira.");
  renderizar();
}

/* ---------- Renderização: Relatórios ---------- */

let relMesIndice = -1; // índice no array do período (ordem cronológica)

function mesesDoRelatorio() {
  const sel = document.getElementById("relatorio-periodo").value;
  if (sel === "ano") {
    const ano = mesSelecionado.split("-")[0];
    const fim = Math.min(12, Number(mesSelecionado.split("-")[1]));
    return Array.from({ length: fim }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  }
  return mesesAtras(Number(sel), mesSelecionado);
}

function taxaPoupanca(rm) {
  return rm.ganhos > 0 ? ((rm.investido + Math.max(0, rm.saldo)) / rm.ganhos) * 100 : null;
}

function renderRelMesMobileDetalhe() {
  const meses = mesesDoRelatorio();
  if (!meses.length) {
    document.getElementById("rel-mes-label").textContent = "—";
    document.getElementById("rel-mes-detalhe").innerHTML =
      `<div class="rel-mes-empty">Nenhum mês no período</div>`;
    document.getElementById("rel-mes-anterior").disabled = true;
    document.getElementById("rel-mes-proximo").disabled = true;
    return;
  }

  if (relMesIndice < 0 || relMesIndice >= meses.length) {
    relMesIndice = meses.length - 1;
  }

  const mesISO = meses[relMesIndice];
  const rm = resumoDoMes(mesISO);
  const taxa = taxaPoupanca(rm);
  const mesHoje = mesDe(hojeISO());
  const ehAtual = mesISO === mesHoje;

  document.getElementById("rel-mes-label").textContent = nomeMes(mesISO);
  const dot = document.getElementById("rel-mes-status-dot");
  dot.classList.toggle("is-atual", ehAtual);
  dot.classList.toggle("is-passado", !ehAtual);

  document.getElementById("rel-mes-anterior").disabled = relMesIndice <= 0;
  document.getElementById("rel-mes-proximo").disabled = relMesIndice >= meses.length - 1;

  document.getElementById("rel-mes-detalhe").innerHTML = `
    <div class="rel-mes-row">
      <span class="rel-mes-row-label">Salário</span>
      <span class="rel-mes-row-value positive">${moeda(rm.salario)}</span>
    </div>
    <div class="rel-mes-row">
      <span class="rel-mes-row-label">Outros ganhos</span>
      <span class="rel-mes-row-value positive">${moeda(rm.outrosGanhos)}</span>
    </div>
    <div class="rel-mes-row">
      <span class="rel-mes-row-label">Despesas</span>
      <span class="rel-mes-row-value negative">${moeda(rm.despesas)}</span>
    </div>
    <div class="rel-mes-row">
      <span class="rel-mes-row-label">Investido</span>
      <span class="rel-mes-row-value invest">${moeda(rm.investido)}</span>
    </div>
    <div class="rel-mes-row">
      <span class="rel-mes-row-label">Saldo</span>
      <span class="rel-mes-row-value ${rm.saldo >= 0 ? "positive" : "negative"}">${moeda(rm.saldo)}</span>
    </div>
    <div class="rel-mes-row">
      <span class="rel-mes-row-label">Taxa de poupança</span>
      <span class="rel-mes-row-value">${taxa != null ? taxa.toFixed(0) + "%" : "—"}</span>
    </div>
  `;
}

function renderRelatorios() {
  const meses = mesesDoRelatorio();
  const r = resumoDoMes(mesSelecionado);
  const mesLabel = nomeMes(mesSelecionado);

  document.getElementById("rel-entrou").textContent = moeda(r.ganhos);
  document.getElementById("rel-entrou-sub").textContent = mesLabel;

  document.getElementById("rel-saiu").textContent = moeda(r.despesas);
  document.getElementById("rel-saiu-sub").textContent =
    r.ganhos > 0 ? `${((r.despesas / r.ganhos) * 100).toFixed(0)}% do que entrou` : mesLabel;

  document.getElementById("rel-investido").textContent = moeda(r.investido);
  document.getElementById("rel-investido-sub").textContent =
    r.ganhos > 0 ? `${((r.investido / r.ganhos) * 100).toFixed(0)}% do que entrou` : mesLabel;

  const elSobrou = document.getElementById("rel-sobrou");
  elSobrou.textContent = moeda(r.saldo);
  elSobrou.className = "stat-value " + (r.saldo >= 0 ? "positive" : "negative");
  document.getElementById("rel-sobrou-sub").textContent = "ganhos − gastos − investimentos";

  graficoCategoriasPercentual("rel-categorias-barras", despesasPorCategoria(meses), "Sem despesas no período");

  const resumos = meses.map(resumoDoMes);
  const linhas = meses.map((m, i) => {
    const rm = resumos[i];
    const taxa = taxaPoupanca(rm);
    return `<tr>
      <td>${nomeMes(m)}</td>
      <td class="right positive">${moeda(rm.salario)}</td>
      <td class="right positive">${moeda(rm.outrosGanhos)}</td>
      <td class="right negative">${moeda(rm.despesas)}</td>
      <td class="right invest">${moeda(rm.investido)}</td>
      <td class="right ${rm.saldo >= 0 ? "positive" : "negative"}">${moeda(rm.saldo)}</td>
      <td class="right">${taxa != null ? taxa.toFixed(0) + "%" : "—"}</td>
    </tr>`;
  }).reverse();

  const totais = resumos.reduce(
    (acc, r) => ({
      salario: acc.salario + r.salario,
      outrosGanhos: acc.outrosGanhos + r.outrosGanhos,
      despesas: acc.despesas + r.despesas,
      investido: acc.investido + r.investido,
      saldo: acc.saldo + r.saldo,
      ganhos: acc.ganhos + r.ganhos,
    }),
    { salario: 0, outrosGanhos: 0, despesas: 0, investido: 0, saldo: 0, ganhos: 0 }
  );
  const taxaTotal = totais.ganhos > 0
    ? ((totais.investido + Math.max(0, totais.saldo)) / totais.ganhos) * 100
    : 0;

  const rodape = `<tr class="table-total">
    <td><strong>Total do período</strong></td>
    <td class="right positive"><strong>${moeda(totais.salario)}</strong></td>
    <td class="right positive"><strong>${moeda(totais.outrosGanhos)}</strong></td>
    <td class="right negative"><strong>${moeda(totais.despesas)}</strong></td>
    <td class="right invest"><strong>${moeda(totais.investido)}</strong></td>
    <td class="right ${totais.saldo >= 0 ? "positive" : "negative"}"><strong>${moeda(totais.saldo)}</strong></td>
    <td class="right"><strong>${totais.ganhos > 0 ? taxaTotal.toFixed(0) + "%" : "—"}</strong></td>
  </tr>`;

  document.getElementById("tabela-resumo-mensal").innerHTML = linhas.join("") + rodape;

  // Mobile: mantém o mês selecionado se ainda estiver no período; senão, vai ao mais recente
  if (relMesIndice < 0 || relMesIndice >= meses.length) {
    relMesIndice = meses.length ? meses.length - 1 : -1;
  }
  renderRelMesMobileDetalhe();
}

/* ---------- Renderização: Configurações ---------- */

function renderConfiguracoes() {
  document.getElementById("config-salario").value = dados.config.salario || "";
  document.getElementById("config-dia-salario").value = dados.config.diaSalario || 5;

  const info = document.getElementById("config-salario-info");
  if (dados.config.salario > 0 && dados.config.mesInicioSalario) {
    info.textContent = `Lançado automaticamente todo mês desde ${nomeMes(dados.config.mesInicioSalario)}.`;
  } else {
    info.innerHTML = "&nbsp;";
  }

  const lista = document.getElementById("lista-categorias");
  lista.innerHTML = dados.config.categorias
    .map((c) => `<span class="chip">${escapeHTML(c)} <button data-remover-cat="${escapeHTML(c)}" title="Remover">✕</button></span>`)
    .join("");
}

function renderResumoSidebar() {
  const r = resumoDoMes(mesSelecionado);
  const totalInvestido = dados.transacoes
    .filter((t) => t.tipo === "investimento")
    .reduce((s, t) => s + valorInvestimento(t), 0);

  document.getElementById("sidebar-salario").textContent = moeda(dados.config.salario || 0);

  const elLivre = document.getElementById("sidebar-livre");
  elLivre.textContent = moeda(r.saldo);
  elLivre.className = "summary-value " + (r.saldo >= 0 ? "positive" : "negative");

  document.getElementById("sidebar-investimentos").textContent = moeda(totalInvestido);
}

function atualizarControlesMes() {
  const mesHoje = mesDe(hojeISO());
  const limiteAvanco = mesLimiteAvanco();
  const fechado = mesFechado(mesSelecionado);
  const ehMesAtual = mesSelecionado === mesHoje;

  const dot = document.getElementById("mes-status-dot");
  dot.classList.toggle("is-atual", ehMesAtual);
  dot.classList.toggle("is-passado", !ehMesAtual);

  const btnProximo = document.getElementById("mes-proximo");
  const noLimite = mesSelecionado >= limiteAvanco;
  btnProximo.disabled = noLimite;
  btnProximo.title = noLimite
    ? limiteAvanco > mesHoje
      ? "Feche este mês para avançar além de " + nomeMes(limiteAvanco)
      : "Não é possível avançar além do mês atual"
    : "Próximo mês";

  const btnHoje = document.getElementById("mes-hoje");
  btnHoje.disabled = ehMesAtual;

  const btnFechar = document.getElementById("mes-fechar");
  btnFechar.disabled = fechado;
  btnFechar.title = fechado
    ? "Este mês já foi encerrado"
    : "Encerrar o mês selecionado e ir para o próximo";

  const bloquearNovaTx = fechado;
  ["btn-nova-transacao", "btn-nova-transacao-2", "btn-nova-transacao-3"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = bloquearNovaTx;
  });
  const btnNovaMobile = document.getElementById("btn-nova-transacao-mobile");
  if (btnNovaMobile) btnNovaMobile.disabled = bloquearNovaTx;
  const formInv = document.getElementById("form-investimento-carteira");
  if (formInv) {
    formInv.querySelectorAll("input, select, button").forEach((el) => {
      el.disabled = bloquearNovaTx;
    });
  }
}

function fecharMes() {
  if (mesFechado(mesSelecionado)) {
    toast("Este mês já está fechado.");
    return;
  }

  const r = resumoDoMes(mesSelecionado);
  const msg = [
    `Encerrar ${nomeMes(mesSelecionado)}?`,
    "",
    `Saldo do mês: ${moeda(r.saldo)}`,
    `Despesas: ${moeda(r.despesas)} · Investido: ${moeda(r.investido)}`,
    "",
    "Após fechar, o mês ficará bloqueado para novos lançamentos e você será levado ao mês seguinte.",
  ].join("\n");

  if (!confirm(msg)) return;

  if (!Array.isArray(dados.config.mesesFechados)) dados.config.mesesFechados = [];
  dados.config.mesesFechados.push(mesSelecionado);
  dados.config.mesesFechados.sort();

  const mesEncerrado = mesSelecionado;
  mesSelecionado = proximoMes(mesSelecionado);

  salvar();
  toast(`${nomeMes(mesEncerrado)} fechado. Indo para ${nomeMes(mesSelecionado)}.`);
  renderizar();
}

/* ---------- Renderização geral ---------- */

function renderizar() {
  const mesHoje = mesDe(hojeISO());
  // Garante salário no mês atual (mesmo navegando no passado) e nos meses futuros selecionados
  const ateMes = mesSelecionado > mesHoje ? mesSelecionado : mesHoje;
  garantirSalariosAutomaticos(ateMes);
  document.getElementById("mes-atual-label").textContent = nomeMes(mesSelecionado);
  preencherFiltroCategorias();
  renderResumoSidebar();
  atualizarControlesMes();

  if (secaoAtiva === "dashboard") renderDashboard();
  else if (secaoAtiva === "transacoes") renderTransacoes();
  else if (secaoAtiva === "investimentos") renderInvestimentos();
  else if (secaoAtiva === "relatorios") renderRelatorios();
  else if (secaoAtiva === "configuracoes") renderConfiguracoes();
}

/* ---------- Modal ---------- */

function preencherGridCategorias(selecionada) {
  const grid = document.getElementById("tx-categoria-grid");
  const categorias = dados.config.categorias.length ? dados.config.categorias : ["Outros"];
  const cat = selecionada && categorias.includes(selecionada) ? selecionada : categorias[0];

  grid.innerHTML = categorias
    .map((c) => `<button type="button" class="cat-grid-btn${c === cat ? " active" : ""}" data-categoria="${escapeHTML(c)}">${escapeHTML(c)}</button>`)
    .join("");

  document.getElementById("tx-categoria").value = cat;
}

function selecionarCategoriaModal(cat) {
  document.getElementById("tx-categoria").value = cat;
  document.querySelectorAll(".cat-grid-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.categoria === cat);
  });
}

function atualizarCamposModal() {
  const tipo = document.querySelector('input[name="tx-tipo"]:checked').value;
  const ehNova = !document.getElementById("tx-id").value;
  document.getElementById("grupo-categoria").classList.toggle("hidden", tipo !== "despesa");
  document.getElementById("grupo-ativo").classList.toggle("hidden", tipo !== "investimento");
  document.getElementById("grupo-resgate").classList.toggle("hidden", tipo !== "investimento");
  document.getElementById("grupo-forma-pagamento").classList.toggle("hidden", tipo !== "despesa");

  const forma = document.getElementById("tx-forma-pagamento").value;
  const permiteParcelas = tipo === "despesa" && ehNova && (forma === "credito" || forma === "pix");
  document.getElementById("grupo-parcelas").classList.toggle("hidden", !permiteParcelas);
  if (permiteParcelas) preencherSelectParcelas();
}

/** Preenche o select de parcelas com o valor de cada parcela calculado a partir do valor informado. */
function preencherSelectParcelas() {
  const select = document.getElementById("tx-parcelas");
  const valorAtual = parseFloat(document.getElementById("tx-valor").value) || 0;
  const selecionado = select.value || "1";
  const max = 12;

  let html = "";
  for (let i = 1; i <= max; i++) {
    const label = i === 1 ? "À vista (1x)" : `${i}x de ${moeda(valorAtual / i)}`;
    html += `<option value="${i}">${label}</option>`;
  }
  select.innerHTML = html;
  select.value = Number(selecionado) <= max ? selecionado : "1";
}

function abrirModal(tx) {
  if (!tx && mesFechado(mesSelecionado)) {
    toast("Este mês está fechado. Não é possível adicionar lançamentos.");
    return;
  }

  const form = document.getElementById("form-transacao");
  form.reset();
  document.getElementById("tx-id").value = tx ? tx.id : "";
  document.getElementById("modal-titulo").textContent = tx ? "Editar transação" : "Nova transação";

  let categoriaInicial = "Outros";
  if (tx?.categoria) {
    categoriaInicial = tx.categoria;
  } else if (dados.config.categorias.includes("Alimentação")) {
    categoriaInicial = "Alimentação";
  } else if (dados.config.categorias.length) {
    categoriaInicial = dados.config.categorias[0];
  }

  const elParcelaInfo = document.getElementById("tx-parcela-info");
  elParcelaInfo.classList.add("hidden");

  if (tx) {
    const radioTipo = document.querySelector(`input[name="tx-tipo"][value="${tx.tipo}"]`);
    if (radioTipo) radioTipo.checked = true;
    document.getElementById("tx-descricao").value = tx.descricao;
    document.getElementById("tx-valor").value = tx.valor;
    document.getElementById("tx-data").value = tx.data;
    if (tx.ativo) document.getElementById("tx-ativo").value = tx.ativo;
    document.getElementById("tx-resgate").checked = !!tx.resgate;
    document.getElementById("tx-forma-pagamento").value = tx.formaPagamento || "debito";
    if (tx.parcelaTotal > 1) {
      elParcelaInfo.textContent = `Parcela ${tx.parcelaAtual} de ${tx.parcelaTotal} · ${FORMAS_PAGAMENTO[tx.formaPagamento] || ""}`;
      elParcelaInfo.classList.remove("hidden");
    }
  } else {
    // Data padrão: hoje se estivermos no mês selecionado, senão dia 1 do mês
    const hoje = hojeISO();
    document.getElementById("tx-data").value =
      mesDe(hoje) === mesSelecionado ? hoje : `${mesSelecionado}-01`;
    document.querySelector('input[name="tx-tipo"][value="despesa"]').checked = true;
    document.getElementById("tx-forma-pagamento").value = "debito";
  }

  preencherGridCategorias(categoriaInicial);

  atualizarCamposModal();
  document.getElementById("modal-transacao").classList.remove("hidden");
  document.getElementById("tx-descricao").focus();
}

function fecharModal() {
  document.getElementById("modal-transacao").classList.add("hidden");
}

function salvarTransacaoDoForm(e) {
  e.preventDefault();
  const id = document.getElementById("tx-id").value;
  const tipo = document.querySelector('input[name="tx-tipo"]:checked').value;
  const valor = parseFloat(document.getElementById("tx-valor").value);
  const descricao = document.getElementById("tx-descricao").value.trim();
  const data = document.getElementById("tx-data").value;

  if (!descricao || !data || !(valor > 0)) {
    toast("Preencha descrição, valor e data.");
    return;
  }

  const tx = {
    id: id || uid(),
    tipo,
    descricao,
    valor,
    data,
  };
  if (tipo === "despesa") {
    const cat = document.getElementById("tx-categoria").value;
    if (!cat) {
      toast("Selecione uma categoria.");
      return;
    }
    tx.categoria = cat;
    tx.formaPagamento = document.getElementById("tx-forma-pagamento").value;
  }
  if (tipo === "ganho") tx.categoria = "Ganhos";
  if (tipo === "investimento") {
    // Novos investimentos só pela seção Investimentos
    if (!id) {
      toast("Adicione investimentos pela seção Investimentos.");
      return;
    }
    tx.ativo = document.getElementById("tx-ativo").value;
    tx.resgate = document.getElementById("tx-resgate").checked;
  }

  // Parcelamento: só disponível para despesas novas pagas em crédito/PIX
  const grupoParcelas = document.getElementById("grupo-parcelas");
  const parcelas = !id && tipo === "despesa" && !grupoParcelas.classList.contains("hidden")
    ? parseInt(document.getElementById("tx-parcelas").value, 10) || 1
    : 1;

  if (!id && parcelas > 1) {
    const valorParcela = Math.floor((valor / parcelas) * 100) / 100;
    const ajuste = +(valor - valorParcela * parcelas).toFixed(2);
    const parcelamentoId = uid();

    for (let i = 1; i <= parcelas; i++) {
      const ehUltima = i === parcelas;
      dados.transacoes.push({
        ...tx,
        id: uid(),
        descricao: `${descricao} (${i}/${parcelas})`,
        valor: ehUltima ? +(valorParcela + ajuste).toFixed(2) : valorParcela,
        data: adicionarMeses(data, i - 1),
        parcelamentoId,
        parcelaAtual: i,
        parcelaTotal: parcelas,
      });
    }

    salvar();
    fecharModal();
    toast(`Despesa parcelada em ${parcelas}x adicionada.`);
    renderizar();
    return;
  }

  if (id) {
    const i = dados.transacoes.findIndex((t) => t.id === id);
    if (i >= 0) {
      tx.salarioAuto = dados.transacoes[i].salarioAuto; // preserva marcação
      if (dados.transacoes[i].rendimentoMensal != null) {
        tx.rendimentoMensal = dados.transacoes[i].rendimentoMensal;
      }
      if (dados.transacoes[i].parcelamentoId) {
        tx.parcelamentoId = dados.transacoes[i].parcelamentoId;
        tx.parcelaAtual = dados.transacoes[i].parcelaAtual;
        tx.parcelaTotal = dados.transacoes[i].parcelaTotal;
      }
      dados.transacoes[i] = tx;
    }
  } else {
    dados.transacoes.push(tx);
  }

  salvar();
  fecharModal();
  toast(id ? "Transação atualizada." : "Transação adicionada.");
  renderizar();
}

function excluirTransacao(id) {
  const t = dados.transacoes.find((x) => x.id === id);
  if (!t) return;

  if (t.parcelamentoId) {
    const todasParcelas = dados.transacoes.filter((x) => x.parcelamentoId === t.parcelamentoId);
    const excluirTodas = confirm(
      `Esta despesa faz parte de um parcelamento (${todasParcelas.length}x). Deseja excluir todas as parcelas?`
    );
    if (excluirTodas) {
      dados.transacoes = dados.transacoes.filter((x) => x.parcelamentoId !== t.parcelamentoId);
      salvar();
      toast("Parcelamento excluído.");
      renderizar();
      return;
    }
    if (!confirm(`Excluir apenas a parcela "${t.descricao}" de ${moeda(t.valor)}?`)) return;
    dados.transacoes = dados.transacoes.filter((x) => x.id !== id);
    salvar();
    toast("Parcela excluída.");
    renderizar();
    return;
  }

  if (!confirm(`Excluir "${t.descricao}" de ${moeda(t.valor)}?`)) return;
  dados.transacoes = dados.transacoes.filter((x) => x.id !== id);
  salvar();
  toast("Transação excluída.");
  renderizar();
}

function excluirProjetoCarteira(descricao) {
  if (!descricao) return;
  const txs = dados.transacoes.filter(
    (t) => t.tipo === "investimento" && ((t.descricao || "").trim() || "Sem descrição") === descricao
  );
  if (!txs.length) return;
  if (!confirm(`Remover "${descricao}" da carteira?`)) return;
  const ids = new Set(txs.map((t) => t.id));
  dados.transacoes = dados.transacoes.filter((t) => !ids.has(t.id));
  salvar();
  toast("Investimento removido da carteira.");
  renderizar();
}

/* ---------- Exportação / importação ---------- */

function baixarArquivo(nome, conteudo, mime) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function exportarCSV() {
  const sep = ";"; // Excel pt-BR usa ; como separador
  const cab = ["Data", "Tipo", "Descrição", "Categoria/Ativo", "Resgate", "Valor"].join(sep);
  const linhas = [...dados.transacoes]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((t) => [
      dataBR(t.data),
      { ganho: "Ganho", despesa: "Despesa", investimento: "Investimento" }[t.tipo],
      `"${t.descricao.replace(/"/g, '""')}"`,
      `"${(t.categoria || t.ativo || "").replace(/"/g, '""')}"`,
      t.resgate ? "Sim" : "Não",
      t.valor.toFixed(2).replace(".", ","),
    ].join(sep));
  const csv = "\uFEFF" + [cab, ...linhas].join("\r\n"); // BOM para acentos no Excel
  baixarArquivo(`financas_${hojeISO()}.csv`, csv, "text/csv;charset=utf-8");
  toast("CSV exportado.");
}

function exportarJSON() {
  baixarArquivo(
    `financas_backup_${hojeISO()}.json`,
    JSON.stringify(dados, null, 2),
    "application/json"
  );
  toast("Backup JSON exportado.");
}

function importarJSON(arquivo) {
  const leitor = new FileReader();
  leitor.onload = () => {
    try {
      const d = JSON.parse(leitor.result);
      if (!Array.isArray(d.transacoes) || !d.config) throw new Error("estrutura inválida");
      if (!confirm(`Importar backup com ${d.transacoes.length} transações? Isto substituirá os dados atuais.`)) return;
      dados = d;
      if (!Array.isArray(dados.config.categorias) || !dados.config.categorias.length) {
        dados.config.categorias = [...CATEGORIAS_PADRAO];
      }
      migrarConfigSalario(dados.config, dados.transacoes);
      garantirMesesFechados(dados.config);
      salvar();
      toast("Backup importado com sucesso.");
      renderizar();
    } catch (e) {
      toast("Arquivo inválido. Use um backup JSON exportado por esta aplicação.");
    }
  };
  leitor.readAsText(arquivo, "utf-8");
}

/* ---------- Eventos ---------- */

function configurarEventos() {
  // Navegação
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach((b) =>
    b.addEventListener("click", () => irPara(b.dataset.section))
  );
  document.querySelectorAll("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => irPara(b.dataset.goto))
  );

  // Seletor de mês
  document.getElementById("mes-anterior").addEventListener("click", () => {
    mesSelecionado = mesesAtras(2, mesSelecionado)[0];
    renderizar();
  });
  document.getElementById("mes-proximo").addEventListener("click", () => {
    if (mesSelecionado >= mesLimiteAvanco()) return;
    mesSelecionado = proximoMes(mesSelecionado);
    renderizar();
  });
  document.getElementById("mes-fechar").addEventListener("click", fecharMes);
  document.getElementById("mes-hoje").addEventListener("click", () => {
    mesSelecionado = mesDe(hojeISO());
    renderizar();
  });

  // Botões de nova transação
  ["btn-nova-transacao", "btn-nova-transacao-2", "btn-nova-transacao-3", "btn-nova-transacao-mobile"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => abrirModal(null));
  });
  document.getElementById("form-investimento-carteira").addEventListener("submit", salvarInvestimentoCarteira);

  // Modal
  document.getElementById("modal-fechar").addEventListener("click", fecharModal);
  document.getElementById("modal-transacao").addEventListener("click", (e) => {
    if (e.target.id === "modal-transacao") fecharModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModal();
  });
  document.querySelectorAll('input[name="tx-tipo"]').forEach((r) =>
    r.addEventListener("change", atualizarCamposModal)
  );
  document.getElementById("tx-forma-pagamento").addEventListener("change", atualizarCamposModal);
  document.getElementById("tx-valor").addEventListener("input", () => {
    if (!document.getElementById("grupo-parcelas").classList.contains("hidden")) {
      preencherSelectParcelas();
    }
  });
  document.getElementById("form-transacao").addEventListener("submit", salvarTransacaoDoForm);
  document.getElementById("tx-categoria-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-grid-btn");
    if (btn) selecionarCategoriaModal(btn.dataset.categoria);
  });

  // Ações nas tabelas (delegação)
  document.body.addEventListener("click", (e) => {
    const editar = e.target.closest("[data-editar]");
    const excluir = e.target.closest("[data-excluir]");
    const excluirProjeto = e.target.closest("[data-excluir-projeto]");
    const removerCat = e.target.closest("[data-remover-cat]");
    if (editar) {
      const tx = dados.transacoes.find((t) => t.id === editar.dataset.editar);
      if (tx) abrirModal(tx);
    } else if (excluirProjeto) {
      excluirProjetoCarteira(excluirProjeto.dataset.excluirProjeto);
    } else if (excluir) {
      excluirTransacao(excluir.dataset.excluir);
    } else if (removerCat) {
      const cat = removerCat.dataset.removerCat;
      dados.config.categorias = dados.config.categorias.filter((c) => c !== cat);
      salvar();
      renderConfiguracoes();
      toast(`Categoria "${cat}" removida.`);
    }
  });

  // Filtros de transações
  ["filtro-tipo", "filtro-categoria"].forEach((id) =>
    document.getElementById(id).addEventListener("change", renderTransacoes)
  );
  document.getElementById("filtro-busca").addEventListener("input", renderTransacoes);

  // Relatórios
  document.getElementById("relatorio-periodo").addEventListener("change", () => {
    relMesIndice = -1;
    renderRelatorios();
  });
  document.getElementById("rel-mes-anterior").addEventListener("click", () => {
    if (relMesIndice <= 0) return;
    relMesIndice -= 1;
    renderRelMesMobileDetalhe();
  });
  document.getElementById("rel-mes-proximo").addEventListener("click", () => {
    const meses = mesesDoRelatorio();
    if (relMesIndice >= meses.length - 1) return;
    relMesIndice += 1;
    renderRelMesMobileDetalhe();
  });
  document.getElementById("btn-export-csv").addEventListener("click", exportarCSV);
  document.getElementById("btn-export-json").addEventListener("click", exportarJSON);
  document.getElementById("input-import-json").addEventListener("change", (e) => {
    if (e.target.files[0]) importarJSON(e.target.files[0]);
    e.target.value = "";
  });

  // Configurações
  document.getElementById("btn-salvar-config").addEventListener("click", () => {
    const novoSalario = parseFloat(document.getElementById("config-salario").value) || 0;
    dados.config.salario = novoSalario;
    dados.config.diaSalario = Math.min(28, Math.max(1, parseInt(document.getElementById("config-dia-salario").value) || 5));

    if (novoSalario > 0 && !dados.config.mesInicioSalario) {
      // Começa a valer a partir do mês em que o usuário fez este lançamento
      dados.config.mesInicioSalario = mesDe(hojeISO());
    } else if (novoSalario <= 0) {
      dados.config.mesInicioSalario = null;
    }

    salvar();
    const mesHoje = mesDe(hojeISO());
    garantirSalariosAutomaticos(mesSelecionado > mesHoje ? mesSelecionado : mesHoje);
    toast("Configurações salvas.");
    renderizar();
  });

  document.getElementById("btn-add-categoria").addEventListener("click", adicionarCategoria);
  document.getElementById("nova-categoria").addEventListener("keydown", (e) => {
    if (e.key === "Enter") adicionarCategoria();
  });

  document.getElementById("btn-apagar-tudo").addEventListener("click", () => {
    if (!confirm("Apagar TODOS os dados? Esta ação não pode ser desfeita.")) return;
    if (!confirm("Tem certeza? Considere exportar um backup antes.")) return;
    localStorage.removeItem(STORAGE_KEY);
    dados = carregar();
    toast("Todos os dados foram apagados.");
    renderizar();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (secaoAtiva === "dashboard") renderDashboard();
      else if (secaoAtiva === "investimentos") renderInvestimentos();
    }, 150);
  });
}

function adicionarCategoria() {
  const input = document.getElementById("nova-categoria");
  const nome = input.value.trim();
  if (!nome) return;
  if (dados.config.categorias.some((c) => c.toLowerCase() === nome.toLowerCase())) {
    toast("Essa categoria já existe.");
    return;
  }
  dados.config.categorias.push(nome);
  salvar();
  input.value = "";
  renderConfiguracoes();
  toast(`Categoria "${nome}" adicionada.`);
}

/* ---------- Inicialização ---------- */

configurarEventos();
renderizar();
