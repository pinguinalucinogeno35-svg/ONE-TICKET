// Assinatura dos QR codes (Ed25519). Formato: v1.<codigo>.<emitido_em_base36>.<assinatura_base64url>
import crypto from 'node:crypto';

let privateKey = null;

function getKey() {
  if (!privateKey) {
    const der = process.env.TICKET_PRIVATE_KEY;
    if (!der) throw new Error('TICKET_PRIVATE_KEY ausente');
    privateKey = crypto.createPrivateKey({ key: Buffer.from(der, 'base64'), format: 'der', type: 'pkcs8' });
  }
  return privateKey;
}

export function signTicket(code, issuedAtSeconds) {
  const msg = `v1.${code}.${Number(issuedAtSeconds).toString(36)}`;
  const sig = crypto.sign(null, Buffer.from(msg), getKey()).toString('base64url');
  return `${msg}.${sig}`;
}

export function publicKey() {
  return process.env.TICKET_PUBLIC_KEY || '';
}
