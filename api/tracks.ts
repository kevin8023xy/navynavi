import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryTracks } from './_lib/data';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mmsi, start_time, end_time, page, page_size, bbox } = req.query;

    const result = await queryTracks({
      mmsi: typeof mmsi === 'string' ? mmsi : undefined,
      start_time:
        start_time && typeof start_time === 'string'
          ? parseInt(start_time, 10)
          : undefined,
      end_time:
        end_time && typeof end_time === 'string'
          ? parseInt(end_time, 10)
          : undefined,
      bbox: typeof bbox === 'string' ? bbox : undefined,
      page: Math.max(1, parseInt(
        (typeof page === 'string' ? page : '1'), 10
      ) || 1),
      page_size: Math.min(
        500000,
        Math.max(1, parseInt(
          (typeof page_size === 'string' ? page_size : '500'), 10
        ) || 500),
      ),
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[tracks] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
