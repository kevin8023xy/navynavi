import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    ok: true,
    cwd: process.cwd(),
    env: process.env.VERCEL_ENV || 'local',
    node_version: process.version,
  });
}
