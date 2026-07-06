# 动手实践：用 PMTiles + MapLibre GL 搭建一个纯前端的自定义矢量地图服务

> 这是一份面向工程师的“可借鉴操作”指南。不需要 PostGIS、不需要 TileServer、不需要服务器。读完可以直接动手：把任意矢量数据变成 PMTiles 文件，再用 MapLibre GL 在浏览器里渲染出来。

---

## 目录

1. 为什么选 PMTiles？
2. 准备数据：GeoJSON / SHP / MBTiles 都可以
3. 生成 PMTiles 的三种方式
4. 检查 PMTiles：看看里面有什么
5. 前端项目结构
6. 注册 `pmtiles` 协议（关键一步）
7. 在 MapLibre 里加载 PMTiles
8. 编写 Style JSON：让图层有颜色、有标注
9. 常见的坑和排错
10. 部署上线

---

## 一、为什么选 PMTiles？

传统 Web 地图通常长这样：

```
PostgreSQL + PostGIS → TileServer GL / MapProxy → 前端 {z}/{x}/{y}.pbf
```

好处是强大，坏处是重：要运维数据库、瓦片服务、缓存、HTTPS 等。

**PMTiles 提供了一条更轻的路：**

```
源数据 → tippecanoe → output.pmtiles → 放到 public/ → 前端直接读取
```

它的本质是：把所有 MVT 瓦片打包到一个文件里，外加一个索引 header，让前端可以通过 HTTP Range 请求随机读取任意瓦片。

优势：

- **单文件**：便于版本管理、CDN 分发、Git 托管。
- **纯静态**：丢到 OSS / GitHub Pages / Cloudflare Pages 即可。
- **省带宽**：前端只请求当前视野需要的瓦片。
- **兼容 MapLibre / Mapbox GL**：体验与标准矢量瓦片无异。

适合场景：

- 区域级数据可视化（城市、园区、航线、海图）
- 原型验证 / 内网离线部署
- 数据量不大但需要复杂矢量样式的项目

不适合：

- 全球级高频更新的底图（仍需 TileServer + 缓存）

---

## 二、准备数据

PMTiles 支持标准 MVT 格式作为输入。你可以从以下数据开始：

| 数据格式 | 转换方式 |
|---------|---------|
| GeoJSON | `tippecanoe` 直接生成 PMTiles |
| Shapefile | `ogr2ogr` 先转 GeoJSON，再 `tippecanoe` |
| GeoPackage | `ogr2ogr` 或 `tippecanoe` 直接读 |
| MBTiles | `pmtiles convert` 转换 |

### 2.1 示例：用 GeoJSON 生成 PMTiles

假设你有一个 `cities.geojson`：

```bash
tippecanoe \
  -o cities.pmtiles \
  --minimum-zoom=0 \
  --maximum-zoom=14 \
  --drop-fraction-as-needed \
  --extend-zooms-if-still-dropping \
  cities.geojson
```

参数含义：

- `-o`：输出文件
- `--minimum-zoom` / `--maximum-zoom`：瓦片层级范围
- `--drop-fraction-as-needed`：高密度时自动抽稀
- `--extend-zooms-if-still-dropping`：如果低层放不下，自动增加高层级

### 2.2 示例：SHP 批量生成

```bash
for shp in shp/*.shp; do
  tippecanoe -o "pmtiles/$(basename $shp .shp).pmtiles" "$shp"
done
```

Windows 下可用 Python 的 `subprocess` 循环处理。

---

## 三、合并多个 PMTiles（可选）

当你有多个 PMTiles 文件时，通常希望合成一个文件，方便前端管理。

**注意：不要直接文件拼接，因为同一块瓦片可能包含多个图层。**

正确做法是按 MVT 图层合并：

