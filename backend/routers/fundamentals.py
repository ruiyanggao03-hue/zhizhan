import os
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'

import logging
import traceback
import requests
import pandas as pd
import akshare as ak
from fastapi import APIRouter, Depends
from sqlalchemy import create_engine
from auth.auth_middleware import get_current_user
from utils import safe_float

router = APIRouter(
    prefix="/api/fundamentals",
    tags=["财务基本面分析"],
    dependencies=[Depends(get_current_user)]
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = "sqlite:///financial_data.db"
engine = create_engine(DB_PATH)


def get_val_from_row(row, keys, default=0.0):
    if row is None or row.empty: return default
    for k in keys:
        if k in row and pd.notna(row[k]) and str(row[k]).strip() not in ["", "-", "--", "NaN", "nan", "None"]:
            return safe_float(row[k])
    return default

# =====================================================================
# 绝对阈值评分：基于金融行业通用标准，零额外网络请求
# =====================================================================
def calc_absolute_score(val, thresholds, is_positive=True):
    """Score based on absolute financial thresholds (0-100).
    thresholds: [(upper_bound, score_at_boundary), ...] sorted ascending
    is_positive=True: higher value = higher score (ROE, margin, growth)
    is_positive=False: lower value = higher score (debt ratio, turnover days)"""
    if is_positive:
        # Higher is better: score rises with value
        if val <= thresholds[0][0]:
            return thresholds[0][1]
        for i in range(len(thresholds) - 1):
            if thresholds[i][0] < val <= thresholds[i + 1][0]:
                t_lo, s_lo = thresholds[i]
                t_hi, s_hi = thresholds[i + 1]
                ratio = (val - t_lo) / (t_hi - t_lo) if t_hi > t_lo else 0
                return s_lo + ratio * (s_hi - s_lo)
        return thresholds[-1][1]
    else:
        # Lower is better: score rises as value decreases (inverted)
        if val >= thresholds[0][0]:
            return thresholds[0][1]
        for i in range(len(thresholds) - 1):
            if thresholds[i + 1][0] <= val < thresholds[i][0]:
                t_hi, s_lo = thresholds[i]  # note: higher bound = lower score
                t_lo, s_hi = thresholds[i + 1]
                ratio = (t_hi - val) / (t_hi - t_lo) if t_hi > t_lo else 0
                return s_lo + ratio * (s_hi - s_lo)
        return thresholds[-1][1]


# Threshold tables: (value_boundary, score)
ROE_THRESHOLDS = [
    (0, 10), (5, 30), (8, 50), (12, 65), (15, 75), (20, 90), (30, 98)
]
GROSS_MARGIN_THRESHOLDS = [
    (0, 10), (10, 30), (20, 50), (30, 65), (40, 75), (50, 85), (60, 95)
]
PROFIT_GROWTH_THRESHOLDS = [
    (-100, 5), (-20, 20), (0, 40), (10, 55), (20, 70), (30, 85), (50, 98)
]
REVENUE_GROWTH_THRESHOLDS = [
    (-100, 5), (-10, 20), (0, 40), (10, 55), (20, 70), (30, 85), (50, 98)
]
AR_DAYS_THRESHOLDS = [  # inverted: lower is better
    (120, 10), (90, 25), (60, 45), (45, 60), (30, 75), (15, 90), (0, 98)
]
INV_DAYS_THRESHOLDS = [  # inverted
    (300, 10), (200, 25), (120, 45), (90, 60), (60, 75), (30, 90), (0, 98)
]
DEBT_RATIO_THRESHOLDS = [  # inverted
    (85, 5), (70, 20), (60, 35), (50, 50), (40, 65), (30, 80), (15, 95)
]
CF_REV_THRESHOLDS = [
    (0, 10), (5, 30), (10, 50), (15, 65), (20, 80), (30, 95)
]

@router.get("/{stock_code}")
def get_fundamentals(stock_code: str):
    try:
        logger.info(f"========== 抓取并计算 {stock_code} 基本面 ==========")

        prefix_tx = "sh" if stock_code.startswith("6") else "sz"
        kpi_url = f"http://qt.gtimg.cn/q={prefix_tx}{stock_code}"
        headers = {"User-Agent": "Mozilla/5.0", "Connection": "close"}
        proxies = {"http": None, "https": None}
        kpi_res = requests.get(kpi_url, headers=headers, proxies=proxies, timeout=5)
        kpi_data_str = kpi_res.text.split('~')

        price = 0.0; pe_value = 0.0; mkt_cap = 0.0
        kpi_data = []
        if len(kpi_data_str) > 45:
            price = safe_float(kpi_data_str[3])
            pct_change = safe_float(kpi_data_str[32])
            pe = kpi_data_str[39]
            pb = kpi_data_str[46]
            mkt_cap = safe_float(kpi_data_str[45])
            pe_value = safe_float(pe)
            kpi_data = [
                {"title": "最新收盘价", "val": str(price), "sub": f"{pct_change}%", "up": pct_change > 0},
                {"title": "市盈率 (PE)", "val": str(pe), "sub": "动态", "up": False},
                {"title": "市净率 (PB)", "val": str(pb), "sub": "最新", "up": True},
                {"title": "总市值", "val": f"{mkt_cap} 亿", "sub": "A股实时", "up": True}
            ]

        tb_profit = f"profit_{stock_code}"
        tb_balance = f"balance_{stock_code}"
        tb_cash = f"cash_{stock_code}"
        need_download = True

        df_profit, df_balance, df_cash = pd.DataFrame(), pd.DataFrame(), pd.DataFrame()

        try:
            df_profit = pd.read_sql(f"SELECT * FROM `{tb_profit}`", engine)
            df_balance = pd.read_sql(f"SELECT * FROM `{tb_balance}`", engine)
            df_cash = pd.read_sql(f"SELECT * FROM `{tb_cash}`", engine)
            if not df_profit.empty and not df_balance.empty and not df_cash.empty:
                logger.info(f"⚡ 数据库命中！直接从本地读取 {stock_code} 的财务三表。")
                need_download = False
        except Exception:
            pass

        if need_download:
            logger.info(f"🌐 数据库未命中，正在下载 {stock_code} 的财务三表并存入数据库")
            full_code = f"{prefix_tx}{stock_code}"
            
            df_profit = ak.stock_financial_abstract_ths(symbol=stock_code, indicator="按报告期")
            df_balance = ak.stock_financial_report_sina(stock=full_code, symbol="资产负债表")
            df_cash = ak.stock_financial_report_sina(stock=full_code, symbol="现金流量表")


            df_profit.to_sql(tb_profit, engine, if_exists='replace', index=False)
            df_balance.to_sql(tb_balance, engine, if_exists='replace', index=False)
            df_cash.to_sql(tb_cash, engine, if_exists='replace', index=False)

        df_profit['year'] = df_profit['报告期'].astype(str).str[:4]
        if '报告日' in df_balance.columns: df_balance['year'] = df_balance['报告日'].astype(str).str[:4]
        if '报告日' in df_cash.columns: df_cash['year'] = df_cash['报告日'].astype(str).str[:4]

        annual_profit = df_profit[df_profit['报告期'].astype(str).str.contains('12-31')].copy()
        if annual_profit.empty: raise ValueError("未找到年报数据")
        annual_profit = annual_profit.sort_values('year', ascending=False).head(5).sort_values('year', ascending=True)

        years, revenues, profits, rev_growths, prof_growths = [], [], [], [], []
        gross_margins, net_margins, inv_days, ar_days = [], [], [], []
        cash_op, cash_in, cash_fi = [], [], []
        
        s_roe, s_margin, s_prof_g, s_rev_g = [], [], [], []
        s_ar_d, s_inv_d, s_debt_r, s_cash_bal = [], [], [], []
        s_cf_rev, s_cf_prof = [], []

        assets, liabs, equity, current_assets, non_current_assets = 0, 0, 0, 0, 0
        debt_ratio_val = 0.0

        for _, p_row in annual_profit.iterrows():
            yr = p_row['year']
            years.append(yr)

            b_rows = df_balance[df_balance['year'] == yr] if 'year' in df_balance.columns else pd.DataFrame()
            c_rows = df_cash[df_cash['year'] == yr] if 'year' in df_cash.columns else pd.DataFrame()
            b_row = b_rows.iloc[0] if not b_rows.empty else pd.Series()
            c_row = c_rows.iloc[0] if not c_rows.empty else pd.Series()

            rev = get_val_from_row(p_row, ['营业总收入', '营业收入', '保险业务收入']) / 1e8
            prof = get_val_from_row(p_row, ['净利润', '归属于母公司股东的净利润']) / 1e8
            rev_g = get_val_from_row(p_row, ['营业总收入同比增长率', '营业收入同比增长率', '营收同比'])
            prof_g = get_val_from_row(p_row, ['净利润同比增长率', '归属净利润同比增长率'])
            revenues.append(round(rev, 2)); profits.append(round(prof, 2))
            rev_growths.append(round(rev_g, 2)); prof_growths.append(round(prof_g, 2))

            g_margin = get_val_from_row(p_row, ['销售毛利率', '毛利率'])
            n_margin = get_val_from_row(p_row, ['销售净利率', '净利率'])
            if g_margin == 0 and n_margin != 0: g_margin = n_margin 
            gross_margins.append(round(g_margin, 2)); net_margins.append(round(n_margin, 2))

            inv_d = get_val_from_row(p_row, ['存货周转天数'])
            ar_d = get_val_from_row(p_row, ['应收账款周转天数'])
            inv_days.append(round(inv_d, 2)); ar_days.append(round(ar_d, 2))

            op_cf = get_val_from_row(c_row, ['经营活动产生的现金流量净额', '经营现金流']) / 1e8
            if op_cf == 0: 
                eps_cf = get_val_from_row(p_row, ['每股经营现金流'])
                op_cf = (eps_cf * (safe_float(kpi_data_str[45])*1e8 / price)) / 1e8 if price>0 else 0
            
            in_cf = get_val_from_row(c_row, ['投资活动产生的现金流量净额']) / 1e8
            fi_cf = get_val_from_row(c_row, ['筹资活动产生的现金流量净额']) / 1e8
            cash_op.append(round(op_cf, 2)); cash_in.append(round(in_cf, 2)); cash_fi.append(round(fi_cf, 2))

            # 🌟 修复资产饼图：极度强化的资产解析与会计恒等式兜底计算
            current_assets = get_val_from_row(b_row, ['流动资产合计']) / 1e8
            non_current_assets = get_val_from_row(b_row, ['非流动资产合计']) / 1e8
            liabs = get_val_from_row(b_row, ['负债合计']) / 1e8
            assets = current_assets + non_current_assets
            
            # 扩展词库匹配所有者权益
            equity_keys = ['所有者权益(或股东权益)合计', '所有者权益合计', '股东权益合计', '归属于母公司股东权益合计', '归属于母公司所有者权益合计']
            equity = get_val_from_row(b_row, equity_keys) / 1e8
            
            # 会计恒等式兜底：资产 = 负债 + 所有者权益
            if equity == 0 and assets > 0:
                equity = assets - liabs
                
            debt_ratio_val = get_val_from_row(p_row, ['资产负债率'])

            roe = get_val_from_row(p_row, ['净资产收益率', 'ROE'])
            cash_bal = get_val_from_row(c_row, ['期末现金及现金等价物余额', '货币资金']) / 1e8
            
            s_roe.append(roe); s_margin.append(g_margin)
            s_prof_g.append(prof_g); s_rev_g.append(rev_g)
            s_ar_d.append(ar_d); s_inv_d.append(inv_d)
            s_debt_r.append(debt_ratio_val); s_cash_bal.append(cash_bal)
            s_cf_rev.append((op_cf / rev) if rev else 0)
            s_cf_prof.append((op_cf / prof) if prof else 0)

        asset_data = [
            {"value": round(current_assets, 2), "name": "流动资产合计"},
            {"value": round(non_current_assets, 2), "name": "非流动资产合计"},
            {"value": round(liabs, 2), "name": "负债合计"},
            {"value": round(equity, 2), "name": "所有者权益合计"}
        ]

        # --- Absolute threshold scoring ---
        roe = s_roe[-1] if s_roe else 0
        margin = s_margin[-1] if s_margin else 0
        prof_g = s_prof_g[-1] if s_prof_g else 0
        rev_g = s_rev_g[-1] if s_rev_g else 0
        ar_d = s_ar_d[-1] if s_ar_d else 999
        inv_d = s_inv_d[-1] if s_inv_d else 999
        debt_r = s_debt_r[-1] if s_debt_r else 0
        cf_rev = s_cf_rev[-1] if s_cf_rev else 0

        score_roe = calc_absolute_score(roe, ROE_THRESHOLDS, True)
        score_margin = calc_absolute_score(margin, GROSS_MARGIN_THRESHOLDS, True)
        profit_score = score_roe * 0.7 + score_margin * 0.3

        score_prof_g = calc_absolute_score(prof_g, PROFIT_GROWTH_THRESHOLDS, True)
        score_rev_g = calc_absolute_score(rev_g, REVENUE_GROWTH_THRESHOLDS, True)
        growth_score = score_prof_g * 0.5 + score_rev_g * 0.5

        score_ar = calc_absolute_score(ar_d, AR_DAYS_THRESHOLDS, False)
        score_inv = calc_absolute_score(inv_d, INV_DAYS_THRESHOLDS, False)
        operate_score = score_ar * 0.5 + score_inv * 0.5

        score_debt = calc_absolute_score(debt_r, DEBT_RATIO_THRESHOLDS, False)
        solvency_score = score_debt

        score_cf_rev = calc_absolute_score(cf_rev, CF_REV_THRESHOLDS, True)
        cash_create_score = score_cf_rev

        radar_data = [
            {"name": "盈利能力", "value": round(profit_score, 1)},
            {"name": "发展能力", "value": round(growth_score, 1)},
            {"name": "营运能力", "value": round(operate_score, 1)},
            {"name": "偿债能力", "value": round(solvency_score, 1)},
            {"name": "现金创造", "value": round(cash_create_score, 1)}
        ]

        logger.info(f"🎉 {stock_code} 数据库读取与前端数据匹配成功！")
        return {
            "status": "success",
            "stock_code": stock_code,
            "kpi_data": kpi_data,
            "trend_data": {"years": years, "revenue": revenues, "profit": profits, "rev_growth": rev_growths, "prof_growth": prof_growths},
            "margin_data": {"gross": gross_margins, "net": net_margins},
            "turnover_data": {"inventory": inv_days, "ar": ar_days},
            "cash_flow_data": {"operate": cash_op, "invest": cash_in, "finance": cash_fi},
            "asset_data": {"pie_data": asset_data, "debt_ratio": round(debt_ratio_val, 2)},
            "radar_data": radar_data
        }

    except Exception as e:
        logger.error(f"严重错误:\n{traceback.format_exc()}")
        return {"status": "error", "message": "系统异常，获取数据失败，请联系管理员！"}