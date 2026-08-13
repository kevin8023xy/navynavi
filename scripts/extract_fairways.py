#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从原始 S-57 SHP 提取 fairways（航道）面要素 → public/data/fairways.geojson
与 zone-polygon.geojson 同构：每个 feature 带 id / name 等属性，供 turf 点面判断。

数据源: CN413111/shp/CN413111_45000_FAIRWY_R.shp (12 个航道面)
依赖:   pyshp  (pip install pyshp)

用法:
    python scripts/extract_fairways.py
"""
import os
import json
import shapefile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHP_PATH = os.path.join(ROOT, 'CN413111', 'shp', 'CN413111_45000_FAIRWY_R.shp')
OUT_PATH = os.path.join(ROOT, 'public', 'data', 'fairways.geojson')


def main():
    if not os.path.exists(SHP_PATH):
        raise SystemExit(f'未找到航道 SHP: {SHP_PATH}')

    reader = shapefile.Reader(SHP_PATH, encoding='utf-8', errors='replace')
    fields = [f[0] for f in reader.fields[1:]]
    field_keys = set(fields)

    def pick(rec, *names):
        for n in names:
            if n in field_keys:
                v = rec.get(n)
                if v not in (None, '', 0.0):
                    return v
        return None

    features = []
    for i, sr in enumerate(reader.shapeRecords()):
        geom = sr.shape.__geo_interface__
        rec = dict(zip(fields, sr.record))

        # id 优先 RCID（稳定唯一编号），否则回退到索引
        rcid = rec.get('RCID')
        fid = rec.get('FIDN')
        fw_id = str(int(rcid)) if isinstance(rcid, (int, float)) else f'FW{i:03d}'

        props = {
            'id': fw_id,
            'name': f'航道 {fw_id}',
            'lnam': rec.get('LNAM') or '',
            'rcid': rcid if isinstance(rcid, (int, float)) else None,
            'fidn': fid if isinstance(fid, (int, float)) else None,
            'drval1': rec.get('DRVAL1'),     # 推荐水深
            'orient': rec.get('ORIENT'),     # 航道走向
            'trafic': rec.get('TRAFIC'),     # 交通流向
            'acronym': rec.get('Acronym') or 'FAIRWY',
        }
        # 去掉 None 值，保持 geojson 干净
        props = {k: v for k, v in props.items() if v is not None}

        features.append({
            'type': 'Feature',
            'geometry': geom,
            'properties': props,
        })

    reader.close()

    fc = {'type': 'FeatureCollection', 'features': features}
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(fc, f, ensure_ascii=False, indent=2)

    print(f'已写出 {len(features)} 个航道面 → {OUT_PATH}')
    for ft in features:
        p = ft['properties']
        print(f"  id={p.get('id')}  rcid={p.get('rcid')}  drval1={p.get('drval1')}")


if __name__ == '__main__':
    main()
