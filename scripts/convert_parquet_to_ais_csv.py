"""
将 output/merged_feichang_ships_2021-10-01_2021-10-31.parquet
转换为 public/data/ais.csv.gz，替换前端现有数据。
"""
from pathlib import Path

import pandas as pd

PARQUET_PATH = Path("e:/term/navi_navy/output/merged_feichang_ships_2021-10-01_2021-10-31.parquet")
OUTPUT_PATH = Path("e:/term/navi_navy/public/data/ais.csv.gz")


def main():
    if not PARQUET_PATH.exists():
        raise FileNotFoundError(f"找不到 Parquet: {PARQUET_PATH}")

    df = pd.read_parquet(PARQUET_PATH)

    # 转换为 UTC 时间戳（秒）
    df["Timestamp (Unix)"] = (df["timestamp_ms"] // 1000).astype(int)

    # 生成 ISO 时间字符串
    df["Timestamp (ISO)"] = pd.to_datetime(df["timestamp_ms"], unit="ms", utc=True).dt.strftime(
        "%Y-%m-%dT%H:%M:%S.000Z"
    )

    # 生成 Date 和 Time (UTC)
    utc_dt = pd.to_datetime(df["timestamp_ms"], unit="ms", utc=True)
    df["Date"] = utc_dt.dt.strftime("%Y/%m/%d")
    df["Time (UTC)"] = utc_dt.dt.strftime("%H:%M.%S")

    # 重命名列为旧格式
    output_df = pd.DataFrame(
        {
            "MMSI": df["mmsi"].astype(int),
            "Latitude": df["lat"],
            "Longitude": df["lon"],
            "Speed Over Ground (SOG)": df["sog"],
            "Course Over Ground (COG)": df["cog"],
            "True Heading": df["heading"],
            "Navigational Status": df["status"].astype(int),
            "Timestamp (Unix)": df["Timestamp (Unix)"],
            "Timestamp (ISO)": df["Timestamp (ISO)"],
            "Date": df["Date"],
            "Time (UTC)": df["Time (UTC)"],
        }
    )

    # 按时间排序
    output_df = output_df.sort_values("Timestamp (Unix)").reset_index(drop=True)

    # 输出 gzip 压缩 CSV
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    output_df.to_csv(
        OUTPUT_PATH,
        index=False,
        compression="gzip",
        encoding="utf-8",
    )

    raw_size = len(output_df.to_csv(index=False).encode("utf-8"))
    gz_size = OUTPUT_PATH.stat().st_size

    print("转换完成:")
    print(f"  源 Parquet: {PARQUET_PATH}")
    print(f"  输出: {OUTPUT_PATH}")
    print(f"  记录数: {len(output_df):,}")
    print(f"  原始 CSV 大小: {raw_size / 1024 / 1024:.2f} MB")
    print(f"  gzip 后大小: {gz_size / 1024 / 1024:.2f} MB")
    print(f"  压缩比: {gz_size / raw_size * 100:.1f}%")
    print(f"  时间范围: {output_df['Timestamp (ISO)'].iloc[0]} ~ {output_df['Timestamp (ISO)'].iloc[-1]}")


if __name__ == "__main__":
    main()
