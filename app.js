/* =====================================================
   Minhas Finanças — controle pessoal de despesas
   Dados salvos em localStorage (somente neste navegador)
   Regras de cálculo puras ficam em calculos.js.
   ===================================================== */

"use strict";

/* ---------- Estado e persistência ---------- */

const STORAGE_KEY = "financas.dados.v1";

let descartadasAoCarregar = 0;
let dados = carregar();

/** Guarda o JSON original para recuperação manual antes de ele ser sobrescrito. */
function guardarCopiaOriginal(raw) {
  try { localStorage.setItem(`${STORAGE_KEY}.corrompido`, raw); } catch { /* sem espaço */ }
}

function carregar() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { dados: limpos, descartadas } = sanitizarDados(JSON.parse(raw));
      if (descartadas > 0) {
        guardarCopiaOriginal(raw);
        descartadasAoCarregar = descartadas;
      }
      return limpos;
    }
  } catch (e) {
    // Dados corrompidos: guarda uma cópia para recuperação manual e recomeça
    if (raw) guardarCopiaOriginal(raw);
  }
  return dadosIniciais();
}

/** Persiste os dados; retorna false (e avisa o usuário) se o navegador recusar a gravação. */
function salvar() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    return true;
  } catch (e) {
    toast("Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado. Exporte um backup.");
    return false;
  }
}

/** Salva, mostra a mensagem de sucesso (se gravou) e atualiza a tela. */
function persistir(msgSucesso) {
  if (salvar() && msgSucesso) toast(msgSucesso);
  renderizar();
}

/* ---------- Formatação ---------- */

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function moeda(v) { return fmtBRL.format(v || 0); }

function nomeMes(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
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

function diaMesAbreviado(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const abrev = new Date(ano, mes - 1, dia)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");
  return `${dia} de ${abrev}`;
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3200);
}

/* ---------- Meses fechados ---------- */

function mesFechado(mesISO) {
  return dados.config.mesesFechados.includes(mesISO);
}

/** Avisa e retorna true se a data cair em um mês fechado (somente leitura). */
function bloqueadoPorMesFechado(dataISO) {
  const mes = mesDe(dataISO);
  if (!mesFechado(mes)) return false;
  toast(`${nomeMes(mes)} está fechado. Reabra o mês para alterar lançamentos nele.`);
  return true;
}

/** Limite superior para navegação com › (considera meses já fechados). */
function mesLimiteAvanco() {
  const mesHoje = mesDe(hojeISO());
  const fechados = dados.config.mesesFechados;
  if (!fechados.length) return mesHoje;
  const mesAposUltimoFechado = proximoMes(fechados[fechados.length - 1]);
  return mesAposUltimoFechado > mesHoje ? mesAposUltimoFechado : mesHoje;
}

/* ---------- Salário automático ---------- */

/** Garante o salário automático até o mês atual (ou até o mês selecionado, se for futuro). */
function sincronizarSalariosApp() {
  const mesHoje = mesDe(hojeISO());
  const ateMes = mesSelecionado > mesHoje ? mesSelecionado : mesHoje;
  if (sincronizarSalarios(dados, ateMes)) salvar();
}

function ignorarSalarioNoMes(mesISO) {
  const lista = dados.config.salarioMesesIgnorados;
  if (!lista.includes(mesISO)) {
    lista.push(mesISO);
    lista.sort();
  }
}

/* ---------- Carteira ---------- */

