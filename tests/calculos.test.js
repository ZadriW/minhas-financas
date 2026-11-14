"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../calculos.js");

function dadosCom({ transacoes = [], config = {} } = {}) {
  const d = C.dadosIniciais();
  d.transacoes = transacoes;
  Object.assign(d.config, config);
  return d;
}

const perto = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≈ ${b}`);

describe("datas", () => {
  test("dataValida rejeita datas inexistentes e formatos errados", () => {
    assert.equal(C.dataValida("2026-02-28"), true);
    assert.equal(C.dataValida("2026-02-30"), false);
    assert.equal(C.dataValida("2026-2-01"), false);
    assert.equal(C.dataValida(null), false);
  });

  test("adicionarMeses ajusta ao último dia do mês", () => {
    assert.equal(C.adicionarMeses("2026-01-31", 1), "2026-02-28");
    assert.equal(C.adicionarMeses("2026-11-15", 3), "2027-02-15");
  });

  test("mesesDeAte e mesesAtras atravessam a virada do ano", () => {
    assert.deepEqual(C.mesesDeAte("2026-11", "2027-01"), ["2026-11", "2026-12", "2027-01"]);
    assert.deepEqual(C.mesesDeAte("2027-02", "2027-01"), []);
    assert.deepEqual(C.mesesAtras(3, "2027-01"), ["2026-11", "2026-12", "2027-01"]);
  });

  test("mesesEntre conta meses do calendário", () => {
    assert.equal(C.mesesEntre("2026-01-31", "2026-02-01"), 1);
    assert.equal(C.mesesEntre("2026-03-01", "2026-01-01"), 0);
  });
});

describe("resumoDoMes", () => {
  test("separa salário, outros ganhos, despesas e investimentos (resgate soma ao saldo)", () => {
    const txs = [
      { tipo: "ganho", valor: 5000, data: "2026-05-05", salarioAuto: true },
      { tipo: "ganho", valor: 300, data: "2026-05-10", categoria: "Ganhos" },
      { tipo: "despesa", valor: 1200, data: "2026-05-11" },
      { tipo: "investimento", valor: 1000, data: "2026-05-12" },
      { tipo: "investimento", valor: 200, data: "2026-05-20", resgate: true },
      { tipo: "despesa", valor: 999, data: "2026-06-01" },
    ];
    const r = C.resumoDoMes(txs, "2026-05");
    assert.equal(r.salario, 5000);
    assert.equal(r.outrosGanhos, 300);
    assert.equal(r.despesas, 1200);
    assert.equal(r.investido, 800);
    assert.equal(r.saldo, 3300);
    assert.equal(r.qtd, 5);
  });
});

describe("posicaoCarteira", () => {
  const aporte = { tipo: "investimento", descricao: "CDB", ativo: "Renda Fixa", valor: 1000, data: "2026-01-10", rendimentoMensal: 1 };

  test("juros compostos mensais até a data de referência", () => {
    const p = C.posicaoCarteira([aporte], "2026-04-05");
    perto(p.total, 1000 * 1.01 ** 3);
    perto(p.rendimentoTotal, 1000 * 1.01 ** 3 - 1000);
    perto(p.projetos[0].rendimentoMes, p.total * 0.01);
  });

  test("ignora lançamentos posteriores à data de referência", () => {
    const p = C.posicaoCarteira([aporte], "2025-12-31");
    assert.equal(p.total, 0);
    assert.equal(p.projetos.length, 0);
  });

  test("resgate parcial reduz o saldo e para de render sobre o valor resgatado", () => {
    const resgate = { tipo: "investimento", descricao: "CDB", valor: 500, data: "2026-02-10", resgate: true };
    const p = C.posicaoCarteira([aporte, resgate], "2026-03-10");
    perto(p.total, (1000 * 1.01 - 500) * 1.01);
    perto(p.projetos[0].aportado, 500);
  });

  test("resgate total remove o projeto da carteira", () => {
    const resgate = { tipo: "investimento", descricao: "CDB", valor: 1010, data: "2026-02-10", resgate: true };
    const p = C.posicaoCarteira([aporte, resgate], "2026-06-01");
    assert.equal(p.projetos.length, 0);
  });

  test("agrupa por descrição e usa a taxa do aporte mais recente", () => {
    const outro = { ...aporte, valor: 500, data: "2026-02-01", rendimentoMensal: 2 };
    const acoes = { tipo: "investimento", descricao: "PETR4", ativo: "Ações", valor: 3000, data: "2026-02-01", rendimentoMensal: 0 };
    const p = C.posicaoCarteira([aporte, outro, acoes], "2026-02-01");
    assert.equal(p.projetos.length, 2);
    assert.equal(p.projetos[0].descricao, "PETR4");
    const cdb = p.projetos[1];
    assert.equal(cdb.taxa, 2);
    perto(cdb.saldoAtual, 1000 * 1.02 + 500);
  });
});

describe("salário automático", () => {
  const base = { salario: 4000, diaSalario: 5, mesInicioSalario: "2026-09" };

  test("lança um salário por mês até o mês indicado, sem duplicar", () => {
    const d = dadosCom({ config: base });
    assert.equal(C.sincronizarSalarios(d, "2026-11"), true);
    assert.deepEqual(d.transacoes.map((t) => t.data), ["2026-09-05", "2026-10-05", "2026-11-05"]);
    assert.equal(C.sincronizarSalarios(d, "2026-11"), false);
    assert.equal(d.transacoes.length, 3);
  });

  test("não recria salário excluído pelo usuário nem lança em mês fechado", () => {
    const d = dadosCom({ config: { ...base, salarioMesesIgnorados: ["2026-10"], mesesFechados: ["2026-09"] } });
    C.sincronizarSalarios(d, "2026-11");
    assert.deepEqual(d.transacoes.map((t) => t.data), ["2026-11-05"]);
  });

  test("mudança de salário atualiza só meses atuais/futuros abertos e não editados", () => {
    const d = dadosCom({ config: { ...base, mesesFechados: ["2026-12"] } });
    C.sincronizarSalarios(d, "2027-01");
    d.transacoes.find((t) => t.data === "2026-11-05").salarioEditado = true;
    d.config.salario = 4500;
    d.config.diaSalario = 10;
    C.aplicarMudancaSalario(d, "2026-10");
    const porMes = Object.fromEntries(d.transacoes.map((t) => [C.mesDe(t.data), t]));
    assert.equal(porMes["2026-09"].valor, 4000); // passado
    assert.equal(porMes["2026-10"].valor, 4500);
    assert.equal(porMes["2026-10"].data, "2026-10-10");
    assert.equal(porMes["2026-11"].valor, 4000); // editado manualmente
    assert.equal(porMes["2027-01"].valor, 4500);
    assert.equal(porMes["2026-12"], undefined); // fechado antes de ser gerado
  });

  test("salário zerado remove lançamentos automáticos do mês atual em diante", () => {
    const d = dadosCom({ config: base });
    C.sincronizarSalarios(d, "2026-11");
    d.config.salario = 0;
    C.aplicarMudancaSalario(d, "2026-10");
    assert.deepEqual(d.transacoes.map((t) => t.data), ["2026-09-05"]);
  });
});

describe("gerarParcelas", () => {
  test("divide o valor e a última parcela absorve o arredondamento", () => {
    const ps = C.gerarParcelas({ tipo: "despesa", descricao: "TV", valor: 100, data: "2026-01-31" }, 3);
    assert.deepEqual(ps.map((p) => p.valor), [33.33, 33.33, 33.34]);
    assert.deepEqual(ps.map((p) => p.data), ["2026-01-31", "2026-02-28", "2026-03-31"]);
    assert.deepEqual(ps.map((p) => p.descricao), ["TV (1/3)", "TV (2/3)", "TV (3/3)"]);
    assert.equal(new Set(ps.map((p) => p.parcelamentoId)).size, 1);
    assert.equal(new Set(ps.map((p) => p.id)).size, 3);
  });
});

describe("sanitizarDados", () => {
  test("rejeita estrutura inválida", () => {
    assert.throws(() => C.sanitizarDados(null));
    assert.throws(() => C.sanitizarDados({ transacoes: {}, config: {} }));
  });

  test("descarta transações inválidas e troca ids maliciosos", () => {
    const { dados, descartadas } = C.sanitizarDados({
      transacoes: [
        { id: '"><img src=x onerror=alert(1)>', tipo: "despesa", descricao: "Ok", valor: "10.456", data: "2026-01-02" },
        { id: "abc", tipo: "hack", valor: 1, data: "2026-01-02" },
        { id: "abd", tipo: "ganho", valor: -5, data: "2026-01-02" },
        { id: "abe", tipo: "ganho", valor: 5, data: "<script>" },
      ],
      config: {},
    });
    assert.equal(descartadas, 3);
    assert.equal(dados.transacoes.length, 1);
    const t = dados.transacoes[0];
    assert.match(t.id, /^[a-z0-9]+$/i);
    assert.equal(t.valor, 10.46);
    assert.equal(t.formaPagamento, "debito");
  });

  test("ids duplicados recebem novo id", () => {
    const tx = { id: "abc", tipo: "ganho", descricao: "x", valor: 1, data: "2026-01-01" };
    const { dados } = C.sanitizarDados({ transacoes: [tx, { ...tx }], config: {} });
    assert.notEqual(dados.transacoes[0].id, dados.transacoes[1].id);
  });

  test("forma de pagamento não aceita chaves herdadas do protótipo", () => {
    const { dados } = C.sanitizarDados({
      transacoes: [{ id: "a1", tipo: "despesa", descricao: "x", valor: 1, data: "2026-01-01", formaPagamento: "constructor" }],
      config: {},
    });
    assert.equal(dados.transacoes[0].formaPagamento, "debito");
  });

  test("normaliza config, migra salarioAuto antigo e descarta a chave vazada", () => {
    const { dados } = C.sanitizarDados({
      transacoes: [{ id: "s1", tipo: "ganho", descricao: "Salário", valor: 3000, data: "2026-03-05", salarioAuto: true }],
      config: {
        salario: 3000, salarioAuto: true, diaSalario: 31,
        mesesFechados: ["2026-02", "2026-02", "lixo"],
        categorias: ["Lazer", "lazer", "", 7],
        geminiApiKey: C.PREFIXO_CHAVE_VAZADA + "resto",
      },
    });
    assert.equal(dados.config.mesInicioSalario, "2026-03");
    assert.equal(dados.config.diaSalario, 28);
    assert.deepEqual(dados.config.mesesFechados, ["2026-02"]);
    assert.deepEqual(dados.config.salarioMesesIgnorados, []);
    assert.deepEqual(dados.config.categorias, ["Lazer"]);
    assert.equal(dados.config.geminiApiKey, "");
  });

  test("categorias vazias voltam ao padrão", () => {
    const { dados } = C.sanitizarDados({ transacoes: [], config: { categorias: [] } });
    assert.deepEqual(dados.config.categorias, C.CATEGORIAS_PADRAO);
  });
});

describe("CSV", () => {
  test("protege contra fórmulas, escapa aspas e formata números", () => {
    assert.equal(C.linhaCSV(["=SOMA(A1)", 'Diz "oi"', "a;b", 12.5]), `'=SOMA(A1);"Diz ""oi""";"a;b";12,50`);
  });
});

