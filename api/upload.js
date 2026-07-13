'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

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
    if (existingCsv) {
      const existingLines = existingCsv.trim().split(/\r?\n/);
      const existingHeaders = existingLines[0].split(',').map(h => h.trim());

      // 直接追加新数据行（不做去重，因为会导致大文件内存溢出）
      // 假设新数据来自不同时间范围
      if (JSON.stringify(newHeaders) !== JSON.stringify(existingHeaders)) {
        // 如果列不相同，需要转换
        const newHeadersLower = newHeaders.map(h => h.toLowerCase());
        const colMapping = {};
        for (const existingHeader of existingHeaders) {
          const idx = newHeadersLower.indexOf(existingHeader.toLowerCase());
          colMapping[existingHeader] = idx;
        }

        const convertedLines = newLines.slice(1).filter(l => l.trim()).map(line => {
          const cols = line.split(',');
          return existingHeaders.map(header => {
            const idx = colMapping[header];
            if (idx >= 0 && idx < cols.length) {
              return cols[idx];
            }
            if (header === 'group_id') return '0';
            if (header === 'datetime') return new Date().toISOString().slice(0, 19).replace('T', ' ');
            if (header === 'timestamp') return new Date().toISOString();
            if (header === 'rot') return '0';
            return '';
          }).join(',');
        });
        mergedCsv = existingCsv + '\n' + convertedLines.join('\n');
      } else {
        // 列完全相同，直接追加
        const newDataLines = newLines.slice(1).filter(line => line.trim());
        mergedCsv = existingCsv + '\n' + newDataLines.join('\n');
      }
    } else {
      mergedCsv = csvContent;
    }

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
