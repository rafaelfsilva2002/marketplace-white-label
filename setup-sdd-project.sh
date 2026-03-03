#!/bin/bash
# setup-sdd-project.sh – Gera toda a estrutura SDD para SaaS multi‑tenant

set -e  # interrompe em caso de erro

echo "Criando estrutura de diretórios..."
mkdir -p docs/adr specs/pending specs/active .sdd/templates scripts templates/{microservice-template,worker-template,frontend-template}

# ==================== ADRs ====================
echo "Criando ADRs..."

# ADR 001
cat > docs/adr/001-tenancy-model.md << 'EOF'
# ADR 001: Modelo de Isolamento de Dados Multi‑tenancy

[Conteúdo completo do ADR 001 – copie do pacote anterior]
EOF

# ADR 002
cat > docs/adr/002-host-trust-boundary.md << 'EOF'
# ADR 002: Host Trust Boundary e Resolução de Tenant

[Conteúdo completo do ADR 002]
EOF

# ADR 003
cat > docs/adr/003-stripe-idempotency.md << 'EOF'
# ADR 003: Idempotência e Consistência no Stripe Connect

[Conteúdo completo do ADR 003]
EOF

# ADR 004
cat > docs/adr/004-algolia-isolation.md << 'EOF'
# ADR 004: Isolamento de Dados no Algolia (Busca)

[Conteúdo completo do ADR 004]
EOF

# ADR 005
cat > docs/adr/005-outbox-replay.md << 'EOF'
# ADR 005: Outbox Pattern e Replay de Eventos

[Conteúdo completo do ADR 005]
EOF

# ADR 006
cat > docs/adr/006-hub-spoke-ai-architecture.md << 'EOF'
# ADR 006: Arquitetura Hub-and-Spoke para Escala Multi-tenant

[Conteúdo completo do ADR 006]
EOF

# ADR 007
cat > docs/adr/007-single-tenant-for-compliance.md << 'EOF'
# ADR 007: Suporte a Single-tenant para Clientes com Requisitos Extremos de Compliance

[Conteúdo completo do ADR 007]
EOF

# ADR 008
cat > docs/adr/008-crypto-rail-adapter.md << 'EOF'
# ADR 008: Adapter para Múltiplas Blockchains (Ethereum, Polygon, Solana)

[Conteúdo completo do ADR 008]
EOF

# ADR 009
cat > docs/adr/009-crypto-reconciliation-ledger.md << 'EOF'
# ADR 009: Conciliação de Transações Cripto com Ledger

[Conteúdo completo do ADR 009]
EOF

# ADR 010
cat > docs/adr/010-crypto-compliance-aml.md << 'EOF'
# ADR 010: Camada de Compliance e AML para Transações Cripto

[Conteúdo completo do ADR 010]
EOF

# ADR 011
cat > docs/adr/011-gitops-oci-artifacts.md << 'EOF'
# ADR 011: GitOps com OCI Artifacts (Flux D2)

[Conteúdo completo do ADR 011]
EOF

# ADR 012
cat > docs/adr/012-pgdog-proxy-validation.md << 'EOF'
# ADR 012: Proxy de Validação Multi‑tenant com PgDog

[Conteúdo completo do ADR 012]
EOF

# ADR 013
cat > docs/adr/013-trust-infrastructure.md << 'EOF'
# ADR 013: Trust Infrastructure como Camada Fundamental

[Conteúdo completo do ADR 013]
EOF

# ADR 014
cat > docs/adr/014-outcome-based-pricing.md << 'EOF'
# ADR 014: Pricing Baseado em Outcomes (Service‑as‑Software)

[Conteúdo completo do ADR 014]
EOF

# ADR 015
cat > docs/adr/015-edge-computing.md << 'EOF'
# ADR 015: Edge Computing para Aplicações Globais

[Conteúdo completo do ADR 015]
EOF

# ADR 016
cat > docs/adr/016-vector-database-strategy.md << 'EOF'
# ADR 016: Escalabilidade de Busca Vetorial para Features de IA

[Conteúdo completo do ADR 016]
EOF

# ADR 017
cat > docs/adr/017-finops.md << 'EOF'
# ADR 017: FinOps como Princípio Arquitetural

[Conteúdo completo do ADR 017]
EOF

# ADR 018
cat > docs/adr/018-orchestration-layer.md << 'EOF'
# ADR 018: Camada de Orquestração como Ativo Estratégico

