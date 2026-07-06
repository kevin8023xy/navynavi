# 从 S-57 海图到 Web PMTiles 服务：一套完整的轻量级海图地图方案

> 最近在做一个航海可视化项目，需要把 ENC（电子海图）数据搬到浏览器里。传统方案动辄上 GDAL + PostGIS + TileServer，太笨重。我尝试了一条更轻量的路线：用 Python 把 Shapefile 转成 PMTiles，再用 MapLibre GL 直接在前端加载。整个过程踩了不少坑，但效果还不错。下面把完整思路和实践过程分享出来。

---

## 一、目标与思路

### 1.1 项目目标

- 将 S-57 / Shapefile 形式的海图数据渲染到网页地图上。
- 不使用重型后端服务，能部署在任意静态托管（Vite + GitHub Pages / OSS / EOP 等）即可。
- 保留 S-52 海图符号语义：深度区（`DEPARE`）、锚地（`ACHARE`）、灯浮标（`LIGHTS`）、航道等。

### 1.2 整体架构

```
S-57 SHP → tippecanoe / pmtiles-py → .pmtiles → MapLibre GL + pmtiles Protocol
                ↓
        React + Vite + s52-chart.json
```

核心思路：

- **PMTiles** 把 MVT 矢量瓦片打包成单个文件，可放 `public/` 下，由前端直接读取。
- **MapLibre GL** 加载 `pmtiles://...` 矢量源，配合 `style.json` 按图层定义 S-52 样式。
- 批量 SHP 用 Python 脚本生成独立 PMTiles 后再**合并**，避免手动处理上百个文件。

---

## 二、从 SHP 到单个 PMTiles 文件

### 2.1 数据准备：S-57 导出为 Shapefile

海图原始数据通常是 S-57 `.000` 格式。通过 ogr2ogr 或海图软件导出后，得到一堆按物标类别命名的 Shapefile：

```
shp/
├── C1511521_50000_ACHARE_R.shp   # 锚地区域
├── C1511521_50000_DEPARE_R.shp   # 深度区域
├── C1511521_50000_LIGHTS_P.shp   # 灯标/浮标
├── C1511521_50000_LNDARE_R.shp   # 陆地
├── ...
```

每个文件对应一个 S-57 物标类（Object Class），后缀 `_R` 表示区域面、`_P` 表示点、`_L` 表示线。

### 2.2 SHP 转单个 PMTiles

这里我用了 `tippecanoe` 风格的 `pmtiles` Python 库，为每个 SHP 生成一个 PMTiles 文件：

```python
import subprocess
import os
from pathlib import Path

SHP_DIR = Path("shp")
PMTILES_DIR = Path("pmtiles")
PMTILES_DIR.mkdir(exist_ok=True)

for shp in SHP_DIR.glob("*.shp"):
    out = PMTILES_DIR / f"{shp.stem}.pmtiles"
    subprocess.run([
        "tippecanoe",
        "-zg",                       # 自动推断最大 zoom
        "--drop-fraction-as-needed",
        "--extend-zooms-if-still-dropping",
        "-o", str(out),
        str(shp),
    ], check=True)
```

也可以直接用 `pmtiles` 库的 Python API 操作，但 tippecanoe 更成熟稳定，适合首次处理。

运行后得到 `pmtiles/` 目录下的 182 个 `.pmtiles` 文件。

---

## 三、真正的难点：合并多个 PMTiles

### 3.1 为什么不能直接拼接？

最初我以为合并 PMTiles 就是把多个文件的字节拼起来，或者选其中一个文件。后来才发现：

> 同一块瓦片（z/x/y）里可能包含多个物标图层。如果简单覆盖，只能保留最后一个文件的内容，其他图层会丢失。

比如：某一瓦片内同时存在 `DEPARE_R`（深度面）和 `LIGHTS_P`（灯标）。两个文件各自编码了该瓦片，覆盖合并只会剩下一个图层。

### 3.2 正确做法：按 MVT 图层合并

PMTiles 的底层是 Gzip 压缩的 MVT（Mapbox Vector Tile）。合并时应该：

