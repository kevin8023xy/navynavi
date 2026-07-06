#!/usr/bin/env python3
"""合并多个 PMTiles 文件为一个，同时合并 MVT 图层（避免相同 tile 覆盖）。"""
import os
import glob
import gzip
import sys
import mercantile
from collections import defaultdict
from pmtiles.reader import Reader, MmapSource
from pmtiles.writer import Writer
from pmtiles.tile import zxy_to_tileid, Compression, TileType
from mapbox_vector_tile import decode, encode

# 导入 S-52 图层分类定义
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from shp_to_pmtiles import S52_LAYERS as _S52_LAYERS

# 修复 key 名中的空格
if "tidal_w stations" in _S52_LAYERS:
    _S52_LAYERS["tidal_w_stations"] = _S52_LAYERS.pop("tidal_w stations")

# 建立 (S-57 代码, 几何类型) -> S-52 图层名 映射
CODE_GEOM_TO_S52 = defaultdict(list)
for layer_name, info in _S52_LAYERS.items():
    for code in info["codes"]:
        CODE_GEOM_TO_S52[(code, info["geom"])].append(layer_name)

SEARCH_DIR = r"e:\term\navi_navy\pmtiles"
OUTPUT_FILE = r"e:\term\navi_navy\public\pmtiles\navy_chart.pmtiles"
MAX_WM_LAT = 85.0511287798066


def parse_code_geom(filename):
    """从文件名 C1511521_50000_ACHARE_R.pmtiles 提取代码和几何类型。"""
    base = os.path.basename(filename).replace(".pmtiles", "")
    parts = base.split("_")
    if len(parts) >= 4:
        return parts[-2], parts[-1]
    return None, None


def header_bounds(h):
    return [
        h["min_lon_e7"] / 1e7,
        h["min_lat_e7"] / 1e7,
        h["max_lon_e7"] / 1e7,
        h["max_lat_e7"] / 1e7,
    ]


def clamp_wm_lat(lat):
    return max(min(lat, MAX_WM_LAT), -MAX_WM_LAT)


def merge():
    files = sorted(glob.glob(os.path.join(SEARCH_DIR, "*.pmtiles")))
    if not files:
        print(f"No .pmtiles found in {SEARCH_DIR}")
        return

    # tile_id -> {target_layer_name -> [features]}
    tile_features = defaultdict(lambda: defaultdict(list))
    # tile_id -> {target_layer_name -> extent}
    tile_extents = defaultdict(dict)

    min_zoom, max_zoom = 99, 0
    bounds = [180.0, 90.0, -180.0, -90.0]
    tile_compression = None
    tile_type = None
    unmapped = []

    for i, f in enumerate(files, 1):
        code, geom = parse_code_geom(f)
        target_layers = CODE_GEOM_TO_S52.get((code, geom)) if code and geom else None
        if not target_layers:
            unmapped.append(os.path.basename(f))
            continue

        print(f"[{i}/{len(files)}] Reading: {os.path.basename(f)} -> {', '.join(target_layers)}")

        with open(f, "rb") as src:
            reader = Reader(MmapSource(src))
            h = reader.header()
            zmin, zmax = h["min_zoom"], h["max_zoom"]
            min_zoom = min(min_zoom, zmin)
            max_zoom = max(max_zoom, zmax)
            if tile_compression is None:
                tile_compression = h.get("tile_compression", Compression.GZIP)
            if tile_type is None:
                tile_type = h.get("tile_type", TileType.MVT)

            b = header_bounds(h)
            west, south, east, north = b
            south = clamp_wm_lat(south)
            north = clamp_wm_lat(north)
            bounds[0] = min(bounds[0], west)
            bounds[1] = min(bounds[1], south)
            bounds[2] = max(bounds[2], east)
            bounds[3] = max(bounds[3], north)

            for z in range(zmin, zmax + 1):
                for tile in mercantile.tiles(west, south, east, north, zooms=(z,)):
                    data = reader.get(z, tile.x, tile.y)
                    if not data:
                        continue
                    try:
                        raw = gzip.decompress(data)
                        mvt = decode(raw)
                    except Exception as e:
                        print(f"  decode error {z}/{tile.x}/{tile.y}: {e}")
                        continue

                    tile_id = zxy_to_tileid(z, tile.x, tile.y)
                    for layer_name, layer in mvt.items():
                        features = layer.get("features", [])
                        if not features:
                            continue
                        for target in target_layers:
                            tile_features[tile_id][target].extend(features)
                            if target not in tile_extents[tile_id]:
                                tile_extents[tile_id][target] = layer.get("extent", 4096)

    if not tile_features:
        print("Error: no tiles found")
        return

    if unmapped:
        print(f"\nSkipped {len(unmapped)} unmapped files:")
        for name in unmapped[:10]:
            print(f"  {name}")
        if len(unmapped) > 10:
            print(f"  ... and {len(unmapped) - 10} more")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "wb") as dst:
        writer = Writer(dst)
        for tile_id in sorted(tile_features.keys()):
            layers = tile_features[tile_id]
            encoded_layers = {}
            for layer_name, features in layers.items():
                if not features:
                    continue
                encoded_layers[layer_name] = {
                    "name": layer_name,
                    "features": features,
                    "extent": tile_extents[tile_id][layer_name],
                }
            if not encoded_layers:
                continue
            try:
                tile_bytes = encode(list(encoded_layers.values()))
            except Exception as e:
                print(f"  encode error tile {tile_id}: {e}")
                continue
            compressed = gzip.compress(tile_bytes)
            writer.write_tile(tile_id, compressed)

        writer.finalize(
            header={
                "min_zoom": min_zoom,
                "max_zoom": max_zoom,
                "min_lon_e7": int(bounds[0] * 1e7),
                "min_lat_e7": int(bounds[1] * 1e7),
                "max_lon_e7": int(bounds[2] * 1e7),
                "max_lat_e7": int(bounds[3] * 1e7),
                "center_zoom": max_zoom,
                "center_lon_e7": int((bounds[0] + bounds[2]) / 2 * 1e7),
                "center_lat_e7": int((bounds[1] + bounds[3]) / 2 * 1e7),
                "tile_compression": tile_compression,
                "tile_type": tile_type,
            },
            metadata={"name": "Navy Chart", "type": "overlay", "version": "1.0"},
        )

    print(
        f"\nDone! {OUTPUT_FILE} ({os.path.getsize(OUTPUT_FILE) / (1024 * 1024):.2f} MB)"
    )
    print(f"  Total tiles: {len(tile_features)}")
    print(f"  Zoom: {min_zoom} - {max_zoom}")
    print(f"  Bounds: {bounds}")


if __name__ == "__main__":
    merge()
