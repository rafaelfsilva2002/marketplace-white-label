# ADR 011: GitOps com OCI Artifacts (Flux D2)

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

A plataforma precisa de um pipeline de deploy confiavel, auditavel e reproduzivel que suporte multiplos ambientes (dev, staging, prod) com promocao controlada entre eles. O modelo tradicional de GitOps (Flux v1, ArgoCD com raw Git) puxa manifestos diretamente de repositorios Git, o que apresenta limitacoes: polling constante no Git gera carga, manifestos podem ser alterados entre o momento da aprovacao e o deploy, e nao ha garantia de integridade do artefato deployado.

O Flux D2 (v2) introduz suporte nativo a OCI Artifacts -- artefatos empacotados como imagens OCI (Open Container Initiative) armazenados em registries padrao (como GHCR, ECR, ACR). Isso permite tratar manifestos Kubernetes como artefatos imutaveis e assinados, com o mesmo modelo de distribuicao e cache de imagens de container.

A combinacao de OCI Artifacts com assinatura Cosign garante que o artefato deployado em producao e exatamente o mesmo que foi testado em staging, com prova criptografica de integridade e procedencia. Isso atende requisitos de compliance (SOC2) e simplifica auditorias de deploy.

## Decisao

Adotamos **Flux D2 com OCI Artifacts** como mecanismo de deploy da plataforma. Manifestos Kubernetes sao empacotados como artefatos OCI, armazenados em registry, assinados com Cosign e promovidos entre ambientes via tag mutation.

### Pipeline de deploy:

```
Code Push → CI Build → OCI Package → Sign (Cosign) → Push to Registry
                                                            ↓
                                                    Dev (auto-deploy)
                                                            ↓
                                                  Staging (auto-deploy)
                                                            ↓
                                                   Prod (manual gate)
```

### Justificativas:

1. **Imutabilidade**: Artefato OCI e imutavel por digest. O que foi testado em staging e exatamente o que vai para prod.
2. **Assinatura criptografica**: Cosign garante que o artefato nao foi adulterado entre build e deploy.
3. **Registry como source of truth**: Registries OCI sao otimizados para distribuicao de artefatos (cache, CDN, replicacao).
4. **Auditoria completa**: Cada deploy e rastreavel ao commit, ao build, a assinatura e ao artefato especifico.
5. **Promocao por tag**: `dev`, `staging`, `prod` sao tags que apontam para o mesmo digest, garantindo consistencia.

## Consequencias

### Positivas
- Garantia criptografica de que o artefato em producao e o mesmo testado em staging.
- Trilha de auditoria imutavel de todos os deploys (commit → build → artefato → deploy).
- Eliminacao de drift entre ambientes (mesmo artefato, tags diferentes).
- Performance superior ao polling Git (registry push notification via webhook).
- Compativel com politicas de admission (Kyverno/OPA pode verificar assinatura antes de aceitar deploy).

### Negativas
- Complexidade adicional no pipeline de CI (empacotar OCI, assinar, publicar).
- Dependencia de registry OCI como componente critico (mitigado com replicacao).
- Curva de aprendizado para equipe acostumada com GitOps tradicional (raw Git).
- Cosign key management requer cuidado (rotacao, armazenamento seguro).
- Debugging mais complexo (nao basta olhar o Git, precisa inspecionar artefato OCI).

## Implementacao

### Pipeline CI para empacotar e assinar artefato OCI

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy OCI Artifact

on:
  push:
    branches: [main]

