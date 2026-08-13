'use strict';
// 验证 C 项扩展：zone-stats 按 MMSI 聚合「进入航道 + 经过区域面 id」。
// 直接调用 HTTP handler（mock req/res），断言返回结构与聚合正确性。

const assert = require('assert');
const handler = require('../api/zone-stats');

let pass = 0;
const ok = (name, cond) => {
  if (!cond) throw new Error('FAIL: ' + name);
  pass++;
  console.log('  ✓', name);
};

function mockRes() {
  let body = null;
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(obj) { body = obj; return this; },
    end() {},
  };
  return { res, getBody: () => body };
}

(async () => {
  // 1) 不带时间过滤，跑全量（用内嵌/CSV 数据，取决于环境）
  const { res, getBody } = mockRes();
  await handler(
    { method: 'GET', query: { min_sog: '0', exclude_fishing: '0', exclude_towing: '0' } },
    res,
  );
  const data = getBody();
  ok('返回含 summary', data && data.summary);
  ok('返回含 ships 数组', data && Array.isArray(data.ships));
  ok('fairwayCount = 12', data.summary.fairwayCount === 12);
  ok('zoneCount = 10', data.summary.zoneCount === 10);

  // 2) 聚合结构：每艘船有 fairways 数组与 zones 数组，且 fairways 非空
  if (data.ships.length > 0) {
    const s0 = data.ships[0];
    ok('ship 含 mmsi', typeof s0.mmsi === 'number');
    ok('ship.fairways 为非空数组', Array.isArray(s0.fairways) && s0.fairways.length > 0);
    ok('ship.zones 为数组', Array.isArray(s0.zones));
    ok('fairways id 均为字符串', s0.fairways.every((x) => typeof x === 'string'));
    ok('zones id 均为字符串', s0.zones.every((x) => typeof x === 'string'));
    console.log('    样例 MMSI', s0.mmsi, '航道', s0.fairways, '区域面', s0.zones);

    // 3) 按 MMSI 主键唯一：无重复 mmsi
    const mmsis = data.ships.map((s) => s.mmsi);
    ok('MMSI 主键唯一（无重复）', new Set(mmsis).size === mmsis.length);

    // 4) 仅「进入航道」的船被保留：所有 ship.fairways 非空（已由 filter 保证）
    ok('所有结果均进入过航道', data.ships.every((s) => s.fairways.length > 0));
  } else {
    console.log('  (注) 当前数据集无船进入航道，跳过聚合细节断言');
  }

  console.log(`\n${pass} 项断言全部通过 ✅`);
  console.log('  summary:', JSON.stringify(data.summary));
})().catch((e) => {
  console.error('验证失败:', e.message);
  process.exit(1);
});
