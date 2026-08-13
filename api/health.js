'use strict';

const { getAllRecords, ensureLoaded } = require('../lib/api/data');

module.exports = async function handler(req, res) {
  console.log('[health] handler called', { method: req.method, url: req.url, env: process.env.VERCEL_ENV });
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
    await ensureLoaded();
    const records = getAllRecords();
    return res.json({
      status: 'ok',
      total: records.length,
      ships: new Set(records.map((r) => r.mmsi)).size,
    });
  } catch (err) {
    console.error('[health] Error:', err);
    return res
      .status(500)
      .json({ error: err && err.message ? err.message : 'Internal server error' });
  }
};
