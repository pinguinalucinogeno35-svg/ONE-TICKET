import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function POST(req, { params }) {
  const { id } = await params;
  try {
    const status = await rpc('api_cancel', { p_order_id: id });
    return Response.json({ status });
  } catch (e) {
    return errorResponse(e);
  }
}
