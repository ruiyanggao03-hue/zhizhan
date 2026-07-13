import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Card, Spin, ConfigProvider, theme, Space, Button, Alert, Input, Avatar, AutoComplete, message } from 'antd';
import ReactECharts from 'echarts-for-react';
import ReactMarkdown from 'react-markdown';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Zap, Bot, User, Search, Globe, FileText, ExternalLink, BrainCircuit, Activity, PieChart, StopCircle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ConversationSidebar from '../components/ConversationSidebar';

import { API_BASE } from '../api';

const { Title, Text } = Typography;

// 提取到组件外，避免每次渲染时重建
const StatItem = ({ title, value, color }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', background: `rgba(${color === '#ef4444' ? '239,68,68' : color === '#10b981' ? '16,185,129' : '255,255,255'},0.08)`, padding: '12px 8px', borderRadius: '10px', border: `0.5px solid rgba(${color === '#ef4444' ? '239,68,68' : color === '#10b981' ? '16,185,129' : '255,255,255'},0.15)` }}>
    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', fontWeight: 500 }}>{title}</div>
    <div style={{ fontSize: '22px', fontWeight: 700, color: color, fontFamily: 'monospace' }}>{value}</div>
  </div>
);

export default function Sentiment() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const stockCode = searchParams.get('code') || '600519';
  const stockName = searchParams.get('name') || '贵州茅台';

  const [errorMsg, setErrorMsg] = useState(null);

  const [navOptions, setNavOptions] = useState([]);
  const [navInputValue, setNavInputValue] = useState("");

  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Conversation state
  const [convId, setConvId] = useState(null);
  const [convRefreshKey, setConvRefreshKey] = useState(0);

  // 🌟 修复滚动锁定所需 Refs
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const abortControllerRef = useRef(null);
  const inputRef = useRef(null);

  const [tickerIndex, setTickerIndex] = useState(0);

  // 🌟 精确判断用户是否正在向上翻阅聊天记录
  const handleChatScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;
    // 距离底部高度如果大于 100px，则认定用户已经主动往上滚动了
    const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
    userScrolledUpRef.current = !isNearBottom;
  };

  useEffect(() => {
    const container = chatContainerRef.current;
    // 只有在用户没有往上翻记录的时候，才进行强制下拉锁定
    if (container && chatEndRef.current && !userScrolledUpRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  // 切换标的时重置对话
  useEffect(() => {
    setConvId(null);
    setChatHistory([
      { sender: 'ai', isThinking: false, text: `您好，我是**智瞻AI投顾 Ruiyang**。您可以向我询问关于**${stockName}**的走势研判、情绪分析，或者对右侧展示的全网新闻资讯有任何疑问，我都可以为您解答。` }
    ]);
  }, [stockCode, stockName]);

  // 重型数据（React Query 缓存）
  const { data: heavyData, isLoading: loading } = useQuery({
    queryKey: ['sentiment', stockCode],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE}/api/sentiment/data/${stockCode}`, { timeout: 20000 });
      if (response.data.status === "error") { setErrorMsg(response.data.message); throw new Error(response.data.message); }
      return response.data;
    },
  });

  // 实时股价（15秒轮询）
  const { data: realtime } = useQuery({
    queryKey: ['sentiment-realtime', stockCode],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/sentiment/realtime/${stockCode}`, { timeout: 5000 });
      return res.data;
    },
    refetchInterval: 15000,
    staleTime: 10 * 1000,
  });

  // 洞察滚动：10秒切换一条
  const insights = heavyData?.ai_analysis?.insights || [];
  useEffect(() => {
    if (insights.length <= 1) return;
    const ticker = setInterval(() => {
      setTickerIndex(prev => (prev + 1) % insights.length);
    }, 10000);
    return () => clearInterval(ticker);
  }, [insights.length]);

  // AI 对话
  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMessage = { sender: 'user', text: chatInput };
    const currentAiMessageIndex = chatHistory.length + 1;
    const newHistory = [
      ...chatHistory,
      userMessage,
      { sender: 'ai', isThinking: true, text: '' }
    ];

    setChatHistory(newHistory);
    setChatInput('');
    setChatLoading(true);

    // 🌟 用户发新消息时，重置滚动状态，保证首字能自动跳到底部
    userScrolledUpRef.current = false;

    // Create conversation if not exists
    let currentConvId = convId;
    if (!currentConvId) {
      try {
        const res = await axios.post(`${API_BASE}/api/chat/conversations`, {
          module: 'sentiment',
          stock_code: stockCode,
          stock_name: stockName,
        });
        currentConvId = res.data.id;
        setConvId(res.data.id);
      } catch (e) {
        messageApi.error('创建对话失败');
        setChatLoading(false);
        return;
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let aiContent = '';

    try {
      const response = await fetch(`${API_BASE}/api/sentiment/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          stock_code: stockCode,
          stock_name: stockName,
          message: userMessage.text,
          history: chatHistory.filter(h => !h.isThinking).slice(-30),
          displayed_news: heavyData?.news || [],
          realtime: realtime || {},
          ai_analysis: heavyData?.ai_analysis || {},
          conversation_id: currentConvId || '',
        }),
        signal: controller.signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkStr = decoder.decode(value);
        const lines = chunkStr.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '');
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'answer') {
                aiContent += parsed.content;
                setChatHistory(prev => {
                  const updated = [...prev];
                  updated[currentAiMessageIndex] = {
                    sender: 'ai',
                    isThinking: false,
                    text: aiContent
                  };
                  return updated;
                });
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setChatHistory(prev => {
          const updated = [...prev];
          updated[currentAiMessageIndex] = {
            sender: 'ai',
            isThinking: false,
            text: "网络波动，推理链中断。"
          };
          return updated;
        });
      }
    } finally {
      setChatLoading(false);
      abortControllerRef.current = null;
      inputRef.current?.focus();
      // Save messages
      const finalConvId = currentConvId;
      if (finalConvId && aiContent) {
        axios.post(`${API_BASE}/api/chat/conversations/${finalConvId}/messages`, {
          messages: [
            { sender: 'user', text: userMessage.text },
            { sender: 'ai', text: aiContent },
          ],
        }).then(() => {
          setConvRefreshKey(k => k + 1);
        }).catch(() => {});
      }
    }
  };

  const handleStopOutput = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // --- Conversation handlers ---
  const handleSelectConv = async (conv) => {
    try {
      const res = await axios.get(`${API_BASE}/api/chat/conversations/${conv.id}/messages?limit=200`);
      const messages = res.data.messages || res.data;
      const msgs = messages.map(m => ({
        sender: m.sender,
        text: m.text,
        isThinking: false,
      }));
      setChatHistory(msgs);
      setConvId(conv.id);
      userScrolledUpRef.current = false;
    } catch (e) {
      console.error('Failed to load conversation:', e);
    }
  };

  const handleNewConv = (id) => {
    if (id) {
      setConvId(id);
      setChatHistory([]);
    } else {
      setConvId(null);
      setChatHistory([]);
    }
    userScrolledUpRef.current = false;
  };

  const handleNavSearch = async (value) => {
    setNavInputValue(value);
    if (value.length >= 1) {
      try { const res = await axios.get(`${API_BASE}/api/search?keyword=${value}`, { timeout: 5000 }); setNavOptions(res.data); } catch (e) {}
    } else setNavOptions([]);
  };

  const handleNavExecute = (rawVal) => {
    if (!rawVal || rawVal.trim() === '') {
        messageApi.warning("请输入公司名称或股票代码！");
        return;
    }
    let finalCode = rawVal, finalName = "智能诊断标的";
    if (rawVal.includes(' - ')) {
      const parts = rawVal.split(' - ');
      finalCode = parts[0].trim(); finalName = parts[1].trim();
    } else {
      const exactMatch = navOptions.find(o => o.value === rawVal || o.label.split(' - ')[1] === rawVal);
      if (exactMatch) {
          const parts = exactMatch.label.split(' - ');
          finalCode = parts[0].trim(); finalName = parts[1].trim();
      } else if (/^\d{6}$/.test(rawVal)) finalCode = rawVal;
      else {
          messageApi.error("❌ 请输入完整的公司名称或 6 位股票代码！");
          return;
      }
    }
    setSearchParams({ code: finalCode, name: finalName });
    setNavInputValue(""); 
  };

  const isUp = realtime?.change >= 0;
  const colorUp = '#ef4444'; 
  const colorDown = '#10b981'; 

  const optionGauge = {
    series: [{
        type: 'gauge', startAngle: 180, endAngle: 0, min: 0, max: 100,
        radius: '100%', center: ['50%', '70%'], 
        axisLine: { lineStyle: { width: 10, color: [[0.39, colorDown], [0.84, '#f59e0b'], [1, colorUp]] } }, 
        pointer: { icon: 'triangle', length: '50%', width: 5, itemStyle: { color: '#e2e8f0' } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        detail: { fontSize: 32, offsetCenter: [0, '30%'], valueAnimation: true, formatter: '{value}', color: '#fff', fontWeight: 800 },
        data: [{ value: heavyData?.ai_analysis?.score || 0 }]
    }]
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorBgBase: '#060a12' } }}>
      {contextHolder}
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#060a12', backgroundImage: 'radial-gradient(circle at 50% -30%, rgba(59, 130, 246, 0.12), rgba(6, 10, 18, 1) 70%)', color: '#f8fafc', padding: '20px 32px', overflow: 'hidden' }}>
      <div style={{ maxWidth: '1750px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Space size="large" align="center">
              <Button type="text" icon={<ArrowLeft size={18} />} style={{ color: '#64748b' }} onClick={() => navigate('/')}>返回数据主舱</Button>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)' }}></div>
              <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Zap size={22} color="#3b82f6" /> 
                <span style={{ background: 'linear-gradient(135deg, #fff 30%, #64748b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '22px', fontWeight: 800 }}>
                    {stockName} <span style={{ color: '#3b82f6', WebkitTextFillColor: '#3b82f6', fontSize: '18px', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>{stockCode}</span>
                </span>
              </Title>
            </Space>

            <div style={{ display: 'flex', width: '300px', marginLeft: 'auto', marginRight: '40px', gap: '8px' }}>
              <AutoComplete options={navOptions} style={{ flex: 1 }} onSelect={(val) => handleNavExecute(val)} onSearch={handleNavSearch} value={navInputValue} onChange={setNavInputValue}>
                <Input prefix={<Search size={14} color="#3b82f6" />} placeholder="切入新标的" onPressEnter={() => handleNavExecute(navInputValue)} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}/>
              </AutoComplete>
              <Button type="primary" onClick={() => handleNavExecute(navInputValue)} className="nav-btn" style={{ background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 600, borderRadius: '8px' }}>分析</Button>
            </div>

            <Space size="middle">
              <Button type="primary" onClick={() => navigate(`/fundamentals?code=${stockCode}&name=${stockName}`)} className="nav-btn"
                style={{ background: 'linear-gradient(90deg, #059669, #10b981)', border: 'none', fontWeight: 600, height: '38px', padding: '0 20px', borderRadius: '8px', fontSize: '13px' }}>
                 <Globe size={14} style={{marginRight: '6px'}}/> 财务基本面分析
              </Button>
              <Button type="primary" onClick={() => navigate(`/report?code=${stockCode}&name=${stockName}`)} className="nav-btn"
                style={{ background: 'linear-gradient(90deg, #6d28d9, #8b5cf6)', border: 'none', fontWeight: 600, height: '38px', padding: '0 20px', borderRadius: '8px', fontSize: '13px' }}>
                <FileText size={14} style={{marginRight: '6px'}}/> 开启 AI 行业研究
              </Button>
            </Space>
          </div>

          {loading && !heavyData ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                 <Spin size="large" />
                 <div style={{ marginTop: '20px', color: '#3b82f6', letterSpacing: '2px' }}>智瞻AI引擎正在拉取市场情绪数据...</div>
             </div>
          ) : errorMsg ? (
             <Alert title="错误" description={errorMsg} type="error" showIcon style={{marginTop: '20px'}}/>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0 }}>
              <Row gutter={20} style={{ flex: '0 0 47%', marginBottom: 0, minHeight: 0 }}>
                <Col span={10} style={{ height: '100%', padding: '0 10px' }}>
                  <Card variant="borderless" style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(16px)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)', height: '100%', display: 'flex', flexDirection: 'column' }} styles={{ body: { padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' } }}>
                    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <Activity color="#00E5FF" size={18}/>
                        <span style={{ margin: 0, color: '#00E5FF', fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px' }}>实时盘口</span>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', marginBottom: '12px' }}>
                            <span style={{ fontSize: '52px', fontWeight: 800, color: isUp ? colorUp : colorDown, fontFamily: 'monospace' }}>{realtime?.price?.toFixed(2) || '0.00'}</span>
                            <span style={{ fontSize: '15px', color: isUp ? colorUp : colorDown, marginLeft: '12px', fontWeight: 700 }}>{isUp ? '+' : ''}{realtime?.change} ({isUp ? '+' : ''}{realtime?.change_pct}%)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                            <StatItem title="今开" value={realtime?.open || '-'} color="#fff" />
                            <StatItem title="最高" value={realtime?.high || '-'} color={colorUp} />
                            <StatItem title="最低" value={realtime?.low || '-'} color={colorDown} />
                        </div>
                        <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '10px', color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.03)', padding: '5px 8px', borderRadius: '6px', border: '0.5px solid rgba(255,255,255,0.04)' }}>
                            ⚠️ 若当前为非交易时段，则显示最近一个交易日的收盘数据
                        </div>
                    </div>
                  </Card>
                </Col>

                <Col span={7} style={{ height: '100%', padding: '0 10px' }}>
                  <Card variant="borderless" style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(16px)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)', height: '100%' }} styles={{ body: { padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}}>
                      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0px' }}>
                          <PieChart color="#f59e0b" size={18}/>
                          <span style={{ margin: 0, color: '#f59e0b', fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px' }}>市场情绪得分</span>
                      </div>
                      <div style={{ flex: 'none', display: 'flex', justifyContent: 'center', height: '100px' }}>
                         <ReactECharts option={optionGauge} style={{ height: '100%', width: '100%' }} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                         <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <Bot color="#3b82f6" size={16}/>
                            <Title level={5} style={{ margin: 0, color: '#f1f5f9', fontSize: '15px' }}>智瞻核心定调</Title>
                            <span style={{ marginLeft: 'auto', color: heavyData?.ai_analysis?.advice?.includes('多') || heavyData?.ai_analysis?.advice?.includes('买') ? colorUp : (heavyData?.ai_analysis?.advice?.includes('风险') || heavyData?.ai_analysis?.advice?.includes('卖') ? colorDown : '#f59e0b'), fontWeight: 'bold', border: '1px solid', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                              策略指向: {heavyData?.ai_analysis?.advice}
                            </span>
                         </div>
                         <div style={{ flex: 1, width: '100%', overflowY: 'auto', paddingRight: '4px', minHeight: 0 }}>
                           <AnimatePresence mode="wait">
                              {insights.length > 0 && (
                                <motion.div
                                   key={tickerIndex}
                                   initial={{ y: 20, opacity: 0 }}
                                   animate={{ y: 0, opacity: 1 }}
                                   exit={{ y: -20, opacity: 0 }}
                                   transition={{ duration: 0.5, ease: 'easeInOut' }}
                                   style={{ fontSize: '13px', lineHeight: '1.7', wordBreak: 'break-word' }}
                                >
                                   <div style={{ marginBottom: '8px' }}>
                                      <Text type="secondary" style={{ color: '#94a3b8' }}>核心逻辑：</Text> 
                                      <span style={{ color: '#e2e8f0' }}>{insights[tickerIndex].logic}</span>
                                   </div>
                                   <div>
                                      <Text type="secondary" style={{ color: '#94a3b8' }}>投顾简评：</Text> 
                                      <span style={{ color: '#cbd5e1' }}>{insights[tickerIndex].comment}</span>
                                   </div>
                                </motion.div>
                              )}
                           </AnimatePresence>
                         </div>
                      </div>
                  </Card>
                </Col>

                <Col span={7} style={{ height: '100%', padding: '0 10px' }}>
                  <Card variant="borderless" style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(16px)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)', height: '100%', display: 'flex', flexDirection: 'column' }} styles={{ body: { padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}}>
                      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <Globe color="#10b981" size={18}/>
                          <span style={{ margin: 0, color: '#10b981', fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px' }}>全网实时期刊资讯</span>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }} className="custom-scroll">
                          {heavyData?.news?.map((item, idx) => (
                              <div key={idx} style={{ marginBottom: '16px' }}>
                                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{item.time || '智能抓取'}</div>
                                  <a href={item.url !== '#' ? item.url : null} target="_blank" rel="noreferrer" style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.5, display: 'block', transition: 'color 0.2s' }} 
                                     onMouseOver={(e) => e.target.style.color = '#3b82f6'} onMouseOut={(e) => e.target.style.color = '#cbd5e1'}>
                                      {item.title} {item.url !== '#' && <ExternalLink size={10} style={{ display: 'inline', marginLeft: '4px' }}/>}
                                  </a>
                              </div>
                          ))}
                      </div>
                  </Card>
                </Col>
              </Row>

              <div style={{ flex: 1, padding: '0 10px', minHeight: 0 }}>
                <Card variant="borderless" style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(16px)', borderRadius: '16px', border: '1px solid rgba(59,130,246,0.3)', height: '100%', display: 'flex', flexDirection: 'column' }} styles={{ body: { padding: 0, display: 'flex', flexDirection: 'row', height: '100%' } }}>
                  <ConversationSidebar
                    module="sentiment"
                    stockCode={stockCode}
                    currentId={convId}
                    onSelect={handleSelectConv}
                    onNew={(id) => { handleNewConv(id); }}
                    refreshKey={convRefreshKey}
                  />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ flex: 'none', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                       <div style={{ position: 'relative' }}>
                          <Avatar style={{ backgroundColor: '#1d4ed8' }} icon={<Bot size={18}/>} />
                          <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, background: '#10b981', borderRadius: '50%', border: '2px solid #0f172a' }}></span>
                       </div>
                       <div>
                          <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '15px' }}>AI智能投顾 Ruiyang</div>
                          <div style={{ color: '#10b981', fontSize: '12px' }}>智瞻量化推理引擎 </div>
                       </div>
                    </div>

                    <div
                      ref={chatContainerRef}
                      onScroll={handleChatScroll}
                      style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}
                      className="custom-scroll"
                    >
                       {chatHistory.map((msg, idx) => (
                          <div key={idx} style={{ display: 'flex', flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row', gap: '12px' }}>
                             <Avatar style={{ backgroundColor: msg.sender === 'user' ? '#334155' : '#1d4ed8', flexShrink: 0 }} icon={msg.sender === 'user' ? <User size={16}/> : <Bot size={16}/>} />

                             <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {msg.sender === 'ai' && msg.isThinking && !msg.text && (
                                      <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <BrainCircuit size={16} className="animate-pulse" />
                                          智瞻AI 正在处理检索数据并思考...
                                      </div>
                                  )}

                                  {msg.text && (
                                      <div style={{
                                          padding: '14px 18px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.6,
                                          backgroundColor: msg.sender === 'user' ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                          color: '#fff', borderTopRightRadius: msg.sender === 'user' ? 2 : 12, borderTopLeftRadius: msg.sender === 'user' ? 12 : 2
                                      }}>
                                          {msg.sender === 'user' ? msg.text : (
                                              <div className="markdown-body">
                                                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                                              </div>
                                          )}
                                      </div>
                                  )}
                             </div>
                          </div>
                       ))}
                       <div ref={chatEndRef} />
                    </div>

                    <div style={{ flex: 'none', padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                       <div style={{ display: 'flex', gap: '10px' }}>
                          <Input ref={inputRef} placeholder={`向智瞻 AI 助手提问关于 ${stockName} 的事情...`} value={chatInput} onChange={(e) => setChatInput(e.target.value)} onPressEnter={handleSendMessage} disabled={chatLoading} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', height: '42px' }}/>
                          {chatLoading ? (
                            <Button type="text" icon={<StopCircle size={22} color="#ef4444" />} onClick={handleStopOutput} style={{ borderRadius: '8px', height: '42px', width: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="终止 AI 输出" />
                          ) : (
                            <Button type="primary" icon={<Send size={18} />} onClick={handleSendMessage} style={{ background: '#3b82f6', border: 'none', borderRadius: '8px', height: '42px', width: '42px' }} />
                          )}
                       </div>
                    </div>
                  </div>
                </Card>
              </div>

            </div>
          )}
          <div style={{ flexShrink: 0, textAlign: 'center', color: '#475569', fontSize: '12px', padding: '16px 0 4px 0', letterSpacing: '1px' }}>
  ⚠️ AI分析仅供参考，股市有风险，入市需谨慎。
</div>
        </div>
      </div>

      <style>{`
        body { margin: 0; }
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .markdown-body p { margin-bottom: 0.5em; }
        .markdown-body strong { color: #00E5FF; }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

        /* 导航按钮 — 悬停动效 */
        .nav-btn {
          transition: all 0.25s ease;
          cursor: pointer;
        }
        .nav-btn:hover {
          transform: scale(1.04);
          filter: brightness(1.15);
        }
        .nav-btn:active {
          transform: scale(0.97);
          transition: all 0.1s;
        }
      `}</style>
    </ConfigProvider>
  );
}