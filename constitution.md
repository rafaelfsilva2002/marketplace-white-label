# Constituicao do Sistema — SaaS Multi-tenant Enterprise Marketplace

> **Versao:** 2.0.0
> **Data de vigencia:** 2026-03-03
> **Stack:** NestJS + Drizzle ORM + PostgreSQL + Redis + Next.js 14 + Turborepo + pnpm + Stripe Connect + Algolia + Crypto Rails + AI Gateway
> **Classificacao:** Documento normativo interno — toda decisao arquitetural, de codigo ou de deploy DEVE estar em conformidade com esta Constituicao.

---

## Preambulo

Este sistema e uma plataforma white-label de marketplace que permite a parceiros (tenants) lancar seus proprios marketplaces customizados para profissionais de servicos. Cada tenant opera sob seu proprio dominio, marca e regras de negocio, porem compartilha a mesma infraestrutura gerenciada centralmente.

A presente Constituicao estabelece os principios inviolaveis, as regras operacionais e os gates de qualidade que regem todo o ciclo de vida do software — do design ao deploy. Nenhuma feature, hotfix ou refatoracao podera ser introduzida sem estar em conformidade com os artigos aqui definidos.

Os pilares fundamentais sao: **isolamento de tenant**, **integridade financeira**, **observabilidade**, **seguranca em camadas**, **simplicidade arquitetural** e **inteligencia AI-native**. Estes pilares nao sao negociaveis.

---

## Artigo I — Tenant Isolation como Principio Inviolavel

O isolamento de tenant e o principio mais fundamental desta plataforma. Sua violacao constitui falha critica de seguranca e de confianca.

### Clausula 1.1 — Tenant ID Obrigatorio
Toda operacao de leitura, escrita, atualizacao ou exclusao de dados DEVE incluir `tenant_id` como filtro. Queries sem `tenant_id` sao proibidas em tabelas que contenham dados de tenant, sem excecao.

### Clausula 1.2 — Row Level Security (RLS) como Defesa em Profundidade
Toda tabela que armazena dados de tenant DEVE ter politicas de Row Level Security (RLS) ativas no PostgreSQL. O RLS atua como camada de defesa adicional alem da filtragem na camada de aplicacao, garantindo que mesmo em caso de bug no codigo, dados de outro tenant jamais sejam retornados.

### Clausula 1.3 — Chaves Primarias Compostas
Todas as tabelas de dados de tenant DEVEM utilizar chaves primarias compostas que incluam `tenant_id` como primeiro componente. Indices e foreign keys tambem DEVEM incluir `tenant_id`. Formato padrao: `PRIMARY KEY (tenant_id, id)`.

### Clausula 1.4 — Proibicao Absoluta de Vazamento Cross-Tenant
Sob nenhuma circunstancia dados de um tenant podem ser acessados, exibidos, agregados ou inferidos por outro tenant. Isso inclui: respostas de API, logs expostos ao cliente, mensagens de erro, cache compartilhado, indices de busca (Algolia) e filas de eventos.

### Clausula 1.5 — Tabelas de Referencia como Unica Excecao
Somente tabelas de referencia (categorias globais, configuracoes de plataforma, tipos de servico padrao) podem existir sem `tenant_id`. Estas tabelas DEVEM ser documentadas explicitamente no schema e marcadas com o decorator `@ReferenceTable()`. Qualquer tabela sem `tenant_id` que nao seja de referencia e considerada uma violacao.

### Clausula 1.6 — Resolucao de Tenant via Host
A identificacao do tenant DEVE ser feita pela resolucao de hostname (dominio customizado ou subdominio). O middleware `TenantResolver` DEVE ser o primeiro na cadeia de execucao. Requests que nao resolvam para um tenant valido DEVEM ser rejeitados com `403 Forbidden` antes de qualquer processamento adicional. Conforme ADR-002 (Host Trust Boundary).

---

## Artigo II — Seguranca em Camadas

A seguranca nao e um recurso opcional; e uma propriedade arquitetural que permeia todas as camadas do sistema.

### Clausula 2.1 — Autenticacao JWT com Rotacao de Tokens
A autenticacao DEVE utilizar JWT com tempo de expiracao curto (maximo 15 minutos para access tokens). Refresh tokens DEVEM ter rotacao automatica: cada uso de refresh token invalida o anterior e emite um novo par. Tokens comprometidos DEVEM poder ser revogados via blacklist em Redis com TTL igual ao tempo restante de expiracao.

### Clausula 2.2 — RBAC com Guards em Todos os Endpoints
Todo endpoint DEVE ser protegido por um guard de autorizacao baseado em Role-Based Access Control (RBAC). As roles DEVEM ser definidas por tenant e incluir, no minimo: `platform_admin`, `tenant_admin`, `provider`, `customer`. Nenhum endpoint pode ser acessivel sem autenticacao, exceto rotas publicas explicitamente listadas em um whitelist documentado.