/** Data de referência para cálculos da carteira (mês selecionado ou hoje). */
function dataRefCarteira() {
  const hoje = hojeISO();
  const mesHoje = mesDe(hoje);
  if (mesSelecionado > mesHoje) return `${mesSelecionado}-01`;
  if (mesSelecionado === mesHoje) return hoje;
  const [a, m] = mesSelecionado.split("-").map(Number);
  return `${mesSelecionado}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
}

function carteiraAtual() {
  return posicaoCarteira(dados.transacoes, dataRefCarteira());
}

/* ---------- Estado da interface ---------- */

let mesSelecionado = mesDe(hojeISO());
let secaoAtiva = "dashboard";
let diaRenderizado = hojeISO();
let resgateEmEdicao = null; // projeto da carteira quando o modal está em modo resgate
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

function mudarMes(mesISO) {
  mesSelecionado = mesISO;
  sincronizarSalariosApp();
  renderizar();
}

/* ---------- Camadas (modais e diálogos) ---------- */

const camadas = []; // pilha de overlays abertos: {el, focoAnterior, aoFechar}

function abrirCamada(el, aoFechar) {
  camadas.push({ el, focoAnterior: document.activeElement, aoFechar });
  el.classList.remove("hidden");
}

function fecharCamada(el) {
  const i = camadas.findIndex((c) => c.el === el);
  if (i < 0) return;
  const [camada] = camadas.splice(i, 1);
  el.classList.add("hidden");
  if (camada.focoAnterior && document.contains(camada.focoAnterior)) camada.focoAnterior.focus();
}

function elementosFocaveis(el) {
  return [...el.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
    .filter((x) => !x.disabled && x.offsetParent !== null);
}

/** Escape fecha só a camada do topo; Tab circula dentro dela. */
function teclaNasCamadas(e) {
  const topo = camadas[camadas.length - 1];
  if (!topo) return;
  if (e.key === "Escape") {
    e.preventDefault();
    topo.aoFechar();
  } else if (e.key === "Tab") {
    const focaveis = elementosFocaveis(topo.el);
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (!topo.el.contains(document.activeElement)) {
      e.preventDefault();
      primeiro.focus();
    } else if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }
}

let finalizarDialogo = null;

/**
 * Diálogo de escolha. botoes: [{valor, rotulo, estilo}] (estilo = classe btn-*).
 * Resolve com o valor do botão clicado, ou null se cancelado.
 */
function dialogo({ titulo, mensagem, botoes, cancelar = "Cancelar" }) {
  if (finalizarDialogo) finalizarDialogo(null);

  const el = document.getElementById("modal-dialogo");
  const acoes = document.getElementById("dialogo-acoes");
  const lista = cancelar ? [{ valor: null, rotulo: cancelar, estilo: "ghost" }, ...botoes] : botoes;

  document.getElementById("dialogo-titulo").textContent = titulo;
  document.getElementById("dialogo-mensagem").textContent = mensagem;
  acoes.innerHTML = lista
    .map((b, i) => `<button type="button" class="btn btn-${b.estilo || "primary"}" data-indice="${i}">${escapeHTML(b.rotulo)}</button>`)
    .join("");

  return new Promise((resolve) => {
    const finalizar = (valor) => {
      finalizarDialogo = null;
      acoes.onclick = null;
      fecharCamada(el);
      resolve(valor);
    };
    finalizarDialogo = finalizar;
    acoes.onclick = (e) => {
      const b = e.target.closest("[data-indice]");
      if (b) finalizar(lista[Number(b.dataset.indice)].valor);
    };
    abrirCamada(el, () => finalizar(null));
    acoes.querySelector("button").focus();
  });
}

function confirmar(titulo, mensagem, { rotulo = "Confirmar", perigo = false } = {}) {
  return dialogo({
    titulo,
    mensagem,
    botoes: [{ valor: true, rotulo, estilo: perigo ? "danger" : "primary" }],
  }).then((v) => v === true);
}

function avisar(titulo, mensagem) {
  return dialogo({ titulo, mensagem, botoes: [{ valor: true, rotulo: "Entendi" }], cancelar: null });
}

/* ---------- Gráficos ---------- */

function desenharGrafico(canvasId, config) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, config);
}

Chart.defaults.color = "#8b95ab";
Chart.defaults.borderColor = "#2a3550";
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

/** Legenda das roscas: cada item mostra a porcentagem e o valor. */
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

  return mobile
    ? { position: "bottom", align: "center", labels: { boxWidth: 10, padding: 10, color: "#ffffff", font: { size: 11 }, generateLabels } }
    : { position: "right", labels: { boxWidth: 12, padding: 14, color: "#ffffff", font: { size: 13 }, generateLabels } };
}

/**
 * Gráfico de rosca com o total no centro e porcentagem/valor na legenda.
 * entradas: [[rótulo, valor], ...] já ordenadas.
 */
function graficoRosca(canvasId, entradas, { msgVazio, subtexto, cor }) {
  const total = entradas.reduce((s, [, v]) => s + v, 0);
  const mobile = window.matchMedia("(max-width: 800px)").matches;
  const layout = mobile ? { padding: { top: 8, bottom: 4 } } : {};
  const centerText = {
    text: moeda(total),
    subtext: subtexto,
    color: cor,
    ...(mobile && { fontSize: 19, subFontSize: 11 }),
  };

  if (!entradas.length) {
    desenharGrafico(canvasId, {
      type: "doughnut",
      data: { labels: [msgVazio], datasets: [{ data: [1], backgroundColor: ["#2a3550"], borderWidth: 0 }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { enabled: false }, centerText },
        cutout: mobile ? "74%" : "68%",
        layout,
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
      cutout: mobile ? "72%" : "62%",
      layout,
      plugins: {
        legend: opcoesLegendaRosca(total, mobile),
        tooltip: tooltipMoeda(),
        centerText,
      },
    },
  });
}

/** Despesas por categoria em barras horizontais (% do total). */
function graficoCategoriasPercentual(containerId, entradas, msgVazio) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const total = entradas.reduce((s, [, v]) => s + v, 0);
  if (!entradas.length) {
    el.innerHTML = `<div class="cat-bars-empty">${escapeHTML(msgVazio)}</div>`;
    return;
  }

  el.innerHTML = entradas.map(([cat, valor], i) => {
    const pct = total > 0 ? (valor / total) * 100 : 0;
    return `<div class="cat-bar-row">
      <div class="cat-bar-header">
        <span class="cat-bar-name">${escapeHTML(cat)}</span>
        <span class="cat-bar-meta">${pct.toFixed(0)}% · ${moeda(valor)}</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${pct.toFixed(1)}%;background:${CORES[i % CORES.length]}"></div>
      </div>
    </div>`;
  }).join("");
}

/* ---------- Linhas de transação ---------- */

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
  return t.resgate ? "↩️" : `<i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i>`;
}

/** Informações de exibição comuns às listas de transações (textos ainda não escapados). */
function infoVisualTransacao(t) {
  return {
    cat: t.tipo === "investimento" ? (t.ativo || "—") : (t.categoria || "—"),
    classeValor: { ganho: "positive", despesa: "negative", investimento: "invest" }[t.tipo],
    sinal: t.tipo === "ganho" || (t.tipo === "investimento" && t.resgate) ? "+" : "−",
    nomeTipo: { ganho: "Ganho", despesa: "Despesa", investimento: t.resgate ? "Resgate" : "Investimento" }[t.tipo],
    tagTipo: { ganho: "tag-ganho", despesa: "tag-despesa", investimento: "tag-invest" }[t.tipo],
    formaPagamento: t.tipo === "despesa" && t.formaPagamento && t.formaPagamento !== "debito"
      ? FORMAS_PAGAMENTO[t.formaPagamento] || ""
      : "",
    parcela: t.parcelaTotal > 1 ? `${Number(t.parcelaAtual)}/${Number(t.parcelaTotal)}` : "",
  };
}

function botoesAcaoHTML(t) {
  if (mesFechado(mesDe(t.data))) {
    return `<span class="tx-bloqueado" title="Mês fechado — reabra para alterar">
      <i class="fa-solid fa-lock" aria-hidden="true"></i><span class="sr-only">Mês fechado</span>
    </span>`;
  }
  const id = escapeHTML(t.id);
  const desc = escapeHTML(t.descricao);
  return `<button class="btn btn-ghost btn-icon" data-editar="${id}" title="Editar" aria-label="Editar ${desc}">
      <i class="fa-solid fa-pen" aria-hidden="true"></i>
    </button>
    <button class="btn btn-ghost btn-icon" data-excluir="${id}" title="Excluir" aria-label="Excluir ${desc}">
      <i class="fa-solid fa-trash" aria-hidden="true"></i>
    </button>`;
}

function linhaTransacaoHTML(t) {
  const v = infoVisualTransacao(t);
  let extraTags = "";
  if (v.formaPagamento) extraTags += `<span class="tag tag-categoria">${escapeHTML(v.formaPagamento)}</span>`;
  if (v.parcela) extraTags += `<span class="tag tag-categoria">${v.parcela}</span>`;
  return `<tr>
    <td>${escapeHTML(dataBR(t.data))}</td>
    <td>${escapeHTML(t.descricao)}</td>
    <td><span class="tag tag-categoria">${escapeHTML(v.cat)}</span>${extraTags}</td>
    <td><span class="tag ${v.tagTipo}">${v.nomeTipo}</span></td>
    <td class="right ${v.classeValor}">${v.sinal} ${moeda(t.valor)}</td>
    <td class="right">${botoesAcaoHTML(t)}</td>
  </tr>`;
}

function linhaTransacaoMobileHTML(t) {
  const v = infoVisualTransacao(t);
  let meta = `${escapeHTML(v.cat)} · ${escapeHTML(diaMesAbreviado(t.data))}`;
  if (v.formaPagamento) meta += ` · ${escapeHTML(v.formaPagamento)}`;
  if (v.parcela) meta += ` · ${v.parcela}`;
  return `<div class="tx-mobile-item">
    <div class="tx-icon tx-${t.tipo}">${iconeTransacao(t)}</div>
    <div class="tx-mobile-info">
      <div class="tx-desc">${escapeHTML(t.descricao)}</div>
      <div class="tx-meta">${meta}</div>
    </div>
    <div class="tx-valor ${v.classeValor}">${v.sinal} ${moeda(t.valor)}</div>
    <div class="tx-mobile-acoes">${botoesAcaoHTML(t)}</div>
  </div>`;
}

function linhaTransacaoResumoHTML(t) {
  const v = infoVisualTransacao(t);
  return `<div class="tx-item">
    <div class="tx-icon tx-${t.tipo}">${iconeTransacao(t)}</div>
    <div class="tx-info">
      <div class="tx-desc">${escapeHTML(t.descricao)}</div>
      <div class="tx-meta">${escapeHTML(v.cat)} · ${escapeHTML(diaMesAbreviado(t.data))}</div>
    </div>
    <div class="tx-valor ${v.classeValor}">${v.sinal} ${moeda(t.valor)}</div>
  </div>`;
}

/* ---------- Renderização: Dashboard ---------- */

function renderDashboard() {
  const r = resumoDoMes(dados.transacoes, mesSelecionado);

  document.getElementById("stat-salario").textContent = moeda(r.salario);
  document.getElementById("stat-salario-sub").textContent = dados.config.mesInicioSalario
    ? `renda fixa desde ${nomeMes(dados.config.mesInicioSalario)}`
    : "não configurado — defina em Configurações";

  document.getElementById("stat-ganhos").textContent = moeda(r.ganhos);
  document.getElementById("stat-ganhos-sub").textContent =
    r.salario > 0 ? `${moeda(r.salario)} de salário` : "incluindo salário";
  document.getElementById("stat-despesas").textContent = moeda(r.despesas);
  document.getElementById("stat-despesas-sub").textContent =
    r.ganhos > 0 ? `${((r.despesas / r.ganhos) * 100).toFixed(0)}% da renda` : " ";
  document.getElementById("stat-investido").textContent = moeda(r.investido);
  document.getElementById("stat-investido-sub").textContent =
    r.ganhos > 0 ? `${((r.investido / r.ganhos) * 100).toFixed(0)}% dos ganhos` : " ";

  const positivo = r.saldo >= 0;
  const elSaldo = document.getElementById("stat-saldo");
  elSaldo.textContent = moeda(r.saldo);
  elSaldo.className = "stat-value " + (positivo ? "positive" : "negative");

  const elBadge = document.getElementById("stat-saldo-badge");
  elBadge.textContent = positivo ? "Positivo" : "Negativo";
  elBadge.className = "stat-badge " + (positivo ? "positive" : "negative");

  document.getElementById("dash-mes-label").textContent = nomeMes(mesSelecionado);

  graficoRosca("chart-categorias", despesasPorCategoria(dados.transacoes, [mesSelecionado]), {
    msgVazio: "Sem despesas no mês",
    subtexto: "gasto total",
    cor: "#ff5c74",
  });

  const ultimas = transacoesDoMes(dados.transacoes, mesSelecionado)
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 8);
  document.getElementById("dash-ultimas").innerHTML = ultimas.length
    ? ultimas.map(linhaTransacaoResumoHTML).join("")
    : `<div class="tx-empty">Nenhuma transação neste mês</div>`;
}

/* ---------- Renderização: Transações ---------- */

function renderTransacoes() {
  const tipo = document.getElementById("filtro-tipo").value;
  const categoria = document.getElementById("filtro-categoria").value;
  const busca = document.getElementById("filtro-busca").value.trim().toLowerCase();

  let txs = transacoesDoMes(dados.transacoes, mesSelecionado);
  if (tipo) txs = txs.filter((t) => t.tipo === tipo);
  if (categoria) txs = txs.filter((t) => (t.categoria || t.ativo) === categoria);
  if (busca) txs = txs.filter((t) => t.descricao.toLowerCase().includes(busca));
  txs.sort((a, b) => b.data.localeCompare(a.data));

  document.getElementById("tabela-transacoes").innerHTML = txs.map(linhaTransacaoHTML).join("");
  document.getElementById("transacoes-lista-mobile").innerHTML = txs.map(linhaTransacaoMobileHTML).join("");
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

function formatarTaxa(taxa) {
  return Number.isInteger(taxa) ? String(taxa) : taxa.toFixed(2).replace(".", ",");
}

function renderInvestimentos() {
  const carteira = carteiraAtual();
  const rMes = resumoDoMes(dados.transacoes, mesSelecionado);

  document.getElementById("inv-total").textContent = moeda(carteira.total);
  document.getElementById("inv-mes").textContent = moeda(rMes.investido);
  document.getElementById("inv-mes-sub").textContent = `${nomeMes(mesSelecionado)} · aportes − resgates`;
  document.getElementById("inv-rendimento-acumulado").textContent = moeda(carteira.rendimentoTotal);
  document.getElementById("inv-rendimento").textContent = moeda(carteira.rendimentoMesTotal);

  graficoRosca("chart-inv-tipos", carteira.projetos.map((p) => [p.descricao, p.saldoAtual]), {
    msgVazio: "Sem investimentos",
    subtexto: "patrimônio",
    cor: "#a06bff",
  });

  const elCarteira = document.getElementById("carteira-lista");
  if (!carteira.projetos.length) {
    elCarteira.innerHTML = `<div class="carteira-empty">Nenhum investimento na carteira</div>`;
    return;
  }
  elCarteira.innerHTML = carteira.projetos.map((p, i) => {
    const nome = escapeHTML(p.descricao);
    const meta = `${escapeHTML(p.ativo)} · ${escapeHTML(mesAbrev(p.data))} · ${escapeHTML(formatarTaxa(p.taxa))}% ao mês`;
    return `<div class="carteira-item">
      <span class="carteira-dot" style="background:${CORES[i % CORES.length]}" aria-hidden="true"></span>
      <div class="carteira-info">
        <div class="carteira-nome">${nome}</div>
        <div class="carteira-meta">${meta}</div>
      </div>
      <div class="carteira-valores">
        <div class="carteira-saldo">${moeda(p.saldoAtual)}</div>
        <div class="carteira-rendimento">+${moeda(p.rendimentoMes)}/mês</div>
      </div>
      <button type="button" class="carteira-acao carteira-resgatar" data-resgatar-projeto="${nome}" title="Resgatar" aria-label="Resgatar de ${nome}">
        <i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
      </button>
      <button type="button" class="carteira-acao carteira-excluir" data-excluir-projeto="${nome}" title="Excluir da carteira" aria-label="Excluir ${nome} da carteira">
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
      </button>
    </div>`;
  }).join("");
}

function salvarInvestimentoCarteira(e) {
  e.preventDefault();

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
  if (bloqueadoPorMesFechado(data)) return;

  dados.transacoes.push({
    id: uid(),
    tipo: "investimento",
    descricao,
    valor: Math.round(valor * 100) / 100,
    data,
    ativo,
    rendimentoMensal,
    resgate: false,
  });

  document.getElementById("form-investimento-carteira").reset();
  persistir("Investimento adicionado à carteira.");
}

function abrirResgate(descricao) {
  const projeto = carteiraAtual().projetos.find((p) => p.descricao === descricao);
  if (projeto) abrirModal(null, { resgateDe: projeto });
}

async function excluirProjetoCarteira(descricao) {
  const txs = dados.transacoes.filter((t) => t.tipo === "investimento" && chaveProjeto(t) === descricao);
  if (!txs.length) return;

  if (txs.some((t) => mesFechado(mesDe(t.data)))) {
    await avisar(
      "Não é possível excluir",
      `"${descricao}" tem lançamentos em meses fechados. Para tirá-lo da carteira sem alterar o histórico, use Resgatar.`
    );
    return;
  }

  const ok = await confirmar(
    "Excluir da carteira",
    `Isto apaga os ${txs.length} lançamento(s) de "${descricao}" (aportes e resgates) e altera os relatórios dos meses em que ocorreram.\n\nPara registrar uma retirada, use Resgatar.`,
    { rotulo: "Excluir histórico", perigo: true }
  );
  if (!ok) return;

  const ids = new Set(txs.map((t) => t.id));
  dados.transacoes = dados.transacoes.filter((t) => !ids.has(t.id));
  persistir("Investimento removido da carteira.");
}

/* ---------- Renderização: Relatórios ---------- */

let relMesIndice = -1; // índice no array do período (ordem cronológica)

function mesesDoRelatorio() {
  const sel = document.getElementById("relatorio-periodo").value;
  if (sel === "ano") {
    const [ano, mes] = mesSelecionado.split("-");
    return Array.from({ length: Number(mes) }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  }
  return mesesAtras(Number(sel), mesSelecionado);
}

/** Indicador do mês: verde = atual, cinza = outro mês, cadeado = fechado. */
function atualizarIndicadorMes(dot, mesISO) {
  const fechado = mesFechado(mesISO);
  dot.classList.toggle("is-fechado", fechado);
  dot.classList.toggle("is-atual", !fechado && mesISO === mesDe(hojeISO()));
  dot.classList.toggle("is-passado", !fechado && mesISO !== mesDe(hojeISO()));
  dot.title = fechado ? "Mês fechado" : "";
}

function formatarTaxaPoupanca(r) {
  const taxa = taxaPoupanca(r);
  return taxa != null ? taxa.toFixed(0) + "%" : "—";
}

function renderRelMesMobileDetalhe() {
  const meses = mesesDoRelatorio();
  if (relMesIndice < 0 || relMesIndice >= meses.length) relMesIndice = meses.length - 1;

  const mesISO = meses[relMesIndice];
  const rm = resumoDoMes(dados.transacoes, mesISO);

  document.getElementById("rel-mes-label").textContent = nomeMes(mesISO);
  atualizarIndicadorMes(document.getElementById("rel-mes-status-dot"), mesISO);
  document.getElementById("rel-mes-anterior").disabled = relMesIndice <= 0;
  document.getElementById("rel-mes-proximo").disabled = relMesIndice >= meses.length - 1;

  const linhas = [
    ["Salário", rm.salario, "positive"],
    ["Outros ganhos", rm.outrosGanhos, "positive"],
    ["Despesas", rm.despesas, "negative"],
    ["Investido", rm.investido, "invest"],
    ["Saldo", rm.saldo, rm.saldo >= 0 ? "positive" : "negative"],
  ];
  document.getElementById("rel-mes-detalhe").innerHTML =
    linhas.map(([rotulo, valor, classe]) => `<div class="rel-mes-row">
      <span class="rel-mes-row-label">${rotulo}</span>
      <span class="rel-mes-row-value ${classe}">${moeda(valor)}</span>
    </div>`).join("") +
    `<div class="rel-mes-row">
      <span class="rel-mes-row-label">Taxa de poupança</span>
      <span class="rel-mes-row-value">${formatarTaxaPoupanca(rm)}</span>
    </div>`;
}

function linhaResumoMensalHTML(rotulo, r, negrito) {
  const c = (v) => (negrito ? `<strong>${v}</strong>` : v);
  return `<td>${c(rotulo)}</td>
    <td class="right positive">${c(moeda(r.salario))}</td>
    <td class="right positive">${c(moeda(r.outrosGanhos))}</td>
    <td class="right negative">${c(moeda(r.despesas))}</td>
    <td class="right invest">${c(moeda(r.investido))}</td>
    <td class="right ${r.saldo >= 0 ? "positive" : "negative"}">${c(moeda(r.saldo))}</td>
    <td class="right">${c(formatarTaxaPoupanca(r))}</td>`;
}

function renderRelatorios() {
  const meses = mesesDoRelatorio();
  const r = resumoDoMes(dados.transacoes, mesSelecionado);
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

  graficoCategoriasPercentual("rel-categorias-barras", despesasPorCategoria(dados.transacoes, meses), "Sem despesas no período");

  const resumos = meses.map((m) => resumoDoMes(dados.transacoes, m));
  const linhas = meses
    .map((m, i) => `<tr>${linhaResumoMensalHTML(nomeMes(m) + (mesFechado(m) ? " 🔒" : ""), resumos[i], false)}</tr>`)
    .reverse();

  const totais = resumos.reduce(
    (acc, rm) => {
      for (const k of Object.keys(acc)) acc[k] += rm[k];
      return acc;
    },
    { salario: 0, outrosGanhos: 0, despesas: 0, investido: 0, saldo: 0, ganhos: 0 }
  );
  const rodape = `<tr class="table-total">${linhaResumoMensalHTML("Total do período", totais, true)}</tr>`;

  document.getElementById("tabela-resumo-mensal").innerHTML = linhas.join("") + rodape;
  renderRelMesMobileDetalhe();
}

/* ---------- Renderização: Configurações ---------- */

function renderConfiguracoes() {
  document.getElementById("config-salario").value = dados.config.salario || "";
  document.getElementById("config-dia-salario").value = dados.config.diaSalario || 5;
  document.getElementById("config-gemini-key").value = dados.config.geminiApiKey || "";

  const info = document.getElementById("config-salario-info");
  info.textContent = dados.config.salario > 0 && dados.config.mesInicioSalario
    ? `Lançado automaticamente todo mês desde ${nomeMes(dados.config.mesInicioSalario)}.`
    : " ";

  document.getElementById("lista-categorias").innerHTML = dados.config.categorias
    .map((c) => {
      const nome = escapeHTML(c);
      return `<span class="chip">${nome} <button data-remover-cat="${nome}" title="Remover" aria-label="Remover categoria ${nome}">✕</button></span>`;
    })
    .join("");
}

function renderResumoSidebar() {
  const r = resumoDoMes(dados.transacoes, mesSelecionado);

  document.getElementById("sidebar-salario").textContent = moeda(dados.config.salario);

  const elLivre = document.getElementById("sidebar-livre");
  elLivre.textContent = moeda(r.saldo);
  elLivre.className = "summary-value " + (r.saldo >= 0 ? "positive" : "negative");

  document.getElementById("sidebar-investimentos").textContent = moeda(carteiraAtual().total);
}

function atualizarControlesMes() {
  const mesHoje = mesDe(hojeISO());
  const limiteAvanco = mesLimiteAvanco();
  const fechado = mesFechado(mesSelecionado);

  document.getElementById("mes-atual-label").textContent = nomeMes(mesSelecionado);
  atualizarIndicadorMes(document.getElementById("mes-status-dot"), mesSelecionado);

  const btnProximo = document.getElementById("mes-proximo");
  const noLimite = mesSelecionado >= limiteAvanco;
  btnProximo.disabled = noLimite;
  btnProximo.title = noLimite
    ? limiteAvanco > mesHoje
      ? "Feche este mês para avançar além de " + nomeMes(limiteAvanco)
      : "Não é possível avançar além do mês atual"
    : "Próximo mês";

  document.getElementById("mes-hoje").disabled = mesSelecionado === mesHoje;

  const btnFechar = document.getElementById("mes-fechar");
  btnFechar.textContent = fechado ? "Reabrir mês" : "Fechar mês";
  btnFechar.title = fechado
    ? "Reabrir o mês para permitir alterações"
    : "Encerrar o mês selecionado e ir para o próximo";

  ["btn-nova-transacao", "btn-nova-transacao-2", "btn-nova-transacao-3", "btn-nova-transacao-mobile"].forEach((id) => {
    document.getElementById(id).disabled = fechado;
  });
  document.getElementById("form-investimento-carteira")
    .querySelectorAll("input, select, button")
    .forEach((el) => { el.disabled = fechado; });
}

async function fecharMes() {
  const r = resumoDoMes(dados.transacoes, mesSelecionado);
  const ok = await confirmar(
    `Fechar ${nomeMes(mesSelecionado)}?`,
    `Saldo do mês: ${moeda(r.saldo)}\nDespesas: ${moeda(r.despesas)} · Investido: ${moeda(r.investido)}\n\n` +
      "O mês ficará somente leitura (sem criar, editar ou excluir lançamentos nele) até ser reaberto. Você será levado ao mês seguinte.",
    { rotulo: "Fechar mês" }
  );
  if (!ok || mesFechado(mesSelecionado)) return;

  const mesEncerrado = mesSelecionado;
  dados.config.mesesFechados.push(mesEncerrado);
  dados.config.mesesFechados.sort();
  mesSelecionado = proximoMes(mesEncerrado);
  sincronizarSalariosApp();
  persistir(`${nomeMes(mesEncerrado)} fechado. Indo para ${nomeMes(mesSelecionado)}.`);
}

async function reabrirMes() {
  const mes = mesSelecionado;
  const ok = await confirmar(
    `Reabrir ${nomeMes(mes)}?`,
    "Os lançamentos deste mês voltarão a poder ser criados, editados e excluídos.",
    { rotulo: "Reabrir mês" }
  );
  if (!ok || !mesFechado(mes)) return;

  dados.config.mesesFechados = dados.config.mesesFechados.filter((m) => m !== mes);
  sincronizarSalariosApp();
  persistir(`${nomeMes(mes)} reaberto.`);
}

/* ---------- Renderização geral ---------- */

function renderizar() {
  diaRenderizado = hojeISO();
  preencherFiltroCategorias();
  renderResumoSidebar();
  atualizarControlesMes();

  if (secaoAtiva === "dashboard") renderDashboard();
  else if (secaoAtiva === "transacoes") renderTransacoes();
  else if (secaoAtiva === "investimentos") renderInvestimentos();
  else if (secaoAtiva === "relatorios") renderRelatorios();
  else if (secaoAtiva === "configuracoes") renderConfiguracoes();
}

/* ---------- IA (Gemini): transação em linguagem natural ---------- */

// Manter em sincronia com api/ia.js (modelos, prompt e schema).
const GEMINI_MODELOS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
];
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_STATUS_TENTAR_PROXIMO = [404, 429, 500, 503, 504];
const IA_TIMEOUT_MS = 20000;

/** Monta o prompt com o contexto necessário para interpretar o texto do usuário. */
function promptTransacaoIA(texto) {
  const categorias = dados.config.categorias.length ? dados.config.categorias : ["Outros"];
  return [
    "Você interpreta lançamentos financeiros pessoais escritos em português informal e os converte em dados estruturados.",
    "",
    `Data de hoje: ${hojeISO()}.`,
    `Mês selecionado no app: ${mesSelecionado}.`,
    `Categorias de despesa disponíveis: ${categorias.join(", ")}.`,
    "",
    "Regras:",
    '- "tipo": "ganho" para dinheiro recebido, "despesa" para gastos. Na dúvida, use "despesa".',
    '- "descricao": curta e capitalizada, sem valor nem data (ex.: "Supermercado", "Uber").',
    '- "valor": número positivo em reais.',
    '- "data": formato YYYY-MM-DD. Resolva termos relativos ("hoje", "ontem", "sexta passada") usando a data de hoje.',
    "  Se o texto não citar data, use a data de hoje se ela estiver no mês selecionado; senão, use o dia 01 do mês selecionado.",
    '- "categoria": exatamente uma da lista de categorias (apenas para despesas). Se nenhuma servir, use "Outros" ou a mais próxima.',
    '- "formaPagamento": "debito", "credito" ou "pix" (apenas para despesas). Sem menção, use "debito". Compras parceladas normalmente são no crédito.',
    '- "parcelas": número de 1 a 12. Sem menção a parcelamento, use 1. "3x" significa 3 parcelas e o valor informado é o total.',
    "",
    "Texto do usuário:",
    texto,
  ].join("\n");
}

async function fetchComTimeout(url, opcoes) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IA_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opcoes, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Interpreta o texto do usuário e retorna a transação sugerida.
 * Caminho padrão: endpoint /api/ia (chave guardada no servidor).
 * Fallback: chave pessoal configurada pelo usuário (chamada direta ao Gemini),
 * útil para rodar localmente via file:// ou localhost sem backend.
 */
async function interpretarTransacaoIA(texto) {
  const chavePessoal = (dados.config.geminiApiKey || "").trim();
  const eLocal = location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";

  if (eLocal) {
    if (!chavePessoal) {
      throw new Error("Configure sua chave da API do Gemini em Configurações para usar a IA localmente.");
    }
    return interpretarViaChavePessoal(texto, chavePessoal);
  }

  try {
    return await interpretarViaEndpoint(texto);
  } catch (e) {
    // Endpoint inexistente (ex.: hospedagem sem funções) e há chave pessoal: usa a chave
    if ((e.status === 404 || e.status === 405) && chavePessoal) {
      return interpretarViaChavePessoal(texto, chavePessoal);
    }
    throw e;
  }
}

/** Chama a função serverless /api/ia, que usa a chave do projeto. */
async function interpretarViaEndpoint(texto) {
  let resposta;
  try {
    resposta = await fetchComTimeout("/api/ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto,
        categorias: dados.config.categorias,
        hoje: hojeISO(),
        mesSelecionado,
      }),
    });
  } catch (e) {
    throw new Error(e.name === "AbortError"
      ? "A IA demorou demais para responder. Tente novamente."
      : "Sem conexão com a API. Verifique sua internet.");
  }

  let json = null;
  try {
    json = await resposta.json();
  } catch { /* resposta sem corpo JSON */ }

  if (!resposta.ok) {
    const e = new Error(json?.erro || `Erro na IA (${resposta.status}). Tente novamente.`);
    e.status = resposta.status;
    throw e;
  }

  return validarSugestaoIA(json, dados.config.categorias, hojeISO());
}

/** Chamada direta ao Gemini com a chave pessoal do usuário. */
async function interpretarViaChavePessoal(texto, chave) {
  const corpo = {
    contents: [{ parts: [{ text: promptTransacaoIA(texto) }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING", enum: ["ganho", "despesa"] },
          descricao: { type: "STRING" },
          valor: { type: "NUMBER" },
          data: { type: "STRING" },
          categoria: { type: "STRING" },
          formaPagamento: { type: "STRING", enum: ["debito", "credito", "pix"] },
          parcelas: { type: "INTEGER" },
        },
        required: ["tipo", "descricao", "valor", "data"],
      },
    },
  };

  const json = await chamarGeminiGenerateContent(chave, corpo);
  const textoIA = extrairTextoGemini(json);
  if (!textoIA) throw new Error("A IA não retornou uma resposta válida. Tente reescrever.");

  let s;
  try {
    s = JSON.parse(textoIA);
  } catch {
    throw new Error("Não foi possível interpretar a resposta da IA. Tente reescrever.");
  }
  return validarSugestaoIA(s, dados.config.categorias, hojeISO());
}

/** Tenta os modelos em ordem; indisponibilidade ou limite em um modelo passa para o próximo. */
async function chamarGeminiGenerateContent(chave, corpo) {
  let ultimoStatus = 404;
  let ultimoDetalhe = "";

  for (const modelo of GEMINI_MODELOS) {
    let resposta;
    try {
      resposta = await fetchComTimeout(`${GEMINI_API_BASE}/${modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
        body: JSON.stringify(corpo),
      });
    } catch (e) {
      if (e.name !== "AbortError") throw new Error("Sem conexão com a API. Verifique sua internet.");
      ultimoStatus = 504;
      ultimoDetalhe = "";
      continue;
    }

    if (resposta.ok) return resposta.json();

    ultimoStatus = resposta.status;
    ultimoDetalhe = await lerErroGemini(resposta);
    if (!GEMINI_STATUS_TENTAR_PROXIMO.includes(resposta.status)) break;
  }

  throw new Error(mensagemErroGemini(ultimoStatus, ultimoDetalhe));
}