describe("validarSugestaoIA", () => {
  const cats = ["Alimentação", "Outros"];

  test("casa a categoria ignorando acentos e maiúsculas", () => {
    const s = C.validarSugestaoIA({ valor: 10, categoria: "alimentacao" }, cats, "2026-11-14");
    assert.equal(s.categoria, "Alimentação");
    const desconhecida = C.validarSugestaoIA({ valor: 10, categoria: "Pets" }, cats, "2026-11-14");
    assert.equal(desconhecida.categoria, "Outros");
  });

  test("normaliza a resposta da IA", () => {
    const s = C.validarSugestaoIA(
      { tipo: "despesa", descricao: " Mercado ", valor: "45.678", data: "2026-13-01", categoria: "Inexistente", formaPagamento: "boleto", parcelas: 40 },
      cats, "2026-11-13"
    );
    assert.deepEqual(s, {
      tipo: "despesa", descricao: "Mercado", valor: 45.68, data: "2026-11-13",
      categoria: "Outros", formaPagamento: "debito", parcelas: 12,
    });
  });

  test("exige valor positivo", () => {
    assert.throws(() => C.validarSugestaoIA({ valor: 0 }, cats, "2026-11-13"), /valor/);
    assert.throws(() => C.validarSugestaoIA(null, cats, "2026-11-13"), /valor/);
  });
});

