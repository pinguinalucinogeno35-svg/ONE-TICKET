# ONE Ticket — Bilheteria e Bar

Dois sistemas separados, mesmo banco (Supabase).

| Sistema | Pasta | Endereço | Quem entra |
|---|---|---|---|
| Bilheteria | `bilheteria/` | https://one-ticket-bilheteria.vercel.app | produtor, bilheteria, portaria |
| Bar | `bar/` | https://one-ticket-bar-sooty.vercel.app | produtor, gerente_bar, caixa_bar |

- Login por função (`/entrar`), cada pessoa com sua senha. Cadastro em Bilheteria > Equipe (só o produtor).
- Sessão: cookie assinado (HMAC, `COOKIE_SECRET`), 12 h. Permissão conferida no servidor em cada página e rota.
- Resultado da festa (`/resultado`, só produtor) nos dois sistemas: soma ingressos + bar do mesmo evento.
- Caixa do bar só cancela venda que ainda está na fila do aparelho; venda enviada só gerente/produtor.

Variáveis de ambiente (cada projeto): SUPABASE_URL, SUPABASE_KEY, API_SECRET, EVENT_SLUG (reserva), COOKIE_SECRET. Na Bilheteria, CONTATO_COMERCIAL (e-mail ou WhatsApp do botão "Quero vender minha festa" da vitrine).
A Bilheteria também usa as chaves do QR (ED25519) e do Mercado Pago.

Banco: rode `db/001` a `db/007` em ordem.

Eventos são cadastrados na Bilheteria > Eventos (só o produtor). O evento da noite (portaria, bar e endereço principal) é escolhido lá; `EVENT_SLUG` só vale enquanto ninguém escolher.