async function lerErroGemini(resposta) {
  try {
    const json = await resposta.json();
    return json?.error?.message || "";
  } catch {
    return "";
  }
}

function mensagemErroGemini(status, detalhe) {
  const texto = (detalhe || "").toLowerCase();
  if (status === 401 || status === 403 || (status === 400 && /api key|permission|unregistered/.test(texto))) {
    return "Chave da API inválida. Confira em Configurações.";
  }
  if (status === 400) return "A IA não conseguiu interpretar o texto. Tente reescrever.";
  if (status === 429) return "Limite gratuito da API atingido. Tente novamente em instantes.";
  if (status === 404) return "Nenhum modelo Gemini disponível para esta chave. No AI Studio, confirme que a chave está ativa.";
  if (status === 504) return "A IA demorou demais para responder. Tente novamente.";
  if (status >= 500) return "Serviço de IA indisponível no momento. Tente novamente em instantes.";
  return detalhe || `Erro na API do Gemini (${status}). Tente novamente.`;
}

function extrairTextoGemini(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => p.text || "").join("").trim();
}

/** Preenche o formulário do modal com a sugestão da IA (o usuário revisa antes de salvar). */
function aplicarSugestaoIA(s) {
  document.querySelector(`input[name="tx-tipo"][value="${s.tipo}"]`).checked = true;
  document.getElementById("tx-descricao").value = s.descricao;
  document.getElementById("tx-valor").value = s.valor;
  document.getElementById("tx-data").value = s.data;

  if (s.tipo === "despesa") {
    document.getElementById("tx-forma-pagamento").value = s.formaPagamento;
    selecionarCategoriaModal(s.categoria);
  }

  atualizarCamposModal();

  if (s.tipo === "despesa" && s.parcelas > 1 && (s.formaPagamento === "credito" || s.formaPagamento === "pix")) {
    preencherSelectParcelas();
    document.getElementById("tx-parcelas").value = String(s.parcelas);
  }
}

