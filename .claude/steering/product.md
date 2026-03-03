# Product Overview

## Product Purpose
Marketplace de servicos profissionais AI-Native inspirado no Fatal Model. Conecta profissionais de servicos a clientes usando inteligencia artificial embutida em toda a experiencia — busca semantica, recomendacao, moderacao automatica, deteccao de fraude e precificacao dinamica.

## Target Users

| Role | Descricao | Necessidades |
|------|-----------|-------------|
| `professional` | Profissionais que oferecem servicos | Visibilidade, gestao de perfil, receber pagamentos, planos de assinatura |
| `user` | Clientes que buscam profissionais | Encontrar profissionais facilmente, busca inteligente, avaliacoes confiaveis |
| `moderator` | Moderadores da plataforma | Aprovar perfis, moderar fotos, resolver disputas |
| `admin` | Administrador da plataforma | Estatisticas, gestao de usuarios, configuracoes |

## Key Features

1. **Busca Semantica**: Encontra profissionais por intencao natural, nao so palavras-chave (pgvector + embeddings)
2. **Recomendacao Inteligente**: "Quem viu X tambem viu Y" baseado em comportamento real (collaborative filtering)
3. **Moderacao Automatica de Fotos**: Detecta conteudo improprio antes da aprovacao (Vision API)
4. **Deteccao de Fraude**: Identifica perfis falsos por padroes de comportamento (ML anomaly detection)
5. **Analise de Sentimento**: Extrai insights das avaliacoes dos clientes (NLP)
6. **Precificacao Dinamica**: Sugere melhor plano baseado em historico (Analytics + ML)
7. **Perfis de Profissionais**: CRUD completo com fotos, servicos, localizacao, verificacao
8. **Sistema de Pagamentos**: Stripe Connect com wallet, ledger, saques, assinaturas
9. **Avaliacoes e Reviews**: Ratings com analise de sentimento automatica
10. **Geolocalizacao**: Busca por proximidade com PostGIS

## Business Objectives

- Ser a plataforma #1 de servicos profissionais no Brasil
- Diferenciacao via IA nativa (nao bolt-on)
- Monetizacao via planos de assinatura para profissionais + comissao sobre pagamentos
- Experiencia de busca superior via IA semantica

## Success Metrics

- **GMV** (Gross Merchandise Value): Volume de transacoes na plataforma
- **Conversao de busca**: % de buscas que resultam em contato/contratacao
- **NPS**: Net Promoter Score dos profissionais e clientes
- **Tempo de busca**: Reducao do tempo medio para encontrar um profissional
- **Fraude**: Reducao de perfis falsos detectados

## Product Principles

1. **IA-First**: Toda feature deve considerar como IA pode melhorar a experiencia
2. **Simplicidade**: Interface limpa e intuitiva, complexidade escondida
3. **Confianca**: Verificacao de perfis, moderacao e deteccao de fraude como prioridade
4. **Performance**: Respostas rapidas, busca semantica < 500ms

## Monitoring & Visibility

- **Dashboard Type**: Web-based (Next.js + shadcn/ui)
- **Real-time Updates**: WebSocket para notificacoes, polling para dashboards
- **Key Metrics Displayed**: GMV, conversoes, perfis ativos, filas de moderacao, custo IA
- **Sharing Capabilities**: Reports exportaveis para admin

## Future Vision

### Potential Enhancements
- **App Mobile**: React Native para profissionais e clientes
- **Crypto Payments**: Ethereum/Polygon/Solana como alternativa
- **Agentes IA**: Assistentes autonomos com memoria persistida
- **Multi-categoria**: Expansao para novas verticais de servicos
- **Internacionalizacao**: i18n para mercados LATAM
