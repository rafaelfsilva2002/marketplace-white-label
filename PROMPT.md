# Ralph Loop Prompt — Marketplace White Label

## Contexto
Voce esta implementando uma plataforma SaaS white-label de marketplace AI-Native multi-tenant.
Toda a arquitetura esta documentada. Sua responsabilidade e IMPLEMENTAR, nao redesenhar.

## Fontes de Verdade
1. `constitution.md` — Principios inviolaveis
2. `docs/requirements.md` — Requisitos com criterios de aceitacao
3. `docs/trace-matrix.md` — Mapa requisito → ADR → task
4. `specs/pending/fase-0-alicerce.json` — Tasks da fase atual
5. `docs/adr/` — Decisoes com codigo de exemplo
6. `CLAUDE.md` — Regras de implementacao e convencoes

## Sua Missao

### 1. Avalie o Estado Atual
- Leia `git log --oneline -10` para ver o que ja foi feito
- Leia os arquivos de codigo existentes para entender o progresso
- Identifique qual task da spec atual ainda nao foi implementada

### 2. Escolha a Proxima Task
- Siga a ordem do spec: `specs/pending/fase-0-alicerce.json`
- Respeite dependencias entre tasks
- Se uma task esta incompleta, termine-a antes de comecar outra
- Se a fase 0 estiver completa, avance para `fase-1-mvp-nucleo-multitenant.json`

### 3. Implemente com TDD
Para cada task:
1. **Leia o ADR** referenciado na trace-matrix (`docs/trace-matrix.md`)
2. **Escreva testes primeiro** (Red) — testes de integracao com banco real quando aplicavel
3. **Implemente o minimo** para os testes passarem (Green)
4. **Refatore** mantendo testes verdes (Refactor)
5. **Verifique criterios de aceitacao** do requisito em `docs/requirements.md`
6. **Execute os testes**: `pnpm test` ou equivalente
7. **Commite** com mensagem descritiva da task

### 4. Regras Inviolaveis (da Constituicao)
- Todo codigo DEVE incluir `tenant_id` em queries de dados de dominio
- Todo evento DEVE usar outbox pattern (ADR-005)
- Todo log DEVE ter `correlationId` e `tenant_id`
- Testes DEVEM usar banco PostgreSQL real (testcontainers ou db de teste)
- NUNCA criar abstracoes sobre NestJS ou Drizzle

### 5. Qualidade
- Cobertura minima 80% em modulos core
- Latencia P95 < 200ms para APIs de leitura
- Contract tests entre servicos
- Lint sem warnings

### 6. Quando Terminar Uma Task
- Verifique que todos os testes passam
- Verifique que os criterios de aceitacao do requisito estao satisfeitos
- Faca commit com mensagem: `feat(modulo): descricao da task [task-X-Y]`
- Atualize o progresso: crie/atualize `PROGRESS.md` com o que foi feito

### 7. Quando Terminar a Fase Inteira
Se TODAS as tasks da fase atual estiverem implementadas e testadas:
- Atualize `PROGRESS.md` com "Fase X concluida"
- Avance para a proxima fase
- Se todas as fases estiverem concluidas:

<promise>FASE COMPLETA</promise>

## Fluxo de Cada Iteracao

```
1. git log → entender onde parou
2. Ler spec atual → identificar proxima task
3. Ler ADR da task → entender decisao e codigo
4. Escrever testes → TDD Red
5. Implementar → TDD Green
6. Refatorar → TDD Refactor
7. Verificar criterios → requirements.md
8. Rodar testes → pnpm test
9. Commitar → git commit
10. Atualizar PROGRESS.md
```

## IMPORTANTE
- NAO redesenhe a arquitetura. Ela ja esta aprovada.
- NAO pule testes. TDD e obrigatorio.
- NAO crie abstracoes desnecessarias. Rule of Three.
- NAO ignore erros. Systematic debugging antes de corrigir.
- SIGA os exemplos de codigo dos ADRs. Eles foram escritos com intencao.