[Conteúdo completo do ADR 018]
EOF

# ADR 019
cat > docs/adr/019-semantic-layer.md << 'EOF'
# ADR 019: Camada Semântica Compartilhada

[Conteúdo completo do ADR 019]
EOF

# ADR 020
cat > docs/adr/020-saas-management-apis.md << 'EOF'
# ADR 020: Expor APIs de Gerenciamento para Clientes Enterprise

[Conteúdo completo do ADR 020]
EOF

# ADR 021
cat > docs/adr/021-shadow-ai-governance.md << 'EOF'
# ADR 021: Governança de Shadow AI

[Conteúdo completo do ADR 021]
EOF

# ADR 022
cat > docs/adr/022-active-backups.md << 'EOF'
# ADR 022: Active Backups para Reuso de Dados

[Conteúdo completo do ADR 022]
EOF

# ADR 023
cat > docs/adr/023-api-versioning.md << 'EOF'
# ADR 023: Estratégia de API Versionamento

[Conteúdo completo do ADR 023]
EOF

# ==================== Requisitos ====================
echo "Criando docs/requirements.md..."
cat > docs/requirements.md << 'EOF'
# Requisitos do Sistema (Rastreáveis)

[Tabela completa com TEN, SEC, FIN, EVT, OBS, TRUST, BIZ, ORC, MGT, DAT, NFR – conforme pacote anterior]
EOF

# ==================== Matriz de Rastreabilidade ====================
echo "Criando docs/trace-matrix.md..."
cat > docs/trace-matrix.md << 'EOF'
# Matriz de Rastreabilidade

[Tabela completa com todas as linhas – conforme pacote anterior]
EOF

