# DevEfficiency

Sistema de gestão operacional e financeira voltado para agências, prestadores de serviços e empresas de tecnologia. Centraliza clientes, projetos, ordens de serviço, assinaturas, cobranças e relatórios financeiros em uma única plataforma self-hosted.

---

## Funcionalidades

### Gestão
| Módulo | Descrição |
|---|---|
| **Clientes** | Cadastro completo com endereço, contatos, dia de vencimento e histórico |
| **Projetos** | Vinculados a clientes, com subprojetos e fixação no dashboard |
| **Produtos** | Catálogo de serviços e produtos com valor de referência |
| **Fornecedores** | Cadastro de fornecedores para controle de despesas |

### Operações
| Módulo | Descrição |
|---|---|
| **Ordens de Serviço** | Criação, acompanhamento e controle de status; apontamentos de horas; geração de orçamento/fatura/recibo em PDF |
| **Assinaturas** | Cobranças recorrentes (mensal/anual) com renovação automática de protocolos |

### Financeiro
| Módulo | Descrição |
|---|---|
| **Protocolos** | Acordo financeiro por OS ou assinatura com itens de serviço, produtos, recibos, parcelamento e desconto |
| **Cobranças** | Consolidação de protocolos em faturas por cliente; ciclo `pendente → faturada → pago` |
| **Contas a Pagar** | Controle de despesas e pagamentos com categorias por centro de custo |
| **Contas Bancárias** | Saldo em tempo real, transferências entre contas, suporte a IBAN/SWIFT para pagamentos internacionais |
| **Invoice Internacional** | Geração de invoice em PDF no padrão exterior (USD/EUR/GBP/BRL) a partir de uma OS |
| **Relatórios** | Fluxo de Caixa, DRE e Relatório de Despesas |

### Infraestrutura
| Módulo | Descrição |
|---|---|
| **Servidores** | Cadastro e vínculo de servidores/licenças a clientes e assinaturas |

---

## Stack

