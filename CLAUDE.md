# ONE Ticket — Bilheteria e Bar

PWA para uma produtora de festas: venda de ingressos, portaria e controle do bar. Cliente final: um produtor de eventos. Quem desenvolve é um freelancer (Sena, ONE Agência Digital).

## Como trabalhar neste projeto

- Responda sempre em português do Brasil.
- Seja direto e prático. Antes de algo grande, mostre o plano em poucas linhas.
- Quando faltar informação do cliente, use um campo entre colchetes (ex.: `[CAPACIDADE DO LOCAL]`), nunca invente.
- Aponte riscos técnicos e de escopo quando perceber.
- Ícones: nunca use emoji ou glifos de texto (✓ ✎ → + etc.) como ícone. Desenhe SVG próprio em `components/Icon.js` (grade 24, traço 2, `currentColor`). Sinais tipográficos em texto corrido (·, —, ×, ≈) são permitidos.
- Identidade: marca "ONE Ticket", azul Perspective `#2F5BFF`, fundo branco por padrão, tema escuro opcional (botão no topo). Fonte Inter Tight (substituta da Neue Haas Grotesk) e IBM Plex Mono.

## Estrutura

```
bilheteria/   Next.js 15 (App Router, JS puro) — ingressos, portaria, cupons, lotes, equipe, resultado
bar/          Next.js 15 — PDV do bar, estoque, produtos, line-up, painel, resultado
db/           Migrations SQL 001 a 005 (rodar em ordem) + db/testes (seeds e cenários)
```

São **dois sistemas separados, dois deploys, mesmo banco** (Supabase Postgres). Arquivos compartilhados estão duplicados nas duas pastas e devem ficar idênticos: `lib/auth.js`, `lib/errors.js`, `lib/db.js`, `lib/format.js`, `lib/money.js`, `lib/units.js`, `components/{Brand,AdminNav,AreaTag,MeContext,Icon,ThemeToggle,FestaResult}.js`, `app/{entrar,sem-acesso,resultado}/page.js`, `app/api/{login,logout}/route.js`, `app/globals.css`, `app/equipe.css`. O que muda entre os dois fica em `lib/apps.js` (APP, AREA, OTHER, ACCESS, HOME, NAV, RESULT_LINKS, LOGIN_TITLE).

## Arquitetura

- O app nunca acessa tabelas direto. Todo acesso é por funções `api_*` SECURITY DEFINER no Postgres, chamadas via REST `rpc()` (`lib/db.js`) com a chave anon + `p_secret` (= `API_SECRET`), conferido por `private.assert_secret`.
- pgcrypto fica no schema `extensions`: funções que usam `crypt/gen_salt` têm `search_path = public, extensions`.
- Erros do banco são códigos em MAIÚSCULAS (`raise exception 'LOTE_ESGOTADO'`), traduzidos em `lib/errors.js`.
- **Login por função** (migration 005): tabela `staff_users` (senha bcrypt, 5 erros = bloqueio de 10 min). `api_staff_login(p_app)` só aceita as funções daquele sistema.
  - Bilheteria: `produtor`, `bilheteria`, `portaria`. Bar: `produtor`, `gerente_bar`, `caixa_bar`.
  - Sessão = cookie `one_s` = base64url(JSON {i,n,r,e}) + HMAC-SHA256 com `COOKIE_SECRET`, 12 h. `requireRole()` nas páginas, `apiRole()` nas rotas (`lib/auth.js`).
  - A equipe é cadastrada só na Bilheteria (`/painel/equipe`, só produtor) e vale para os dois sistemas.
- **Resultado da festa** (`/resultado`, só produtor, nos dois sistemas): `api_festa_result` soma ingressos pagos + bar do mesmo evento.
- **QR do ingresso**: assinado com Ed25519 (`TICKET_PRIVATE_KEY` / `TICKET_PUBLIC_KEY`), conferido offline na portaria.
- **Offline**: PDV e portaria guardam fila em localStorage (com fallback em memória) e sincronizam de forma idempotente (`client_sale_id`, `client_scan_id`). Service worker em `public/sw.js`.

## Regras de negócio do bar

- Venda e estoque **sempre em unidades**. Caixa (`units_per_case`) serve só para dar entrada no estoque.
- Estoque pode ficar negativo; o painel marca "Conferir: negativo".
- O painel cruza o horário de cada venda com o line-up: vendas e ranking por show (ex.: "durante o show do Guilherme das 18h às 20h, Absolut vendeu 50 garrafas").
- Caixa do bar só cancela venda ainda na fila do aparelho. Venda já enviada: só gerente ou produtor (`ACCESS.cancelar`).
- Gerente do bar não vê faturamento de ingressos (`tickets_cents` é zerado no servidor).

## Rodar localmente

```bash
cd bilheteria        # ou cd bar
npm install
vercel link          # escolha o projeto certo (ver CLAUDE.local.md)
vercel env pull .env.local
npm run dev
```

Sem a Vercel CLI, crie `.env.local` a partir de `.env.example`.

## Deploy

Cada pasta é um projeto Vercel. Em cada uma: `vercel --prod`. Mudou arquivo compartilhado? Copie para a outra pasta e publique as duas.

## Banco

Supabase. Migrations em `db/001` a `db/005`. Para mudanças, crie `db/006_...sql` e aplique (Supabase SQL editor, CLI ou MCP). Evite `DELETE` em massa (deu timeout antes); prefira soft delete (ex.: `lineup.removed`).

## Pendências e riscos conhecidos

- Desativar alguém não derruba a sessão na hora (até 12 h). Se o cliente exigir corte imediato: conferir `staff_users.active` a cada requisição.
- O produtor faz login separado em cada domínio. Com domínio próprio (`bilheteria.[DOMÍNIO]`, `bar.[DOMÍNIO]`) dá para unificar o cookie.
- Cancelar venda pelo painel do bar (hoje só pelo PDV do aparelho que vendeu).
- Dados do bar são simulados (seed com 1.345 vendas); por isso o "gasto no bar por pessoa" na demo sai distorcido.
- Faltam do cliente: `[TAXA DO MERCADO PAGO]`, `[TAXA DAS MAQUININHAS]`, `[CACHÊS, LOCAÇÃO, EQUIPE]`, `[DOMÍNIO]`, licença da fonte Neue Haas Grotesk.
- Senhas de demonstração precisam ser trocadas antes de entregar (tela Equipe).
- Mercado Pago está em modo simulado (`PAYMENT_MODE`); falta credencial real do cliente.

## Histórico (resumo)

1. Arquitetura + banco do MVP (001, 002) e demo publicada.
2. Identidade ONE Ticket; cupons e edição de preço de lotes no painel (003).
3. Módulo do bar: PDV, produtos, estoque em unidades, line-up, ranking por show (004).
4. Versão tema claro (padrão) com escuro opcional.
5. Separação em dois sistemas (Bilheteria e Bar) com login por função, tela Equipe e Resultado da festa (005).
