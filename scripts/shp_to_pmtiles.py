#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
S-57 海图 SHP → PMTiles 转换脚本
支持按 S-52 标准分类合并图层

用法:
    python shp_to_pmtiles.py

依赖:
    pip install pyshp geojson
    以及 tippecanoe + pmtiles CLI 工具

作者: AI Assistant
"""

import os
import sys
import json
import glob
import struct
import subprocess
from collections import defaultdict, Counter
from pathlib import Path

# ==================== 配置 ====================
SHP_DIR = r'e:/term/navi_navy/shp'
OUTPUT_DIR = r'e:/term/navi_navy/public/pmtiles'
TEMP_DIR = r'e:/term/navi_navy/.temp_tiles'

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

# ==================== S-57 代码 → S-52 图层分类 ====================
# 基于 IHO S-52 标准，将 S-57 要素代码分类为逻辑图层组
S52_LAYERS = {
    # --- 深度相关 (Depth) ---
    'depth_areas': {
        'codes': ['DEPARE', 'DMPGRD', 'SBDARE'],
        'geom': 'R',
        'description': '深度区域/海底区域',
        's52_color': 'DEPDW',
    },
    'depth_contours': {
        'codes': ['DEPCNT'],
        'geom': 'L',
        'description': '等深线',
        's52_color': 'DEPCN',
    },
    'soundings': {
        'codes': ['SOUNDG'],
        'geom': 'P',
        'description': '测深点',
        's52_color': 'SNDG1',
    },

    # --- 陆地 (Land) ---
    'land_areas': {
        'codes': ['LNDARE', 'LNDRGN', 'BUAARE', 'HRBARE', 'LAKARE'],
        'geom': 'R',
        'description': '陆地/建筑区/港口/湖泊',
        's52_color': 'LANDA',
    },
    'land_elevation': {
        'codes': ['LNDELV'],
        'geom': 'P',
        'description': '高程点',
        's52_color': 'LNDEL',
    },
    'land_line': {
        'codes': ['LNDELV'],
        'geom': 'L',
        'description': '等高线',
        's52_color': 'LNDEL',
    },

    # --- 海岸线 (Coastline) ---
    'coastline': {
        'codes': ['COALNE'],
        'geom': 'L',
        'description': '海岸线',
        's52_color': 'COALN',
    },

    # --- 航道/航线 (Routes) ---
    'fairways': {
        'codes': ['FAIRWY'],
        'geom': 'R',
        'description': '航道区域',
        's52_color': 'FAIRW',
    },
    'fairways_line': {
        'codes': ['NAVLNE', 'RECTRC'],
        'geom': 'L',
        'description': '导航线/推荐航线',
        's52_color': 'NAVLN',
    },
    'route_beacons': {
        'codes': ['RTPBCN'],
        'geom': 'P',
        'description': '航线信标',
        's52_color': 'RTPBC',
    },

    # --- 交通基础设施 (Transportation) ---
    'roads': {
        'codes': ['ROADWY', 'RAILWY', 'CAUSWY'],
        'geom': 'L',
        'description': '道路/铁路/堤道',
        's52_color': 'ROADW',
    },
    'roads_area': {
        'codes': ['ROADWY'],
        'geom': 'R',
        'description': '道路区域',
        's52_color': 'ROADW',
    },
    'tunnels': {
        'codes': ['TUNNEL'],
        'geom': 'L',
        'description': '隧道',
        's52_color': 'TUNNL',
    },
    'bridges': {
        'codes': ['BRIDGE'],
        'geom': 'R',
        'description': '桥梁',
        's52_color': 'BRIDG',
    },

    # --- 水域 (Water) ---
    'rivers': {
        'codes': ['RIVERS'],
        'geom': 'L',
        'description': '河流',
        's52_color': 'RIVER',
    },
    'rivers_area': {
        'codes': ['RIVERS'],
        'geom': 'R',
        'description': '河流区域',
        's52_color': 'RIVER',
    },
    'sea_areas': {
        'codes': ['SEAARE'],
        'geom': 'R',
        'description': '海域',
        's52_color': 'SEAAR',
    },

    # --- 障碍物 (Obstructions) ---
    'obstructions': {
        'codes': ['OBSTRN', 'UWTROC'],
        'geom': 'P',
        'description': '障碍物/水下岩石',
        's52_color': 'OBSTR',
    },
    'wrecks': {
        'codes': ['WRECKS'],
        'geom': 'P',
        'description': '沉船',
        's52_color': 'WRECK',
    },
    'obstructions_area': {
        'codes': ['WRECKS', 'OBSTRN'],
        'geom': 'R',
        'description': '障碍物区域',
        's52_color': 'OBSTR',
    },

    # --- 航标 (Aids to Navigation) ---
    'buoys': {
        'codes': ['BOYCAR', 'BOYISD', 'BOYLAT', 'BOYSPP'],
        'geom': 'P',
        'description': '浮标',
        's52_color': 'BOYSP',
    },
    'beacons': {
        'codes': ['BCNSPP'],
        'geom': 'P',
        'description': '立标',
        's52_color': 'BCNSP',
    },
    'lights': {
        'codes': ['LIGHTS'],
        'geom': 'P',
        'description': '灯塔/灯标',
        's52_color': 'LIGHT',
    },
    'topmarks': {
        'codes': ['TOPMAR'],
        'geom': 'P',
        'description': '顶标',
        's52_color': 'TOPMA',
    },
    'radar_stations': {
        'codes': ['RADSTA', 'RDOSTA'],
        'geom': 'P',
        'description': '雷达站/无线电指向标',
        's52_color': 'RADAR',
    },

    # --- 设施/建筑 (Facilities) ---
    'buildings': {
        'codes': ['BUISGL'],
        'geom': 'P',
        'description': '建筑物',
        's52_color': 'BUISG',
    },
    'landmarks': {
        'codes': ['LNDMRK'],
        'geom': 'P',
        'description': '地标',
        's52_color': 'LNDMK',
    },
    'pilots': {
        'codes': ['PILBOP'],
        'geom': 'P',
        'description': '引航作业点',
        's52_color': 'PILBO',
    },
    'radar_call': {
        'codes': ['RDOCAL'],
        'geom': 'L',
        'description': '雷达呼叫线',
        's52_color': 'RDOCA',
    },

    # --- 管线 (Pipelines) ---
    'pipelines': {
        'codes': ['PIPSOL'],
        'geom': 'L',
        'description': '管线',
        's52_color': 'PIPSO',
    },

    # --- 特殊区域 (Special Areas) ---
    'anchorages': {
        'codes': ['ACHARE'],
        'geom': 'R',
        'description': '锚地',
        's52_color': 'ACHAR',
    },
    'berths': {
        'codes': ['BERTHS'],
        'geom': 'R',
        'description': '泊位',
        's52_color': 'BERTH',
    },
    'restricted_areas': {
        'codes': ['RESARE', 'CTNARE'],
        'geom': 'R',
        'description': '限制区/禁锚区',
        's52_color': 'RESAR',
    },
    'production_areas': {
        'codes': ['PRDARE'],
        'geom': 'R',
        'description': '生产区/油田',
        's52_color': 'PRDAR',
    },
    'fences': {
        'codes': ['FNCLNE'],
        'geom': 'L',
        'description': '栅栏/围墙',
        's52_color': 'FNCLN',
    },
    'gates': {
        'codes': ['GATCON'],
        'geom': 'R',
        'description': '闸门/船闸',
        's52_color': 'GATCO',
    },
    'shoreline_construction': {
        'codes': ['SLCONS'],
        'geom': 'R',
        'description': '岸线建筑',
        's52_color': 'SLCON',
    },
    'slope_top': {
        'codes': ['SLOTOP'],
        'geom': 'R',
        'description': '坡顶线',
        's52_color': 'SLOTO',
    },

    # --- 行政/元数据 (Administrative) ---
    'admin_areas': {
        'codes': ['ADMARE'],
        'geom': 'R',
        'description': '行政区',
        's52_color': 'ADMAR',
    },
    'magvar': {
        'codes': ['MAGVAR'],
        'geom': 'R',
        'description': '磁差信息',
        's52_color': 'MAGVA',
    },

    # --- 海图元数据 (Chart Metadata) ---
    'meta_coverage': {
        'codes': ['M_COVR'],
        'geom': 'R',
        'description': '海图覆盖范围',
        's52_color': 'M_COVR',
    },
    'meta_system': {
        'codes': ['M_NSYS'],
        'geom': 'R',
        'description': '导航系统',
        's52_color': 'M_NSYS',
    },
    'meta_quality': {
        'codes': ['M_QUAL'],
        'geom': 'R',
        'description': '数据质量',
        's52_color': 'M_QUAL',
    },
    'tidal_streams': {
        'codes': ['TS'],
        'geom': 'R',
        'description': '潮汐流',
        's52_color': 'TS',
    },
    'tidal_stations': {
        'codes': ['SISTAT'],
        'geom': 'P',
        'description': '潮汐站',
        's52_color': 'SISTA',
    },
    'tidal_w stations': {
        'codes': ['SISTAW'],
        'geom': 'P',
        'description': '潮汐观测站',
        's52_color': 'SISTA',
    },
}


def get_s57_code(filename):
    """从文件名提取 S-57 代码和几何类型"""
    base = os.path.basename(filename).replace('.shp', '')
    parts = base.split('_')
    if len(parts) >= 4:
        return parts[2], parts[3]
    return None, None


def read_dbf_fields(dbf_path):
    """读取 DBF 字段信息"""
    fields = []
    try:
        with open(dbf_path, 'rb') as f:
            f.read(4)
            numrec = struct.unpack('<I', f.read(4))[0]
            headerlen = struct.unpack('<H', f.read(2))[0]
            f.read(2)
            numfields = (headerlen - 33) // 32
            f.seek(32)
            for i in range(numfields):
                name = f.read(11).decode('ascii', errors='ignore').strip('\x00').strip()
                ftype = f.read(1).decode('ascii')
                f.read(4)
                flen = struct.unpack('B', f.read(1))[0]
                f.read(15)
                fields.append({'name': name, 'type': ftype, 'len': flen})
    except Exception as e:
        print(f"  Warning: 无法读取 DBF: {e}")
    return fields


def shp_to_geojson(shp_path, out_geojson_path):
    """使用 pyshp 将 SHP 转为 GeoJSON FeatureCollection"""
    try:
        import shapefile
    except ImportError:
        print("错误: 需要安装 pyshp: pip install pyshp")
        sys.exit(1)

    reader = shapefile.Reader(shp_path, encoding='utf-8', errors='replace')
    fields = reader.fields[1:]  # 跳过 DeletionFlag
    field_names = [f[0] for f in fields]

    features = []
    try:
        shape_records = reader.shapeRecords()
    except Exception as e:
        print(f"  Warning: shapeRecords 失败，尝试 iterShapeRecords: {e}")
        try:
            shape_records = list(reader.iterShapeRecords())
        except Exception as e2:
            print(f"  Error: 无法读取记录: {e2}")
            reader.close()
            # 写入空 GeoJSON 避免后续报错
            geojson = {'type': 'FeatureCollection', 'features': []}
            with open(out_geojson_path, 'w', encoding='utf-8') as f:
                json.dump(geojson, f, ensure_ascii=False, separators=(',', ':'))
            return 0

    for shape_record in shape_records:
        geometry = shape_record.shape.__geo_interface__
        properties = {}
        for i, value in enumerate(shape_record.record):
            if i < len(field_names):
                key = field_names[i]
                # 处理编码问题
                if isinstance(value, bytes):
                    try:
                        value = value.decode('utf-8').strip()
                    except:
                        try:
                            value = value.decode('gbk').strip()
                        except:
                            value = str(value)
                elif isinstance(value, str):
                    value = value.strip()
                # 跳过空值
                if value is not None and value != '':
                    properties[key] = value

        # 添加 S-57 代码信息
        code, geom = get_s57_code(shp_path)
        if code:
            properties['S57_CODE'] = code
        if geom:
            properties['S57_GEOM'] = geom

        feature = {
            'type': 'Feature',
            'geometry': geometry,
            'properties': properties
        }
        features.append(feature)

    reader.close()

    geojson = {
        'type': 'FeatureCollection',
        'features': features
    }

    with open(out_geojson_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(',', ':'))

    return len(features)


def group_shp_files():
    """按 S-52 图层分组 SHP 文件"""
    shp_files = sorted(glob.glob(os.path.join(SHP_DIR, '*.shp')))

    # 建立 code+geom -> layer 映射
    code_geom_to_layer = {}
    for layer_name, layer_info in S52_LAYERS.items():
        for code in layer_info['codes']:
            key = (code, layer_info['geom'])
            if key not in code_geom_to_layer:
                code_geom_to_layer[key] = []
            code_geom_to_layer[key].append(layer_name)

    # 分组
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
            # 尝试只匹配 code（不区分几何类型）
            matched = False
            for layer_name, layer_info in S52_LAYERS.items():
                if code in layer_info['codes']:
                    layer_groups[layer_name].append(shp_path)
                    matched = True
                    break
            if not matched:
                unclassified.append(shp_path)

    return layer_groups, unclassified


def merge_geojson_files(geojson_files, out_path):
    """合并多个 GeoJSON 文件为一个"""
    all_features = []
    for gf in geojson_files:
        with open(gf, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if 'features' in data:
                all_features.extend(data['features'])

    merged = {
        'type': 'FeatureCollection',
        'features': all_features
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, separators=(',', ':'))
    return len(all_features)


def run_tippecanoe(geojson_path, mbtiles_path, layer_name, min_zoom=0, max_zoom=14):
    """使用 tippecanoe 生成 MBTiles"""
    cmd = [
        'tippecanoe',
        '-o', mbtiles_path,
        '--minimum-zoom=' + str(min_zoom),
        '--maximum-zoom=' + str(max_zoom),
        '--layer=' + layer_name,
        '--drop-densest-as-needed',
        '--extend-zooms-if-still-dropping',
        '--no-tile-compression',  # 方便调试
        '--force',
        geojson_path
    ]
    print(f"  运行: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  tippecanoe 错误: {result.stderr}")
        return False
    return True


def convert_mbtiles_to_pmtiles(mbtiles_path, pmtiles_path):
    """使用 pmtiles CLI 将 MBTiles 转为 PMTiles"""
    cmd = ['pmtiles', 'convert', mbtiles_path, pmtiles_path]
    print(f"  运行: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  pmtiles 错误: {result.stderr}")
        return False
    return True


def main():
    print("=" * 60)
    print("S-57 SHP → PMTiles 转换工具")
    print("=" * 60)

    # 1. 分组 SHP 文件
    print("\n[1/5] 分析 SHP 文件并分类...")
    layer_groups, unclassified = group_shp_files()

    print(f"  发现 {sum(len(v) for v in layer_groups.values())} 个已分类文件")
    print(f"  未分类文件: {len(unclassified)} 个")
    if unclassified:
        print(f"    未分类: {[os.path.basename(f) for f in unclassified[:5]]}")

    for layer_name, files in sorted(layer_groups.items()):
        print(f"  图层 '{layer_name}': {len(files)} 个文件")

    # 2. 转换每个图层组为 GeoJSON
    print("\n[2/5] 转换 SHP → GeoJSON...")
    layer_geojson = {}
    for layer_name, shp_files in sorted(layer_groups.items()):
        if not shp_files:
            continue

        geojson_files = []
        total_features = 0

        for shp_path in shp_files:
            base_name = os.path.basename(shp_path).replace('.shp', '')
            geojson_path = os.path.join(TEMP_DIR, f"{base_name}.geojson")

            count = shp_to_geojson(shp_path, geojson_path)
            if count > 0:
                geojson_files.append(geojson_path)
                total_features += count

        if not geojson_files:
            print(f"  跳过 '{layer_name}' (无有效要素)")
            continue

        # 合并为一个 GeoJSON
        merged_path = os.path.join(TEMP_DIR, f"{layer_name}.geojson")
        merge_count = merge_geojson_files(geojson_files, merged_path)
        layer_geojson[layer_name] = merged_path
        print(f"  '{layer_name}': {merge_count} 个要素 -> {merged_path}")

    # 3. 生成 MBTiles
    print("\n[3/5] 生成 MBTiles (需要 tippecanoe)...")
    layer_mbtiles = {}
    for layer_name, geojson_path in sorted(layer_geojson.items()):
        mbtiles_path = os.path.join(TEMP_DIR, f"{layer_name}.mbtiles")

        # 根据图层类型设置 zoom 范围
        if 'meta_' in layer_name:
            min_z, max_z = 0, 10
        elif layer_name in ['soundings', 'lights', 'buoys', 'beacons']:
            min_z, max_z = 10, 16
        else:
            min_z, max_z = 6, 14

        if run_tippecanoe(geojson_path, mbtiles_path, layer_name, min_z, max_z):
            layer_mbtiles[layer_name] = mbtiles_path
            print(f"  '{layer_name}' -> {mbtiles_path}")
        else:
            print(f"  错误: 无法生成 '{layer_name}' 的 MBTiles")

    # 4. 合并所有 MBTiles 为一个
    print("\n[4/5] 合并所有图层为单个 MBTiles...")
    if len(layer_mbtiles) > 1:
        # 使用 tile-join 合并
        all_mbtiles = list(layer_mbtiles.values())
        merged_mbtiles = os.path.join(TEMP_DIR, 'navy_chart.mbtiles')
        cmd = ['tile-join', '-o', merged_mbtiles, '--no-tile-compression', '--force'] + all_mbtiles
        print(f"  运行: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  tile-join 错误: {result.stderr}")
            print("  将使用第一个 MBTiles 作为替代")
            merged_mbtiles = all_mbtiles[0]
    elif len(layer_mbtiles) == 1:
        merged_mbtiles = list(layer_mbtiles.values())[0]
    else:
        print("  错误: 没有成功生成任何 MBTiles")
        return

    # 5. 转为 PMTiles
    print("\n[5/5] 转换为 PMTiles...")
    pmtiles_path = os.path.join(OUTPUT_DIR, 'navy_chart.pmtiles')
    if convert_mbtiles_to_pmtiles(merged_mbtiles, pmtiles_path):
        size_mb = os.path.getsize(pmtiles_path) / (1024 * 1024)
        print(f"  成功! {pmtiles_path} ({size_mb:.2f} MB)")
    else:
        print("  错误: 无法转换为 PMTiles")
        print("  请确保已安装 pmtiles CLI: go install github.com/protomaps/go-pmtiles/pmtiles@latest")

    # 生成图层信息 JSON
    layer_info = {}
    for layer_name, layer_info_data in S52_LAYERS.items():
        if layer_name in layer_geojson:
            layer_info[layer_name] = {
                'description': layer_info_data['description'],
                's52_color': layer_info_data['s52_color'],
                'geometry_type': layer_info_data['geom'],
                'source_codes': layer_info_data['codes'],
            }

    info_path = os.path.join(OUTPUT_DIR, 'layer_info.json')
    with open(info_path, 'w', encoding='utf-8') as f:
        json.dump(layer_info, f, ensure_ascii=False, indent=2)
    print(f"  图层信息已保存: {info_path}")

    print("\n" + "=" * 60)
    print("转换完成!")
    print(f"输出文件: {pmtiles_path}")
    print("=" * 60)


if __name__ == '__main__':
    main()