jobs:
  build-artifact:
    runs-on: ubuntu-latest
    permissions:
      packages: write
      id-token: write  # Para Cosign keyless

    steps:
      - uses: actions/checkout@v4

      - name: Setup Flux CLI
        uses: fluxcd/flux2/action@main

      - name: Build OCI artifact
        run: |
          flux push artifact \
            oci://ghcr.io/${{ github.repository }}/manifests:$(git rev-parse --short HEAD) \
            --path="./k8s" \
            --source="$(git config --get remote.origin.url)" \
            --revision="$(git branch --show-current)/$(git rev-parse HEAD)"

      - name: Sign artifact with Cosign
        uses: sigstore/cosign-installer@v3
      - run: |
          cosign sign --yes \
            ghcr.io/${{ github.repository }}/manifests:$(git rev-parse --short HEAD)

      - name: Tag as dev
        run: |
          flux tag artifact \
            oci://ghcr.io/${{ github.repository }}/manifests:$(git rev-parse --short HEAD) \
            --tag=dev

  promote-staging:
    needs: [build-artifact]
    runs-on: ubuntu-latest
    environment: staging  # Requer aprovacao se configurado

    steps:
      - name: Promote to staging
        run: |
          flux tag artifact \
            oci://ghcr.io/${{ github.repository }}/manifests:$(git rev-parse --short HEAD) \
            --tag=staging

  promote-prod:
    needs: [promote-staging]
    runs-on: ubuntu-latest
    environment: production  # Sempre requer aprovacao

    steps:
      - name: Promote to production
        run: |
          flux tag artifact \
            oci://ghcr.io/${{ github.repository }}/manifests:$(git rev-parse --short HEAD) \
            --tag=prod
```

### Configuracao do Flux D2 para consumir OCI Artifacts

```yaml
# clusters/production/flux-system/oci-repository.yaml
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: OCIRepository
metadata:
  name: marketplace-manifests
  namespace: flux-system
spec:
  interval: 5m
  url: oci://ghcr.io/org/marketplace/manifests
  ref:
    tag: prod
  verify:
    provider: cosign
    matchOIDCIdentity:
      - issuer: https://token.actions.githubusercontent.com
        subject: https://github.com/org/marketplace/.github/workflows/deploy.yml@refs/heads/main
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: marketplace-app
  namespace: flux-system
spec:
  interval: 10m
  sourceRef:
    kind: OCIRepository
    name: marketplace-manifests
  path: ./production
  prune: true
  wait: true
  timeout: 5m
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: api-gateway
      namespace: marketplace
```

### Politica de admission com verificacao de assinatura

```yaml
# clusters/production/policies/verify-signatures.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-oci-signatures
spec:
  validationFailureAction: Enforce
  rules:
    - name: verify-cosign-signature
      match:
        any:
          - resources:
              kinds:
                - Deployment
                - StatefulSet
      verifyImages:
        - imageReferences:
            - "ghcr.io/org/marketplace/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/org/marketplace/*"
                    issuer: "https://token.actions.githubusercontent.com"
```

### Script de rollback

```bash
#!/bin/bash
# scripts/rollback.sh - Rollback para versao anterior

PREVIOUS_DIGEST=$(flux get artifact oci://ghcr.io/org/marketplace/manifests:prod-previous -o json | jq -r '.digest')

flux tag artifact \
  oci://ghcr.io/org/marketplace/manifests@${PREVIOUS_DIGEST} \
  --tag=prod

echo "Rollback iniciado. Flux ira reconciliar em ate 5 minutos."
echo "Digest restaurado: ${PREVIOUS_DIGEST}"
```

## Validacao

1. **Teste de build e push**: Verificar que pipeline gera artefato OCI com digest correto no registry.
2. **Teste de assinatura**: Verificar que `cosign verify` retorna sucesso para artefato assinado.
3. **Teste de artefato nao assinado**: Verificar que Flux rejeita artefato sem assinatura valida.
4. **Teste de promocao**: Verificar que tag `staging` e `prod` apontam para o mesmo digest apos promocao.
5. **Teste de rollback**: Executar rollback e verificar que ambiente retorna ao estado anterior.
6. **Teste de integridade**: Alterar artefato no registry e verificar que Cosign detecta adulteracao.
7. **Teste de Kyverno**: Tentar deployar imagem nao assinada e verificar que admission controller bloqueia.

## Referencias

- [ADR 006 - Arquitetura Hub-and-Spoke](006-hub-spoke-ai-architecture.md)
- REQ-OPS-002: Deploy automatizado com auditoria completa
- REQ-SEC-005: Integridade criptografica de artefatos de deploy
- REQ-COMPLIANCE-003: Trilha de auditoria para SOC2 Type II
- Flux OCI Artifacts Documentation
- Sigstore/Cosign Documentation