function statusIA(msg, tipo) {
  const el = document.getElementById("ia-nl-status");
  el.textContent = msg || " ";
  el.classList.toggle("hidden", !msg);
  el.classList.toggle("ia-nl-status-erro", tipo === "erro");
}

async function preencherComIA() {
  const input = document.getElementById("tx-nl-texto");
  const btn = document.getElementById("btn-ia-preencher");
  const texto = input.value.trim();

  if (!texto) {
    statusIA("Descreva a transação primeiro, ex.: “gastei 45 no mercado ontem”.", "erro");
    input.focus();
    return;
  }

  btn.disabled = true;
  input.disabled = true;
  statusIA("Interpretando com IA…");

  try {
    const sugestao = await interpretarTransacaoIA(texto);
    aplicarSugestaoIA(sugestao);
    if (mesFechado(mesDe(sugestao.data))) {
      statusIA(`A data sugerida está em ${nomeMes(mesDe(sugestao.data))}, que está fechado. Ajuste a data antes de salvar.`, "erro");
    } else {
      statusIA("Formulário preenchido. Revise os campos e salve.");
    }
  } catch (e) {
    statusIA(e.message, "erro");
  } finally {
    btn.disabled = false;
    input.disabled = false;
  }
}

/* ---------- Modal de transação ---------- */

