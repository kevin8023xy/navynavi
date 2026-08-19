'use strict';

const { getShipsLatest, ensureLoaded } = require('../data');

module.exports = async function handler(req, res) {
  console.log('[ships] handler called', { method: req.method, url: req.url, env: process.env.VERCEL_ENV });
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
    const ships = getShipsLatest();
    return res.json(ships);
  } catch (err) {
    console.error('[ships] Error:', err);
    return res
      .status(500)
      .json({ error: err && err.message ? err.message : 'Internal server error' });
  }
};
