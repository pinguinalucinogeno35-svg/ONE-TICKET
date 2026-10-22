import { rpc } from '@/lib/db';
import { errorResponse } from '@/lib/errors';
import { apiRole, denied } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';

export async function POST(req) {
  const me = await apiRole(ACCESS.portaria);
  if (!me) return denied();
  try {
    const { deviceId, scans } = await req.json();
    const clean = (Array.isArray(scans) ? scans : []).slice(0, 200).map((s) => ({
      client_scan_id: String(s.client_scan_id), code: String(s.code).slice(0, 64), scanned_at: s.scanned_at,
    }));
    if (!clean.length) return Response.json([]);
    const res = await rpc('api_checkins', { p_device_id: `${String(deviceId || 'aparelho').slice(0, 30)} · ${me.name}`.slice(0, 60), p_scans: clean });
    return Response.json(res);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