describe("agruparPorDia", () => {
  test("agrupa por data, do mais recente ao mais antigo, com o saldo do dia", () => {
    const grupos = C.agruparPorDia([
      { id: "a", tipo: "ganho", valor: 5000, data: "2026-11-05" },
      { id: "b", tipo: "despesa", valor: 212.4, data: "2026-11-14" },
      { id: "c", tipo: "despesa", valor: 1450, data: "2026-11-05" },
      { id: "d", tipo: "investimento", valor: 500, data: "2026-11-05" },
      { id: "e", tipo: "investimento", valor: 100, data: "2026-11-14", resgate: true },
    ]);
    assert.deepEqual(grupos.map((g) => g.data), ["2026-11-14", "2026-11-05"]);
    assert.deepEqual(grupos[0].itens.map((t) => t.id).sort(), ["b", "e"]);
    assert.equal(grupos[0].total, -112.4);
    assert.equal(grupos[1].total, 3050);
  });

  test("lista vazia não gera grupos", () => {
    assert.deepEqual(C.agruparPorDia([]), []);
  });
});

describe("escapeHTML", () => {
  test("escapa caracteres especiais e aceita nulos", () => {
    assert.equal(C.escapeHTML(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    assert.equal(C.escapeHTML(undefined), "");
  });
});