```python
from pmtiles.reader import Reader, MmapSource
from pmtiles.writer import Writer
from pmtiles.tile import zxy_to_tileid, Compression, TileType
from mapbox_vector_tile import decode, encode
import gzip
from collections import defaultdict

def merge_pmtiles(inputs, output, layer_rename=None):
    """合并多个 PMTiles 文件，按 MVT 图层合并。"""
    layer_rename = layer_rename or {}
    merged = defaultdict(lambda: defaultdict(dict))  # tile_id -> layer_name -> layer
    bounds = None
    min_zoom = 20
    max_zoom = 0
    compression = Compression.GZIP

    for src in inputs:
        f = open(src, "rb")
        reader = Reader(MmapSource(f))
        h = reader.header()

        min_zoom = min(min_zoom, h["min_zoom"])
        max_zoom = max(max_zoom, h["max_zoom"])
        compression = h.get("tile_compression", Compression.GZIP)

        b = h["bounds"]
        if bounds is None:
            bounds = [b[0], b[1], b[2], b[3]]
        else:
            bounds = [
                min(bounds[0], b[0]), min(bounds[1], b[1]),
                max(bounds[2], b[2]), max(bounds[3], b[3]),
            ]

        for z in range(h["min_zoom"], h["max_zoom"] + 1):
            for x in range(2 ** z):
                for y in range(2 ** z):
                    data = reader.get(z, x, y)
                    if not data:
                        continue

                    raw = gzip.decompress(data) if compression == Compression.GZIP else data
                    tile = decode(raw)

                    for layer_name, layer in tile.items():
                        new_name = layer_rename.get(layer_name, layer_name)
                        if new_name:
                            tile_id = zxy_to_tileid(z, x, y)
                            merged[tile_id][new_name] = layer
        f.close()

    # 写入合并后的文件
    with open(output, "wb") as out_f:
        writer = Writer(out_f)

        for tile_id, layers in merged.items():
            layer_list = []
            for name, layer in layers.items():
                layer_list.append({
                    "name": name,
                    "features": layer["features"],
                    "extent": layer.get("extent", 4096),
                })

            tile_bytes = encode(layer_list)
            compressed = gzip.compress(tile_bytes)
            writer.write_tile(tile_id, compressed)

        writer.finalize(
            {
                "min_zoom": min_zoom,
                "max_zoom": max_zoom,
                "bounds": bounds,
                "tile_compression": compression,
                "tile_type": TileType.MVT,
            },
            {}  # metadata
        )

# 使用示例
merge_pmtiles(
    ["a.pmtiles", "b.pmtiles", "c.pmtiles"],
    "merged.pmtiles",
    layer_rename={
        "ACHARE_R": "anchorages",
        "DEPARE_R": "depth_areas",
        "LIGHTS_P": "lights",
    }
)
```

这段代码可以直接复制修改后使用。注意依赖：

```bash
pip install pmtiles mapbox-vector-tile
```

---

## 四、检查 PMTiles

合并或生成后，先检查文件里到底有什么：

```bash
# 查看 PMTiles 元数据
pmtiles show merged.pmtiles

# 查看有哪些图层
pmtiles tile merged.pmtiles 0 0 0 | gunzip | mapbox-vector-tile-debug
```

Python 版检查脚本：

```python
from pmtiles.reader import Reader, MmapSource
import gzip
from mapbox_vector_tile import decode

path = "merged.pmtiles"
f = open(path, "rb")
reader = Reader(MmapSource(f))
print(reader.header())

# 找一个非空瓦片看看图层
for z in range(0, 15):
    for x in range(2 ** z):
        for y in range(2 ** z):
            data = reader.get(z, x, y)
            if data:
                raw = gzip.decompress(data)
                tile = decode(raw)
                print(f"Tile {z}/{x}/{y} layers:", list(tile.keys()))
                f.close()
                exit()
```

确认 `source-layer` 名称，因为后面写样式要用到。

---

## 五、前端项目结构

推荐用 Vite + React + MapLibre GL：

```
my-map-app/
├── public/
│   ├── pmtiles/
│   │   └── merged.pmtiles       ← 瓦片数据
│   └── styles/
│       └── my-style.json        ← 地图样式
├── src/
│   ├── pages/
│   │   └── Map.tsx              ← 地图组件
│   └── App.tsx
├── package.json
└── vite.config.ts
```