# ==================== Specs ====================
echo "Criando specs/pending/fase-0-alicerce.json..."
cat > specs/pending/fase-0-alicerce.json << 'EOF'
{
  "metadata": { "name": "Fase 0: Alicerce Multi‑tenant", "version": "1.0.0", "tenantContext": "multi-tenant", "priority": "critical", "estimatedHours": 40 },
  "phases": [ { "id": "phase-0", "title": "Fundação: Infra, Tenancy e Observabilidade", "tasks": [ "task-0-1", "task-0-2", "task-0-3", "task-0-4", "task-0-5", "task-0-6", "task-0-7", "task-0-8", "task-0-9", "task-0-10", "task-0-11", "task-0-12", "task-0-13", "task-0-14", "task-0-15", "task-0-16", "task-0-17", "task-0-18" ] } ],
  "tasks": [
    { "id": "task-0-1", "title": "Criar estrutura base NestJS com TypeORM e PostgreSQL", "dependencies": [], "verification": [ "API sobe e conecta ao banco", "Migrações funcionam" ] },
    { "id": "task-0-2", "title": "Implementar TenantInterceptor: extrai tenant do Host e valida contra allowlist", "dependencies": ["task-0-1"], "verification": [ "Host `parceiroa.localhost` → tenant A", "Host desconhecido → 404" ] },
    { "id": "task-0-3", "title": "Criar TenantContext com AsyncLocalStorage", "dependencies": ["task-0-2"], "verification": [ "Tenant disponível em serviços", "Requisições concorrentes não misturam tenants" ] },
    { "id": "task-0-4", "title": "Adicionar coluna tenant_id em todas as tabelas (migration)", "dependencies": ["task-0-1"], "verification": [ "Script idempotente", "Índices compostos com tenant_id" ] },
    { "id": "task-0-5", "title": "Criar repositório base com filtro automático de tenant", "dependencies": ["task-0-3", "task-0-4"], "verification": [ "Todas as queries incluem tenantId", "Teste de vazamento: query sem tenant falha" ] },
    { "id": "task-0-6", "title": "Configurar RLS no PostgreSQL e políticas por tabela", "dependencies": ["task-0-4"], "verification": [ "Policy aplicada", "Teste: usuário tenta acessar outro tenant via SQL direto → 0 registros" ] },
    { "id": "task-0-7", "title": "Criar tabela `tenants` e `tenant_config` (JSONB)", "dependencies": ["task-0-1"], "verification": [ "Campos: id, name, domains[], config JSONB" ] },
    { "id": "task-0-8", "title": "Implementar cache Redis para resolução de tenant e config", "dependencies": ["task-0-2", "task-0-7"], "verification": [ "Cache com TTL", "Fallback para banco" ] },
    { "id": "task-0-9", "title": "Criar AuthModule: JWT, refresh token, revogação", "dependencies": ["task-0-3"], "verification": [ "SEC‑001: JWT curto, refresh rotativo", "Teste de replay de refresh" ] },
    { "id": "task-0-10", "title": "Implementar RBAC com roles e guards", "dependencies": ["task-0-9"], "verification": [ "SEC‑002: acesso negado para role inadequada", "BOLA tests" ] },
    { "id": "task-0-11", "title": "Criar Rate Limiter middleware (por tenant, user, operação)", "dependencies": ["task-0-3", "task-0-9"], "verification": [ "SEC‑003: 429 após exceder", "Configurável via feature flag" ] },
    { "id": "task-0-12", "title": "Implementar Audit Log (tabela append‑only)", "dependencies": ["task-0-4"], "verification": [ "SEC‑004: ações financeiras e admin logadas", "Imutabilidade" ] },
    { "id": "task-0-13", "title": "Criar tabela outbox e dispatcher", "dependencies": ["task-0-4"], "verification": [ "EVT‑002: evento só publicado após commit", "Retry com backoff" ] },
    { "id": "task-0-14", "title": "Definir envelope padrão de eventos e validar schema", "dependencies": [], "verification": [ "EVT‑001: evento contém campos obrigatórios", "CI valida JSON Schema" ] },
    { "id": "task-0-15", "title": "Configurar correlationId em logger e tracing", "dependencies": [], "verification": [ "OBS‑001: logs contêm correlationId", "Propagação em chamadas HTTP" ] },
    { "id": "task-0-16", "title": "Criar testes de integração para todos os itens acima", "dependencies": ["task-0-1", "task-0-2", "task-0-3", "task-0-4", "task-0-5", "task-0-6", "task-0-7", "task-0-8", "task-0-9", "task-0-10", "task-0-11", "task-0-12", "task-0-13", "task-0-14", "task-0-15"], "verification": [ "Cobertura mínima 80%", "Testes de isolamento de tenant" ] },
    { "id": "task-0-17", "title": "Implementar chaves primárias compostas com tenant_id em todas as tabelas", "dependencies": ["task-0-4"], "verification": [ "Todas as PKs incluem tenant_id", "Índices atualizados", "FKs também incluem tenant_id" ] },
    { "id": "task-0-18", "title": "Configurar tabelas de referência (dados compartilhados entre tenants)", "dependencies": ["task-0-4"], "verification": [ "Tabelas de referência acessíveis por todos os tenants", "Joins funcionam sem vazar dados" ] }
  ]
}
EOF