1. 读取每个 PMTiles 的 header，获取 `bounds`、`min_zoom`、`max_zoom`、`tile_compression`、`tile_type`。
2. 遍历所有文件的所有瓦片，Gzip 解压得到 MVT 字节。
3. 用 `mapbox-vector-tile` 解码每个瓦片，拿到其中的图层。
4. 把 S-57 图层名（如 `ACHARE_R`、`DEPARE_R`、`LIGHTS_P`）映射为 S-52 图层名（`anchorages`、`depth_areas`、`lights`）。
5. 同一目标瓦片内的所有图层合并后重新编码为 MVT，Gzip 压缩写回。
6. 用 `pmtiles.writer` 写入新的 `navy_chart.pmtiles`。

关键代码片段：

```python
from pmtiles.reader import Reader, MmapSource
from pmtiles.writer import Writer
from pmtiles.tile import zxy_to_tileid, Compression, TileType
from mapbox_vector_tile import decode, encode
import gzip

# 读取一个文件并返回所有非空瓦片数据
reader = Reader(MmapSource(open(src, "rb")))
header = reader.header()
zoom = header["min_zoom"]

for x in range(2 ** zoom):
    for y in range(2 ** zoom):
        tile_data = reader.get(zoom, x, y)
        if tile_data:
            raw = gzip.decompress(tile_data)
            tile = decode(raw)
            # tile: { "ACHARE_R": { "features": [...], "extent": 4096 } }
            for layer_name, layer in tile.items():
                s52_name = map_layer_name(layer_name)  # ACHARE_R -> anchorages
                if s52_name:
                    tile_id = zxy_to_tileid(zoom, x, y)
                    merged[tile_id][s52_name] = layer
```

合并编码时要注意：

```python
# 把 dict 转成 mapbox_vector_tile 期望的 list of layers
layers_list = []
for name, layer in merged[tile_id].items():
    layers_list.append({
        "name": name,
        "features": layer["features"],
        "extent": layer.get("extent", 4096),
    })

tile_bytes = encode(layers_list)
compressed = gzip.compress(tile_bytes)
writer.write_tile(tile_id, compressed)
```

### 3.3 最终合并结果

- 输入：182 个 PMTiles 文件
- 输出：`public/pmtiles/navy_chart.pmtiles`，约 **0.42 MB**
- 有效瓦片：6 个 tile（因为数据集中在局部区域）
- 合并后保留的 S-52 图层：`depth_areas`、`land`、`anchorages`、`lights` 等
- 未匹配图层：35 个（如 `M_COVR_R`、`TS_FEB_P` 等），不影响主要样式

---

## 四、前端加载：MapLibre + PMTiles Protocol

### 4.1 为什么用 PMTiles Protocol？

MapLibre GL 默认不支持 `pmtiles://` 协议，需要注册 `pmtiles` 协议的自定义 `tile` 加载器。必须**在地图实例化前**完成注册，否则样式加载会失败。

### 4.2 注册协议

```tsx
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

useEffect(() => {
  if (!mapContainer.current || map.current) return

  let protocolCleanup: (() => void) | null = null

  const init = async () => {
    // 1. 先注册 PMTiles 协议
    const { Protocol } = await import('pmtiles')
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)
    protocolCleanup = () => maplibregl.removeProtocol('pmtiles')

    // 2. 再创建地图
    const m = new maplibregl.Map({
      container: mapContainer.current!,
      style: { version: 8, ... },
      center: [121.863873, 40.242037],
      zoom: 9.5,
    })
    map.current = m
  }

  init()

  return () => {
    protocolCleanup?.()
    map.current?.remove()
    map.current = null
  }
}, [])
```

### 4.3 矢量源配置

```tsx
style: {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'raster-tiles': {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '...',
    },
    'navy-chart': {
      type: 'vector',
      url: 'pmtiles://pmtiles/navy_chart.pmtiles',
      attribution: 'S-57 ENC Data',
      minzoom: 0,
      maxzoom: 5,
    },
  },
  layers: [
    { id: 'simple-tiles', type: 'raster', source: 'raster-tiles', minzoom: 0, maxzoom: 19 },
  ],
},
```

> 注意：`pmtiles://pmtiles/navy_chart.pmtiles` 里的路径是相对于 Vite `public` 目录的静态资源路径。如果文件放在 `public/pmtiles/navy_chart.pmtiles`，URL 就要写成 `pmtiles://pmtiles/navy_chart.pmtiles`。

### 4.4 加载 S-52 海图样式

地图 `load` 后，再把 `public/styles/s52-chart.json` 中的图层动态加进去：

