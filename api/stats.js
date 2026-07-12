'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  try {
    const outputDir = path.resolve(process.cwd(), 'output');
    const csvPath = path.join(outputDir, 'merged_feichang_ships_2021-10-01_2021-11-30.csv.gz');

    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }

    // 读取 CSV
    const raw = fs.readFileSync(csvPath);
    const csvText = zlib.gunzipSync(raw).toString('utf-8');
    const lines = csvText.trim().split(/\r?\n/);

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV is empty' });
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const colIdx = {
      mmsi: headers.indexOf('mmsi'),
      timestamp_ms: headers.indexOf('timestamp_ms'),
    };

    if (colIdx.mmsi === -1 || colIdx.timestamp_ms === -1) {
      return res.status(400).json({ error: 'Missing required columns' });
    }

    // 获取查询参数
    const { start_time, end_time } = req.query;
    const startTs = start_time ? parseInt(start_time, 10) * 1000 : 0;
    const endTs = end_time ? parseInt(end_time, 10) * 1000 : Infinity;

    // 统计数据
    let minTs = Infinity;
    let maxTs = -Infinity;
    let recordCount = 0;
    const mmsiSet = new Set();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const cols = line.split(',');
      const mmsi = parseInt(cols[colIdx.mmsi], 10);
      const ts = parseInt(cols[colIdx.timestamp_ms], 10);

      // 全局统计
      minTs = Math.min(minTs, ts);
      maxTs = Math.max(maxTs, ts);

      // 时间范围内的统计
      if (ts >= startTs && ts <= endTs) {
        recordCount++;
        mmsiSet.add(mmsi);
      }
    }

    const totalRecords = lines.length - 1;
    const totalMmsi = new Set();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      totalMmsi.add(parseInt(cols[colIdx.mmsi], 10));
    }

    return res.json({
      success: true,
      timeRange: {
        min: Math.floor(minTs / 1000),
        max: Math.floor(maxTs / 1000),
      },
      query: {
        start_time: start_time ? parseInt(start_time, 10) : null,
        end_time: end_time ? parseInt(end_time, 10) : null,
      },
      total: {
        records: totalRecords,
        mmsi: totalMmsi.size,
      },
      filtered: {
        records: recordCount,
        mmsi: mmsiSet.size,
      },
    });
  } catch (err) {
    console.error('[stats] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
