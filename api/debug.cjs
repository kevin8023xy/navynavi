'use strict';

const fs = require('fs');
const path = require('path');

const CSV_FILENAME =
  'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv';

module.exports = function handler(_req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const candidates = [
    path.join(process.cwd(), CSV_FILENAME),
    path.join(process.cwd(), 'api', CSV_FILENAME),
    path.join('/var/task', CSV_FILENAME),
    path.join('/var/task', 'api', CSV_FILENAME),
  ];

  const checks = candidates.map((p) => ({
    path: p,
    exists: fs.existsSync(p),
    size: fs.existsSync(p) ? fs.statSync(p).size : -1,
  }));

  const dirs = {};
  try {
    dirs.cwd = fs.readdirSync(process.cwd());
  } catch (e) {
    dirs.cwd = ['error: ' + e.message];
  }
  try {
    dirs.varTask = fs.readdirSync('/var/task');
  } catch (e) {
    dirs.varTask = ['error: ' + e.message];
  }
  try {
    dirs.varTaskApi = fs.readdirSync('/var/task/api');
  } catch (e) {
    dirs.varTaskApi = ['error: ' + e.message];
  }

  res.json({
    ok: true,
    cwd: process.cwd(),
    env: process.env.VERCEL_ENV || 'local',
    node_version: process.version,
    checks: checks,
    dirs: dirs,
  });
};
