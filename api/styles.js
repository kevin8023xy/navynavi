'use strict';

const fs = require('fs');
const path = require('path');

const STYLES_FILE = path.join(__dirname, 'lib', 'layer-styles.json');

function loadStyles() {
  if (!fs.existsSync(STYLES_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(STYLES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[styles] failed to load styles:', err.message);
    return {};
  }
}

function saveStyles(styles) {
  try {
    fs.writeFileSync(STYLES_FILE, JSON.stringify(styles, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[styles] failed to save styles:', err.message);
    throw err;
  }
}

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    try {
      return res.json(loadStyles());
    } catch (err) {
      console.error('[styles] GET error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { mmsi, style } = req.body;
      if (!mmsi || !style) {
        return res.status(400).json({ error: 'mmsi and style are required' });
      }
      const styles = loadStyles();
      styles[mmsi] = style;
      saveStyles(styles);
      return res.json({ success: true, mmsi, style });
    } catch (err) {
      console.error('[styles] POST error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
