// Vendas e estoque sempre em unidades. Caixa aparece só como referência (≈).
export function plural(label, n) {
  const l = label || 'unidade';
  return Math.abs(n) === 1 || /s$/.test(l) ? l : `${l}s`;
}

export function units(n, label) {
  return `${Number(n || 0).toLocaleString('pt-BR')} ${plural(label, Number(n || 0))}`;
}

export function caseEq(n, perCase) {
  if (!perCase || perCase <= 1 || !n) return '';
  return `≈ ${(n / perCase).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cx`;
}

export const PAYMENT_LABEL = { pix: 'Pix', card: 'Cartão', cash: 'Dinheiro' };

export function hm(iso, tz = 'America/Sao_Paulo') {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}