- **Backend:** Node.js · TypeScript · [Fastify](https://fastify.dev/) v4
- **Banco de dados:** MySQL · [Sequelize](https://sequelize.org/) v6
- **Frontend:** [Vue.js](https://v2.vuejs.org/) 2 (Options API) · Bootstrap 5 · Axios
- **PDF:** [Puppeteer](https://pptr.dev/) + EJS templates
- **Autenticação:** JWT + bcrypt
- **E-mail:** Nodemailer / [Resend](https://resend.com/)
- **Storage:** AWS S3 (upload de arquivos de cobrança)

---

## Requisitos

- Node.js >= 18
- MySQL >= 8
- Google Chrome instalado (para geração de PDFs via Puppeteer)

```bash
# Ubuntu/Debian
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install ./google-chrome-stable_current_amd64.deb
```

---

## Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/santos-jp7/DevEfficiency.git
cd DevEfficiency

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 4. Build
npm run build

# 5. Inicie o servidor
npm start
```

> O banco de dados é criado e atualizado automaticamente no startup via `Sequelize.sync({ alter: true })` — sem migrations manuais.

---

## Variáveis de Ambiente

```env
NODE_ENV=production
PORT=3002

# JWT
SECRET=sua_chave_secreta_forte

# MySQL
DB_NAME=devefficiency
DB_USER=root
DB_PASS=senha
DB_HOST=localhost

# E-mail (Nodemailer)
EMAIL_FROM=noreply@suaempresa.com
EMAIL_NAME=DevEfficiency
EMAIL_USER=usuario@smtp.com
EMAIL_PASS=senha_smtp
EMAIL_HOST=smtp.suaempresa.com
EMAIL_CC=admin@suaempresa.com

# MCP (controle por IA) — vazio desliga o endpoint /api/mcp
MCP_API_KEY=uma_chave_longa_e_aleatoria
MCP_DISABLE=
```

---

## Primeiro Acesso

Após iniciar o servidor, acesse `http://localhost:3002`.

As configurações da empresa (nome, CNPJ, endereço, logo) são definidas em **Gestão → Configurações** após o primeiro login. Os valores padrão são populados automaticamente no startup via seed.

---

## Estrutura do Projeto

```
src/
├── controllers/     # Handlers das rotas (Fastify)
├── hooks/           # Hooks Sequelize (lógica de negócio em beforeSave/afterUpdate)
├── models/          # Modelos Sequelize com associações
├── routes.ts        # Registro de todas as rotas
├── views/           # Templates EJS para geração de PDFs
├── seeds/           # Dados iniciais (configurações padrão)
├── utils/           # Utilitários (baixa de cobrança, envio de e-mail etc.)
├── sync.ts          # Sincronização do banco de dados
├── app.ts           # Configuração do Fastify
└── public/          # Frontend estático (HTML + Vue.js por módulo)
```

---

## Geração de PDF

Os PDFs são renderizados server-side via Puppeteer + EJS sem dependências externas de serviço.

| Documento | Endpoint | Template |
|---|---|---|
| Orçamento / Fatura / Recibo (cliente) | `GET /api/protocols/pdf?ClientId=X&type=...` | `budget_multi.ejs` |
| Orçamento de OS | `GET /api/os/:id/pdf` | `budget.ejs` |
| Fatura de cobrança | `GET /api/billings/:id/pdf` | `billing.ejs` |
| Invoice Internacional | `GET /api/os/:id/invoice-pdf?currency=USD&BankAccountId=X` | `invoice_exterior.ejs` |

---

## Controle por IA (MCP)

O sistema expõe um servidor [MCP](https://modelcontextprotocol.io) em `POST /api/mcp` (Streamable HTTP, stateless), permitindo que assistentes de IA (Claude Code, Claude Desktop, claude.ai, n8n etc.) consultem e operem o sistema.

As ferramentas chamam internamente as mesmas rotas da API REST (`app.inject`), então toda regra de negócio, hook e validação continua valendo.

**Ativação:** defina `MCP_API_KEY` no `.env`. Sem ela o endpoint responde `404`. Toda requisição precisa do header `Authorization: Bearer <MCP_API_KEY>`.

```bash
# Claude Code
claude mcp add --transport http devefficiency https://seu-dominio/api/mcp \
    --header "Authorization: Bearer <MCP_API_KEY>"
```

**Ferramentas disponíveis:**

| Tipo | Ferramentas |
|---|---|
| CRUD por recurso (`action`: list/get/create/update/delete) | `clients`, `contacts`, `addresses`, `projects`, `subprojects`, `service_orders`, `os_entries`, `protocols`, `protocol_registers`, `protocol_products`, `protocol_receipts`, `subscriptions`, `billings`, `billing_protocols`, `products`, `suppliers`, `cost_centers`, `bank_accounts`, `bank_transfers`, `payables`, `reimbursements`, `checks`, `sla_levels`, `client_sla_configs`, `config` |
| Relatórios | `financial_history`, `dre_report`, `expense_report`, `financial_comparison`, `current_os` |
| Ações | `billing_send_email`, `billing_receipt` |
| PDFs (retornados em base64) | `service_order_pdf`, `service_order_invoice_pdf`, `billing_pdf`, `protocols_pdf` |

Para desativar ferramentas, liste-as em `MCP_DISABLE` (ex.: `MCP_DISABLE=billing_send_email`). Uploads de arquivos (NF/boleto, comprovantes de reembolso) não estão disponíveis via MCP.

Credenciais e servidores (senhas, chaves RSA) não são expostos via MCP, nem mesmo dentro de outras respostas (ex.: detalhes do cliente).

> ⚠️ A chave dá acesso ao restante do sistema, incluindo exclusões e envio de e-mails. Use uma chave longa e sirva o endpoint apenas via HTTPS.

---

## Ciclo Financeiro

```
OS / Assinatura
    └── Protocolo  (itens · recibos · desconto · parcelas)
            └── [Liberado para pagamento]
                    └── Cobrança  pendente
                            └── [upload NF/boleto]  →  faturada
                                    └── [baixa]  →  pago
                                            └── Protocolo fechado
                                                    └── Nova renovação  (assinatura recorrente)
```

---

## Contribuindo

1. Fork o repositório
2. Crie uma branch: `git checkout -b feature/minha-funcionalidade`
3. Commit: `git commit -m 'feat: descrição da mudança'`
4. Push: `git push origin feature/minha-funcionalidade`
5. Abra um Pull Request

---

## Licença

[ISC](LICENSE)