/** Grade de categorias; inclui a categoria da transação editada mesmo que tenha sido removida da lista. */
function preencherGridCategorias(selecionada) {
  const grid = document.getElementById("tx-categoria-grid");
  const categorias = dados.config.categorias.length ? [...dados.config.categorias] : ["Outros"];
  if (selecionada && !categorias.includes(selecionada)) categorias.push(selecionada);
  const cat = selecionada || categorias[0];

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
  const modoResgate = !!resgateEmEdicao;
  document.getElementById("grupo-categoria").classList.toggle("hidden", tipo !== "despesa");
  document.getElementById("grupo-ativo").classList.toggle("hidden", tipo !== "investimento" || modoResgate);
  document.getElementById("grupo-resgate").classList.toggle("hidden", tipo !== "investimento" || modoResgate);
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

  let html = "";
  for (let i = 1; i <= PARCELAS_MAX; i++) {
    const label = i === 1 ? "À vista (1x)" : `${i}x de ${moeda(valorAtual / i)}`;
    html += `<option value="${i}">${label}</option>`;
  }
  select.innerHTML = html;
  select.value = Number(selecionado) <= PARCELAS_MAX ? selecionado : "1";
}

function mostrarInfoModal(texto) {
  const el = document.getElementById("tx-info");
  el.textContent = texto || " ";
  el.classList.toggle("hidden", !texto);
}