echo "Criando specs/pending/fase-1-mvp-nucleo-multitenant.json..."
cat > specs/pending/fase-1-mvp-nucleo-multitenant.json << 'EOF'
{
  "metadata": { "name": "Fase 1: MVP — Núcleo do Marketplace", "version": "1.0.0", "tenantContext": "multi-tenant", "priority": "high", "estimatedHours": 60 },
  "phases": [ { "id": "phase-1", "title": "Perfis, Busca e Configuração White‑label", "tasks": [ "task-1-1", "task-1-2", "task-1-3", "task-1-4", "task-1-5", "task-1-6", "task-1-7", "task-1-8", "task-1-9", "task-1-10" ] } ],
  "tasks": [
    { "id": "task-1-1", "title": "Criar entidade Profile (com tenantId, userId, name, description, location(geography), services JSONB, photos[], isVerified)", "dependencies": ["fase-0", "task-0-5"], "verification": [ "TEN‑002 aplicado", "Índice espacial para location" ] },
    { "id": "task-1-2", "title": "Endpoints CRUD de Profile (público: GET /profiles; privado: POST, PUT, DELETE)", "dependencies": ["task-1-1"], "verification": [ "GET /profiles retorna apenas perfis do tenant atual", "POST associa tenantId automaticamente", "PUT/DELETE verificam ownership" ] },
    { "id": "task-1-3", "title": "Integrar Algolia: criar índices por tenant, indexar profiles", "dependencies": ["task-1-1"], "verification": [ "ADR‑004: índice separado por tenant", "Indexador escuta eventos `profile.updated.v1`" ] },
    { "id": "task-1-4", "title": "Implementar busca via Algolia com secured API keys", "dependencies": ["task-1-3"], "verification": [ "Chave gerada no backend restringe ao índice do tenant", "Filtros aplicados" ] },
    { "id": "task-1-5", "title": "Criar TenantConfigModule: GET/PUT /api/admin/tenant-config (branding, features, domains)", "dependencies": ["fase-0", "task-0-7"], "verification": [ "TEN‑005: feature flags aplicadas", "Alteração dispara evento `tenant.config.updated.v1`" ] },
    { "id": "task-1-6", "title": "Endpoint público /api/tenant/config (sem auth) para frontend", "dependencies": ["task-1-5"], "verification": [ "Retorna branding e features do tenant atual" ] },
    { "id": "task-1-7", "title": "Frontend Next.js: hook useTenant() que busca config e aplica tema (CSS variables)", "dependencies": ["task-1-6"], "verification": [ "Tema muda conforme tenant", "Fallback para tema padrão" ] },
    { "id": "task-1-8", "title": "Feature flags no frontend: componentes só renderizam se flag habilitada", "dependencies": ["task-1-7"], "verification": [ "Exemplo: botão de assinatura só aparece se `hasSubscriptions: true`" ] },
    { "id": "task-1-9", "title": "Implementar verificação de perfil (isVerified) via painel admin", "dependencies": ["task-1-1"], "verification": [ "Moderador pode marcar perfil como verificado", "Audit log da ação" ] },
    { "id": "task-1-10", "title": "Testes de integração e segurança para toda a fase", "dependencies": ["task-1-1", "task-1-2", "task-1-3", "task-1-4", "task-1-5", "task-1-6", "task-1-7", "task-1-8", "task-1-9"], "verification": [ "Cross‑tenant search leak: falha", "Feature flags isoladas" ] }
  ]
}
EOF

