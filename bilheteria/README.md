# Ingressos · demo

PWA de venda de ingressos (Next.js 15 + Supabase). A capacidade é garantida no Postgres.

## Rotas

| Rota | O que é |
| --- | --- |
| `/e/festa-demo` | Página do evento e compra (`?codigo=RELAMPAGO` libera o lote promocional) |
| `/pedido/[id]` | Pagamento com cronômetro de reserva (Pix e cartão) |
| `/ingressos/[id]` | Ingressos com QR code assinado, transferência, funciona offline |
| `/painel` | Painel do produtor (senha em `ADMIN_PASSWORD`) |
| `/portaria` | Leitor de QR com validação offline e sincronização |

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_KEY` | Projeto Supabase (chave anon/publishable) |
| `API_SECRET` | Segredo que as funções `api_*` do banco exigem (mesmo valor de `private.app_config`) |
| `TICKET_PRIVATE_KEY` | Chave Ed25519 (PKCS8 DER em base64) que assina os QR codes |
| `TICKET_PUBLIC_KEY` | Chave pública (32 bytes em base64url), usada pela portaria |
| `ADMIN_PASSWORD`, `COOKIE_SECRET` | Login do painel e da portaria |
| `PAYMENT_MODE` | `simulado` (padrão) ou `mercadopago` |
| `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` | Credenciais do Mercado Pago (teste ou produção) |
| `APP_URL` | URL pública, para o webhook do Mercado Pago |
| `EVENT_SLUG` | Evento exibido na raiz, no painel e na portaria |

## Ligar o Mercado Pago

1. Criar aplicação em mercadopago.com.br/developers e copiar as credenciais de teste.
2. Definir `PAYMENT_MODE=mercadopago`, `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` e `APP_URL`.
3. Cadastrar o webhook `APP_URL/api/webhooks/mercadopago` (evento "Pagamentos") e copiar a assinatura secreta para `MP_WEBHOOK_SECRET`.
4. Publicar de novo. O botão "Simular pagamento" some sozinho.

## Banco

Migrações em `001_schema_mvp.sql` e `002_api_demo.sql`. Depois de aplicar, inserir o segredo:

```sql
insert into private.app_config values ('api_secret', '<API_SECRET>');
select cron.schedule('ingressos-tick', '* * * * *', 'select public.cron_tick()');
```