/**
 * Abre o modal para nova transação (tx = null), edição (tx) ou resgate de
 * um projeto da carteira ({resgateDe: projeto de posicaoCarteira}).
 */
function abrirModal(tx, { resgateDe = null } = {}) {
  if (!tx && !resgateDe && mesFechado(mesSelecionado)) {
    toast("Este mês está fechado. Reabra-o para adicionar lançamentos.");
    return;
  }
  if (tx && bloqueadoPorMesFechado(tx.data)) return;

  resgateEmEdicao = resgateDe;
  const form = document.getElementById("form-transacao");
  form.reset();
  document.getElementById("tx-id").value = tx ? tx.id : "";
  document.getElementById("modal-titulo").textContent = resgateDe
    ? `Resgatar — ${resgateDe.descricao}`
    : tx ? "Editar transação" : "Nova transação";

  // Entrada por linguagem natural (IA): apenas em lançamentos novos
  document.getElementById("ia-nl-wrap").classList.toggle("hidden", !!tx || !!resgateDe);
  document.getElementById("tx-nl-texto").value = "";
  statusIA("");

  // Tipo travado quando trocar de tipo perderia informações (investimento, parcela, salário)
  const travarTipo = !!resgateDe || (tx && (tx.tipo === "investimento" || tx.parcelamentoId || tx.salarioAuto));
  document.getElementById("tx-tipo-toggle").classList.toggle("hidden", !!travarTipo);

  const elDescricao = document.getElementById("tx-descricao");
  const elValor = document.getElementById("tx-valor");
  elDescricao.readOnly = !!resgateDe;
  elValor.removeAttribute("max");
  elValor.placeholder = "0,00";
  mostrarInfoModal("");

  let categoriaInicial = null;
  if (tx) {
    const radioTipo = document.querySelector(`input[name="tx-tipo"][value="${tx.tipo}"]`);
    if (radioTipo) radioTipo.checked = true;
    elDescricao.value = tx.descricao;
    elValor.value = tx.valor;
    document.getElementById("tx-data").value = tx.data;
    if (tx.ativo) document.getElementById("tx-ativo").value = tx.ativo;
    document.getElementById("tx-resgate").checked = !!tx.resgate;
    document.getElementById("tx-forma-pagamento").value = tx.formaPagamento || "debito";
    if (tx.tipo === "despesa") categoriaInicial = tx.categoria || null;
    if (tx.parcelaTotal > 1) {
      mostrarInfoModal(`Parcela ${tx.parcelaAtual} de ${tx.parcelaTotal} · ${FORMAS_PAGAMENTO[tx.formaPagamento] || ""}`);
    } else if (tx.salarioAuto) {
      mostrarInfoModal("Salário lançado automaticamente. Após editar, ele não acompanha mais mudanças feitas em Configurações.");
    }
  } else {
    // Data padrão: hoje se estivermos no mês selecionado, senão dia 1 do mês
    const hoje = hojeISO();
    document.getElementById("tx-data").value = mesDe(hoje) === mesSelecionado ? hoje : `${mesSelecionado}-01`;
    document.getElementById("tx-forma-pagamento").value = "debito";

    if (resgateDe) {
      const maximo = Math.round(resgateDe.saldoAtual * 100) / 100;
      document.querySelector('input[name="tx-tipo"][value="investimento"]').checked = true;
      elDescricao.value = resgateDe.descricao;
      elValor.max = maximo.toFixed(2);
      elValor.placeholder = `máx. ${maximo.toFixed(2).replace(".", ",")}`;
      mostrarInfoModal(`Saldo disponível: ${moeda(maximo)}`);
    } else {
      document.querySelector('input[name="tx-tipo"][value="despesa"]').checked = true;
    }
  }

  if (!categoriaInicial) {
    const cats = dados.config.categorias;
    categoriaInicial = cats.includes("Alimentação") ? "Alimentação" : cats[0] || "Outros";
  }
  preencherGridCategorias(categoriaInicial);
  atualizarCamposModal();

  const modal = document.getElementById("modal-transacao");
  abrirCamada(modal, fecharModal);
  (resgateDe ? elValor : elDescricao).focus();
}

function fecharModal() {
  resgateEmEdicao = null;
  fecharCamada(document.getElementById("modal-transacao"));
}

