'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { invalidateCache } = require('./lib/data');

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    let body = {};

    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (typeof req.body === 'object') {
      body = req.body;
    } else {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { mmsi, start_time, end_time, dry_run = false, records } = body;

    const hasRecords = Array.isArray(records) && records.length > 0;
    if (!mmsi && !start_time && !end_time && !hasRecords) {
      return res.status(400).json({
        error: 'At least one filter required: mmsi, start_time, end_time, or records',
      });
    }

    const outputDir = path.resolve(process.cwd(), 'output');
    const csvPath = path.join(outputDir, 'merged_feichang_ships_2021-10-01_2021-11-30.csv.gz');

    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }

    // 读取现有 CSV
    const raw = fs.readFileSync(csvPath);
    const csvText = zlib.gunzipSync(raw).toString('utf-8');
    const lines = csvText.trim().split(/\r?\n/);

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV is empty or has only headers' });
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const colIdx = {
      mmsi: headers.indexOf('mmsi'),
      timestamp_ms: headers.indexOf('timestamp_ms'),
    };

    if (colIdx.mmsi === -1 || colIdx.timestamp_ms === -1) {
      return res.status(400).json({
        error: 'CSV must have mmsi and timestamp_ms columns',
      });
    }

    // 构建精确删除集合
    const deleteSet = new Set();
    if (hasRecords) {
      for (const r of records) {
        if (r && r.mmsi != null && r.timestamp_ms != null) {
          deleteSet.add(`${r.mmsi}_${r.timestamp_ms}`);
        }
      }
    }

    // 过滤数据
    const headerLine = lines[0];
    const dataLines = lines.slice(1);

    const filteredLines = dataLines.filter(line => {
      if (!line.trim()) return true; // 保留空行

      const cols = line.split(',');
      const recordMmsi = parseInt(cols[colIdx.mmsi], 10);
      const recordTs = parseInt(cols[colIdx.timestamp_ms], 10);

      // 精确删除指定的 (mmsi, timestamp_ms) 记录
      if (deleteSet.size > 0) {
        return !deleteSet.has(`${recordMmsi}_${recordTs}`);
      }

      // 检查是否匹配删除条件
      if (mmsi && recordMmsi === parseInt(mmsi, 10)) {
        return false; // 删除
      }

      if (start_time && recordTs < start_time * 1000) {
        return false; // 删除
      }

      if (end_time && recordTs > end_time * 1000) {
        return false; // 删除
      }

      return true; // 保留
    });

    const deletedCount = dataLines.length - filteredLines.length;

    if (dry_run) {
      return res.json({
        success: true,
        dry_run: true,
        deletedCount,
        remainingCount: filteredLines.length,
        message: '这是一个测试运行。添加 dry_run: false 来实际执行删除。',
      });
    }

    // 写回压缩 CSV
    const newCsv = [headerLine, ...filteredLines].join('\n');
    const compressed = zlib.gzipSync(newCsv);
    fs.writeFileSync(csvPath, compressed);

    console.log('[delete] Records deleted:', {
      filters: { mmsi, start_time, end_time },
      recordsCount: deleteSet.size,
      deletedCount,
      remainingCount: filteredLines.length,
    });

    // 异步重建数据缓存
    const rebuildProcess = spawn('node', ['scripts/build-data.js'], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'pipe',
    });

    rebuildProcess.on('exit', (code) => {
      if (code === 0) {
        console.log('[delete] ✓ Rebuild data completed');
        invalidateCache();
      } else {
        console.error('[delete] ✗ Rebuild data exited with code:', code);
      }
    });

    rebuildProcess.on('error', (err) => {
      console.error('[delete] ✗ Rebuild data error:', err.message);
    });

    return res.json({
      success: true,
      deletedCount,
      remainingCount: filteredLines.length,
      message: 'Records deleted. Data cache is being rebuilt in background...',
    });
  } catch (err) {
    console.error('[delete] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