### Clausula 2.3 — Rate Limiting Granular
Rate limiting DEVE ser implementado em tres niveis: (a) por tenant — protecao contra abuso de um tenant inteiro; (b) por usuario — protecao contra abuso individual; (c) por operacao — limites especificos para operacoes sensiveis (login, pagamento, webhook). A implementacao DEVE usar Redis como backend para consistencia entre instancias. Os limites DEVEM ser configuraveis por tenant.

### Clausula 2.4 — Audit Log Append-Only
Toda acao administrativa e toda operacao financeira DEVEM ser registradas em um audit log imutavel (append-only). O log DEVE conter: `tenant_id`, `user_id`, `action`, `resource`, `timestamp`, `ip_address`, `correlation_id`, `before_state`, `after_state`. Delecoes no audit log sao estritamente proibidas. Retencao minima: 7 anos para dados financeiros.

### Clausula 2.5 — Prevencao de BOLA (Broken Object Level Authorization)
Todo acesso a recursos DEVE validar que o `tenant_id` e o `user_id` do token correspondem ao recurso solicitado. A verificacao DEVE ocorrer na camada de servico, nao apenas no controller. Testes automatizados DEVEM cobrir cenarios onde Usuario A tenta acessar recurso do Usuario B dentro do mesmo tenant, e cenarios cross-tenant.

### Clausula 2.6 — Protecao de Dados Sensiveis
Dados sensiveis (PII, dados de pagamento, chaves de API) DEVEM ser criptografados at-rest usando AES-256. Dados de cartao de credito NUNCA sao armazenados — toda gestao de pagamento e delegada ao Stripe. Logs DEVEM sanitizar automaticamente campos sensiveis antes da persistencia. Headers de seguranca (CORS, CSP, HSTS) DEVEM ser configurados por tenant.

---

## Artigo III — Integridade Financeira

Dinheiro e confianca. O sistema financeiro DEVE ser projetado para correcao absoluta, nao para performance.

### Clausula 3.1 — Ledger Imutavel
O ledger financeiro e imutavel. Saldos DEVEM ser derivados da soma (`SUM`) de todas as entradas do ledger, NUNCA armazenados diretamente como campo atualizavel. Toda entrada no ledger contem: `tenant_id`, `account_id`, `entry_type` (debit/credit), `amount`, `currency`, `idempotency_key`, `correlation_id`, `created_at`. Uma vez criada, uma entrada NUNCA pode ser alterada ou removida.

### Clausula 3.2 — Chave de Idempotencia Obrigatoria
Toda operacao financeira (cobranca, transferencia, reembolso, credito, saque) DEVE receber uma `idempotency_key` unica. O sistema DEVE armazenar o resultado da primeira execucao e retorna-lo em caso de retry, sem executar a operacao novamente. A chave de idempotencia DEVE ser composta por: `tenant_id + operation_type + unique_reference`. Conforme ADR-003 (Stripe Idempotency).

### Clausula 3.3 — Atomicidade Total
Toda operacao financeira DEVE ser executada dentro de uma transacao de banco de dados com nivel de isolamento `SERIALIZABLE` ou `REPEATABLE READ`. Se qualquer etapa falhar, todas as etapas DEVEM ser revertidas (rollback). Operacoes parcialmente completas sao proibidas. O padrao e "tudo ou nada".

### Clausula 3.4 — Reembolsos por Lancamentos Compensatorios
Reembolsos NUNCA sao realizados por delecao ou alteracao de lancamentos existentes. Todo reembolso DEVE gerar um lancamento compensatorio (entry de sinal inverso) que referencia o lancamento original via `original_entry_id`. O historico completo permanece intacto e auditavel.

### Clausula 3.5 — Deduplicacao de Webhooks do Stripe
Todo webhook recebido do Stripe DEVE ser verificado quanto a duplicidade antes do processamento. O `event_id` do Stripe DEVE ser armazenado em uma tabela de controle com constraint `UNIQUE`. Webhooks duplicados DEVEM ser aceitos (HTTP 200) mas nao processados. A assinatura do webhook DEVE ser validada usando o `webhook_secret` especifico do tenant.

### Clausula 3.6 — Conciliacao Periodica
O sistema DEVE executar conciliacao automatica diaria entre o ledger interno e os registros do Stripe Connect. Discrepancias DEVEM gerar alertas imediatos (severidade P1) e bloquear saques do tenant afetado ate resolucao manual. Relatorios de conciliacao DEVEM ser armazenados por no minimo 7 anos. Conforme ADR-009 (Crypto Reconciliation Ledger).

---

## Artigo IV — Eventos como Fonte de Verdade

O sistema adota uma arquitetura orientada a eventos. Eventos sao cidadaos de primeira classe e devem ser tratados com o mesmo rigor que dados persistidos.

### Clausula 4.1 — Envelope Padrao de Evento
Todo evento publicado DEVE seguir o envelope padrao contendo os campos obrigatorios:

```typescript
interface DomainEvent {
  id: string;           // UUID v7 (ordenavel por tempo)
  type: string;         // formato: domain.entity.action (ex: marketplace.order.created)
  version: number;      // versao do schema do payload
  tenantId: string;     // UUID do tenant de origem
  timestamp: string;    // ISO 8601 com timezone UTC
  correlationId: string; // rastreabilidade end-to-end
  causationId: string;  // id do evento que causou este
  payload: Record<string, unknown>;
}
```

Eventos que nao contenham todos os campos obrigatorios DEVEM ser rejeitados pelo barramento.

### Clausula 4.2 — Outbox Pattern Obrigatorio
Eventos NUNCA sao publicados diretamente no barramento de mensagens. O fluxo obrigatorio e: (1) salvar dados no banco; (2) salvar evento na tabela `outbox` dentro da mesma transacao; (3) um processo separado (outbox relay) le a tabela `outbox` e publica no barramento. Isso garante que eventos so sao publicados apos commit bem-sucedido no banco de dados. Conforme ADR-005 (Outbox Pattern).

### Clausula 4.3 — Retry com Backoff Exponencial
Consumidores de eventos DEVEM implementar retry com backoff exponencial. A formula padrao e: `delay = base_delay * 2^attempt + jitter`. O numero maximo de tentativas DEVE ser configuravel por tipo de evento (padrao: 5). Apos esgotar as tentativas, o evento DEVE ser movido para uma Dead Letter Queue (DLQ) com metadados completos do erro.

### Clausula 4.4 — Validacao de Schema em CI
Todo schema de evento DEVE ser definido em um registro de schemas (JSON Schema ou Avro). Mudancas de schema DEVEM ser validadas no pipeline de CI para garantir compatibilidade retroativa. Schemas que quebrem compatibilidade DEVEM incrementar o campo `version` do evento e manter o schema anterior ativo durante o periodo de deprecacao.

### Clausula 4.5 — Idempotencia de Consumidores
Todo consumidor de evento DEVE ser idempotente. O `event.id` DEVE ser verificado contra uma tabela de eventos processados antes da execucao. Processar o mesmo evento duas vezes DEVE produzir exatamente o mesmo resultado que processa-lo uma vez. Isso e critico para cenarios de replay e recuperacao de falhas.

### Clausula 4.6 — Ordenacao e Particao por Tenant
Eventos DEVEM ser particionados por `tenant_id` para garantir ordenacao dentro de um tenant. A ordem de eventos entre tenants diferentes nao e garantida e nao deve ser presumida. Cada particao DEVE ter capacidade de processamento independente para evitar que um tenant com alto volume impacte os demais.

---

## Artigo V — Observabilidade Obrigatoria

Se nao pode ser observado, nao pode ser operado. Observabilidade e requisito de producao, nao melhoria futura.

### Clausula 5.1 — CorrelationId em Toda Requisicao
Toda requisicao HTTP que entra no sistema DEVE receber um `correlationId` (UUID v4) caso nao possua um no header `X-Correlation-Id`. Este `correlationId` DEVE ser propagado para: todas as chamadas entre servicos, todas as queries ao banco de dados (via comentario SQL), todos os eventos publicados, todos os logs emitidos e todas as chamadas a servicos externos (Stripe, Algolia).

### Clausula 5.2 — Logging Estruturado com Contexto de Tenant
Todos os logs DEVEM ser estruturados (formato JSON) e DEVEM incluir, no minimo: `timestamp`, `level`, `message`, `tenant_id`, `correlation_id`, `service_name`, `trace_id`. Logs em texto livre sao proibidos em producao. O nivel de log DEVE ser configuravel por tenant e por servico sem necessidade de redeploy (via feature flag ou configuracao em Redis).

### Clausula 5.3 — Propagacao entre Chamadas HTTP
Ao realizar chamadas HTTP entre servicos internos, os seguintes headers DEVEM ser propagados: `X-Correlation-Id`, `X-Tenant-Id`, `X-Request-Id`, `X-Trace-Id`. O servico receptor DEVE utilizar esses headers para contextualizacao de logs e traces. Chamadas sem `X-Tenant-Id` entre servicos internos DEVEM ser rejeitadas.

### Clausula 5.4 — Metricas por Tenant para Alocacao de Custo
Metricas de uso DEVEM ser coletadas e tagueadas por `tenant_id`. Isso inclui: numero de requisicoes, tempo de resposta (p50, p95, p99), consumo de storage, numero de eventos processados, chamadas a APIs externas. Estas metricas alimentam o modulo de FinOps para alocacao precisa de custo por tenant. Conforme ADR-017 (FinOps).

