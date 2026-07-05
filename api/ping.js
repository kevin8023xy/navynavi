'use strict';

module.exports = function handler(_req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    ok: true,
    cwd: process.cwd(),
    env: process.env.VERCEL_ENV || 'local',
    node_version: process.version,
  });
};