安装依赖：

```bash
npm install maplibre-gl pmtiles
```

---

## 六、注册 `pmtiles` 协议（关键一步）

MapLibre 不原生认识 `pmtiles://`，需要手动注册。而且**必须在 `new maplibregl.Map()` 之前注册**，否则 style 解析时会报错。

```tsx
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'

export default function MapPage() {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!container.current || map.current) return

    let cleanup: (() => void) | null = null

    const init = async () => {
      // 1. 注册 PMTiles 协议
      const { Protocol } = await import('pmtiles')
      const protocol = new Protocol()
      maplibregl.addProtocol('pmtiles', protocol.tile)
      cleanup = () => maplibregl.removeProtocol('pmtiles')

      // 2. 创建地图
      map.current = new maplibregl.Map({
        container: container.current!,
        style: {
          version: 8,
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          sources: {
            'basemap': {
              type: 'raster',
              tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap © CARTO',
            },
            'my-data': {
              type: 'vector',
              url: 'pmtiles://pmtiles/merged.pmtiles',
              minzoom: 0,
              maxzoom: 14,
            },
          },
          layers: [
            {
              id: 'basemap-layer',
              type: 'raster',
              source: 'basemap',
            },
          ],
        },
        center: [116.4074, 39.9042],
        zoom: 10,
      })

      // 3. 加载自定义样式
      map.current.on('load', async () => {
        const res = await fetch('/styles/my-style.json')
        const style = await res.json()
        style.layers.forEach((layer: any) => {
          if (!map.current!.getLayer(layer.id)) {
            map.current!.addLayer(layer)
          }
        })
      })
    }

    init()

    return () => {
      cleanup?.()
      map.current?.remove()
      map.current = null
    }
  }, [])

  return <div ref={container} style={{ width: '100%', height: '100vh' }} />
}
```

---

## 七、编写 Style JSON

Style JSON 控制图层颜色、线宽、标注、过滤条件等。核心是 `source-layer` 要与 PMTiles 里的图层名一致。

### 7.1 简单示例

```json
{
  "version": 8,
  "sources": {
    "my-data": {
      "type": "vector",
      "url": "pmtiles://pmtiles/merged.pmtiles"
    }
  },
  "layers": [
    {
      "id": "areas",
      "type": "fill",
      "source": "my-data",
      "source-layer": "depth_areas",
      "paint": {
        "fill-color": "#a5bfdd",
        "fill-opacity": 0.5
      }
    },
    {
      "id": "points",
      "type": "circle",
      "source": "my-data",
      "source-layer": "lights",
      "paint": {
        "circle-radius": 6,
        "circle-color": "#ffcc00",
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff"
      }
    },
    {
      "id": "labels",
      "type": "symbol",
      "source": "my-data",
      "source-layer": "lights",
      "layout": {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Regular"],
        "text-offset": [0, 1.2],
        "text-anchor": "top"
      },
      "paint": {
        "text-color": "#333"
      }
    }
  ]
}
```

### 7.2 按属性分类渲染

```json
{
  "id": "depth_areas",
  "type": "fill",
  "source": "my-data",
  "source-layer": "depth_areas",
  "paint": {
    "fill-color": [
      "match",
      ["get", "depth_type"],
      "deep", "#1a5b8c",
      "shallow", "#a5bfdd",
      "intertidal", "#e6d7b8",
      "#cccccc"
    ]
  }
}
```

### 7.3 图层过滤

```json
{
  "id": "important-lights",
  "type": "circle",
  "source": "my-data",
  "source-layer": "lights",
  "filter": [">=", ["get", "intensity"], 5],
  "paint": {
    "circle-color": "red"
  }
}
```

---

## 八、常见的坑和排错

### 8.1 `pmtiles://` 协议未注册

**现象**：地图白屏，控制台报错 `Unknown protocol: pmtiles` 或 `source url invalid`。

