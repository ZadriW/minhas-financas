# Minhas Finanças — Controle Pessoal de Despesas

Aplicação web de finanças pessoais em HTML, CSS e JavaScript puros (sem build). Os dados ficam salvos no próprio navegador (`localStorage`). Funciona no computador e no celular.

## Como usar

- **Localmente:** abra o `index.html` no navegador ou, melhor, sirva a pasta:
  ```
  python -m http.server 8000
  ```
  e acesse `http://localhost:8000`. Localmente, a IA só funciona com uma chave pessoal do Gemini (veja abaixo).
- **Na Vercel:** publique o repositório. A pasta `api/` vira uma função serverless e a IA passa a usar a chave do projeto.

## Funcionalidades

### Dashboard
- Resumo do mês selecionado: salário, ganhos, despesas, valor investido e saldo livre (ganhos − despesas − investimentos).
- Gráfico de despesas por categoria (rosca) com porcentagem e valor de cada categoria.
- Últimas transações do mês.

### Navegação por mês, fechamento e reabertura
- Seletor de mês no topo (‹ › e "Hoje"); todas as telas respeitam o mês selecionado.
- **Fechar mês:** o mês fica somente leitura. Não é possível criar, editar ou excluir lançamentos nele, nem datar lançamentos (parcelas, resgates, sugestões da IA) dentro dele. O mês fechado aparece com um cadeado.
- **Reabrir mês:** libera o mês para correções.

### Transações
- Ganhos e despesas com descrição, valor, data e categoria.
- Formas de pagamento: débito, cartão de crédito e PIX.
- **Parcelamento** em até 12x (crédito ou PIX), com uma parcela lançada por mês. A última parcela absorve o arredondamento. Ao excluir, é possível apagar só uma parcela ou todas as que estão em meses abertos.
- Filtros por tipo, categoria e busca por descrição.
- **IA (Gemini):** descreva a transação em linguagem natural ("gastei 45 no mercado ontem no PIX") e o formulário é preenchido para revisão.

### Salário (renda fixa)
- Em Configurações, defina valor e dia de recebimento. O salário é lançado automaticamente todo mês a partir do mês da configuração.
- Alterar valor ou dia atualiza o mês atual e os seguintes. Meses passados, fechados ou com o salário editado à mão não mudam.
- Excluir o salário de um mês é definitivo para aquele mês: ele não é recriado.

### Investimentos
- Carteira por projeto (ex.: "CDB Banco X") com tipo de ativo e rendimento em % ao mês.
- **Patrimônio** estimado com juros compostos mensais, considerando aportes e resgates em ordem cronológica, até o mês selecionado.
- **Resgatar:** registra uma retirada parcial ou total sem apagar o histórico.
- Gráfico da distribuição da carteira e rendimento mensal estimado.

### Relatórios
- Entrou, saiu, investido e sobrou no mês.
- Despesas por categoria no período (6, 12 ou 24 meses, ou o ano atual).
- Resumo mensal com salário, outros ganhos, despesas, investido, saldo e taxa de poupança.

### Exportação e backup
- **CSV** compatível com Excel (separador `;`, acentuação correta), incluindo forma de pagamento e parcela.
- **JSON:** backup completo. A chave pessoal da API **não** é incluída.
- **Importar backup:** os dados são validados e lançamentos inválidos são descartados (com aviso).

## IA (Gemini)

- **Produção (Vercel):** defina `GEMINI_API_KEY` em *Settings › Environment Variables*. A chave fica só no servidor (`api/ia.js`).
- **Chave pessoal (opcional):** em Configurações. Usada localmente e como alternativa se o endpoint não existir. Fica salva apenas no navegador.
- **Proteção do endpoint:** só aceita chamadas do próprio site e tem limite por IP em memória (por instância). Para um limite global, crie uma regra de *Rate Limiting* para `/api/ia` no Firewall da Vercel.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Telas, modal de transação e diálogo de confirmação |
| `styles.css` | Tema escuro e layout responsivo |
| `calculos.js` | Regras de cálculo puras (resumos, carteira, salário, parcelas, validação de dados) |
| `app.js` | Interface, eventos e persistência |
| `api/ia.js` | Função serverless da IA (Vercel) |
| `tests/` | Testes automatizados de `calculos.js` |

## Testes

Requer Node.js 20 ou superior:

```
node --test tests/
```

## Tecnologias

- HTML, CSS e JavaScript puros (sem build).
- [Chart.js 4](https://www.chartjs.org/) e Font Awesome via CDN.
- Persistência via `localStorage` do navegador.

## Observações

- Os dados ficam **apenas no navegador/computador em uso**. Para migrar de máquina ou navegador, use Exportar/Importar JSON.
- Limpar os dados de navegação do site apaga os registros. Faça backups regulares.