function salvarTransacaoDoForm(e) {
  e.preventDefault();
  const id = document.getElementById("tx-id").value;
  const tipo = document.querySelector('input[name="tx-tipo"]:checked').value;
  const valor = Math.round(parseFloat(document.getElementById("tx-valor").value) * 100) / 100;
  const descricao = document.getElementById("tx-descricao").value.trim();
  const data = document.getElementById("tx-data").value;

  if (!descricao || !dataValida(data) || !(valor > 0)) {
    toast("Preencha descrição, valor e data.");
    return;
  }

  const original = id ? dados.transacoes.find((t) => t.id === id) : null;
  if (id && !original) {
    toast("Esta transação não existe mais.");
    fecharModal();
    return;
  }
  if (original && bloqueadoPorMesFechado(original.data)) return;
  if (bloqueadoPorMesFechado(data)) return;

  const tx = { id: id || uid(), tipo, descricao, valor, data };

  if (tipo === "despesa") {
    const cat = document.getElementById("tx-categoria").value;
    if (!cat) {
      toast("Selecione uma categoria.");
      return;
    }
    tx.categoria = cat;
    tx.formaPagamento = document.getElementById("tx-forma-pagamento").value;
  }

  if (tipo === "ganho") {
    tx.categoria = original?.tipo === "ganho" && original.categoria ? original.categoria : "Ganhos";
  }

  if (tipo === "investimento") {
    if (resgateEmEdicao) {
      const projeto = posicaoCarteira(dados.transacoes, data).projetos.find((p) => p.descricao === resgateEmEdicao.descricao);
      const saldo = projeto ? projeto.saldoAtual : 0;
      if (valor > saldo + 0.0051) {
        toast(`Saldo de "${resgateEmEdicao.descricao}" em ${dataBR(data)}: ${moeda(saldo)}. Informe um valor menor.`);
        return;
      }
      tx.ativo = resgateEmEdicao.ativo;
      tx.resgate = true;
    } else if (!original) {
      toast("Adicione investimentos pela seção Investimentos.");
      return;
    } else {
      tx.ativo = document.getElementById("tx-ativo").value;
      tx.resgate = document.getElementById("tx-resgate").checked;
    }
  }

  // Parcelamento: só disponível para despesas novas pagas em crédito/PIX
  const grupoParcelas = document.getElementById("grupo-parcelas");
  const parcelas = !original && tipo === "despesa" && !grupoParcelas.classList.contains("hidden")
    ? parseInt(document.getElementById("tx-parcelas").value, 10) || 1
    : 1;

  if (parcelas > 1) {
    const lista = gerarParcelas(tx, parcelas);
    const emMesFechado = lista.find((p) => mesFechado(mesDe(p.data)));
    if (emMesFechado) {
      toast(`A parcela ${emMesFechado.parcelaAtual}/${parcelas} cairia em ${nomeMes(mesDe(emMesFechado.data))}, que está fechado.`);
      return;
    }
    dados.transacoes.push(...lista);
    fecharModal();
    persistir(`Despesa parcelada em ${parcelas}x adicionada.`);
    return;
  }

  if (original) {
    if (original.rendimentoMensal != null) tx.rendimentoMensal = original.rendimentoMensal;
    if (original.parcelamentoId) {
      tx.parcelamentoId = original.parcelamentoId;
      tx.parcelaAtual = original.parcelaAtual;
      tx.parcelaTotal = original.parcelaTotal;
    }
    if (original.salarioAuto) {
      if (mesDe(data) === mesDe(original.data)) {
        tx.salarioAuto = true;
        const mudou = valor !== original.valor || data !== original.data || descricao !== original.descricao;
        if (original.salarioEditado || mudou) tx.salarioEditado = true;
      } else {
        // Movido para outro mês: vira um ganho comum e o mês de origem fica sem salário automático
        ignorarSalarioNoMes(mesDe(original.data));
      }
    }
    dados.transacoes[dados.transacoes.indexOf(original)] = tx;
  } else {
    dados.transacoes.push(tx);
  }

  const msg = tx.resgate && !original ? "Resgate registrado." : original ? "Transação atualizada." : "Transação adicionada.";
  fecharModal();
  persistir(msg);
}

async function excluirTransacao(id) {
  const t = dados.transacoes.find((x) => x.id === id);
  if (!t || bloqueadoPorMesFechado(t.data)) return;

  if (t.parcelamentoId) {
    const todas = dados.transacoes.filter((x) => x.parcelamentoId === t.parcelamentoId);
    const abertas = todas.filter((x) => !mesFechado(mesDe(x.data)));
    const emFechados = todas.length - abertas.length;

    const botoes = [];
    if (abertas.length > 1) {
      botoes.push({
        valor: "todas",
        rotulo: emFechados ? `Excluir as ${abertas.length} em meses abertos` : `Excluir todas (${todas.length})`,
        estilo: "danger",
      });
    }
    botoes.push({ valor: "esta", rotulo: "Só esta parcela", estilo: abertas.length > 1 ? "outline" : "danger" });

    const escolha = await dialogo({
      titulo: "Excluir parcela",
      mensagem: `"${t.descricao}" (${moeda(t.valor)}) faz parte de um parcelamento em ${todas.length}x.` +
        (emFechados ? `\n\n${emFechados} parcela(s) estão em meses fechados e serão mantidas.` : ""),
      botoes,
    });
    if (!escolha) return;

    const ids = new Set(escolha === "todas" ? abertas.map((x) => x.id) : [t.id]);
    dados.transacoes = dados.transacoes.filter((x) => !ids.has(x.id));
    persistir(escolha === "todas" ? "Parcelas excluídas." : "Parcela excluída.");
    return;
  }

  if (t.salarioAuto) {
    const mes = mesDe(t.data);
    const ok = await confirmar(
      "Excluir salário",
      `Excluir o salário de ${nomeMes(mes)} (${moeda(t.valor)})? Ele não será lançado automaticamente de novo neste mês.`,
      { rotulo: "Excluir", perigo: true }
    );
    if (!ok) return;
    ignorarSalarioNoMes(mes);
    dados.transacoes = dados.transacoes.filter((x) => x.id !== id);
    persistir("Salário do mês excluído.");
    return;
  }

  const ok = await confirmar("Excluir transação", `Excluir "${t.descricao}" de ${moeda(t.valor)}?`, { rotulo: "Excluir", perigo: true });
  if (!ok) return;
  dados.transacoes = dados.transacoes.filter((x) => x.id !== id);
  persistir("Transação excluída.");
}

/* ---------- Categorias ---------- */

function adicionarCategoria() {
  const input = document.getElementById("nova-categoria");
  const nome = input.value.trim().slice(0, 40);
  if (!nome) return;
  if (dados.config.categorias.some((c) => c.toLowerCase() === nome.toLowerCase())) {
    toast("Essa categoria já existe.");
    return;
  }
  dados.config.categorias.push(nome);
  input.value = "";
  persistir(`Categoria "${nome}" adicionada.`);
}

async function removerCategoria(cat) {
  if (dados.config.categorias.length <= 1) {
    toast("Mantenha ao menos uma categoria.");
    return;
  }
  const emUso = dados.transacoes.filter((t) => t.tipo === "despesa" && t.categoria === cat).length;
  const ok = await confirmar(
    "Remover categoria",
    emUso
      ? `${emUso} lançamento(s) usam "${cat}". Eles mantêm essa categoria, mas ela deixa de aparecer para novos lançamentos.`
      : `Remover "${cat}" da lista de categorias?`,
    { rotulo: "Remover", perigo: true }
  );
  if (!ok) return;
  dados.config.categorias = dados.config.categorias.filter((c) => c !== cat);
  persistir(`Categoria "${cat}" removida.`);
}

/* ---------- Exportação / importação ---------- */

