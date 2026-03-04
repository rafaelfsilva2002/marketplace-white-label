# Ralph Loop Prompt — Marketplace AI-Native

## Contexto

Voce esta implementando um marketplace de servicos profissionais AI-Native (inspirado Fatal Model).
Marketplace unico, sem multi-tenant. Stack: NestJS + PostgreSQL + Drizzle + Next.js + shadcn/ui.

## Fonte de Verdade

- `docs/PLAN.md` — Plano completo com fases, tasks e diferenciais IA
- `PROGRESS.md` — O que ja foi feito (atualizar apos CADA task)
- `CLAUDE.md` — Regras de implementacao e convencoes

## Modo de Operacao: LOOP AUTONOMO

Voce esta em modo de loop continuo. Isso significa:

- **NUNCA** pare entre tasks
- **NUNCA** pergunte "devo continuar?"
- **NUNCA** espere confirmacao do usuario
- **SEMPRE** avance para a proxima task imediatamente apos concluir a atual
- **SEMPRE** atualize PROGRESS.md apos cada task
- **SEMPRE** faca commit apos cada task

## Sua Missao

### 1. Avalie o Estado Atual

```bash
git log --oneline -10
cat PROGRESS.md
```

- Leia `docs/PLAN.md` para ver todas as tasks de todas as fases
- Identifique a primeira task NAO marcada como `[x]` no PROGRESS.md
- Se uma task esta parcialmente feita, termine-a antes de comecar outra

### 2. Escolha a Proxima Task

- Siga a ordem das fases no PLAN.md (Fase 0 → 1 → 2 → 3 → ...)
- Respeite dependencias entre tasks
- NAO repita o que ja esta marcado como feito no PROGRESS.md

### 3. Implemente com TDD

Para cada task:

1. **Red** — Escreva testes PRIMEIRO (eles devem falhar)
2. **Green** — Implemente o minimo para os testes passarem
3. **Refactor** — Refatore mantendo testes verdes
4. **Verify** — Execute `pnpm test` e confirme que todos passam
5. **Commit** — `git add -A && git commit -m "feat(modulo): descricao [fase-X task-Y]"`

### 4. Atualize PROGRESS.md

Apos concluir cada task, adicione na secao correta:

```
- [x] X.Y Nome da task — breve descricao do que foi implementado
```

### 5. Regras Obrigatorias

- Todo evento DEVE usar outbox pattern
- Todo log DEVE ter `correlationId`
- Testes DEVEM usar banco PostgreSQL real (testcontainers ou DB de teste)
- NUNCA criar abstracoes sobre NestJS ou Drizzle
- NUNCA chamar providers de IA fora do AI Gateway
- Toda operacao financeira DEVE ter chave de idempotencia

### 6. Sinalizacao de Progresso

Ao final de CADA resposta, escreva EXATAMENTE uma destas opcoes:

Se ainda ha tasks pendentes:

```
PROXIMA TASK: fase-X task-Y — nome da task
```

Se TODAS as tasks de TODAS as fases estiverem concluidas:

```
FASE COMPLETA
```

Depois de escrever `PROXIMA TASK`, comece imediatamente a implementar essa task. NAO espere.

## IMPORTANTE — Anti-Padroes Proibidos

- ❌ "Task X concluida. Devo continuar para a task Y?" → Apenas continue.
- ❌ "Voce quer que eu implemente a proxima task?" → Apenas implemente.
- ❌ "Terminei esta fase. Devo comecar a proxima?" → Apenas comece.
- ❌ Parar e resumir apos cada arquivo criado → Resuma apenas apos a task completa.
- ❌ Perguntar qual task fazer → Leia PROGRESS.md e PLAN.md e decida sozinho.

## Padrao Correto

✅ Implementa task → roda testes → commita → atualiza PROGRESS.md → escreve PROXIMA TASK → imediatamente comeca a proxima task.

Continue assim ate escrever FASE COMPLETA.
