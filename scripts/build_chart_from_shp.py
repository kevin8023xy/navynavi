#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
纯 Python SHP → PMTiles 转换脚本（不依赖 tippecanoe / pmtiles CLI）
使用 geopandas + mercantile + mapbox-vector-tile + pmtiles 库生成单个 PMTiles。
"""
import os
import sys
import glob
import gzip
import json
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import mercantile
import pandas as pd
from shapely.ops import transform as shapely_transform
from shapely.geometry import box, mapping, MultiPolygon
from shapely.geometry.polygon import orient
from shapely import wkt
import mapbox_vector_tile
from pmtiles.writer import Writer
from pmtiles.tile import zxy_to_tileid, Compression, TileType

# 导入现有图层分类定义
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))
from shp_to_pmtiles import S52_LAYERS, get_s57_code

# ==================== 配置 ====================
SHP_DIR = r'e:/term/navi_navy/CN413111/shp'
OUTPUT_DIR = r'e:/term/navi_navy/public/pmtiles'
OUTPUT_PATH = os.path.join(OUTPUT_DIR, 'navy_chart.pmtiles')
INFO_PATH = os.path.join(OUTPUT_DIR, 'layer_info.json')

MIN_ZOOM = 6
MAX_ZOOM = 14
TILE_EXTENT = 4096

os.makedirs(OUTPUT_DIR, exist_ok=True)


def read_shp(path):
    """尝试读取 shapefile，自动处理编码问题。"""
    encodings = ['utf-8', 'gbk', 'gb2312', 'cp936', 'latin1']
    last_err = None
    for enc in encodings:
        try:
            gdf = gpd.read_file(path, encoding=enc)
            if gdf.empty:
                return gdf
            # 清理字段名首尾空格，并丢弃空值列
            gdf.columns = [c.strip() if isinstance(c, str) else c for c in gdf.columns]
            return gdf
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"无法读取 {path}: {last_err}")


def group_shp_files():
    """按 S-52 图层分组 SHP 文件。"""
    shp_files = sorted(glob.glob(os.path.join(SHP_DIR, '*.shp')))

    code_geom_to_layer = {}
    for layer_name, layer_info in S52_LAYERS.items():
        for code in layer_info['codes']:
            key = (code, layer_info['geom'])
            code_geom_to_layer.setdefault(key, []).append(layer_name)

    layer_groups = defaultdict(list)
    unclassified = []

    for shp_path in shp_files:
        code, geom = get_s57_code(shp_path)
        if not code or not geom:
            unclassified.append(shp_path)
            continue

        key = (code, geom)
        if key in code_geom_to_layer:
            for layer_name in code_geom_to_layer[key]:
                layer_groups[layer_name].append(shp_path)
        else:
            matched = False
            for layer_name, layer_info in S52_LAYERS.items():
                if code in layer_info['codes']:
                    layer_groups[layer_name].append(shp_path)
                    matched = True
                    break
            if not matched:
                unclassified.append(shp_path)

    return layer_groups, unclassified


def merge_layer_to_gdf(layer_name, shp_files):
    """把同一图层的多个 SHP 合并为一个 GeoDataFrame，并附加 S-57 元信息。"""
    parts = []
    for shp_path in shp_files:
        try:
            gdf = read_shp(shp_path)
            if gdf.empty:
                continue
            code, geom = get_s57_code(shp_path)
            if code:
                gdf['S57_CODE'] = code
            if geom:
                gdf['S57_GEOM'] = geom
            # 保留非空、可序列化的属性
            keep_cols = []
            for col in gdf.columns:
                if col == 'geometry':
                    continue
                # 丢弃全空列
                if gdf[col].notna().any():
                    keep_cols.append(col)
            gdf = gdf[['geometry'] + keep_cols]
            parts.append(gdf)
        except Exception as e:
            print(f"  警告: 读取 {os.path.basename(shp_path)} 失败: {e}")

    if not parts:
        return None
    merged = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=parts[0].crs)
    return merged


def project_geometry(geom, tile):
    """将 WGS84 几何投影到瓦片坐标 (0..TILE_EXTENT)。"""
    bounds = mercantile.xy_bounds(tile)
    width = bounds.right - bounds.left
    height = bounds.top - bounds.bottom

    def transform_fn(x, y, z=None):
        # 输入 WGS84 (lon, lat) 经 mercantile.xy 转为 Web Mercator
        mx, my = mercantile.xy(x, y)
        tx = int(round((mx - bounds.left) / width * TILE_EXTENT))
        # 注意：mapbox_vector_tile.encode 接收的 WKT 坐标按标准坐标系处理（y 向上），
        # 内部再翻转为 MVT 坐标（y 向下）。因此这里输出标准瓦片坐标：
        # y=0 为瓦片南边，y=extent 为瓦片北边。
        ty = int(round((my - bounds.bottom) / height * TILE_EXTENT))
        # 限制在边界内，避免浮点误差导致越界
        tx = max(0, min(TILE_EXTENT, tx))
        ty = max(0, min(TILE_EXTENT, ty))
        return (tx, ty)

    projected = shapely_transform(transform_fn, geom)
    # 过滤掉空或退化的几何
    if projected is None or projected.is_empty:
        return None

    # 修正 Polygon/MultiPolygon 的 ring 方向
    # transform_fn 输出标准瓦片坐标（y 向上）。mapbox_vector_tile.encode 会内部将 y 向下翻转，
    # 得到最终 MVT 坐标。orient(..., sign=1.0) 使多边形在标准坐标系下逆时针，
    # 经 encode 翻转 y 后即为 MVT 要求的顺时针外环。
    if projected.geom_type == 'Polygon':
        projected = orient(projected, sign=1.0)
    elif projected.geom_type == 'MultiPolygon':
        projected = MultiPolygon([orient(p, sign=1.0) for p in projected.geoms])

    return projected


def encode_tile(tile_id, tile_features_by_layer):
    """将各图层要素编码为单个 MVT 瓦片。"""
    layers = []
    for layer_name, features in tile_features_by_layer.items():
        if not features:
            continue
        layers.append({
            'name': layer_name,
            'features': features,
            'extent': TILE_EXTENT,
        })
    if not layers:
        return None
    try:
        mvt_bytes = mapbox_vector_tile.encode(layers)
        return gzip.compress(mvt_bytes)
    except Exception as e:
        print(f"  瓦片 {tile_id} 编码失败: {e}")
        return None


def sanitize_properties(props):
    """清理属性，确保可被 MVT 编码。"""
    cleaned = {}
    for k, v in props.items():
        if k == 'geometry':
            continue
        if v is None:
            continue
        if isinstance(v, (int, float, str, bool)):
            cleaned[k] = v
        else:
            # 其他类型转字符串
            cleaned[k] = str(v)
    return cleaned


def build_pmtiles(layer_gdfs):
    """核心：切瓦片并写入 PMTiles。"""
    # 计算整体 bbox
    total_bounds = [180.0, 90.0, -180.0, -90.0]
    for gdf in layer_gdfs.values():
        if gdf is None or gdf.empty:
            continue
        b = gdf.total_bounds
        total_bounds[0] = min(total_bounds[0], b[0])
        total_bounds[1] = min(total_bounds[1], b[1])
        total_bounds[2] = max(total_bounds[2], b[2])
        total_bounds[3] = max(total_bounds[3], b[3])

    west, south, east, north = total_bounds
    print(f"数据范围: {west:.6f}, {south:.6f}, {east:.6f}, {north:.6f}")

    tile_data = {}  # tile_id -> {layer_name -> [features]}
    tile_extents = defaultdict(dict)

    for layer_name, gdf in layer_gdfs.items():
        if gdf is None or gdf.empty:
            print(f"  跳过空图层: {layer_name}")
            continue

        print(f"处理图层: {layer_name} ({len(gdf)} 个要素)")

        # 构建空间索引，加速瓦片查询
        gdf.sindex

        for z in range(MIN_ZOOM, MAX_ZOOM + 1):
            tiles = list(mercantile.tiles(west, south, east, north, zooms=(z,)))
            for tile in tiles:
                tile_id = zxy_to_tileid(z, tile.x, tile.y)
                tile_bounds = mercantile.bounds(tile)
                tile_box_geom = box(tile_bounds.west, tile_bounds.south,
                                    tile_bounds.east, tile_bounds.north)

                # 快速空间过滤：只处理与瓦片相交的要素
                possible_matches_idx = list(gdf.sindex.intersection(tile_box_geom.bounds))
                if not possible_matches_idx:
                    continue

                subset = gdf.iloc[possible_matches_idx]
                clipped = gpd.clip(subset, tile_box_geom)
                if clipped.empty:
                    continue

                for _, row in clipped.iterrows():
                    geom = project_geometry(row.geometry, tile)
                    if geom is None or geom.is_empty:
                        continue
                    props = sanitize_properties(row.to_dict())
                    try:
                        wkt_str = geom.wkt
                    except Exception:
                        continue
                    tile_data.setdefault(tile_id, defaultdict(list))
                    tile_data[tile_id][layer_name].append({
                        'geometry': wkt_str,
                        'properties': props,
                    })
                    if layer_name not in tile_extents[tile_id]:
                        tile_extents[tile_id][layer_name] = TILE_EXTENT

    if not tile_data:
        print("错误: 没有生成任何瓦片")
        return False

    print(f"\n共生成 {len(tile_data)} 个非空瓦片")

    with open(OUTPUT_PATH, 'wb') as f:
        writer = Writer(f)
        for tile_id in sorted(tile_data.keys()):
            features_by_layer = tile_data[tile_id]
            encoded = encode_tile(tile_id, features_by_layer)
            if encoded:
                writer.write_tile(tile_id, encoded)

        writer.finalize(
            header={
                'min_zoom': MIN_ZOOM,
                'max_zoom': MAX_ZOOM,
                'min_lon_e7': int(total_bounds[0] * 1e7),
                'min_lat_e7': int(total_bounds[1] * 1e7),
                'max_lon_e7': int(total_bounds[2] * 1e7),
                'max_lat_e7': int(total_bounds[3] * 1e7),
                'center_zoom': (MIN_ZOOM + MAX_ZOOM) // 2,
                'center_lon_e7': int((total_bounds[0] + total_bounds[2]) / 2 * 1e7),
                'center_lat_e7': int((total_bounds[1] + total_bounds[3]) / 2 * 1e7),
                'tile_compression': Compression.GZIP,
                'tile_type': TileType.MVT,
            },
            metadata={
                'name': 'Navy Chart CN413111',
                'type': 'overlay',
                'version': '1.0',
                'attribution': 'S-57 ENC Data',
            }
        )

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"\n成功生成: {OUTPUT_PATH} ({size_mb:.2f} MB)")
    print(f"瓦片数: {len(tile_data)}")
    print(f"Zoom 范围: {MIN_ZOOM} - {MAX_ZOOM}")
    return True


def main():
    print("=" * 60)
    print("S-57 SHP → PMTiles (纯 Python 方案)")
    print("=" * 60)

    # 分组
    print("\n[1/4] 分析 SHP 文件并分类...")
    layer_groups, unclassified = group_shp_files()
    print(f"  已分类: {sum(len(v) for v in layer_groups.values())} 个文件")
    print(f"  未分类: {len(unclassified)} 个文件")
    if unclassified:
        print(f"    未分类示例: {[os.path.basename(f) for f in unclassified[:5]]}")

    # 合并为 GeoDataFrame
    print("\n[2/4] 读取并合并 Shapefile...")
    layer_gdfs = {}
    for layer_name, shp_files in sorted(layer_groups.items()):
        print(f"  图层 '{layer_name}': {len(shp_files)} 个文件")
        gdf = merge_layer_to_gdf(layer_name, shp_files)
        if gdf is not None and not gdf.empty:
            layer_gdfs[layer_name] = gdf
            print(f"    -> {len(gdf)} 个要素")
        else:
            print(f"    -> 无有效要素")

    # 生成 PMTiles
    print("\n[3/4] 切瓦片并生成 PMTiles...")
    if not build_pmtiles(layer_gdfs):
        print("生成失败")
        sys.exit(1)

    # 保存图层信息
    print("\n[4/4] 保存图层信息...")
    layer_info = {}
    for layer_name, layer_info_data in S52_LAYERS.items():
        if layer_name in layer_gdfs:
            layer_info[layer_name] = {
                'description': layer_info_data['description'],
                's52_color': layer_info_data['s52_color'],
                'geometry_type': layer_info_data['geom'],
                'source_codes': layer_info_data['codes'],
                'feature_count': len(layer_gdfs[layer_name]),
            }
    with open(INFO_PATH, 'w', encoding='utf-8') as f:
        json.dump(layer_info, f, ensure_ascii=False, indent=2)
    print(f"  图层信息已保存: {INFO_PATH}")

    print("\n" + "=" * 60)
    print("完成! 新海图已替换 public/pmtiles/navy_chart.pmtiles")
    print("=" * 60)


if __name__ == '__main__':
    main()
