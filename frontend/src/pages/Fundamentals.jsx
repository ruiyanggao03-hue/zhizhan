import { API_BASE } from '../api';
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Card, Spin, ConfigProvider, theme, Space, Button, Alert, AutoComplete, Input, message } from 'antd';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Activity, ShieldCheck, Target, ArrowLeft, Banknote, Compass, Zap, Layers, FileText, Search } from 'lucide-react';
import axios from 'axios';

const { Title } = Typography;

const ChartCard = ({ title, icon, option, delay }) => (
  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay }} whileHover={{ y: -8, boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }} style={{ height: '100%' }}>
    <Card 
      bordered={false} 
      style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(16px)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)', height: '100%' }} 
      bodyStyle={{ padding: '24px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ color: '#00E5FF', marginRight: '12px', background: 'rgba(0, 229, 255, 0.08)', padding: '6px', borderRadius: '6px', display: 'flex' }}>
          {icon}
        </div>
        <Title level={4} style={{ margin: 0, color: '#cbd5e1', fontSize: '15px', fontWeight: 600 }}>{title}</Title>
      </div>
      <div style={{ height: '290px', width: '100%' }}>
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
      </div>
    </Card>
  </motion.div>
);

function Fundamentals() {
  const [searchParams, setSearchParams] = useSearchParams(); 
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage(); 
  
  const stockCode = searchParams.get('code') || '600519'; 
  const stockName = searchParams.get('name') || '贵州茅台'; 

  const [navOptions, setNavOptions] = useState([]);
  const [navInputValue, setNavInputValue] = useState("");

  const { data: chartData, isLoading: loading, error } = useQuery({
    queryKey: ['fundamentals', stockCode],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE}/api/fundamentals/${stockCode}`);
      if (response.data.status === "error") throw new Error(response.data.message);
      return response.data;
    },
  });
  const errorMsg = error ? (error.message || "系统异常，获取数据失败") : null;

  const handleNavSearch = async (value) => {
    setNavInputValue(value);
    if (value.length >= 1) {
      try {
        const res = await axios.get(`${API_BASE}/api/search?keyword=${value}`);
        setNavOptions(res.data);
      } catch (e) { console.error(e); }
    } else { setNavOptions([]); }
  };

  const handleNavExecute = (rawVal) => {
    if (!rawVal || rawVal.trim() === '') {
        messageApi.warning("请输入公司名称或股票代码！");
        return;
    }
    let finalCode = rawVal;
    let finalName = "智能诊断标的";

    if (rawVal.includes(' - ')) {
      const parts = rawVal.split(' - ');
      finalCode = parts[0].trim();
      finalName = parts[1].trim();
    } else {
      const exactMatch = navOptions.find(o => o.value === rawVal || o.label.split(' - ')[1] === rawVal);
      if (exactMatch) {
          const parts = exactMatch.label.split(' - ');
          finalCode = parts[0].trim();
          finalName = parts[1].trim();
      } else {
          if (/^\d{6}$/.test(rawVal)) {
              finalCode = rawVal;
          } else {
              messageApi.error("❌ 请输入完整的公司名称或 6 位股票代码！");
              return;
          }
      }
    }
    setSearchParams({ code: finalCode, name: finalName });
    setNavInputValue(""); 
  };

  // ==========================================
  // 图表配置
  // ==========================================
  const chartTheme = {
    textStyle: { fontFamily: 'Inter, system-ui, -apple-system, sans-serif' },
    animationDuration: 1800, 
    animationEasing: 'elasticOut',
  };

  const axisStyle = {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
    axisLabel: { color: '#475569', fontSize: 11, fontWeight: 500 },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.02)', type: 'dashed' } }
  };

  const tooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    textStyle: { color: '#f1f5f9', fontSize: 12 },
    backdropFilter: 'blur(8px)',
    borderRadius: 8,
    padding: [12, 16]
  };

  const optionTrend = {
    ...chartTheme,
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    legend: { data: ['营业总收入(亿)', '净利润(亿)', '营收同比(%)', '净利同比(%)'], textStyle: { color: '#64748b', fontSize: 11 }, top: 0, icon: 'circle', itemGap: 15 },
    grid: { left: '1%', right: '1%', bottom: '2%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: chartData?.trend_data?.years || [], ...axisStyle },
    yAxis: [
      { type: 'value', name: '金额(亿)', nameTextStyle: { color: '#475569', fontSize: 10 }, ...axisStyle },
      { type: 'value', name: '增速(%)', nameTextStyle: { color: '#475569', fontSize: 10 }, ...axisStyle, splitLine: { show: false } }
    ],
    series: [
      { name: '营业总收入(亿)', type: 'bar', barWidth: '22%', data: chartData?.trend_data?.revenue || [], itemStyle: { borderRadius: [4, 4, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#00ccff' }, { offset: 1, color: 'rgba(0,204,255,0.05)' }] } } },
      { name: '净利润(亿)', type: 'bar', barWidth: '22%', data: chartData?.trend_data?.profit || [], itemStyle: { borderRadius: [4, 4, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: 'rgba(59,130,246,0.05)' }] } } },
      { name: '营收同比(%)', type: 'line', yAxisIndex: 1, data: chartData?.trend_data?.rev_growth || [], smooth: true, lineStyle: { width: 3, color: '#f59e0b', shadowColor: 'rgba(245,158,11,0.3)', shadowBlur: 8 }, itemStyle: { color: '#f59e0b' }, symbolSize: 6 },
      { name: '净利同比(%)', type: 'line', yAxisIndex: 1, data: chartData?.trend_data?.prof_growth || [], smooth: true, lineStyle: { width: 3, color: '#ec4899', shadowColor: 'rgba(236,72,153,0.3)', shadowBlur: 8 }, itemStyle: { color: '#ec4899' }, symbolSize: 6 }
    ]
  };

  const optionMargins = {
    ...chartTheme,
    tooltip: { ...tooltipStyle, trigger: 'axis' },
    legend: { data: ['销售毛利率', '销售净利率'], textStyle: { color: '#64748b' }, top: 0, icon: 'roundRect' },
    grid: { left: '1%', right: '2%', bottom: '2%', top: '15%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: chartData?.trend_data?.years || [], ...axisStyle },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%', color: '#475569' }, splitLine: axisStyle.splitLine },
    series: [
      { name: '销售毛利率', type: 'line', data: chartData?.margin_data?.gross || [], smooth: true, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(16,185,129,0.25)' }, { offset: 1, color: 'rgba(16,185,129,0)' }] } }, lineStyle: { width: 3, color: '#10b981', shadowColor: 'rgba(16,185,129,0.4)', shadowBlur: 10 }, itemStyle: { color: '#10b981' }, symbolSize: 4 },
      { name: '销售净利率', type: 'line', data: chartData?.margin_data?.net || [], smooth: true, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(99,102,241,0.25)' }, { offset: 1, color: 'rgba(99,102,241,0)' }] } }, lineStyle: { width: 3, color: '#6366f1', shadowColor: 'rgba(99,102,241,0.4)', shadowBlur: 10 }, itemStyle: { color: '#6366f1' }, symbolSize: 4 }
    ]
  };

  const optionTurnover = {
    ...chartTheme,
    tooltip: { ...tooltipStyle, trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['存货周转天数', '应收账款周转天数'], textStyle: { color: '#64748b' }, top: 0 },
    grid: { left: '1%', right: '2%', bottom: '2%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: chartData?.trend_data?.years || [], ...axisStyle },
    yAxis: { type: 'value', name: '天数', nameTextStyle: { color: '#475569' }, ...axisStyle },
    series: [
      { name: '存货周转天数', type: 'bar', barWidth: '24%', data: chartData?.turnover_data?.inventory || [], itemStyle: { borderRadius: [4, 4, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#a855f7' }, { offset: 1, color: 'rgba(168,85,247,0.05)' }] } } },
      { name: '应收账款周转天数', type: 'bar', barWidth: '24%', data: chartData?.turnover_data?.ar || [], itemStyle: { borderRadius: [4, 4, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#00E5FF' }, { offset: 1, color: 'rgba(0,229,255,0.05)' }] } } }
    ]
  };

  // 🌟 修复2：现金流图表更换为科技感流光渐变色（青紫蓝）
  const optionCashFlow = {
    ...chartTheme,
    tooltip: { ...tooltipStyle, trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['经营活动', '投资活动', '筹资活动'], textStyle: { color: '#64748b' }, top: 0 },
    grid: { left: '1%', right: '2%', bottom: '2%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: chartData?.trend_data?.years || [], ...axisStyle },
    yAxis: { type: 'value', name: '亿元', nameTextStyle: { color: '#475569' }, ...axisStyle },
    series: [
      { name: '经营活动', type: 'bar', barWidth: '18%', data: chartData?.cash_flow_data?.operate || [], itemStyle: { borderRadius: [4, 4, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#00ccff' }, { offset: 1, color: 'rgba(0,204,255,0.05)' }] } } },
      { name: '投资活动', type: 'bar', barWidth: '18%', data: chartData?.cash_flow_data?.invest || [], itemStyle: { borderRadius: [0, 0, 4, 4], color: { type: 'linear', x: 0, y: 1, x2: 0, y2: 0, colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: 'rgba(59,130,246,0.05)' }] } } },
      { name: '筹资活动', type: 'bar', barWidth: '18%', data: chartData?.cash_flow_data?.finance || [], itemStyle: { borderRadius: [0, 0, 4, 4], color: { type: 'linear', x: 0, y: 1, x2: 0, y2: 0, colorStops: [{ offset: 0, color: '#8b5cf6' }, { offset: 1, color: 'rgba(139,92,246,0.05)' }] } } }
    ]
  };

  const optionAssetStructure = {
    ...chartTheme,
    tooltip: { ...tooltipStyle, trigger: 'item', formatter: '{b} <br/><span style="font-size:16px;font-weight:700;color:#00E5FF">{c}</span> 亿元 ({d}%)' },
    legend: { orient: 'vertical', left: '2%', top: 'center', textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 8, itemHeight: 8, itemGap: 14 },
    graphic: {
      elements: [
        { type: 'text', left: '56%', top: '42%', style: { text: '资产负债率', textAlign: 'center', fill: '#475569', fontSize: 12, fontWeight: 500 } },
        { type: 'text', left: '56%', top: '50%', style: { text: `${chartData?.asset_data?.debt_ratio || 0}%`, textAlign: 'center', fill: '#10b981', fontSize: 32, fontWeight: '900', fontFamily: 'Inter, system-ui' } }
      ]
    },
    series: [
      {
        name: '资产负债结构', type: 'pie', radius: ['64%', '88%'], center: ['62%', '50%'],
        padAngle: 4, 
        itemStyle: { borderRadius: 8, borderColor: '#0a0e17', borderWidth: 2 },
        label: { show: false },
        data: chartData?.asset_data?.pie_data?.map((item, idx) => {
            const hexColors = ['#0284c7', '#06b6d4', '#dc2626', '#6d28d9'];
            return { ...item, itemStyle: { color: hexColors[idx] } };
        }) || []
      }
    ]
  };

  const optionRadar = {
    ...chartTheme,
    tooltip: { ...tooltipStyle },
    radar: {
      radius: '80%', 
      center: ['50%', '52%'],
      indicator: [
        { name: '盈利能力', max: 100 }, { name: '发展能力', max: 100 },
        { name: '营运能力', max: 100 }, { name: '偿债能力', max: 100 }, { name: '现金创造', max: 100 }
      ],
      splitArea: { show: true, areaStyle: { color: ['rgba(0,229,255,0.01)', 'rgba(0,229,255,0.03)', 'rgba(0,229,255,0.05)', 'rgba(0,229,255,0.08)'].reverse() } }, 
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', width: 1 } },
      splitLine: { lineStyle: { color: 'rgba(0,229,255,0.2)', width: 1 } },
      axisName: { color: '#94a3b8', fontSize: 11, fontWeight: 600, padding: [4, 8] }
    },
    series: [{
      name: '多维基准模型', type: 'radar',
      data: [{ value: chartData?.radar_data?.map(i => i.value) || [], name: '标的实时能力映射' }],
      areaStyle: { color: 'rgba(0,229,255,0.15)' },
      lineStyle: { width: 2.5, color: '#00E5FF', shadowColor: 'rgba(0,229,255,0.6)', shadowBlur: 12 },
      symbol: 'circle', symbolSize: 5,
      itemStyle: { color: '#fff', borderColor: '#00E5FF', borderWidth: 2 }
    }]
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorBgBase: '#060a12' } }}>
      {contextHolder}
      <div style={{
        height: '100vh', backgroundColor: '#060a12',
        backgroundImage: 'radial-gradient(circle at 50% -30%, rgba(14, 116, 144, 0.25), rgba(6, 10, 18, 1) 70%)',
        color: '#f8fafc', padding: '24px 32px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        <div style={{ maxWidth: '1650px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>

          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Space size="large" align="center">
              <Button type="text" icon={<ArrowLeft size={18} />} style={{ color: '#64748b', fontSize: '14px', padding: 0 }} onClick={() => navigate('/')}>
                返回数据主舱
              </Button>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)' }}></div>
              
              <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={22} color="#00E5FF" /> 
                <span style={{ 
                    background: 'linear-gradient(135deg, #fff 30%, #64748b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    fontSize: '22px', fontWeight: 800, letterSpacing: '0.5px'
                }}>
                    {stockName} <span style={{ color: '#00E5FF', WebkitTextFillColor: '#00E5FF', fontWeight: 700, fontSize: '18px', background: 'rgba(0,229,255,0.1)', padding: '2px 8px', borderRadius: '4px', marginLeft: '6px', fontFamily: 'monospace' }}>{stockCode}</span>
                </span>
              </Title>
            </Space>

            <div style={{ display: 'flex', width: '320px', marginLeft: 'auto', marginRight: '40px', gap: '8px' }}>
              <AutoComplete
                options={navOptions}
                style={{ flex: 1 }}
                onSelect={(val) => handleNavExecute(val)}
                onSearch={handleNavSearch}
                value={navInputValue}
                onChange={(val) => setNavInputValue(val)}
              >
                <Input 
                  prefix={<Search size={14} color="#00E5FF" />}
                  placeholder="切入新标的代码/简称" 
                  onPressEnter={() => handleNavExecute(navInputValue)}
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                />
              </AutoComplete>
              <Button 
                type="primary" 
                onClick={() => handleNavExecute(navInputValue)}
                style={{ background: '#00E5FF', color: '#0a0e17', border: 'none', fontWeight: 600, borderRadius: '8px' }}
              >
                分析
              </Button>
            </div>

            <Space size="middle">
              <Button type="primary" onClick={() => navigate(`/sentiment?code=${stockCode}&name=${stockName}`)} className="nav-btn"
                style={{ background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)', border: 'none', fontWeight: 600, height: '38px', padding: '0 20px', borderRadius: '8px', fontSize: '13px' }}>
                <Zap size={14} style={{marginRight: '6px'}}/> 开启 AI 舆情分析
              </Button>
              <Button type="primary" onClick={() => navigate(`/report?code=${stockCode}&name=${stockName}`)} className="nav-btn"
                style={{ background: 'linear-gradient(90deg, #6d28d9, #8b5cf6)', border: 'none', fontWeight: 600, height: '38px', padding: '0 20px', borderRadius: '8px', fontSize: '13px' }}>
                <FileText size={14} style={{marginRight: '6px'}}/> 开启 AI 行业研究
              </Button>
            </Space>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: '16px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '65vh' }}>
              <Spin size="large" />
              <div style={{ marginTop: '16px', color: '#64748b', fontSize: '13px' }}>正在加载本地高速缓存，匹配底层财务审计结构...</div>
            </div>
          ) : errorMsg ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
               <Alert message={<span style={{fontSize: '16px', fontWeight: 'bold'}}>{errorMsg}</span>} description="底层财务表验证失败。请检查该股票代码是否属于合规上市的A股企业。" type="error" showIcon style={{ background: 'rgba(220,38,38,0.03)', border: '1px solid rgba(220,38,38,0.2)', padding: '20px 32px', borderRadius: '12px' }} />
            </div>
          ) : (
            <>
              {/* 🌟 修复1：严格遵守 A 股红涨绿跌机制！ */}
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <Row gutter={16} style={{ marginBottom: '24px' }}>
                  {chartData?.kpi_data?.map((kpi, i) => (
                    <Col span={6} key={i}>
                      <Card bordered={false} style={{ background: 'rgba(15, 23, 42, 0.25)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                        <div style={{ color: '#475569', fontSize: '12px', marginBottom: '6px', fontWeight: 500 }}>{kpi.title}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <span style={{ color: '#f1f5f9', fontSize: '26px', fontWeight: 800, fontFamily: 'ui-monospace, Consolas' }}>{kpi.val}</span>
                            <span style={{
                                color: kpi.up ? '#ef4444' : '#10b981',
                                fontSize: '12px', fontWeight: 600,
                                background: kpi.up ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                                padding: '1px 6px', borderRadius: '4px'
                            }}>
                                {kpi.up ? '▲' : '▼'} {kpi.sub}
                            </span>
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </motion.div>

              <Row gutter={[20, 20]}>
                <Col xs={24} xl={12}><ChartCard title="营收与净利润全景画像" icon={<LineChart size={18} />} option={optionTrend} delay={0.05} /></Col>
                <Col xs={24} xl={12}><ChartCard title="销售利润率穿透" icon={<Activity size={18} />} option={optionMargins} delay={0.1} /></Col>
                <Col xs={24} xl={12}><ChartCard title="企业营运周转效率" icon={<Target size={18} />} option={optionTurnover} delay={0.15} /></Col>
                <Col xs={24} xl={12}><ChartCard title="三大现金流金额与结构" icon={<Banknote size={18} />} option={optionCashFlow} delay={0.2} /></Col>
                <Col xs={24} xl={12}><ChartCard title="资本结构与负债杠杆" icon={<ShieldCheck size={18} />} option={optionAssetStructure} delay={0.25} /></Col>
                <Col xs={24} xl={12}><ChartCard title="五维能力动态评估 (Min-Max 模型)" icon={<Compass size={18} />} option={optionRadar} delay={0.3} /></Col>
              </Row>
            </>
          )}
          </div>
        </div>
      </div>

      <style>{`
        body { margin: 0; }

        /* 导航按钮 — 高级感悬停动效 */
        .nav-btn {
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          cursor: pointer;
          position: relative;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
        }
        .nav-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 8px;
          opacity: 0;
          transition: opacity 0.3s;
          background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 60%);
          pointer-events: none;
          z-index: 1;
        }
        .nav-btn:hover::after { opacity: 1; }
        .nav-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
        }
        .nav-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          transition: all 0.1s;
        }
      `}</style>
    </ConfigProvider>
  );
}

export default Fundamentals;