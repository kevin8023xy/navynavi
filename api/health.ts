import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllRecords } from './_lib/data';

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
    const records = await getAllRecords();
    return res.json({
      status: 'ok',
      total: records.length,
      ships: new Set(records.map((r) => r.mmsi)).size,
    });
  } catch (err: any) {
    console.error('[health] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