function baixarArquivo(nome, conteudo, mime) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarCSV() {
  const cabecalho = linhaCSV(["Data", "Tipo", "Descrição", "Categoria/Ativo", "Forma de pagamento", "Parcela", "Resgate", "Valor"]);
  const linhas = [...dados.transacoes]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((t) => linhaCSV([
      dataBR(t.data),
      infoVisualTransacao(t).nomeTipo,
      t.descricao,
      t.categoria || t.ativo || "",
      t.tipo === "despesa" ? FORMAS_PAGAMENTO[t.formaPagamento] || "" : "",
      t.parcelaTotal > 1 ? `${t.parcelaAtual} de ${t.parcelaTotal}` : "",
      t.tipo === "investimento" ? (t.resgate ? "Sim" : "Não") : "",
      t.valor,
    ]));
  const csv = "﻿" + [cabecalho, ...linhas].join("\r\n"); // BOM para acentos no Excel
  baixarArquivo(`financas_${hojeISO()}.csv`, csv, "text/csv;charset=utf-8");
  toast("CSV exportado.");
}

function exportarJSON() {
  const { geminiApiKey, ...config } = dados.config; // a chave pessoal não vai para o backup
  baixarArquivo(
    `financas_backup_${hojeISO()}.json`,
    JSON.stringify({ transacoes: dados.transacoes, config }, null, 2),
    "application/json"
  );
  toast("Backup JSON exportado.");
}

async function importarJSON(arquivo) {
  let resultado;
  try {
    resultado = sanitizarDados(JSON.parse(await arquivo.text()));
  } catch {
    toast("Arquivo inválido. Use um backup JSON exportado por esta aplicação.");
    return;
  }

  const { dados: novos, descartadas } = resultado;
  const ok = await confirmar(
    "Importar backup",
    `Importar backup com ${novos.transacoes.length} transações? Isto substituirá os dados atuais.` +
      (descartadas ? `\n\n${descartadas} lançamento(s) inválido(s) do arquivo serão ignorados.` : ""),
    { rotulo: "Importar", perigo: true }
  );
  if (!ok) return;

  novos.config.geminiApiKey = dados.config.geminiApiKey; // mantém a chave deste navegador
  dados = novos;
  sincronizarSalariosApp();
  persistir("Backup importado com sucesso.");
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
    mudarMes(mesesAtras(2, mesSelecionado)[0]);
  });
  document.getElementById("mes-proximo").addEventListener("click", () => {
    if (mesSelecionado < mesLimiteAvanco()) mudarMes(proximoMes(mesSelecionado));
  });
  document.getElementById("mes-fechar").addEventListener("click", () => {
    if (mesFechado(mesSelecionado)) reabrirMes();
    else fecharMes();
  });
  document.getElementById("mes-hoje").addEventListener("click", () => mudarMes(mesDe(hojeISO())));

  // Botões de nova transação
  ["btn-nova-transacao", "btn-nova-transacao-2", "btn-nova-transacao-3", "btn-nova-transacao-mobile"].forEach((id) => {
    document.getElementById(id).addEventListener("click", () => abrirModal(null));
  });
  document.getElementById("form-investimento-carteira").addEventListener("submit", salvarInvestimentoCarteira);

  // Modais e diálogos
  document.addEventListener("keydown", teclaNasCamadas);
  document.getElementById("modal-fechar").addEventListener("click", fecharModal);
  document.getElementById("modal-transacao").addEventListener("click", (e) => {
    if (e.target.id === "modal-transacao") fecharModal();
  });
  document.getElementById("modal-dialogo").addEventListener("click", (e) => {
    if (e.target.id === "modal-dialogo" && finalizarDialogo) finalizarDialogo(null);
  });
  document.querySelectorAll('input[name="tx-tipo"]').forEach((r) =>
    r.addEventListener("change", atualizarCamposModal)
  );
  document.getElementById("tx-forma-pagamento").addEventListener("change", atualizarCamposModal);
  document.getElementById("tx-valor").addEventListener("input", () => {
    if (!document.getElementById("grupo-parcelas").classList.contains("hidden")) preencherSelectParcelas();
  });
  document.getElementById("form-transacao").addEventListener("submit", salvarTransacaoDoForm);
  document.getElementById("tx-categoria-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-grid-btn");
    if (btn) selecionarCategoriaModal(btn.dataset.categoria);
  });

  // Ações nas listas (delegação)
  document.body.addEventListener("click", (e) => {
    const alvo = e.target.closest("[data-editar], [data-excluir], [data-excluir-projeto], [data-resgatar-projeto], [data-remover-cat]");
    if (!alvo) return;
    const ds = alvo.dataset;
    if (ds.editar) {
      const tx = dados.transacoes.find((t) => t.id === ds.editar);
      if (tx) abrirModal(tx);
    } else if (ds.excluir) {
      excluirTransacao(ds.excluir);
    } else if (ds.resgatarProjeto) {
      abrirResgate(ds.resgatarProjeto);
    } else if (ds.excluirProjeto) {
      excluirProjetoCarteira(ds.excluirProjeto);
    } else if (ds.removerCat) {
      removerCategoria(ds.removerCat);
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
    if (relMesIndice >= mesesDoRelatorio().length - 1) return;
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
    const novoSalario = Math.max(0, Math.round((parseFloat(document.getElementById("config-salario").value) || 0) * 100) / 100);
    const mesHoje = mesDe(hojeISO());
    dados.config.salario = novoSalario;
    dados.config.diaSalario = limitarDiaSalario(document.getElementById("config-dia-salario").value);

    if (novoSalario > 0 && !dados.config.mesInicioSalario) {
      // Começa a valer a partir do mês em que o usuário configurou
      dados.config.mesInicioSalario = mesHoje;
    } else if (novoSalario <= 0) {
      dados.config.mesInicioSalario = null;
    }

    aplicarMudancaSalario(dados, mesHoje);
    sincronizarSalariosApp();
    persistir("Configurações salvas.");
  });

  document.getElementById("btn-salvar-gemini").addEventListener("click", () => {
    dados.config.geminiApiKey = document.getElementById("config-gemini-key").value.trim();
    if (salvar()) toast(dados.config.geminiApiKey ? "Chave da API salva." : "Chave da API removida.");
  });

  // IA: preencher transação por linguagem natural
  document.getElementById("btn-ia-preencher").addEventListener("click", preencherComIA);
  document.getElementById("tx-nl-texto").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // não submete o formulário; apenas interpreta o texto
      preencherComIA();
    }
  });

  document.getElementById("btn-add-categoria").addEventListener("click", adicionarCategoria);
  document.getElementById("nova-categoria").addEventListener("keydown", (e) => {
    if (e.key === "Enter") adicionarCategoria();
  });

  document.getElementById("btn-apagar-tudo").addEventListener("click", async () => {
    const ok = await confirmar(
      "Apagar todos os dados",
      "Todas as transações, configurações e a chave da API deste navegador serão apagadas. Esta ação não pode ser desfeita.\n\nConsidere exportar um backup antes.",
      { rotulo: "Apagar tudo", perigo: true }
    );
    if (!ok) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* sem acesso ao armazenamento */ }
    dados = dadosIniciais();
    mesSelecionado = mesDe(hojeISO());
    persistir("Todos os dados foram apagados.");
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (secaoAtiva === "dashboard") renderDashboard();
      else if (secaoAtiva === "investimentos") renderInvestimentos();
    }, 150);
  });

  // App aberto de um dia para o outro: atualiza salário automático e datas de referência
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || hojeISO() === diaRenderizado) return;
    sincronizarSalariosApp();
    renderizar();
  });
}

/* ---------- Inicialização ---------- */

configurarEventos();
sincronizarSalariosApp();
salvar(); // grava dados já normalizados/migrados
renderizar();
if (descartadasAoCarregar > 0) {
  toast(`${descartadasAoCarregar} lançamento(s) inválido(s) foram ignorados. Uma cópia dos dados originais foi guardada neste navegador.`);
}
