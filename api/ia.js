/**
 * Função serverless (Vercel) que interpreta transações em linguagem natural
 * usando a API do Google Gemini com a chave do projeto (GEMINI_API_KEY).
 *
 * A chave fica apenas no servidor, em Settings › Environment Variables.
 * O prompt é montado aqui (e não no cliente) para impedir que o endpoint
 * seja usado como proxy genérico para o Gemini.
 */

const GEMINI_MODELOS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
];
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const TEXTO_MAX = 300;
const CATEGORIAS_MAX = 30;
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

  for (const modelo of GEMINI_MODELOS) {
    const url = `${GEMINI_API_BASE}/${modelo}:generateContent?key=${encodeURIComponent(chave)}`;
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

    if (resposta.ok) return resposta.json();

    ultimoStatus = resposta.status;
    try {
      const json = await resposta.json();
      ultimoDetalhe = json?.error?.message || "";
    } catch {
      ultimoDetalhe = "";
    }
    if (resposta.status !== 404) break;
  }

  const erro = new Error(ultimoDetalhe || `Erro na API do Gemini (${ultimoStatus}).`);
  erro.status = ultimoStatus;
  throw erro;
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    return json(405, { erro: "Método não permitido." });
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
    if (e.status === 429) {
      return json(429, { erro: "Limite de uso da IA atingido. Tente novamente em instantes." });
    }
    if (e.status === 400 || e.status === 401 || e.status === 403) {
      return json(500, { erro: "IA temporariamente indisponível. Confira a chave GEMINI_API_KEY na Vercel." });
    }
    return json(502, { erro: "Erro ao consultar a IA. Tente novamente." });
  }
}
