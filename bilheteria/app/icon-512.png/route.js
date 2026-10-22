import { iconResponse } from '@/lib/icon';

export const dynamic = 'force-static';

export function GET() {
  return iconResponse(512);
}
