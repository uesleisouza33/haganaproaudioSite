# Haganá Pro Audio

Site institucional e catálogo de caixas acústicas e sistemas de som fabricados pela Haganá Pro Audio.

Site: https://haganaproaudio.com.br

## Funcionalidades

- Catálogo de caixas e sistemas, páginas individuais e contato pelo WhatsApp.
- Painel administrativo em `/admin`, com produtos, fotos, rascunhos e equipe.
- Visualização opcional de modelos GLB/GLTF com model-viewer.
- Páginas renderizadas no servidor, metadados, JSON-LD, sitemap e robots.txt.

## Tecnologias

HTML, CSS e JavaScript; backend Cloudflare Worker; D1 (SQLite) para registros; R2 para arquivos. Migrações geradas com Drizzle.

## Preparar e validar

Requer Node.js compatível com as dependências e npm.

```sh
npm ci
npm run build
node scripts/test.mjs
```

O build gera `dist/server/index.js` e as migrações em `dist/.openai/drizzle`. Os testes usam Miniflare com banco e armazenamento locais temporários; não modificam os dados de produção.

## Hospedagem e autenticação

O projeto foi desenvolvido para ChatGPT Sites. A configuração está em `.openai/hosting.json`, com os bindings `DB` (D1) e `BUCKET` (R2). Configure `OWNER_EMAIL` no ambiente do servidor com o e-mail do proprietário autorizado; nenhum segredo é incluído neste repositório.

A entrada administrativa depende do Sign in with ChatGPT oferecido pela plataforma e dos cabeçalhos de identidade confiáveis inseridos pelo dispatcher. Não exponha o Worker diretamente confiando em cabeçalhos enviados pelo cliente. Para hospedar fora do Sites, é necessário integrar autenticação verificada no servidor, configurar D1/R2 e aplicar as migrações. Abrir `index.html` isoladamente não executa o catálogo e o painel completos.

## Conteúdo e arquivos

Este repositório contém o código-fonte, a logo e o esquema/migrações do banco. Os produtos cadastrados, membros, configurações e fotos/modelos enviados pelo painel ficam em D1/R2 e NÃO estão incluídos. A migração integral de hospedagem requer exportação separada desses dados e arquivos.

As quatro imagens de Line Array editadas na conversa não fazem parte desta versão do código. O cadastro pelo navegador foi interrompido a pedido do proprietário.

## Origem

Exportado do projeto Sites `appgprj_6ab2ecfb86388191ad9f44c72114606f`, commit `0ab368f2fc49b1363656f0b56d7a4449c2070ec4`, em 21/10/2026.
