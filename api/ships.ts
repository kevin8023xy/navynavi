import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getShipsLatest } from './_lib/data';

export default function handler(req: VercelRequest, res: VercelResponse) {
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
    const ships = getShipsLatest();
    return res.json(ships);
  } catch (err: any) {
    console.error('[ships] Error:', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Internal server error' });
  }
}