### Clausula 5.5 — Health Checks e Readiness Probes
Todo servico DEVE expor endpoints de health check (`/health/live`) e readiness probe (`/health/ready`). O liveness check verifica que o processo esta ativo. O readiness check verifica conectividade com dependencias criticas (PostgreSQL, Redis, message broker). Se qualquer dependencia critica estiver indisponivel, o servico DEVE se declarar nao-pronto.

### Clausula 5.6 — Alertas e SLOs por Tenant
Alertas DEVEM ser configurados para detectar degradacao de servico por tenant. SLOs (Service Level Objectives) minimos: disponibilidade 99.9%, latencia p95 < 500ms para APIs sincronas, processamento de eventos < 30s para 95% dos eventos. Violacoes de SLO DEVEM gerar alertas automaticos e serem rastreadas em dashboard dedicado.

---

## Artigo VI — Trust Infrastructure

Confianca nao e assumida; e construida, verificada e auditada continuamente.

### Clausula 6.1 — Data Lineage para Toda Transformacao
Toda transformacao de dados DEVE manter rastreabilidade completa (data lineage). Para cada dado derivado, DEVE ser possivel responder: de onde veio, quando foi transformado, por qual processo e com qual versao do codigo. O `correlation_id` e o `causation_id` dos eventos sao os mecanismos primarios de rastreabilidade. Conforme ADR-013 (Trust Infrastructure).

### Clausula 6.2 — Policy-as-Code com OPA
Decisoes de autorizacao complexas DEVEM ser implementadas como politicas declarativas usando Open Policy Agent (OPA) ou mecanismo equivalente. As politicas DEVEM ser versionadas no repositorio de codigo, testadas em CI e implantadas via GitOps. Mudancas em politicas de autorizacao DEVEM passar pelo mesmo processo de review que mudancas de codigo.

### Clausula 6.3 — Audit Trail Acessivel via API
O audit trail DEVE ser acessivel via API RESTful para integracao com sistemas de SIEM (Security Information and Event Management) do tenant. A API DEVE suportar: filtragem por periodo, usuario, tipo de acao e recurso; paginacao; e exportacao em formatos padrao (JSON, CSV). O acesso a API de audit DEVE ser restrito a roles `tenant_admin` e `platform_admin`.

### Clausula 6.4 — Compliance Gates antes de Operacoes Financeiras
Toda operacao financeira DEVE passar por compliance gates antes da execucao. Os gates incluem: (a) verificacao de identidade do usuario (KYC status); (b) verificacao de limites operacionais do tenant; (c) verificacao de regras anti-fraude; (d) verificacao de status regulatorio do tenant. Falha em qualquer gate DEVE bloquear a operacao e gerar alerta.

### Clausula 6.5 — Assinatura Digital de Registros Criticos
Registros financeiros e de auditoria DEVEM ser assinados digitalmente usando HMAC-SHA256 com chave gerenciada pelo sistema. A assinatura permite detectar adulteracao de registros. Verificacoes periodicas de integridade DEVEM ser executadas como job agendado (minimo diario) e discrepancias DEVEM gerar alertas P1.

### Clausula 6.6 — Zero Trust entre Servicos
A comunicacao entre servicos internos DEVE seguir o modelo Zero Trust. Cada servico DEVE autenticar e autorizar chamadas de outros servicos usando service tokens com escopo limitado. Nenhum servico e confiavel por padrao, independentemente de estar na mesma rede. mTLS DEVE ser utilizado para comunicacao entre servicos em producao.

---

## Artigo VII — Simplicidade e Anti-Abstracao

Complexidade e o inimigo silencioso. Toda decisao arquitetural DEVE favorecer a solucao mais simples que atenda aos requisitos.

### Clausula 7.1 — Maximo de 3 Servicos Core na Fase 0
Na fase inicial (Phase 0), o sistema DEVE ser composto por no maximo 3 servicos core: (1) `api-gateway` — ponto de entrada, resolucao de tenant, autenticacao; (2) `marketplace-service` — logica de negocio do marketplace, pedidos, providers; (3) `billing-service` — ledger, pagamentos, Stripe Connect. Novos servicos so podem ser adicionados apos justificativa documentada em ADR.

### Clausula 7.2 — Uso Direto de NestJS e Drizzle
O codigo DEVE utilizar NestJS e Drizzle ORM diretamente, sem camadas de abstracao customizadas. Drizzle foi escolhido por ser SQL-first, com suporte superior a RLS e chaves primarias compostas (ADR decisao critica). E proibido criar: ORMs wrapper sobre Drizzle, frameworks de routing sobre NestJS, bibliotecas internas de dependency injection customizadas, ou camadas de abstracao "para facilitar testes". Decorators e modules do NestJS sao a abstracao. Shared code DEVE ser limitado a: interceptors, guards, decorators e DTOs.

### Clausula 7.3 — Testes de Integracao como Prioridade
A estrategia de testes prioriza testes de integracao com dependencias reais. Testes DEVEM usar: PostgreSQL real (via testcontainers ou banco de teste dedicado), Redis real, e mocks somente para servicos externos (Stripe, Algolia). A piramide de testes segue: integracao (60%), unidade (30%), e2e (10%). Testes que dependem de mocks excessivos sao considerados frageis e devem ser refatorados.

