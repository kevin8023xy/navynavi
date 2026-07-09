"""
合并 "肥肠船数据" 目录下的所有单船 CSV 为一个按时间排序的总表。

每个 CSV 的列结构（无表头）如下：
    0  mmsi          船舶 MMSI（与文件名一致）
    1  lon           经度
    2  lat           纬度
    3  status        航行状态
    4  sog           对地航速（节）
    5  cog           对地航向（度）
    6  heading       船首向（度，511 表示无效）
    7  rot           转向率
    8  timestamp_ms  时间戳（Unix，毫秒）
    9  group_id      未知分组/批次号
    10 datetime      本地时间字符串

运行方式：
    python scripts/merge_feichang_csv.py
"""
import os
from pathlib import Path

import pandas as pd

INPUT_DIR = Path("e:/term/navi_navy/sourcedata/肥肠船数据")
OUTPUT_DIR = Path("e:/term/navi_navy/output")

# 默认截取 2021-10-01 00:00:00 UTC 到 2021-10-31 00:00:00 UTC（即包含整个 10 月 1 日~30 日）
START_DATE = "2021-10-01"
END_DATE = "2021-10-31"  # 左闭右开，不包含 10 月 31 日

CSV_OUTPUT_PATH = OUTPUT_DIR / f"merged_feichang_ships_{START_DATE}_{END_DATE}.csv"
PARQUET_OUTPUT_PATH = OUTPUT_DIR / f"merged_feichang_ships_{START_DATE}_{END_DATE}.parquet"



COLUMNS = [
    "mmsi",
    "lon",
    "lat",
    "status",
    "sog",
    "cog",
    "heading",
    "rot",
    "timestamp_ms",
    "group_id",
    "datetime",
]

DTYPE = {
    "mmsi": "Int64",
    "lon": "float64",
    "lat": "float64",
    "status": "Int64",
    "sog": "float64",
    "cog": "float64",
    "heading": "float64",
    "rot": "float64",
    "timestamp_ms": "Int64",
    "group_id": "Int64",
    "datetime": "str",
}


def load_csv(path: Path) -> pd.DataFrame:
    """读取单个无表头 CSV 并规范列名。"""
    df = pd.read_csv(
        path,
        header=None,
        names=COLUMNS,
        dtype=DTYPE,
        on_bad_lines="skip",
        engine="python",
    )
    # 把 Unix 毫秒时间戳转成 datetime，便于查看
    df["timestamp"] = pd.to_datetime(df["timestamp_ms"], unit="ms", utc=True)
    return df


def main():
    if not INPUT_DIR.exists():
        raise FileNotFoundError(f"输入目录不存在: {INPUT_DIR}")

    csv_files = sorted(INPUT_DIR.glob("*.csv"))
    if not csv_files:
        raise FileNotFoundError(f"在 {INPUT_DIR} 下没有找到 CSV 文件")

    print(f"发现 {len(csv_files)} 个 CSV 文件，开始合并...")

    chunks = []
    for f in csv_files:
        try:
            df = load_csv(f)
            chunks.append(df)
        except Exception as e:
            print(f"  [跳过] {f.name}: {e}")

    if not chunks:
        raise RuntimeError("没有成功读取任何 CSV")

    merged = pd.concat(chunks, ignore_index=True)

    # 按时间排序
    merged = merged.sort_values("timestamp_ms", ascending=True).reset_index(drop=True)

    # 按时间范围过滤
    start_ts = pd.Timestamp(START_DATE, tz="UTC").value // 10**6
    end_ts = pd.Timestamp(END_DATE, tz="UTC").value // 10**6
    filtered = merged[(merged["timestamp_ms"] >= start_ts) & (merged["timestamp_ms"] < end_ts)].copy()

    if filtered.empty:
        raise RuntimeError(f"在 {START_DATE} ~ {END_DATE} 范围内没有数据")

    # 输出 CSV
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filtered.to_csv(CSV_OUTPUT_PATH, index=False)

    # 输出 Parquet（更小的二进制列式格式，方便后端读取）
    try:
        filtered.to_parquet(PARQUET_OUTPUT_PATH, index=False, compression="zstd")
        parquet_ok = True
    except ImportError as e:
        print(f"\n  [Parquet 输出跳过] {e}")
        print("  如需生成 Parquet，请安装 pyarrow：python -m pip install pyarrow")
        parquet_ok = False

    # 打印基础统计
    print("\n合并完成:")
    print(f"  时间范围:   {START_DATE} ~ {END_DATE}（左闭右开）")
    print(f"  CSV 输出:   {CSV_OUTPUT_PATH}")
    print(f"  CSV 大小:   {CSV_OUTPUT_PATH.stat().st_size / 1024 / 1024:.2f} MB")
    if parquet_ok:
        print(f"  Parquet 输出: {PARQUET_OUTPUT_PATH}")
        print(f"  Parquet 大小: {PARQUET_OUTPUT_PATH.stat().st_size / 1024 / 1024:.2f} MB")
        print(f"  压缩比:     {PARQUET_OUTPUT_PATH.stat().st_size / CSV_OUTPUT_PATH.stat().st_size * 100:.1f}%")
    print(f"  总记录数:   {len(filtered):,}")
    print(f"  船舶数量:   {filtered['mmsi'].nunique()}")
    print(f"  时间范围:   {filtered['timestamp'].min()} ~ {filtered['timestamp'].max()}")


    # 简单示例：输出最早/最晚的 5 条记录
    print("\n最早 5 条:")
    print(filtered.head(5).to_string())
    print("\n最晚 5 条:")
    print(filtered.tail(5).to_string())


if __name__ == "__main__":
    main()

