# Minhas Finanças — Controle Pessoal de Despesas

Aplicação web completa de finanças pessoais, sem necessidade de servidor ou instalação. Os dados ficam salvos no próprio navegador (localStorage).

## Como usar

Basta abrir o arquivo `index.html` em qualquer navegador moderno (Chrome, Edge, Firefox).

> Dica: no Windows, dê um duplo clique em `index.html`.

## Funcionalidades

### Dashboard
- Resumo do mês selecionado: salário (renda fixa), ganhos, despesas, valor investido e saldo.
- Gráfico de despesas por categoria (rosca).
- Gráfico de balanço dos últimos 6 meses (barras).
- Lista das últimas transações do mês.

### Resumo fixo na barra lateral
- Card com salário mensal, valor livre para gastar (saldo do mês) e total investido — visível em qualquer tela.

### Navegação por mês
- Seletor de mês no topo (setas ‹ › e botão "Hoje") — todas as telas respeitam o mês selecionado.

### Transações
- Cadastro de **ganhos**, **despesas** e **investimentos** com descrição, valor, data e categoria.
- Edição e exclusão de qualquer lançamento.
- Filtros por tipo, categoria e busca por descrição.

### Salário
- Em **Configurações**, defina o valor e o dia de recebimento do salário.
- O salário é tratado como uma **renda fixa**: ao salvar um valor, ele passa a ser lançado automaticamente como ganho todo mês, a partir do mês em que foi configurado (meses anteriores não são afetados).
- Se o valor for zerado e configurado novamente depois, o lançamento automático recomeça a partir do novo mês de configuração.

### Investimentos
- Aportes e resgates por tipo de ativo (Renda Fixa, Ações, FIIs, Tesouro, Cripto etc.).
- Total acumulado, aportes do mês e média mensal dos últimos 12 meses.
- Gráfico de evolução do patrimônio investido e distribuição por tipo de ativo.

### Relatórios
- Salário e outros ganhos exibidos separadamente no gráfico de balanço e na tabela de resumo mensal.
- Receitas × Despesas × Investimentos por mês (período configurável: 6, 12, 24 meses ou ano atual).
- Evolução do saldo acumulado.
- Despesas por categoria no período.
- Tabela de resumo mensal com taxa de poupança.

### Exportação e backup
- **Exportar CSV**: todas as transações em formato compatível com Excel (separador `;`, acentuação correta).
- **Exportar JSON**: backup completo dos dados e configurações.
- **Importar backup**: restaura um arquivo JSON exportado anteriormente.

### Categorias
- Categorias de despesa personalizáveis em Configurações.

## Tecnologias

- HTML, CSS e JavaScript puros (sem build).
- [Chart.js 4](https://www.chartjs.org/) via CDN para os gráficos.
- Persistência via `localStorage` do navegador.

## Observações

- Os dados ficam salvos **apenas no navegador/computador em uso**. Para migrar de máquina ou navegador, use Exportar/Importar JSON.
- Limpar os dados de navegação do site apaga os registros — faça backups regulares.
