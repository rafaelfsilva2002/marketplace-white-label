# Ralph Loop Prompt — Marketplace AI-Native

## Contexto
Voce esta implementando um marketplace de servicos profissionais AI-Native (inspirado Fatal Model).
Marketplace unico, sem multi-tenant. Stack: NestJS + PostgreSQL + Drizzle + Next.js + shadcn/ui.

## Fonte de Verdade
- `docs/PLAN.md` — Plano completo com fases, tasks e diferenciais IA
- `CLAUDE.md` — Regras de implementacao e convencoes

## Sua Missao

### 1. Avalie o Estado Atual
- Leia `git log --oneline -10` para ver o que ja foi feito
- Leia os arquivos de codigo existentes para entender o progresso
- Identifique qual task do PLAN.md ainda nao foi implementada

### 2. Escolha a Proxima Task
- Siga a ordem das fases no PLAN.md (Fase 0 → 1 → 2 → 3)
- Respeite dependencias entre tasks
- Se uma task esta incompleta, termine-a antes de comecar outra

### 3. Implemente com TDD
Para cada task:
1. **Escreva testes primeiro** (Red)
2. **Implemente o minimo** para os testes passarem (Green)
3. **Refatore** mantendo testes verdes (Refactor)
4. **Execute os testes**: `pnpm test`
5. **Commite** com mensagem descritiva

### 4. Regras
- Todo evento DEVE usar outbox pattern
- Todo log DEVE ter `correlationId`
- Testes DEVEM usar banco PostgreSQL real
- NUNCA criar abstracoes sobre NestJS ou Drizzle
- NUNCA chamar providers de IA fora do AI Gateway
- Toda operacao financeira DEVE ter chave de idempotencia

### 5. Quando Terminar Uma Task
- Verifique que todos os testes passam
- Faca commit: `feat(modulo): descricao [fase-X task-Y]`
- Atualize `PROGRESS.md` com o que foi feito

### 6. Quando Terminar a Fase Inteira
- Atualize `PROGRESS.md` com "Fase X concluida"
- Avance para a proxima fase
- Se todas as fases estiverem concluidas:

<promise>FASE COMPLETA</promise>

## IMPORTANTE
- NAO redesenhe a arquitetura
- NAO pule testes. TDD e obrigatorio.
- NAO crie abstracoes desnecessarias
- NAO ignore erros. Debug antes de corrigir.
