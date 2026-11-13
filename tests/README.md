# Testes de integração

Rodam os **controllers, hooks e regras reais** contra um banco **MySQL/MariaDB descartável**, no mesmo caminho do
boot do app (`sync` cria as tabelas). Não sobem o servidor HTTP: cada teste chama o handler como o Fastify chamaria.

## Como rodar

```bash
TEST_DB_USER=root TEST_DB_PASS=senha npm test           # todos
TEST_DB_USER=root TEST_DB_PASS=senha npm test -- crm     # só os arquivos com "crm" no nome
```

| Variável        | Padrão                  | Observação                                                        |
| --------------- | ----------------------- | ----------------------------------------------------------------- |
| `TEST_DB_HOST`  | `DB_HOST` ou localhost  |                                                                   |
| `TEST_DB_USER`  | `DB_USER` ou root       | precisa poder criar/apagar banco                                  |
| `TEST_DB_PASS`  | `DB_PASS`               |                                                                   |
| `TEST_DB_NAME`  | `devefficiency_test`    | **é apagado a cada arquivo**; o nome precisa conter `test`        |

Qualquer MySQL/MariaDB na porta padrão (3306) serve, por exemplo um avulso em Docker:
`docker run -d --name devefficiency-test-db -e MYSQL_ROOT_PASSWORD=test -p 3306:3306 mysql:8.4` e
`TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASS=test npm test`. **Nunca aponte para o banco de produção**: o
banco de teste é apagado e recriado (por isso o nome precisa conter `test`).

O `npm test` compila o projeto em `.test-build/` (fora do git) e executa `tests/run.js`, que roda cada
`*.test.js` em um processo próprio, em sequência. E-mails nunca saem: ficam em `sentEmails` (ver `helpers.js`) e
`auto_email_mode` fica `off`.

## O que cada arquivo cobre

| Arquivo                     | Cenários                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `commission.test.js`        | Protocolo por comissão: cobrança ao fornecedor (valor na mão e pela %), trava depois de liberado, baixa fecha os protocolos, comissão do vendedor sobre a comissão, protocolo direto (regressão), assinatura e renovação, DRE |
| `nfse.test.js`              | NFS-e Emissor Nacional contra uma Sefin simulada (DPS e pedido de evento validados no XSD oficial v1.01 de `tests/fixtures/nfse-xsd`, se houver `xmllint`, e assinaturas conferidas): configuração e certificado protegidos, autorizada/rejeitada/queda + Verificar/E0014, ISS retido, fornecedor como tomador, descrição pelos itens da cobrança + textos padrão, IBS/CBS, cancelamento (inclusive pendente), substituição com travas do Simples, exportação, confirmação em duas etapas no MCP |
| `payment-terms.test.js`     | Condição de pagamento 15/30/60 (uma cobrança por vencimento), parcelas de protocolos diferentes no mesmo dia, pagamento parcela a parcela, vencimentos manuais e soma que não fecha, voltar para "Em aberto", condição padrão do fornecedor, repasse parcial, "valor final" (quitar) com e sem parcelas, validações |
| `renewal-review.test.js`    | Renovação anual com comissão na mão fica "a revisar" (não libera, nem pelo worker), confirmação com novo valor libera; mensal repete |
| `crm.test.js`               | Leads, oportunidades, etapas, perda com motivo, atividades e follow-ups; ganhar gerando cliente + protocolo/OS, compensação em falha, aviso diário; OS → oportunidade (ganho põe na fila, perda cancela, recebimento impede); reabrir perdida reabre a OS |
| `crm-dedupe.test.js`        | Duplicidade: busca por CNPJ/e-mail/telefone, ganhar lead com CNPJ de cliente existente não duplica, escolha manual, "criar novo" |
| `crm-values.test.js`        | Valor real das oportunidades vindo do protocolo (OS de origem e OS gerada) no funil e no relatório |
| `crm-board.test.js`         | Responsável/autor e filtro "minhas", próximo follow-up junto com a mudança de etapa, funil paginado (totais, "carregar mais", busca), oportunidades paradas (funil, follow-ups, e-mail) |
| `crm-report.test.js`        | Relatório de vendas com números conferidos (conversão, ticket, ciclo, tempo por etapa, filtros) e tools do MCP |

## Escrevendo um teste novo

Crie `tests/<assunto>.test.js` usando `node:test`. `setup()` recria o banco; `call(handler, { params, query, body })`
chama um controller e devolve `{ code, body }`; `model('Nome')`, `controller('caminho')` e `load('utils/...')`
carregam do build. Para simular o usuário logado passe `__user: { user: { id } }` no `call`.
