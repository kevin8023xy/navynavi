#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 S-57 ENC (.000) 文件提取 SOUNDG 水深点，生成 GeoJSON。
"""

import json
import sys
from pathlib import Path

import geopandas as gpd

ENC_PATH = Path(r'e:/term/navi_navy/CN413111/s57/CN413111.000')
OUTPUT_PATH = Path(r'e:/term/navi_navy/public/data/soundings.json')


def extract_soundings(enc_path: Path, output_path: Path) -> int:
    """读取 SOUNDG 图层并输出点 GeoJSON。"""
    print(f"读取: {enc_path}")
    gdf = gpd.read_file(str(enc_path), layer='SOUNDG')
    print(f"  原始记录数: {len(gdf)}")

    features = []
    skipped = 0

    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            skipped += 1
            continue

        # SOUNDG 几何类型通常为 MultiPoint Z
        points = []
        if geom.geom_type == 'MultiPoint':
            points = list(geom.geoms)
        elif geom.geom_type == 'Point':
            points = [geom]
        else:
            skipped += 1
            continue

        for pt in points:
            # Z 坐标为水深值
            depth = pt.z if pt.has_z else None
            if depth is None:
                skipped += 1
                continue

            feature = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [round(pt.x, 6), round(pt.y, 6)],
                },
                'properties': {
                    'VALSOU': round(float(depth), 1),
                },
            }
            features.append(feature)

    geojson = {
        'type': 'FeatureCollection',
        'features': features,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(',', ':'))

    print(f"  输出: {output_path}")
    print(f"  有效水深点数: {len(features)}")
    if skipped:
        print(f"  跳过记录数: {skipped}")
    return len(features)


if __name__ == '__main__':
    try:
        count = extract_soundings(ENC_PATH, OUTPUT_PATH)
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)
