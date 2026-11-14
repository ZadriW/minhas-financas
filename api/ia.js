/**
 * Função serverless (Vercel) que interpreta transações em linguagem natural
 * usando a API do Google Gemini com a chave do projeto (GEMINI_API_KEY).
 *
 * A chave fica apenas no servidor, em Settings › Environment Variables.
 * O prompt é montado aqui (e não no cliente) para impedir que o endpoint
 * seja usado como proxy genérico para o Gemini.
 *
 * Manter em sincronia com app.js (modelos, prompt e schema), usado quando o
 * usuário configura uma chave pessoal.
 */

// Do mais rápido ao mais lento: a extração é simples e o usuário está esperando.
const GEMINI_MODELOS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-3.5-flash",
];
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_STATUS_TENTAR_PROXIMO = [404, 429, 500, 503, 504];
const GEMINI_TIMEOUT_MS = 8000; // por tentativa
const GEMINI_ORCAMENTO_MS = 17000; // total, abaixo do limite do cliente (app.js)
const GEMINI_TEMPO_MINIMO_MS = 1500; // não inicia tentativa com menos tempo que isso

const TEXTO_MAX = 300;
const CATEGORIAS_MAX = 30;

// Limite por IP em memória: vale só dentro de cada instância da função
// (best-effort). Para um limite global, configure uma regra de rate limit
// no Firewall da Vercel para /api/ia.
const LIMITE_POR_MINUTO = 6;
const contadores = new Map();

