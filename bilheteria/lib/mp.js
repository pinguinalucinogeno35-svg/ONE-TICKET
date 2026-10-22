// Mercado Pago (sandbox ou produção). Ativo quando PAYMENT_MODE=mercadopago e MP_ACCESS_TOKEN existe.
import crypto from 'node:crypto';

const MP_API = 'https://api.mercadopago.com';

export function mpEnabled() {
  return process.env.PAYMENT_MODE === 'mercadopago' && !!process.env.MP_ACCESS_TOKEN;
}

export function mpPublicKey() {
  return mpEnabled() ? process.env.MP_PUBLIC_KEY || '' : '';
}

async function mp(path, { method = 'GET', body, idempotencyKey } = {}) {
  const res = await fetch(MP_API + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('[mercadopago]', res.status, JSON.stringify(data));
    const err = new Error('ERRO_PAGAMENTO');
    err.code = 'ERRO_PAGAMENTO';
    throw err;
  }
  return data;
}

// Data no formato aceito pelo MP: 2026-10-05T18:30:00.000-03:00
function mpDate(ms) {
  const d = new Date(ms - 3 * 3600 * 1000);
  return d.toISOString().replace('Z', '-03:00');
}

function appUrl() {
  return process.env.APP_URL || '';
}

export async function createPix(order) {
  const pixExpires = Math.min(Date.now() + 15 * 60 * 1000, new Date(order.expires_at).getTime() - 2 * 60 * 1000);
  return mp('/v1/payments', {
    method: 'POST',
    idempotencyKey: `pix-${order.id}`,
    body: {
      transaction_amount: order.total_cents / 100,
      description: `${order.event.name} · ${order.seats} ingresso(s)`,
      payment_method_id: 'pix',
      external_reference: order.id,
      date_of_expiration: mpDate(pixExpires),
      ...(appUrl() ? { notification_url: `${appUrl()}/api/webhooks/mercadopago` } : {}),
      payer: { email: order.buyer_email, first_name: order.buyer_name.split(' ')[0] },
    },
  });
}

export async function createCardPayment(order, form) {
  return mp('/v1/payments', {
    method: 'POST',
    idempotencyKey: `card-${order.id}-${form.token}`,
    body: {
      transaction_amount: order.total_cents / 100, // valor sempre do servidor, nunca do navegador
      token: form.token,
      description: `${order.event.name} · ${order.seats} ingresso(s)`,
      installments: Number(form.installments || 1),
      payment_method_id: form.payment_method_id,
      issuer_id: form.issuer_id,
      external_reference: order.id,
      ...(appUrl() ? { notification_url: `${appUrl()}/api/webhooks/mercadopago` } : {}),
      payer: { email: form.payer?.email || order.buyer_email, identification: form.payer?.identification },
    },
  });
}

export async function getPayment(id) {
  return mp(`/v1/payments/${encodeURIComponent(id)}`);
}

// Confere a assinatura do webhook (x-signature). Sem segredo configurado, devolve null (não verificado).
export function verifyWebhook(headers, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return null;
  const sig = headers.get('x-signature') || '';
  const requestId = headers.get('x-request-id') || '';
  const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return hmac.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(parts.v1));
}
