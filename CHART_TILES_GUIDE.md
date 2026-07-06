# S-57 海图 → PMTiles 发布指南

## 项目结构

```
e:/term/navi_navy/
├── shp/                          # 182个S-57 SHP文件
├── scripts/
│   └── shp_to_pmtiles.py       # Python转换脚本
├── public/
│   ├── pmtiles/                  # 输出目录
│   │   ├── navy_chart.pmtiles  # 最终瓦片文件
│   │   └── layer_info.json     # 图层信息
│   └── styles/
│       └── s52-chart.json        # S-52标准样式
├── src/pages/
│   └── Console.tsx             # 地图页面（已集成PMTiles）
└── package.json
```

## 环境准备

### 1. Python 依赖
```bash
pip install pyshp geojson
```

### 2. 安装 tippecanoe（生成MBTiles）

**Windows (WSL2 / Docker):**
```bash
# Docker方式
docker run --rm -it -v $(pwd):/data protomaps/tippecanoe:latest
```

**macOS:**
```bash
brew install tippecanoe
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install tippecanoe
```

### 3. 安装 pmtools CLI
```bash
# 需要 Go 环境
go install github.com/protomaps/go-pmtiles/pmtiles@latest

# 或下载预编译二进制
# https://github.com/protomaps/go-pmtiles/releases
```

## 转换步骤

### 步骤 1: SHP → GeoJSON
```bash
cd e:/term/navi_navy
python scripts/shp_to_pmtiles.py
```

脚本会自动：
1. 按 S-52 标准将 182 个 SHP 分类为 40+ 个逻辑图层
2. 将每个 SHP 转为 GeoJSON
3. 合并同图层 GeoJSON

### 步骤 2: GeoJSON → MBTiles
脚本会自动调用 `tippecanoe` 生成 MBTiles。如果 tippecanoe 未安装，可以手动：

```bash
# 示例：为每个图层生成MBTiles
for geojson in .temp_tiles/*.geojson; do
    name=$(basename $geojson .geojson)
    tippecanoe -o .temp_tiles/${name}.mbtiles \
        --minimum-zoom=6 --maximum-zoom=14 \
        --drop-densest-as-needed \
        --layer=$name \
        $geojson
done

# 合并所有MBTiles
tile-join -o .temp_tiles/navy_chart.mbtiles \
    --no-tile-compression \
    .temp_tiles/*.mbtiles
```

### 步骤 3: MBTiles → PMTiles
```bash
pmtiles convert .temp_tiles/navy_chart.mbtiles public/pmtiles/navy_chart.pmtiles
```

## 图层分类说明

| 图层组 | S-57 代码 | 几何类型 | 说明 |
|--------|-----------|----------|------|
| depth_areas | DEPARE, DMPGRD, SBDARE | Polygon | 深度区域 |
| depth_contours | DEPCNT | Line | 等深线 |
| soundings | SOUNDG | Point | 测深点 |
| land_areas | LNDARE, LNDRGN, BUAARE... | Polygon | 陆地 |
| coastline | COALNE | Line | 海岸线 |
| fairways | FAIRWY | Polygon | 航道 |
| fairways_line | NAVLNE, RECTRC | Line | 导航线 |
| roads | ROADWY, RAILWY, CAUSWY | Line | 道路 |
| rivers | RIVERS | Line | 河流 |
| obstructions | OBSTRN, UWTROC | Point | 障碍物 |
| wrecks | WRECKS | Point | 沉船 |
| buoys | BOYCAR, BOYISD, BOYLAT, BOYSPP | Point | 浮标 |
| beacons | BCNSPP | Point | 立标 |
| lights | LIGHTS | Point | 灯塔 |
| anchorages | ACHARE | Polygon | 锚地 |
| restricted_areas | RESARE, CTNARE | Polygon | 限制区 |
| ... | ... | ... | ... |

完整分类见 `scripts/shp_to_pmtiles.py` 中的 `S52_LAYERS` 字典。

## 前端集成

已修改 `src/pages/Console.tsx`：

1. **注册 PMTiles Protocol**
   ```typescript
   import { Protocol } from 'pmtiles'
   const protocol = new Protocol()
   maplibregl.addProtocol('pmtiles', protocol.tile)
   ```

2. **添加海图源**
   ```typescript
   'navy-chart': {
     type: 'vector',
     url: 'pmtiles://navy_chart.pmtiles',
   }
   ```

3. **加载 S-52 样式**
   从 `/styles/s52-chart.json` 动态加载图层样式

4. **图层切换按钮**
   顶部菜单栏新增 "ENC" 按钮，可切换海图显示/隐藏

## S-52 样式标准

样式文件 `public/styles/s52-chart.json` 遵循 IHO S-52 标准：

- **深水区**: `#A6D8F0` (蓝)
- **浅水区**: `#E8F4FC` (浅蓝)
- **陆地**: `#F5E6C8` (米黄)
- **等深线**: `#2E7D8A` (深青)
- **海岸线**: `#4A3728` (深棕)
- **航道**: `#1A5F8A` (深蓝虚线)
- **浮标**: 按形状分类颜色
- **灯塔**: `#FFD700` (金黄)
- **障碍物**: `#8B0000` (暗红)
- **限制区**: `#F5D5D5` (浅红) + 虚线边框

## 部署

### Vercel 部署
```bash
npm run build
vercel --prod
```

PMTiles 文件会自动包含在构建输出中（位于 `public/` 目录）。

### 文件大小优化
如果 PMTiles 文件过大：
1. 调整 `tippecanoe` 参数：`--drop-densest-as-needed`
2. 限制 zoom 范围：`--minimum-zoom=8 --maximum-zoom=12`
3. 简化几何：`--simplification=10`

## 常见问题

**Q: tippecanoe 在 Windows 上无法运行？**
A: 使用 WSL2 或 Docker。推荐 WSL2：
```bash
wsl --install
# 在 WSL 中安装 tippecanoe
sudo apt-get update && sudo apt-get install tippecanoe
```

**Q: 中文属性乱码？**
A: 脚本已使用 GBK 编码读取 DBF，如仍乱码可修改 `shp_to_geojson` 函数中的编码参数。

**Q: 瓦片加载失败？**
A: 检查：
1. `pmtiles` 包是否已安装 (`npm list pmtiles`)
2. `navy_chart.pmtiles` 是否在 `public/pmtiles/` 目录
3. 浏览器控制台是否有 CORS 错误

## 参考

- [PMTiles 规范](https://github.com/protomaps/PMTiles)
- [IHO S-52 标准](https://iho.int/uploads/user/pubs/standards/s-52/S-52_e5.0.pdf)
- [S-57 对象目录](https://www.s-57.com)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
