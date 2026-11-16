import { rpc } from '@/lib/db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Imagem do evento. Cada envio gera um id novo, então o cache pode ser longo.
export async function GET(_req, { params }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('não encontrado', { status: 404 });
  try {
    const img = await rpc('api_event_image_get', { p_id: id });
    if (!img) return new Response('não encontrado', { status: 404 });
    return new Response(Buffer.from(img.data, 'base64'), {
      headers: {
        'Content-Type': img.mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('erro', { status: 500 });
  }
}