echo "Criando specs/pending/fase-2-monetizacao.json..."
cat > specs/pending/fase-2-monetizacao.json << 'EOF'
{
  "metadata": { "name": "Fase 2: Monetização — Wallet, Ledger e Stripe Connect", "version": "1.0.0", "tenantContext": "multi-tenant", "priority": "high", "estimatedHours": 80 },
  "phases": [ { "id": "phase-2", "title": "Pagamentos e Ledger", "tasks": [ "task-2-1", "task-2-2", "task-2-3", "task-2-4", "task-2-5", "task-2-6", "task-2-7", "task-2-8", "task-2-9", "task-2-10", "task-2-11", "task-2-12", "task-2-13", "task-2-14", "task-2-15", "task-2-16", "task-2-17", "task-2-18", "task-2-19", "task-2-20" ] } ],
  "tasks": [
    { "id": "task-2-1", "title": "Criar entidade `ledger_entry` (tenantId, account, amount, currency, entry_type, reference_id, metadata)", "dependencies": ["fase-0", "task-0-5"], "verification": [ "FIN‑001, FIN‑002: saldo derivado, não mutável" ] },
    { "id": "task-2-2", "title": "Implementar serviço de ledger com validação de saldo e idempotência", "dependencies": ["task-2-1"], "verification": [ "FIN‑003: mesma chave de idempotência não gera duplicata", "FIN‑004: atomicidade" ] },
    { "id": "task-2-3", "title": "Criar tabela `stripe_webhook_events` para deduplicação", "dependencies": [], "verification": [ "Evento com mesmo ID ignorado" ] },
    { "id": "task-2-4", "title": "Integrar Stripe Connect: onboarding de profissionais (gera stripeAccountId)", "dependencies": ["task-2-3"], "verification": [ "Profissional recebe link de onboarding", "Salva `stripeAccountId` no profile" ] },
    { "id": "task-2-5", "title": "Criar endpoint /api/payments/create-payment-intent (com Idempotency-Key)", "dependencies": ["task-2-2", "task-2-4"], "verification": [ "PaymentIntent criado com application_fee_amount", "Idempotência garantida" ] },
    { "id": "task-2-6", "title": "Webhook handler para `payment_intent.succeeded` e `charge.refunded`", "dependencies": ["task-2-3", "task-2-5"], "verification": [ "FIN‑005: refund gera transação compensatória", "Deduplicação" ] },
    { "id": "task-2-7", "title": "Criar wallet do usuário (saldo agregado via ledger)", "dependencies": ["task-2-2"], "verification": [ "Consulta saldo = SUM(amount) onde amount > 0" ] },
    { "id": "task-2-8", "title": "Implementar saques (withdraw) para profissionais: valida saldo, gera transferência Stripe, cria ledger entry", "dependencies": ["task-2-7", "task-2-4"], "verification": [ "Saldo bloqueado durante saque", "Idempotência" ] },
    { "id": "task-2-9", "title": "Criar dashboard financeiro para parceiro (transações, saldos, comissões)", "dependencies": ["task-2-2"], "verification": [ "Apenas dados do próprio tenant", "Filtros por período" ] },
    { "id": "task-2-10", "title": "Adicionar suporte a múltiplas moedas (BRL, USD, USDC)", "dependencies": ["task-2-2"], "verification": [ "Ledger por currency" ] },
    { "id": "task-2-11", "title": "Implementar rail cripto (simplificado inicialmente: apenas registro de transações, watcher simulado)", "dependencies": ["task-2-2"], "verification": [ "Transações cripto são registradas no ledger", "Conciliação simulada" ] },
    { "id": "task-2-12", "title": "Testes de estresse e integração para fluxos financeiros", "dependencies": ["task-2-1", "task-2-2", "task-2-3", "task-2-4", "task-2-5", "task-2-6", "task-2-7", "task-2-8", "task-2-9", "task-2-10", "task-2-11"], "verification": [ "Cobertura >95% no módulo wallet", "Testes de concorrência" ] },
    { "id": "task-2-13", "title": "Implementar adaptador base para blockchain (interface CryptoRail)", "dependencies": ["task-2-2"], "verification": [ "Interface define métodos para geração de endereço, confirmações, parse de valores", "Implementação mock" ] },
    { "id": "task-2-14", "title": "Criar adaptador para Ethereum/Polygon (USDT/USDC) usando ethers.js", "dependencies": ["task-2-13"], "verification": [ "Gera endereço de depósito válido", "Consulta confirmações" ] },
    { "id": "task-2-15", "title": "Criar adaptador para Solana (USDT/USDC) usando @solana/web3.js", "dependencies": ["task-2-13"], "verification": [ "Gera endereço de depósito (associated token account)", "Consulta confirmações" ] },
    { "id": "task-2-16", "title": "Criar tabela crypto_transactions e worker de reconciliação", "dependencies": ["task-2-2", "task-2-14", "task-2-15"], "verification": [ "Worker atualiza confirmações", "Ao atingir threshold, gera entrada no ledger", "Idempotência" ] },
    { "id": "task-2-17", "title": "Implementar endpoints para depósito cripto (gerar endereço, histórico)", "dependencies": ["task-2-16"], "verification": [ "Usuário pode solicitar endereço de depósito", "Endereço é persistido e reutilizado", "Histórico de transações cripto" ] },
    { "id": "task-2-18", "title": "Criar camada de compliance AML (mock inicial, depois integração com provedor)", "dependencies": ["task-2-16"], "verification": [ "Transações de endereços sancionados (mock) entram em hold", "Dashboard de compliance lista transações em hold", "Ação de aprovar/rejeitar" ] },
    { "id": "task-2-19", "title": "Adicionar webhooks para receber notificações de transações (Infura/Helius)", "dependencies": ["task-2-14", "task-2-15", "task-2-18"], "verification": [ "Webhook seguro (valida assinatura)", "Atualiza status da transação" ] },
    { "id": "task-2-20", "title": "Testes de integração para fluxo completo de cripto (depósito, confirmação, crédito)", "dependencies": ["task-2-13", "task-2-14", "task-2-15", "task-2-16", "task-2-17", "task-2-18", "task-2-19"], "verification": [ "Cenário: transação detectada → pending → confirmed → ledger atualizado", "Cenário: transação suspeita → hold → aprovação manual → confirmada", "Cenário: transação com confirmações insuficientes não gera saldo" ] }
  ]
}
EOF

