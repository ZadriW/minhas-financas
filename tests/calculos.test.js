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

describe("contas fixas", () => {
  const faculdade = () => ({
    id: "fac1", descricao: "Faculdade", valor: 1200, dia: 31, categoria: "Educação",
    formaPagamento: "pix", mesInicio: "2027-01", mesFim: null, mesesIgnorados: [],
  });

  test("lança uma vez por mês, no último dia quando o mês é curto, sem duplicar", () => {
    const d = dadosCom({ config: { contasFixas: [faculdade()] } });
    assert.equal(C.sincronizarContasFixas(d, "2027-03"), true);
    assert.deepEqual(d.transacoes.map((t) => t.data), ["2027-01-31", "2027-02-28", "2027-03-31"]);
    const t = d.transacoes[0];
    assert.equal(t.tipo, "despesa");
    assert.equal(t.categoria, "Educação");
    assert.equal(t.formaPagamento, "pix");
    assert.equal(t.contaFixaId, "fac1");
    assert.equal(C.sincronizarContasFixas(d, "2027-03"), false);
    assert.equal(d.transacoes.length, 3);
  });

  test("pula meses fechados, meses ignorados e meses após o fim", () => {
    const conta = { ...faculdade(), mesesIgnorados: ["2027-02"], mesFim: "2027-04" };
    const d = dadosCom({ config: { contasFixas: [conta], mesesFechados: ["2027-03"] } });
    C.sincronizarContasFixas(d, "2027-06");
    assert.deepEqual(d.transacoes.map((t) => C.mesDe(t.data)), ["2027-01", "2027-04"]);
  });

  test("não lança antes do mês de início", () => {
    const d = dadosCom({ config: { contasFixas: [faculdade()] } });
    assert.equal(C.sincronizarContasFixas(d, "2026-12"), false);
    assert.equal(d.transacoes.length, 0);
  });

  test("mudança vale do mês atual em diante, só em meses abertos e não editados", () => {
    const conta = faculdade();
    const d = dadosCom({ config: { contasFixas: [conta] } });
    C.sincronizarContasFixas(d, "2027-05");
    d.config.mesesFechados = ["2027-03"];
    d.transacoes.find((t) => C.mesDe(t.data) === "2027-04").contaFixaEditada = true;
    Object.assign(conta, { valor: 1350, dia: 10, descricao: "Mensalidade" });
    C.aplicarMudancaContaFixa(d, conta, "2027-02");
    const porMes = Object.fromEntries(d.transacoes.map((t) => [C.mesDe(t.data), t]));
    assert.equal(porMes["2027-01"].valor, 1200); // passado
    assert.equal(porMes["2027-02"].valor, 1350);
    assert.equal(porMes["2027-02"].data, "2027-02-10");
    assert.equal(porMes["2027-02"].descricao, "Mensalidade");
    assert.equal(porMes["2027-03"].valor, 1200); // fechado
    assert.equal(porMes["2027-04"].valor, 1200); // editado à mão
    assert.equal(porMes["2027-05"].valor, 1350);
  });

  test("encerrar remove lançamentos abertos a partir do mês e mantém os fechados", () => {
    const d = dadosCom({ config: { contasFixas: [faculdade()] } });
    C.sincronizarContasFixas(d, "2027-05");
    d.config.mesesFechados = ["2027-04"];
    assert.equal(C.encerrarContaFixa(d, "fac1", "2027-03"), 2); // março e maio
    assert.deepEqual(d.transacoes.map((t) => C.mesDe(t.data)), ["2027-01", "2027-02", "2027-04"]);
    assert.equal(d.config.contasFixas[0].mesFim, "2027-02");
    C.sincronizarContasFixas(d, "2027-08");
    assert.equal(d.transacoes.length, 3);
    assert.equal(C.contasFixasAtivas(d.config, "2027-02").length, 0);
    assert.equal(C.contasFixasAtivas(d.config, "2027-01").length, 1);
  });

  test("encerrar antes de começar tira a conta da lista e solta os lançamentos restantes", () => {
    const d = dadosCom({ config: { contasFixas: [faculdade()] } });
    C.sincronizarContasFixas(d, "2027-02");
    d.config.mesesFechados = ["2027-02"];
    C.encerrarContaFixa(d, "fac1", "2027-01");
    assert.equal(d.config.contasFixas.length, 0);
    assert.equal(d.transacoes.length, 1);
    assert.equal(d.transacoes[0].contaFixaId, undefined);
  });

  test("resumo do mês separa o que já foi pago do que ainda vence", () => {
    const txs = [
      { tipo: "despesa", descricao: "Academia", valor: 99.9, data: "2026-11-30", contaFixaId: "a" },
      { tipo: "despesa", descricao: "Aluguel", valor: 1800, data: "2026-11-05", contaFixaId: "b" },
      { tipo: "despesa", descricao: "Faculdade", valor: 1250, data: "2026-11-15", contaFixaId: "c" },
      { tipo: "despesa", descricao: "Mercado", valor: 300, data: "2026-11-02" },
      { tipo: "despesa", descricao: "Aluguel", valor: 1800, data: "2026-12-05", contaFixaId: "b" },
    ];
    const r = C.resumoContasFixas(txs, "2026-11", "2026-11-15");
    assert.deepEqual(r.itens.map((t) => t.descricao), ["Aluguel", "Faculdade", "Academia"]);
    assert.equal(r.total, 3149.9);
    assert.equal(r.pago, 3050); // o que vence hoje conta como pago
    assert.equal(r.aPagar, 99.9);
    assert.equal(r.proxima.descricao, "Academia");
    const vazio = C.resumoContasFixas(txs, "2027-01", "2026-11-15");
    assert.equal(vazio.total, 0);
    assert.equal(vazio.proxima, null);
  });

  test("sanitização valida contas e preserva o vínculo dos lançamentos", () => {
    const { dados } = C.sanitizarDados({
      transacoes: [
        { id: "t1", tipo: "despesa", descricao: "Faculdade", valor: 1200, data: "2027-01-31", contaFixaId: "fac1", contaFixaEditada: true },
        { id: "t2", tipo: "despesa", descricao: "X", valor: 1, data: "2027-01-01", contaFixaId: "<script>" },
      ],
      config: {
        contasFixas: [
          { ...faculdade(), dia: 45, formaPagamento: "boleto" },
          { ...faculdade() }, // id repetido
          { ...faculdade(), id: "b2", valor: -5 },
          { ...faculdade(), id: "b3", mesFim: "2026-01" }, // fim antes do início
          { ...faculdade(), id: "b4", mesInicio: "2027-13" },
        ],
      },
    });
    assert.equal(dados.config.contasFixas.length, 1);
    assert.equal(dados.config.contasFixas[0].dia, 31);
    assert.equal(dados.config.contasFixas[0].formaPagamento, "debito");
    assert.equal(dados.transacoes[0].contaFixaId, "fac1");
    assert.equal(dados.transacoes[0].contaFixaEditada, true);
    assert.equal(dados.transacoes[1].contaFixaId, undefined);
    assert.deepEqual(C.sanitizarDados({ transacoes: [], config: {} }).dados.config.contasFixas, []);
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
