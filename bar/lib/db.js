// Acesso ao banco: só roda no servidor. Toda chamada leva o segredo do servidor.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const API_SECRET = process.env.API_SECRET;

export class DbError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export async function rpc(fn, args = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !API_SECRET) {
    throw new DbError('CONFIG_AUSENTE', 'Variáveis SUPABASE_URL, SUPABASE_KEY e API_SECRET são obrigatórias');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_secret: API_SECRET, ...args }),
    cache: 'no-store',
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && data.message) || `HTTP ${res.status}`;
    const code = /^[A-Z_]+$/.test(msg) ? msg : 'ERRO_INTERNO';
    if (code === 'ERRO_INTERNO') console.error(`[rpc ${fn}]`, msg);
    throw new DbError(code, msg);
  }
  return data;
}