### Clausula 7.4 — Rule of Three para Abstracoes
Nenhuma abstracao DEVE ser criada ate que o padrao tenha sido repetido no minimo 3 vezes em contextos diferentes. Na primeira ocorrencia, copie. Na segunda, anote. Na terceira, abstraia. Abstracoes prematuras sao mais custosas que codigo duplicado. Toda abstracao criada DEVE ser justificada com os 3 casos concretos que a motivaram.

### Clausula 7.5 — Convencoes sobre Configuracao
O projeto DEVE seguir convencoes consistentes que eliminem a necessidade de documentacao extensiva: nomenclatura de arquivos (`kebab-case`), estrutura de modulos (feature-first), nomenclatura de tabelas (`snake_case`, plural), nomenclatura de colunas (`snake_case`), formato de resposta de API (envelope padrao com `data`, `meta`, `errors`). Desvios de convencao DEVEM ser documentados em ADR.

### Clausula 7.6 — Nenhuma Dependencia sem Justificativa
Toda dependencia externa (pacote npm, servico SaaS, ferramenta) DEVE ser justificada antes da adocao. Criterios de avaliacao: (a) a dependencia resolve um problema real e imediato; (b) possui manutencao ativa (commits nos ultimos 6 meses); (c) nao duplica funcionalidade ja disponivel no stack; (d) o custo de implementacao propria seria significativamente maior. Dependencias que falhem em qualquer criterio DEVEM ser rejeitadas.

---

## Artigo VIII — Crypto Rails

Trilhos de pagamento em criptomoeda sao tratados com o mesmo rigor — ou superior — que trilhos de moeda fiduciaria.

### Clausula 8.1 — Adapter Pattern para Multiplas Blockchains
A integracao com blockchains DEVE seguir o Adapter Pattern, com uma interface unificada (`ICryptoRailAdapter`) e implementacoes especificas por blockchain (Ethereum, Polygon, Solana, etc.). A adicao de uma nova blockchain DEVE exigir apenas a implementacao de um novo adapter, sem modificacao no codigo existente (Open/Closed Principle). Conforme ADR-008 (Crypto Rail Adapter).

### Clausula 8.2 — Conciliacao com Limites de Confirmacao
Transacoes on-chain so DEVEM ser consideradas finalizadas apos atingir o numero minimo de confirmacoes definido por blockchain: Ethereum (12 confirmacoes), Polygon (128 confirmacoes), Solana (32 confirmacoes). Ate atingir o limite, a transacao permanece em estado `pending_confirmation`. Creditos no ledger interno so sao realizados apos finalizacao. Conforme ADR-009 (Crypto Reconciliation Ledger).

### Clausula 8.3 — Camada de Compliance AML
Toda transacao de criptomoeda DEVE passar por uma camada de compliance Anti-Money Laundering (AML) antes do credito no ledger. A camada DEVE: (a) verificar o endereco de origem contra listas de sancoes (OFAC, EU Sanctions); (b) calcular risk score da transacao; (c) aplicar regras de threshold por tenant e por jurisdicao; (d) bloquear e reportar transacoes suspeitas automaticamente. Conforme ADR-010 (Crypto Compliance AML).

### Clausula 8.4 — Registros de Transacao Imutaveis
Todo registro de transacao cripto no sistema DEVE ser imutavel, seguindo o mesmo principio do ledger financeiro (Artigo III, Clausula 3.1). O registro DEVE conter: `tenant_id`, `tx_hash`, `blockchain`, `from_address`, `to_address`, `amount`, `token`, `confirmations`, `status`, `aml_check_result`, `created_at`. Alteracoes de status sao registradas como novas entradas, nao como updates.

### Clausula 8.5 — Segregacao de Wallets por Tenant
Cada tenant DEVE ter wallets segregadas (enderecos unicos) para recebimento de criptomoedas. Fundos de diferentes tenants NUNCA devem ser co-misturados em um unico endereco. A geracao de enderecos DEVE seguir padrao HD Wallet (BIP-44) com derivacao por tenant. Chaves privadas DEVEM ser armazenadas em HSM ou servico de custodia qualificado; NUNCA no banco de dados da aplicacao.

### Clausula 8.6 — Fallback e Circuit Breaker para Nodes
A comunicacao com nodes de blockchain DEVE implementar circuit breaker pattern. Se um provider de node (ex: Alchemy, Infura) estiver indisponivel, o sistema DEVE fazer fallback para um provider alternativo. O estado do circuit breaker DEVE ser monitorado e alertado. Transacoes em andamento durante falha de node DEVEM ser reprocessadas automaticamente apos recuperacao, respeitando idempotencia.

---

## Artigo IX — Escalabilidade e Deploy

