'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const { invalidateCache } = require('./lib/data');

function parseCsvLines(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim());
  return { headers, rows: lines.slice(1) };
}

function getColIndex(headers, names) {
  const lowerHeaders = headers.map((h) => h.toLowerCase());
  for (const name of names) {
    const idx = lowerHeaders.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function convertRow(cols, targetHeaders, sourceHeaders) {
  const colMap = {};
  for (let i = 0; i < sourceHeaders.length; i++) {
    colMap[sourceHeaders[i].toLowerCase()] = cols[i] ?? '';
  }

  return targetHeaders.map((targetHeader) => {
    const lower = targetHeader.toLowerCase();
    if (colMap[lower] !== undefined) return colMap[lower];
    if (lower === 'group_id') return '0';
    if (lower === 'datetime')
      return new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (lower === 'timestamp') return new Date().toISOString();
    if (lower === 'rot') return '0';
    return '';
  });
}


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
    // 在 Vercel 中：req.body 是 Buffer（使用 serverless runtime）
    // 或者前端发送 JSON，这里我们支持两种：
    // 1. 前端发送 CSV 内容作为 JSON { csv: "..." }
    // 2. 前端发送 multipart/form-data （需要特殊处理）

    let csvContent = '';

    if (typeof req.body === 'string') {
      const body = JSON.parse(req.body);
      csvContent = body.csv;
    } else if (req.body && req.body.csv) {
      csvContent = req.body.csv;
    } else if (Buffer.isBuffer(req.body)) {
      csvContent = req.body.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'CSV content required' });
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return res.status(400).json({ error: 'CSV is empty' });
    }

    // 获取数据目录
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const csvPath = path.join(outputDir, 'merged_feichang_ships_2021-10-01_2021-11-30.csv.gz');

    // 如果现有文件存在，读取并合并
    let existingCsv = '';
    if (fs.existsSync(csvPath)) {
      const raw = fs.readFileSync(csvPath);
      existingCsv = zlib.gunzipSync(raw).toString('utf-8');
    }

    // 分析 CSV 结构
    const newLines = csvContent.trim().split(/\r?\n/);
    const newHeaders = newLines[0].split(',').map(h => h.trim());

    // 检查必要的列
    const requiredCols = ['mmsi', 'timestamp_ms'];
    const newHeadersLower = newHeaders.map(h => h.toLowerCase());
    const missingCols = requiredCols.filter(col => !newHeadersLower.includes(col));

    if (missingCols.length > 0) {
      return res.status(400).json({
        error: 'CSV is missing required columns',
        missing: missingCols,
        required: requiredCols,
        provided: newHeaders,
        hint: `Your CSV has columns: [${newHeaders.join(', ')}]. But it's missing: [${missingCols.join(', ')}]. Please ensure your CSV contains at least 'mmsi' and 'timestamp_ms' columns.`,
      });
    }

    let mergedCsv = '';
    const { headers: existingHeaders, rows: existingRows } = existingCsv
      ? parseCsvLines(existingCsv)
      : { headers: [], rows: [] };

    // 以现有文件列名为基准；若尚无现有文件，则以新文件列名为基准
    const targetHeaders =
      existingHeaders.length > 0 ? existingHeaders : newHeaders;

    const mmsiIdx = getColIndex(targetHeaders, ['mmsi']);
    const tsIdx = getColIndex(targetHeaders, ['timestamp_ms']);

    if (mmsiIdx < 0 || tsIdx < 0) {
      return res.status(400).json({
        error: 'Cannot locate mmsi or timestamp_ms columns in target CSV',
      });
    }

    // 使用 mmsi + timestamp_ms 作为唯一键，新数据覆盖旧数据
    const recordMap = new Map();

    for (const line of existingRows) {
      if (!line.trim()) continue;
      const cols = line.split(',');
      const mmsi = cols[mmsiIdx];
      const ts = cols[tsIdx];
      if (!mmsi || !ts) continue;
      recordMap.set(`${mmsi}_${ts}`, cols);
    }

    const newMmsiIdx = getColIndex(newHeaders, ['mmsi']);
    const newTsIdx = getColIndex(newHeaders, ['timestamp_ms']);

    for (const line of newLines.slice(1).filter((l) => l.trim())) {
      const cols = line.split(',');
      const mmsi = cols[newMmsiIdx];
      const ts = cols[newTsIdx];
      if (!mmsi || !ts) continue;
      const converted =
        existingHeaders.length > 0
          ? convertRow(cols, targetHeaders, newHeaders)
          : cols;
      recordMap.set(`${mmsi}_${ts}`, converted);
    }

    const mergedRows = Array.from(recordMap.values());
    mergedCsv = [targetHeaders.join(','), ...mergedRows.map((cols) => cols.join(','))].join('\n');


    // 压缩并保存
    const compressed = zlib.gzipSync(mergedCsv);
    fs.writeFileSync(csvPath, compressed);

    const stats = fs.statSync(csvPath);
    const sizeKb = (stats.size / 1024).toFixed(2);

    console.log('[upload] CSV uploaded successfully:', {
      path: csvPath,
      sizeKb,
      records: mergedCsv.split('\n').length - 1,
    });

    // 异步运行数据构建脚本（不阻塞上传响应）
    const { spawn } = require('child_process');
    const buildProcess = spawn('node', ['scripts/build-data.js'], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'pipe'
    });

    buildProcess.on('exit', (code) => {
      if (code === 0) {
        console.log('[upload] ✓ Build data completed successfully');
        invalidateCache();
      } else {
        console.error('[upload] ✗ Build data exited with code:', code);
      }
    });

    buildProcess.on('error', (err) => {
      console.error('[upload] ✗ Build data error:', err.message);
    });

    // 立即返回成功响应
    return res.json({
      success: true,
      message: 'CSV uploaded and data rebuild triggered',
      file: csvPath,
      sizeKb,
      recordCount: mergedCsv.split('\n').length - 1,
      note: 'Data cache is being rebuilt in background...',
    });
  } catch (err) {
    console.error('[upload] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