echo "Criando specs/pending/fase-3-enterprise.json..."
cat > specs/pending/fase-3-enterprise.json << 'EOF'
{
  "metadata": { "name": "Fase 3: Capacidades Enterprise (Trust, Orquestração, Escala)", "version": "1.0.0", "tenantContext": "multi-tenant", "priority": "medium", "estimatedHours": 120 },
  "phases": [ { "id": "phase-3", "title": "Trust, Orquestração e Gestão Enterprise", "tasks": [ "task-3-1", "task-3-2", "task-3-3", "task-3-4", "task-3-5", "task-3-6", "task-3-7", "task-3-8", "task-3-9", "task-3-10" ] } ],
  "tasks": [
    { "id": "task-3-1", "title": "Implementar serviço de metering e billing baseado em consumo", "dependencies": ["fase-2"], "verification": [ "Eventos de negócio geram records de metering", "Metering é imutável e auditável", "Integração com Stripe para billing variável" ] },
    { "id": "task-3-2", "title": "Integrar Open Policy Agent (OPA) para políticas de autorização", "dependencies": ["fase-0"], "verification": [ "Todas as decisões de autorização consultam OPA", "Políticas podem ser atualizadas sem redeploy" ] },
    { "id": "task-3-3", "title": "Implementar lineage de dados (tabela `data_lineage` + eventos)", "dependencies": ["fase-0"], "verification": [ "Cada transformação gera lineage event", "É possível rastrear origem de qualquer dado" ] },
    { "id": "task-3-4", "title": "Criar serviço de rastreamento de outcomes para pricing por resultado", "dependencies": ["task-3-1"], "verification": [ "Outcomes configuráveis por contrato", "Relatórios auditáveis" ] },
    { "id": "task-3-5", "title": "Implementar camada de orquestração com Temporal/Step Functions", "dependencies": [], "verification": [ "Workflows longos são gerenciados e auditáveis", "Capacidade de replay" ] },
    { "id": "task-3-6", "title": "Expor APIs SCIM para provisionamento de usuários", "dependencies": ["fase-1"], "verification": [ "Integração com Okta validada", "Cria/atualiza/desativa usuários automaticamente" ] },
    { "id": "task-3-7", "title": "Expor APIs de auditoria e logs para SIEM", "dependencies": ["fase-0"], "verification": [ "Logs incluem tenant_id, user_id, ação, timestamp", "API permite consulta por período e tenant" ] },
    { "id": "task-3-8", "title": "Implementar backup searchável (active backups)", "dependencies": ["fase-0"], "verification": [ "Backups podem ser consultados via SQL", "Retenção configurável por tenant" ] },
    { "id": "task-3-9", "title": "Adicionar tagging e cost allocation para FinOps", "dependencies": ["fase-0"], "verification": [ "Todos os recursos têm tags tenant_id", "Relatórios de custo por tenant disponíveis" ] },
    { "id": "task-3-10", "title": "Configurar GitOps com OCI Artifacts (Flux D2)", "dependencies": ["infra"], "verification": [ "Deploys usam OCI, não Git", "Artefatos assinados com Cosign" ] }
  ]
}
EOF

# ==================== Constitution ====================
echo "Criando constitution.md..."
cat > constitution.md << 'EOF'
# Constituição do Sistema - SaaS Multi-tenant Enterprise

[Conteúdo completo da Constitution – conforme pacote anterior]
EOF

# ==================== Scripts ====================
echo "Criando scripts/init-sdd.sh..."
cat > scripts/init-sdd.sh << 'EOF'
#!/bin/bash
# init-sdd.sh – Configura o projeto para SDD

mkdir -p docs/adr specs/pending specs/active .sdd/templates
echo "Estrutura criada. Copie manualmente os arquivos ou use este script como base."
EOF
chmod +x scripts/init-sdd.sh

echo "Criando scripts/generate-service.sh..."
cat > scripts/generate-service.sh << 'EOF'
#!/bin/bash
# generate-service.sh – Gera um novo microsserviço a partir de template
echo "Uso: ./generate-service.sh <template> <service-name>"
EOF
chmod +x scripts/generate-service.sh

echo "Criando scripts/ci-tenant-aware.sh..."
cat > scripts/ci-tenant-aware.sh << 'EOF'
#!/bin/bash
# ci-tenant-aware.sh – Pipeline que entende o modelo multi-tenant
echo "Executando CI tenant-aware..."
EOF
chmod +x scripts/ci-tenant-aware.sh

# ==================== Templates vazios ====================
echo "Criando diretórios de templates (vazios)..."
touch templates/microservice-template/.gitkeep
touch templates/worker-template/.gitkeep
touch templates/frontend-template/.gitkeep

echo "Estrutura completa criada com sucesso!"
