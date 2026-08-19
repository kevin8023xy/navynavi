'use strict';

const healthHandler = require('../lib/api/routes/health');
const shipsHandler = require('../lib/api/routes/ships');

const handlers = {
  health: healthHandler,
  ships: shipsHandler,
};

function getRoute(req) {
  if (typeof req.query?.route === 'string') {
    return req.query.route.replace(/\.js$/, '');
  }

  const pathname = new URL(req.url, 'http://localhost').pathname;
  return pathname.split('/').filter(Boolean).pop()?.replace(/\.js$/, '') || '';
}

module.exports = function handler(req, res) {
  const routeHandler = handlers[getRoute(req)];
  if (!routeHandler) {
    return res.status(404).json({ error: 'API route not found' });
  }
  return routeHandler(req, res);
};
