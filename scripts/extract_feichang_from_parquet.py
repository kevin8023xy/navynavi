"""
从 output/merged_feichang_ships.parquet 全量数据中按时间范围提取子集，
生成与 merged_feichang_ships_2021-10-01_2021-10-31.csv 格式一致的 CSV/Parquet。

运行方式：
    python scripts/extract_feichang_from_parquet.py
"""
import os
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent

INPUT_PARQUET = PROJECT_ROOT / "output" / "merged_feichang_ships.parquet"
OUTPUT_DIR = PROJECT_ROOT / "output"

START_DATE = "2021-10-01"
END_DATE = "2021-11-30"  # 左闭右开，不包含 2021-12-01

CSV_OUTPUT_PATH = OUTPUT_DIR / f"merged_feichang_ships_{START_DATE}_{END_DATE}.csv"
PARQUET_OUTPUT_PATH = OUTPUT_DIR / f"merged_feichang_ships_{START_DATE}_{END_DATE}.parquet"


def main():
    if not INPUT_PARQUET.exists():
        raise FileNotFoundError(f"找不到全量 Parquet: {INPUT_PARQUET}")

    print(f"[extract] Reading {INPUT_PARQUET} ...")
    df = pd.read_parquet(INPUT_PARQUET)

    required_cols = {
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
        "timestamp",
    }
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Parquet 缺少列: {missing}")

    # 按时间范围过滤（左闭右开）
    start_ts = pd.Timestamp(START_DATE, tz="UTC").value // 10**6
    end_ts = (pd.Timestamp(END_DATE, tz="UTC") + pd.Timedelta(days=1)).value // 10**6
    filtered = df[(df["timestamp_ms"] >= start_ts) & (df["timestamp_ms"] < end_ts)].copy()

    if filtered.empty:
        raise RuntimeError(f"在 {START_DATE} ~ {END_DATE} 范围内没有数据")

    # 统一按时间排序
    filtered = filtered.sort_values("timestamp_ms", ascending=True).reset_index(drop=True)

    # 确保 timestamp 列为 UTC 字符串格式（与 merge_feichang_csv.py 输出保持一致）
    filtered["timestamp"] = pd.to_datetime(filtered["timestamp_ms"], unit="ms", utc=True).astype(str)

    # 保证列顺序一致
    output_columns = [
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
        "timestamp",
    ]
    filtered = filtered[output_columns]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 输出 CSV
    filtered.to_csv(CSV_OUTPUT_PATH, index=False, encoding="utf-8")

    # 输出 Parquet
    try:
        filtered.to_parquet(PARQUET_OUTPUT_PATH, index=False, compression="zstd")
        parquet_ok = True
    except ImportError as e:
        print(f"\n  [Parquet 输出跳过] {e}")
        print("  如需生成 Parquet，请安装 pyarrow：python -m pip install pyarrow")
        parquet_ok = False

    # 打印统计
    print("\n提取完成:")
    print(f"  时间范围: {START_DATE} ~ {END_DATE}（左闭右开）")
    print(f"  CSV 输出: {CSV_OUTPUT_PATH}")
    print(f"  CSV 大小: {CSV_OUTPUT_PATH.stat().st_size / 1024 / 1024:.2f} MB")
    if parquet_ok:
        print(f"  Parquet 输出: {PARQUET_OUTPUT_PATH}")
        print(f"  Parquet 大小: {PARQUET_OUTPUT_PATH.stat().st_size / 1024 / 1024:.2f} MB")
        print(f"  压缩比: {PARQUET_OUTPUT_PATH.stat().st_size / CSV_OUTPUT_PATH.stat().st_size * 100:.1f}%")
    print(f"  总记录数: {len(filtered):,}")
    print(f"  船舶数量: {filtered['mmsi'].nunique()}")
    ts_min = pd.to_datetime(filtered["timestamp_ms"].min(), unit="ms", utc=True)
    ts_max = pd.to_datetime(filtered["timestamp_ms"].max(), unit="ms", utc=True)
    print(f"  时间范围: {ts_min} ~ {ts_max}")

    print("\n最早 5 条:")
    print(filtered.head(5).to_string())
    print("\n最晚 5 条:")
    print(filtered.tail(5).to_string())


if __name__ == "__main__":
    main()
