// Dados do evento como o comprador vê (página /e/<slug> e /api/evento/<slug>).
// - Lote agendado (próximo lote) vai sem preço: o valor só aparece no painel.
// - Meia-entrada só vai quando ainda há cota de meia no evento.
export function publicEvent(ev) {
  if (!ev || !Array.isArray(ev.batches)) return ev;
  const halfOpen = (ev.half_available || 0) > 0;
  return {
    ...ev,
    batches: ev.batches.map((b) => ({
      ...b,
      offers: b.status === 'scheduled' ? [] : (b.offers || []).filter((o) => halfOpen || o.variant !== 'meia'),
    })),
  };
}
