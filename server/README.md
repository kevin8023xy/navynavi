# Ship Tracks 后端服务

Node.js + Express 后端，读取 CSV 数据提供 REST API 给前端。

## 快速启动

```bash
cd server
npm install
npm start
```

默认监听 `http://localhost:5000`

---

## API 说明

### 健康检查

```
GET /api/health
```

返回数据总量和船只数量。

### 船只列表

```
GET /api/ships
```

返回所有不重复的 MMSI 及其最后已知位置。

### 拉取轨迹（核心接口）

```
GET /api/tracks
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `mmsi` | string | 指定船只 MMSI，逗号分隔可多选 |
| `start_time` | int | Unix 时间戳（包含） |
| `end_time` | int | Unix 时间戳（包含） |
| `page` | int | 页码，默认 `1` |
| `page_size` | int | 每页条数，默认 `500`，最大 `5000` |
| `bbox` | string | 空间范围筛选，格式 `minLat,maxLat,minLng,maxLng` |

**返回格式:**

```json
{
  "total": 207803,
  "page": 1,
  "page_size": 5000,
  "data": [
    {
      "mmsi": 412226207,
      "lat": 40.154306,
      "lng": 121.79988,
      "sog": 0.1,
      "cog": 55,
      "heading": 511,
      "status": 15,
      "timestamp": 1633046400,
      "iso": "2021-10-01T00:00:00.000Z"
    }
  ]
}
```

---

## 前端调用示例

前端已配置 Vite proxy，直接请求 `/api` 即可：

```typescript
// 获取所有船只
fetch('/api/ships').then(r => r.json()).then(console.log);

// 分页拉取 00:00 ~ 00:10 的轨迹
fetch('/api/tracks?start_time=1633046400&end_time=1633047000&page=1&page_size=5000')
  .then(r => r.json()).then(console.log);
```

## 数据结构

| CSV 字段 | API 字段 | 说明 |
|----------|----------|------|
| MMSI | mmsi | 船舶唯一标识 |
| Latitude | lat | 纬度 |
| Longitude | lng | 经度 |
| Speed Over Ground (SOG) | sog | 对地速度 |
| Course Over Ground (COG) | cog | 对地航向 |
| True Heading | heading | 真航向 |
| Navigational Status | status | 航行状态 |
| Timestamp (Unix) | timestamp | Unix 时间戳 |
| Timestamp (ISO) | iso | ISO 时间字符串 |