A arquitetura DEVE suportar crescimento de tenants sem redesign. Deploy DEVE ser automatizado, auditavel e revertivel.

### Clausula 9.1 — GitOps com OCI Artifacts
Todo deploy DEVE ser gerenciado via GitOps. O estado desejado da infraestrutura e das aplicacoes DEVE ser declarado em repositorio Git. Artefatos de deploy DEVEM ser empacotados como OCI Artifacts, permitindo versionamento, assinatura e verificacao de integridade. Deploys manuais via kubectl, SSH ou console sao proibidos em producao. Conforme ADR-011 (GitOps OCI Artifacts).

### Clausula 9.2 — Hub-and-Spoke para Multi-tenant Scaling
A arquitetura de deploy DEVE seguir o modelo Hub-and-Spoke: o Hub contem servicos compartilhados (gestao de tenants, billing, observabilidade) e cada Spoke e um ambiente isolado que pode atender um ou mais tenants. Tenants com requisitos de compliance especificos (dados soberanos, regulacao setorial) DEVEM poder ser movidos para Spokes dedicados sem alteracao de codigo. Conforme ADR-006 e ADR-007.

### Clausula 9.3 — Edge Computing para Latencia Global
Assets estaticos, APIs de leitura pesada e resolucao de tenant DEVEM ser distribuidos via edge computing (CDN com compute). A estrategia DEVE suportar: (a) cache de conteudo estatico por tenant; (b) execucao de logica de roteamento no edge; (c) pre-rendering de paginas Next.js no edge; (d) fallback transparente para a regiao de origem em caso de cache miss. Conforme ADR-015 (Edge Computing).

### Clausula 9.4 — FinOps: Todo Recurso Tagueado com Tenant
Todo recurso de infraestrutura (instancia, banco, fila, storage, CDN) DEVE ser tagueado com `tenant_id` ou `tenant_group_id` para alocacao precisa de custos. Metricas de consumo DEVEM ser coletadas por tenant e disponibilizadas em dashboard de FinOps. Tenants que ultrapassem thresholds de custo DEVEM gerar alertas para o time de operacoes. Conforme ADR-017 (FinOps).

### Clausula 9.5 — Rollback Automatico
Todo deploy DEVE ter uma estrategia de rollback automatico. Se as metricas de saude (error rate, latencia p99, taxa de sucesso de health check) degradarem alem dos thresholds definidos nos primeiros 10 minutos apos deploy, o sistema DEVE reverter automaticamente para a versao anterior. Rollbacks DEVEM ser registrados no audit log com justificativa automatica.

### Clausula 9.6 — Ambientes de Preview por Pull Request
Toda pull request DEVE gerar um ambiente de preview efemero com dados de seed para validacao manual e automatizada. O ambiente DEVE incluir: servicos afetados pela mudanca, banco com schema atualizado e dados de teste, e URL acessivel para revisores. Ambientes de preview DEVEM ser destruidos automaticamente apos merge ou fechamento da PR.

---

## Artigo X — API Contracts

APIs sao contratos publicos. Contratos quebrados destroem a confianca de integradores e parceiros.

### Clausula 10.1 — Versionamento por Path de URL
Todas as APIs DEVEM ser versionadas via path de URL no formato `/api/v{N}/resource`. Cada versao DEVE ter comportamento estavel e previsivel. O header `X-API-Version` pode ser usado para sub-versoes (minor), mas o path DEVE conter a major version. Conforme ADR-023 (API Versioning).

### Clausula 10.2 — Breaking Changes Exigem Nova Versao
Qualquer mudanca que quebre a compatibilidade retroativa DEVE resultar na criacao de uma nova major version da API. Sao consideradas breaking changes: remocao de campos, mudanca de tipo de campo, alteracao de semantica de campo existente, remocao de endpoint, mudanca de codigos de status HTTP para mesma operacao. Adicao de campos opcionais NAO e breaking change.

### Clausula 10.3 — Politica de Deprecacao: Minimo 6 Meses
Versoes de API deprecadas DEVEM permanecer ativas e funcionais por no minimo 6 meses apos o anuncio de deprecacao. O anuncio DEVE incluir: (a) header `Sunset` com data de desativacao conforme RFC 8594; (b) header `Deprecation` conforme draft-ietf-httpapi-deprecation-header; (c) documentacao de migracao; (d) notificacao por email a todos os tenants que utilizam a versao afetada.

### Clausula 10.4 — OpenAPI Spec como Fonte de Verdade
Toda API DEVE ter uma especificacao OpenAPI (versao 3.1+) atualizada e versionada no repositorio. A especificacao DEVE ser a fonte de verdade — DTOs, validators e clientes DEVEM ser gerados a partir da spec, nao o contrario. A especificacao DEVE ser validada no CI e diferencas entre spec e implementacao DEVEM falhar o build.

