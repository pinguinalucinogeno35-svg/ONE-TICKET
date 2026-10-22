export function brl(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dateLong(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

export function dateShort(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  });
}

export const VARIANT_LABEL = { inteira: 'Inteira', meia: 'Meia-entrada', casadinha: 'Casadinha' };

export const STATUS_LABEL = {
  pending: 'Aguardando pagamento',
  paid: 'Pago',
  expired: 'Expirado',
  canceled: 'Cancelado',
  refunded: 'Estornado',
  needs_refund: 'Estornar',
};