**原因**：`new maplibregl.Map()` 在 `addProtocol('pmtiles', ...)` 之前执行。

**解决**：按第六节的顺序，先 `addProtocol`，再 `new Map`。

### 8.2 `source-layer` 不匹配

**现象**：图层加了但看不见。

**原因**：style 里的 `source-layer` 和 PMTiles 里的图层名不一致。

**解决**：用第四节脚本打印实际图层名，再对齐 style。

### 8.3 文字不显示

**现象**：`symbol` 图层没有文字。

**原因**：没配置 `glyphs` 字体源。

**解决**：在 style 顶层加：

```json
"glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
```

或换成自己的字体服务。

### 8.4 PMTiles 路径错误

**现象**：请求 404，文件加载失败。

**原因**：Vite 中 `public/pmtiles/merged.pmtiles` 对应 URL 是 `/pmtiles/merged.pmtiles`，所以 style 里要写：

```
pmtiles://pmtiles/merged.pmtiles
```

而不是 `pmtiles://merged.pmtiles`。

### 8.5 瓦片最大/最小 zoom 不对

**现象**：缩放到某级别后数据消失或加载失败。

**原因**：`source` 的 `minzoom` / `maxzoom` 与 PMTiles 实际不一致。

**解决**：用 `pmtiles show` 查看实际层级，前端配置对齐。

### 8.6 合并后文件丢失图层

**现象**：合并后只剩一个图层。

**原因**：简单文件拼接导致同 tile 被覆盖。

**解决**：使用第三节的 MVT 图层级合并脚本。

---

## 九、部署上线

### 9.1 构建

```bash
npm run build
```

Vite 会把 `public/` 下的文件原样复制到 `dist/`，所以 PMTiles 文件会被打包进去。

### 9.2 部署到任意静态托管

| 平台 | 命令/方式 |
|-----|----------|
| GitHub Pages | `gh-pages -d dist` |
| Vercel | `vercel --prod` |
| Cloudflare Pages | 拖放 `dist/` |
| OSS / S3 | `aws s3 sync dist/ s3://bucket` |
| 内网 Nginx | 把 `dist/` 挂到根目录 |

### 9.3 启用 HTTP Range 请求

PMTiles 依赖 HTTP `Range` 请求头来读取文件片段。如果部署后地图不加载，检查服务器是否支持 Range。

Nginx 配置示例：

```nginx
location /pmtiles/ {
    add_header Accept-Ranges bytes;
}
```

---

## 十、完整操作清单

复制下面这个清单，一步步跟着做：

```markdown
[ ] 1. 准备数据：GeoJSON / SHP / MBTiles
[ ] 2. 安装 tippecanoe：brew install tippecanoe（或下载 release）
[ ] 3. 生成 PMTiles：tippecanoe -o out.pmtiles input.geojson
[ ] 4. 如需合并多个文件，用第三节 Python 脚本
[ ] 5. 检查 PMTiles 图层名：用 pmtiles show 或 Python 检查脚本
[ ] 6. 创建 Vite + React + MapLibre 项目
[ ] 7. 安装依赖：npm install maplibre-gl pmtiles
[ ] 8. 把 PMTiles 放到 public/pmtiles/
[ ] 9. 编写 public/styles/my-style.json
[ ] 10. 在 Map.tsx 中注册 pmtiles 协议并创建地图
[ ] 11. 配置 source URL 为 pmtiles://pmtiles/xxx.pmtiles
[ ] 12. 确保 style 中有 glyphs 字段
[ ] 13. npm run dev 本地验证
[ ] 14. npm run build 检查构建
[ ] 15. 部署，并确认服务器支持 Range 请求
```

---

## 结语

PMTiles + MapLibre GL 是一个被低估的组合。它把过去需要一整条后端链路才能做的事情，压缩成“生成一个文件、写一个前端配置”这两步。对于数据可控、场景聚焦的项目来说，这是目前最干净、最容易上手的矢量地图方案之一。

希望这份指南能帮你少踩几个坑。如果你已经动手做出来了，欢迎分享你的成果。