```tsx
m.on('load', async () => {
  const res = await fetch('/styles/s52-chart.json')
  const s52Style = await res.json()

  s52Style.layers.forEach((layer: any) => {
    if (!m.getLayer(layer.id)) {
      m.addLayer(layer)
    }
  })
})
```

`public/styles/s52-chart.json` 里定义了 S-52 图层：

```json
{
  "version": 8,
  "sources": {
    "navy-chart": {
      "type": "vector",
      "url": "pmtiles://pmtiles/navy_chart.pmtiles",
      "attribution": "S-57 ENC Data"
    }
  },
  "layers": [
    {
      "id": "depth_areas",
      "type": "fill",
      "source": "navy-chart",
      "source-layer": "depth_areas",
      "paint": {
        "fill-color": ["match", ["get", "depth_value"], "...", "...", "#a5bfdd"],
        "fill-opacity": 0.6
      }
    },
    {
      "id": "lights",
      "type": "circle",
      "source": "navy-chart",
      "source-layer": "lights",
      "paint": {
        "circle-radius": 4,
        "circle-color": "#ffcc00"
      }
    }
  ]
}
```

`source-layer` 必须与合并脚本输出的 S-52 图层名保持一致。

---

## 五、踩坑记录

### 5.1 PMTiles header 中的 `tile_compression` 和 `tile_type`

`pmtiles.writer` 默认写出的头里没有 `tile_type`，导致 `Reader` 解析时可能把 `Unknown` 当 `MVT`。合并输出时显式加上 `tile_type: TileType.MVT`，MapLibre 才能正确识别。

### 5.2 地图创建前必须注册协议

如果先把 `maplibregl.Map` 实例化，再 `addProtocol('pmtiles', ...)`，MapLibre 在解析 style 时找不到 `pmtiles://` 协议，会直接报错。必须放在 new Map 之前。

### 5.3 矢量字体 glyphs

S-52 样式里有文字标注，需要在 style 顶层加 `glyphs` 字段，否则标注不会显示。我用的是 MapLibre 官方 demo 字体：

```json
"glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
```

### 5.4 路由冲突：console.html vs /console

项目里原本有一个静态的 `console.html`，和 React Router 的 `/console` 路由冲突。在 Vite 开发服务器里，直接访问 `/console` 会命中静态文件而不是 React 路由。解决方式：把 `console.html` 重命名为 `console_legacy.html`，或者移出 public 目录。

---

## 六、最终效果

打开 `http://localhost:5173/console`，可以看到：

- CARTO 浅色底图作为基础底图
- S-57 ENC 深度区、陆地、锚地、灯浮标等海图图层叠加其上
- 构建通过，无 TypeScript 错误
- 整个服务可纯静态部署，无需后端瓦片服务器

---

## 七、文件清单

| 文件 | 说明 |
|------|------|
| `scripts/shp_to_pmtiles.py` | 批量 SHP → PMTiles |
| `scripts/merge_auto.py` | 合并多个 PMTiles 为单个 `navy_chart.pmtiles` |
| `public/pmtiles/navy_chart.pmtiles` | 合并后的海图瓦片包 |
| `public/styles/s52-chart.json` | S-52 海图图层样式 |
| `src/pages/Console.tsx` | React 控制台 + MapLibre 地图 |
| `console_legacy.html` | 旧版静态控制台（已保留备份） |

---

## 八、可以进一步做的优化

1. **更大范围海图**：目前只有局部 6 个瓦片，后续可扩展为全球或区域海图。
2. **属性驱动样式**：S-57 属性很丰富（如 `DRVAL1`、`COLOUR`、`STATUS`），可以在 `s52-chart.json` 里用 `match`/`get` 表达式做更精细的 S-52 符号化。
3. **PBF 字体本地化**：把海图字体放到 `public/fonts/` 下，避免依赖外部服务。
4. **交互增强**：点击灯浮标、航道显示 S-57 属性弹窗。

---

## 总结

这套方案的核心价值在于：

> **把一整套 S-57 海图数据流程，压缩成“一个 Python 脚本 + 一个 PMTiles 文件 + 一个 MapLibre 前端”的组合。**

不需要 PostGIS、不需要 TileServer、不需要服务器渲染。对于中小型航海可视化项目、原型验证、离线大屏场景非常合适。希望这篇分享能帮到同样在折腾海图 Web 化的同学。
