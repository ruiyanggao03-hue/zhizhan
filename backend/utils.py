"""共享工具函数"""

import pandas as pd


def safe_float(val, default=0.0):
    """安全地将值转为浮点数，支持中文数字单位（万、亿、万亿）和百分号"""
    try:
        if pd.isna(val) or val == "" or str(val).strip() in ["-", "--", "NaN", "nan", "False", "None"]:
            return default
        val_str = str(val).replace(',', '').strip()
        if val_str.endswith('%'):
            return float(val_str[:-1])
        if '万亿' in val_str:
            return float(val_str.replace('万亿', '')) * 1e12
        if '亿' in val_str:
            return float(val_str.replace('亿', '')) * 1e8
        if '万' in val_str:
            return float(val_str.replace('万', '')) * 1e4
        return float(val_str)
    except (ValueError, TypeError):
        return default