function json(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function estourouLimite(ip) {
  const janela = Math.floor(Date.now() / 60000);
  const chave = `${ip}:${janela}`;
  const atual = (contadores.get(chave) || 0) + 1;
  contadores.set(chave, atual);
  if (contadores.size > 1000) {
    for (const k of contadores.keys()) {
      if (!k.endsWith(`:${janela}`)) contadores.delete(k);
    }
  }
  return atual > LIMITE_POR_MINUTO;
}

/** Aceita apenas chamadas do próprio site (navegadores sempre enviam Origin em POST cross-site). */
function origemPermitida(request) {
  const origem = request.headers.get("origin");
  if (!origem) return true;
  try {
    return new URL(origem).host === request.headers.get("host");
  } catch {
    return false;
  }
}

async function fetchComTimeout(url, opcoes, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opcoes, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function montarPrompt({ texto, categorias, hoje, mesSelecionado }) {
  return [
    "Você interpreta lançamentos financeiros pessoais escritos em português informal e os converte em dados estruturados.",
    "",
    `Data de hoje: ${hoje}.`,
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

function validarEntrada(body) {
  const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
  if (!texto) return { erro: "Texto da transação não informado." };
  if (texto.length > TEXTO_MAX) return { erro: `Texto muito longo (máximo ${TEXTO_MAX} caracteres).` };

  let categorias = Array.isArray(body?.categorias) ? body.categorias : [];
  categorias = categorias
    .filter((c) => typeof c === "string" && c.trim())
    .map((c) => c.trim().slice(0, 40))
    .slice(0, CATEGORIAS_MAX);
  if (!categorias.length) categorias = ["Outros"];

  const reData = /^\d{4}-\d{2}-\d{2}$/;
  const reMes = /^\d{4}-\d{2}$/;
  const hoje = reData.test(body?.hoje || "") ? body.hoje : new Date().toISOString().slice(0, 10);
  const mesSelecionado = reMes.test(body?.mesSelecionado || "") ? body.mesSelecionado : hoje.slice(0, 7);

  return { entrada: { texto, categorias, hoje, mesSelecionado } };
}

async function chamarGemini(chave, prompt) {
  const corpo = {
    contents: [{ parts: [{ text: prompt }] }],
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

  let ultimoStatus = 404;
  let ultimoDetalhe = "";
  const inicio = Date.now();

  for (const modelo of GEMINI_MODELOS) {
    const restante = GEMINI_ORCAMENTO_MS - (Date.now() - inicio);
    if (restante < GEMINI_TEMPO_MINIMO_MS) {
      ultimoStatus = 504;
      break;
    }

    const t0 = Date.now();
    let resposta;
    try {
      resposta = await fetchComTimeout(`${GEMINI_API_BASE}/${modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
        body: JSON.stringify(corpo),
      }, Math.min(GEMINI_TIMEOUT_MS, restante));
    } catch (e) {
      if (e.name !== "AbortError") throw e;
      console.log(`[ia] ${modelo} tempo esgotado (${Date.now() - t0} ms)`);
      ultimoStatus = 504;
      ultimoDetalhe = "";
      continue;
    }

    console.log(`[ia] ${modelo} -> ${resposta.status} (${Date.now() - t0} ms)`);
    if (resposta.ok) return resposta.json();

    ultimoStatus = resposta.status;
    try {
      const json = await resposta.json();
      ultimoDetalhe = json?.error?.message || "";
    } catch {
      ultimoDetalhe = "";
    }
    if (!GEMINI_STATUS_TENTAR_PROXIMO.includes(resposta.status)) break;
  }

  const erro = new Error(ultimoDetalhe || `Erro na API do Gemini (${ultimoStatus}).`);
  erro.status = ultimoStatus;
  throw erro;
}

/** Lê o corpo bruto: usa o req.body da Vercel quando existe, senão o stream. */
async function lerCorpo(req) {
  let corpo;
  try {
    corpo = req.body;
  } catch {
    return "{corpo inválido"; // a Vercel lança ao acessar req.body com JSON malformado
  }
  if (typeof corpo === "string") return corpo;
  if (Buffer.isBuffer(corpo)) return corpo.toString("utf8");
  if (corpo && typeof corpo === "object") return JSON.stringify(corpo);

  const pedacos = [];
  for await (const pedaco of req) pedacos.push(pedaco);
  return Buffer.concat(pedacos).toString("utf8");
}

/**
 * A Vercel chama funções Node no formato (req, res). Converte para
 * Request/Response da Web e delega para tratar().
 */
export default async function handler(req, res) {
  const headers = new Headers();
  for (const [nome, valor] of Object.entries(req.headers)) {
    if (typeof valor === "string") headers.set(nome, valor);
  }
  const temCorpo = req.method !== "GET" && req.method !== "HEAD";
  const request = new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
    method: req.method,
    headers,
    body: temCorpo ? await lerCorpo(req) : undefined,
  });

  const resposta = await tratar(request);
  res.statusCode = resposta.status;
  resposta.headers.forEach((valor, nome) => res.setHeader(nome, valor));
  res.end(Buffer.from(await resposta.arrayBuffer()));
}

async function tratar(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    return json(405, { erro: "Método não permitido." });
  }

  if (!origemPermitida(request)) {
    return json(403, { erro: "Origem não permitida." });
  }

  const chave = (process.env.GEMINI_API_KEY || "").trim();
  if (!chave) {
    return json(500, { erro: "IA não configurada no servidor. Defina GEMINI_API_KEY na Vercel." });
  }

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "desconhecido";
  if (estourouLimite(ip)) {
    return json(429, { erro: "Muitas solicitações. Aguarde um minuto e tente de novo." });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json(400, { erro: "Corpo da requisição inválido." });
  }

  const { erro, entrada } = validarEntrada(body);
  if (erro) return json(400, { erro });

  try {
    const resultado = await chamarGemini(chave, montarPrompt(entrada));
    const parts = resultado?.candidates?.[0]?.content?.parts;
    const textoIA = Array.isArray(parts) ? parts.map((p) => p.text || "").join("").trim() : "";
    if (!textoIA) {
      return json(502, { erro: "A IA não retornou uma resposta válida. Tente reescrever." });
    }

    let sugestao;
    try {
      sugestao = JSON.parse(textoIA);
    } catch {
      return json(502, { erro: "Não foi possível interpretar a resposta da IA. Tente reescrever." });
    }

    return json(200, sugestao);
  } catch (e) {
    const detalhe = (e.message || "").toLowerCase();
    if (e.status === 429) {
      return json(429, { erro: "Limite de uso da IA atingido. Tente novamente em instantes." });
    }
    if (e.status === 401 || e.status === 403 || (e.status === 400 && /api key|permission|unregistered/.test(detalhe))) {
      return json(500, { erro: "IA temporariamente indisponível. Confira a chave GEMINI_API_KEY na Vercel." });
    }
    if (e.status === 400) {
      return json(422, { erro: "A IA não conseguiu interpretar o texto. Tente reescrever." });
    }
    if (e.status === 504) {
      return json(504, { erro: "A IA demorou demais para responder. Tente novamente." });
    }
    return json(502, { erro: "Erro ao consultar a IA. Tente novamente." });
  }
}