### Clausula 10.5 — Envelope Padrao de Resposta
Todas as respostas de API DEVEM seguir o envelope padrao:

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO8601",
    "version": "v1",
    "pagination": {}
  },
  "errors": []
}
```

Respostas de sucesso DEVEM incluir `data` e `meta`. Respostas de erro DEVEM incluir `errors` com array de objetos contendo `code`, `message`, `field` (quando aplicavel) e `details`. Codigos de erro DEVEM ser documentados e estaveis entre versoes.

### Clausula 10.6 — Contratos de Teste (Contract Testing)
Toda integracao entre servicos internos e toda API publica DEVEM ter contract tests. Os testes validam que o provider implementa o contrato esperado pelo consumer. Contract tests DEVEM ser executados no CI de ambos os lados (provider e consumer). Falha em contract test DEVE bloquear o deploy. Recomenda-se o uso de Pact ou ferramenta equivalente.

---

## Artigo XI — Inteligencia AI-Native

A inteligencia artificial nao e um add-on; e uma capacidade arquitetural de primeira classe que permeia dados, decisoes e workflows.

### Clausula 11.1 — AI Gateway como Ponto Unico de Acesso a LLMs
Toda chamada a modelos de linguagem (LLMs) DEVE passar pelo AI Gateway (`packages/ai-gateway`). O gateway DEVE implementar: (a) roteamento multi-provider (OpenAI, Anthropic, Ollama) com fallback automatico; (b) cache semantico para evitar chamadas redundantes; (c) metricas de custo por tenant por operacao; (d) rate limiting por tenant; (e) logging estruturado de prompt/completion para auditoria. Chamadas diretas a providers de IA fora do gateway sao proibidas. Conforme ADR-024.

### Clausula 11.2 — Embeddings como Cidadaos de Primeira Classe
Embeddings sao dados derivados que DEVEM ser sincronizados automaticamente via eventos de dominio. Toda entidade que possua representacao vetorial DEVE: (a) publicar evento no outbox quando criada ou atualizada; (b) ter o embedding recalculado por worker dedicado (`workers/embedding-sync`); (c) ser armazenada em pgvector com `tenant_id` como filtro obrigatorio (RLS se aplica a vetores). Embeddings desatualizados sao considerados bug — o sync DEVE ser eventualmente consistente com SLO < 60 segundos. Conforme ADR-025.

### Clausula 11.3 — Observabilidade de IA: Metricas de Qualidade e Custo
Alem das metricas tecnicas tradicionais (Artigo V), toda operacao de IA DEVE coletar metricas especificas: (a) latencia por provider/modelo; (b) custo (tokens de input + output) por tenant e por operacao; (c) taxa de fallback entre providers; (d) score de qualidade da resposta (quando aplicavel via feedback loop); (e) taxa de alucinacao detectada (para operacoes com ground truth). Estas metricas DEVEM alimentar dashboards de FinOps-AI por tenant. Conforme ADR-026.

### Clausula 11.4 — A/B Testing de LLMs em Producao
O sistema DEVE suportar A/B testing de modelos e prompts em producao. O AI Gateway DEVE implementar: (a) roteamento por percentual de trafego entre variantes (modelo A vs modelo B); (b) coleta de metricas por variante (custo, latencia, qualidade); (c) segmentacao por tenant (tenants podem ser atribuidos a variantes especificas); (d) rollback automatico se a variante apresentar degradacao de qualidade. Decisoes de troca de modelo DEVEM ser baseadas em dados, nao em intuicao. Conforme ADR-027.

### Clausula 11.5 — Runtime de Agentes com Gestao de Estado
Agentes autonomos (agentic workflows) DEVEM ser executados em runtime dedicado com gestao de estado explicita. O runtime DEVE garantir: (a) estado persistido entre steps do agente (nao em memoria); (b) limites de iteracao configuraveis por tipo de agente e por tenant; (c) human-in-the-loop obrigatorio para acoes destrutivas ou financeiras; (d) audit log de todas as decisoes do agente com chain-of-thought; (e) circuit breaker para agentes que excedam custo ou tempo. Agentes NUNCA operam sem supervisao de estado. Conforme ADR-028.

### Clausula 11.6 — Decision Delegation com Autonomia Gradual
Agentes podem receber delegacao de decisao com niveis de autonomia crescentes: Nivel 0 (sugere, humano decide), Nivel 1 (decide com confirmacao humana), Nivel 2 (decide autonomamente com threshold). A progressao de nivel DEVE ser baseada em historico de acerto do agente por tipo de decisao e por tenant. O threshold de confianca para cada nivel DEVE ser configuravel pelo `tenant_admin`. Toda decisao delegada DEVE ser registrada no audit log com: nivel de autonomia, score de confianca, e decisao tomada. Regressao de nivel e automatica se a taxa de erro exceder threshold. Conforme ADR-029.

---

## Gates de Qualidade

Nenhum artefato pode ser implantado em producao sem passar por todos os gates abaixo. Gates sao automatizados e integrados ao pipeline de CI/CD.

### Gate 1 — Gate de Simplicidade
**Criterio:** O numero de servicos core nao excede 3 na Fase 0.
**Validacao:** Script de CI verifica o numero de servicos declarados no manifesto de deploy.
**Violacao:** Deploy bloqueado. Requer ADR aprovado para adicao de servico.

### Gate 2 — Gate Anti-Abstracao
**Criterio:** O codigo utiliza NestJS e Drizzle ORM diretamente, sem wrappers customizados.
**Validacao:** Linter customizado verifica ausencia de camadas de abstracao proibidas (lista mantida em `.eslintrc`).
**Violacao:** Build falha. Codigo deve ser refatorado para usar APIs nativas do framework.

### Gate 3 — Gate de Integracao
**Criterio:** Contratos entre servicos estao definidos, versionados e testados.
**Validacao:** Contract tests (Pact ou equivalente) executam no CI e validam provider/consumer.
**Violacao:** Deploy bloqueado. Contratos devem ser atualizados e testes corrigidos.

### Gate 4 — Gate de Isolamento
**Criterio:** Nenhuma query acessa dados sem filtro de `tenant_id`; testes de vazamento cross-tenant passam.
**Validacao:** (a) Analise estatica de queries Drizzle via linter customizado; (b) Suite de testes de integracao que tenta acessar dados de Tenant B usando credenciais de Tenant A.
**Violacao:** Build falha. Considerada falha critica de seguranca (P0).

### Gate 5 — Gate Financeiro
**Criterio:** Toda operacao financeira possui chave de idempotencia e testes de idempotencia passam.
**Validacao:** Testes automatizados que executam a mesma operacao financeira 3 vezes com a mesma chave e validam que o resultado e identico e que apenas uma entrada e criada no ledger.
**Violacao:** Deploy bloqueado. Considerada falha critica de integridade (P0).

### Gate 6 — Gate de Observabilidade
**Criterio:** Todo log e resposta de API contem `correlationId`; metricas por tenant estao configuradas.
**Validacao:** (a) Testes de integracao verificam presenca de `correlationId` em logs e headers de resposta; (b) Script valida que dashboards de metricas por tenant estao provisionados.
**Violacao:** Deploy bloqueado. Operacao sem observabilidade nao e permitida em producao.

### Gate 7 — Gate de Qualidade IA
**Criterio:** Toda chamada a LLM passa pelo AI Gateway; embeddings possuem sync automatico; metricas de custo por tenant estao ativas.
**Validacao:** (a) Analise estatica verifica ausencia de chamadas diretas a providers de IA fora do gateway; (b) Testes de integracao validam que criacao/atualizacao de entidade com embedding dispara evento de sync; (c) Script verifica que metricas de custo-por-operacao estao sendo coletadas por tenant.
**Violacao:** Deploy bloqueado. Operacoes de IA sem observabilidade e controle de custo nao sao permitidas em producao.

---

## Emendas

### Processo de Emenda
1. **Proposta:** Qualquer membro do time pode propor uma emenda via Pull Request que modifica este documento.
2. **Documentacao:** A proposta DEVE incluir: justificativa tecnica, impacto nos artigos existentes, analise de compatibilidade retroativa e plano de migracao (se aplicavel).
3. **Revisao:** A emenda DEVE ser revisada e aprovada por no minimo 2 engenheiros senior e 1 arquiteto.
4. **Versionamento:** Cada emenda incrementa a versao minor deste documento. Mudancas em principios inviolaveis incrementam a versao major.

### Restricoes Inviolaveis
Nenhuma emenda, sob qualquer circunstancia, pode:

- **Enfraquecer o isolamento de tenant** (Artigo I) — o isolamento so pode ser fortalecido, nunca relaxado.
- **Comprometer a integridade financeira** (Artigo III) — a imutabilidade do ledger e a idempotencia sao inegociaveis.
- **Remover compliance gates** (Artigo VI, Clausula 6.4) — gates podem ser adicionados ou refinados, nunca removidos.
- **Eliminar gates de qualidade** — gates podem ser adicionados ou tornados mais rigorosos, nunca removidos ou relaxados.
- **Remover o AI Gateway como ponto unico de acesso** (Artigo XI, Clausula 11.1) — chamadas diretas a LLMs sao proibidas; todo acesso DEVE passar pelo gateway.

### Registro de Emendas

| Versao | Data       | Descricao                          | Autor      |
|--------|------------|------------------------------------|------------|
| 1.0.0  | 2026-03-03 | Versao inicial da Constituicao     | Arquitetura |
| 2.0.0  | 2026-03-03 | Artigo XI (AI-Native), Gate 7, migracao TypeORM→Drizzle, pilar AI-Native | Arquitetura |

---

> **"A complexidade e o inimigo da seguranca, da correcao e da manutencao. Quando em duvida, simplifique."**
