import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Typography, ConfigProvider, theme, Space, Button, Input, AutoComplete, message, Modal } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { UploadCloud, Cpu, Globe, Download, Send, CheckCircle2, Loader2, FileCheck2, Layers, ArrowLeft, Search, Zap, Tag, Bot, User, BrainCircuit, Eye, Trash2, FileText, File, StopCircle, Paperclip } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../context/AuthContext';
import ConversationSidebar from '../components/ConversationSidebar';

const { Title } = Typography;

const INTENT_LABELS = {
  off_topic: '引导回正题',
  clarify: '需求对齐',
  focused: '专题分析',
  revise: '研报修订',
  full_report: '完整研报',
};

const THINKING_TEXT = {
  off_topic: '正在理解您的提问...',
  clarify: '正在理解您的投研需求，准备与您对齐分析方向...',
  focused: '正在调取知识库与全网数据，撰写专题分析...',
  revise: '正在根据您的意见修订研报内容...',
  full_report: '正在调取知识库与全网数据，撰写完整深度研报...',
};

import { API_BASE } from '../api';

export default function ReportWorkspace() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const stockCode = searchParams.get('code') || '600519';
  const stockName = searchParams.get('name') || '贵州茅台';
  const { data: industry = '分析中...' } = useQuery({
    queryKey: ['industry', stockCode],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/industry?code=${stockCode}&name=${stockName}`);
      return res.data.industry || '全市场综合研判';
    },
    staleTime: Infinity,  // 行业分类永不变化，一次请求永久缓存
  });

  const [navOptions, setNavOptions] = useState([]);
  const [navInputValue, setNavInputValue] = useState('');

  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);

  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const abortControllerRef = useRef(null);
  const inputRef = useRef(null);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');

  const [exportModalVisible, setExportModalVisible] = useState(false);

  // Conversation state
  const [convId, setConvId] = useState(null);
  const [convRefreshKey, setConvRefreshKey] = useState(0);
  const [pdfPopoverOpen, setPdfPopoverOpen] = useState(false);

  const hasExportableReport = chatHistory.some(
    (m) => m.sender === 'ai' && m.exportable && m.text
  );

  useEffect(() => {
    setChatHistory([
      {
        sender: 'ai',
        text: industry === '分析中...'
          ? `您好，我是智瞻首席行业研究员Ruiyang。正在锁定 **${stockName}** 的宏观生态图谱...`
          : `您好，我是智瞻首席研究员Ruiyang。当前标的归属赛道已锁定为 **【${industry}】**。\n\n您可以告诉我关注的分析角度，我会先和您对齐需求；需要完整深度研报时，请明确说 **「生成完整深度研报」**，我将按标准格式输出。`,
        intent: 'clarify',
        exportable: false,
      },
    ]);
    userScrolledUpRef.current = false;
  }, [stockName, industry]);

  const handleChatScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
    userScrolledUpRef.current = !isNearBottom;
  };

  useEffect(() => {
    const container = chatContainerRef.current;
    if (container && chatEndRef.current && !userScrolledUpRef.current) {
      const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
      if (isNearBottom) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [chatHistory]);

  const handleNavSearch = async (value) => {
    setNavInputValue(value);
    if (value.length >= 1) {
      try {
        const res = await axios.get(`${API_BASE}/api/search?keyword=${value}`, { timeout: 5000 });
        setNavOptions(res.data);
      } catch (e) {}
    } else {
      setNavOptions([]);
    }
  };

  const handleNavExecute = (rawVal) => {
    if (!rawVal || rawVal.trim() === '') {
      messageApi.warning('请输入公司名称或股票代码！');
      return;
    }
    let finalCode = rawVal;
    let finalName = '智能诊断标的';
    if (rawVal.includes(' - ')) {
      const parts = rawVal.split(' - ');
      finalCode = parts[0].trim();
      finalName = parts[1].trim();
    } else {
      const exactMatch = navOptions.find((o) => o.value === rawVal || o.label.split(' - ')[1] === rawVal);
      if (exactMatch) {
        const parts = exactMatch.label.split(' - ');
        finalCode = parts[0].trim();
        finalName = parts[1].trim();
      } else if (/^\d{6}$/.test(rawVal)) {
        finalCode = rawVal;
      } else {
        messageApi.error('❌ 请输入完整的公司名称或 6 位代码！');
        return;
      }
    }
    setSearchParams({ code: finalCode, name: finalName });
    setNavInputValue('');
  };

  const fileInputRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      messageApi.error('仅支持上传 PDF 格式的研报！');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('${API_BASE}/api/rag/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data.status === 'success') {
        const newDoc = { id: response.data.doc_id, title: response.data.title, url: URL.createObjectURL(file) };
        setUploadedDocs((prev) => [...prev, newDoc]);
        setSelectedDocs((prev) => [...prev, newDoc.id]);
        messageApi.success('研报切片解析入库成功！');
      } else {
        messageApi.error('文件解析失败：' + response.data.message);
      }
    } catch (error) {
      messageApi.error('网络异常，上传失败。');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleDocSelection = (id) => {
    setSelectedDocs((prev) => (prev.includes(id) ? prev.filter((docId) => docId !== id) : [...prev, id]));
  };

  const openPreview = (e, url, title) => {
    e.stopPropagation();
    setPreviewUrl(url);
    setPreviewTitle(title);
    setPreviewVisible(true);
  };

  const handleDeleteDoc = async (e, docId) => {
    e.stopPropagation();
    setUploadedDocs((prev) => prev.filter((doc) => doc.id !== docId));
    setSelectedDocs((prev) => prev.filter((id) => id !== docId));
    try {
      await axios.post('${API_BASE}/api/rag/delete_doc', { doc_id: docId });
    } catch (error) {}
  };

  const handleSend = async () => {
    if (!inputText.trim() || isGenerating) return;

    const userMessage = { sender: 'user', text: inputText };
    const currentAiMessageIndex = chatHistory.length + 1;

    setChatHistory([
      ...chatHistory,
      userMessage,
      { sender: 'ai', isThinking: true, text: '', intent: 'clarify', exportable: false },
    ]);
    setInputText('');
    setIsGenerating(true);
    userScrolledUpRef.current = false;

    // Create conversation if not exists
    let currentConvId = convId;
    if (!currentConvId) {
      try {
        const res = await axios.post(`${API_BASE}/api/chat/conversations`, {
          module: 'report',
          stock_code: stockCode,
          stock_name: stockName,
        });
        currentConvId = res.data.id;
        setConvId(res.data.id);
      } catch (e) {
        messageApi.error('创建对话失败');
        setIsGenerating(false);
        return;
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let aiContent = '';
    let intent = 'clarify';
    let exportable = false;

    try {
      const response = await fetch(`${API_BASE}/api/rag/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          stock_code: stockCode,
          stock_name: stockName,
          industry: industry,
          message: userMessage.text,
          selected_docs: selectedDocs,
          history: chatHistory.filter((h) => !h.isThinking).slice(-30),
          conversation_id: currentConvId || '',
        }),
        signal: controller.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const dataStr = line.replace('data: ', '').trim();
          if (dataStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(dataStr);

            if (parsed.type === 'meta') {
              intent = parsed.intent || 'clarify';
              exportable = parsed.exportable || false;
            }

            if (parsed.type === 'answer') {
              aiContent += parsed.content;
            }

            if (parsed.type === 'done') {
              intent = parsed.intent || intent;
              exportable = parsed.exportable ?? exportable;
            }

            setChatHistory((prev) => {
              const updated = [...prev];
              updated[currentAiMessageIndex] = {
                sender: 'ai',
                isThinking: !aiContent,
                text: aiContent,
                intent,
                exportable,
              };
              return updated;
            });
          } catch (e) {}
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setChatHistory((prev) => {
          const updated = [...prev];
          updated[currentAiMessageIndex] = {
            sender: 'ai',
            isThinking: false,
            text: '网络波动，推理链中断。',
            intent: 'clarify',
            exportable: false,
          };
          return updated;
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      inputRef.current?.focus();
      // Save messages after stream completes (use a local var to track conv ID)
      const finalConvId = currentConvId;
      if (finalConvId && aiContent) {
        axios.post(`${API_BASE}/api/chat/conversations/${finalConvId}/messages`, {
          messages: [
            { sender: 'user', text: userMessage.text, selected_docs: selectedDocs },
            { sender: 'ai', text: aiContent, intent, exportable },
          ],
        }).then(() => {
          setConvRefreshKey(k => k + 1);
        }).catch(() => {});
        axios.put(`${API_BASE}/api/chat/conversations/${finalConvId}`, { selected_docs: selectedDocs }).catch(() => {});
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
        intent: m.intent,
        exportable: m.exportable,
        isThinking: false,
      }));
      setChatHistory(msgs);
      setConvId(conv.id);
      if (conv.selected_docs) {
        setSelectedDocs(conv.selected_docs);
      } else {
        setSelectedDocs([]);
      }
      userScrolledUpRef.current = false;
    } catch (e) {
      messageApi.error('加载对话失败');
    }
  };

  const handleNewConv = async (id) => {
    if (id) {
      setConvId(id);
      setChatHistory([]);
    } else {
      setConvId(null);
      setChatHistory([]);
    }
    setSelectedDocs([]);
    userScrolledUpRef.current = false;
  };

  const saveMessagesToBackend = async (userText, aiText, aiIntent, aiExportable) => {
    if (!convId) return;
    try {
      const payload = {
        messages: [
          { sender: 'user', text: userText },
          { sender: 'ai', text: aiText, intent: aiIntent, exportable: aiExportable },
        ],
      };
      // Include selected_docs on the user message so backend can store it
      payload.messages[0].selected_docs = selectedDocs;
      await axios.post(`${API_BASE}/api/chat/conversations/${convId}/messages`, payload);

      // Save selected_docs to conversation
      await axios.put(`${API_BASE}/api/chat/conversations/${convId}`, { selected_docs: selectedDocs });

      setConvRefreshKey(k => k + 1);
    } catch (e) {
      console.error('Failed to save messages:', e);
    }
  };

  const handleOpenExport = () => {
    if (!hasExportableReport) {
      messageApi.warning('当前仅有对话或专题分析，请说「生成完整深度研报」后再导出。');
      return;
    }
    setExportModalVisible(true);
  };

  const handleExport = async (format) => {
    if (industry === '分析中...') {
      messageApi.warning('行业分类加载中，请稍后再试');
      return;
    }

    const exportableReports = chatHistory.filter(
      (m) => m.sender === 'ai' && m.exportable && m.text
    );

    if (exportableReports.length === 0) {
      messageApi.warning('暂无可导出的完整深度研报。请先明确要求「生成完整深度研报」。');
      setExportModalVisible(false);
      return;
    }

    const reportMessage = exportableReports[exportableReports.length - 1];

    messageApi.loading(`正在由后端高精引擎原生渲染 ${format.toUpperCase()}，请稍候...`, 0);

    try {
      const response = await axios.post(
        `${API_BASE}/api/rag/export/${format}`,
        {
          stock_name: stockName,
          industry: industry,
          markdown_content: reportMessage.text,
        },
        { responseType: 'blob' }
      );

      // Check if response is JSON error (blob mode still returns proper headers)
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await response.data.text();
        let errMsg = '导出失败';
        try { const errData = JSON.parse(text); errMsg = errData.message || errMsg; } catch {}
        messageApi.destroy();
        messageApi.error(errMsg);
        setExportModalVisible(false);
        return;
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      // 从报告内容中提取股票名（与后端 _extract_stock_from_report 逻辑一致），
      // 历史报告即使与当前页面标的不同的也能正确命名
      const reportStockMatch = reportMessage.text.match(/# 智瞻深度研报_(.+?)_/);
      const reportStockName = reportStockMatch ? reportStockMatch[1] : stockName;
      link.setAttribute('download', `智瞻深度研报_${reportStockName}.${format === 'word' ? 'docx' : 'pdf'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      messageApi.destroy();
      messageApi.success('公文级高精文档导出成功！');
    } catch (error) {
      messageApi.destroy();
      console.error('Export failed:', error);
      messageApi.error('导出失败，请检查后端引擎服务。');
    }
    setExportModalVisible(false);
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorBgBase: '#060a12' } }}>
      {contextHolder}

      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#060a12', backgroundImage: 'radial-gradient(circle at 50% -30%, rgba(139, 92, 246, 0.15), rgba(6, 10, 18, 1) 70%)', color: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ maxWidth: '1750px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 32px' }}>

          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Space size="large" align="center">
              <Button type="text" icon={<ArrowLeft size={18} />} style={{ color: '#64748b' }} onClick={() => navigate('/')}>返回数据主舱</Button>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)' }}></div>
              <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={22} color="#a855f7" />
                <span style={{ background: 'linear-gradient(135deg, #fff 30%, #64748b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '22px', fontWeight: 800 }}>
                  {stockName}{' '}
                  <span style={{ color: '#a855f7', WebkitTextFillColor: '#a855f7', fontSize: '18px', background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                    {stockCode}
                  </span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '4px 12px', borderRadius: '8px', fontSize: '13px', color: '#94a3b8', marginLeft: '8px', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)' }}>
                  <Tag size={14} color="#a855f7" style={{ opacity: 0.8 }} /> 所属宏观赛道：
                  <span style={{ color: industry === '分析中...' ? '#64748b' : '#34d399', fontWeight: 600, letterSpacing: '0.5px' }}>{industry}</span>
                </div>
              </Title>
            </Space>

            <div style={{ display: 'flex', width: '300px', marginLeft: 'auto', marginRight: '40px', gap: '8px' }}>
              <AutoComplete options={navOptions} style={{ flex: 1 }} onSelect={(val) => handleNavExecute(val)} onSearch={handleNavSearch} value={navInputValue} onChange={setNavInputValue}>
                <Input prefix={<Search size={14} color="#a855f7" />} placeholder="切入新标的" onPressEnter={() => handleNavExecute(navInputValue)} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }} />
              </AutoComplete>
              <Button type="primary" onClick={() => handleNavExecute(navInputValue)} className="nav-btn" style={{ background: '#a855f7', color: '#fff', border: 'none', fontWeight: 600, borderRadius: '8px' }}>分析</Button>
            </div>

            <Space size="middle">
              <Button type="primary" onClick={() => navigate(`/fundamentals?code=${stockCode}&name=${stockName}`)} className="nav-btn" style={{ background: 'linear-gradient(90deg, #059669, #10b981)', border: 'none', fontWeight: 600, height: '38px', padding: '0 20px', borderRadius: '8px', fontSize: '13px' }}>
                <Globe size={14} style={{ marginRight: '6px' }} /> 财务基本面分析
              </Button>
              <Button type="primary" onClick={() => navigate(`/sentiment?code=${stockCode}&name=${stockName}`)} className="nav-btn" style={{ background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)', border: 'none', fontWeight: 600, height: '38px', padding: '0 20px', borderRadius: '8px', fontSize: '13px' }}>
                <Zap size={14} style={{ marginRight: '6px' }} /> 开启 AI 舆情分析
              </Button>
            </Space>
          </div>

          <style>{`
            .glass-panel { background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
            .upload-box { border: 2px dashed rgba(51, 65, 85, 0.6); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; align-items: center; color: #94a3b8; cursor: pointer; transition: all 0.3s; margin-bottom: 16px; }
            .upload-box:hover { border-color: rgba(168, 85, 247, 0.5); background: rgba(168, 85, 247, 0.05); color: #c084fc; }
            .doc-item { padding: 10px; border-radius: 8px; border: 1px solid rgba(51, 65, 85, 0.5); cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; background: rgba(30, 41, 59, 0.3); }
            .doc-item:hover { background: rgba(30, 41, 59, 0.8); border-color: rgba(71, 85, 105, 0.8); }
            .doc-item.selected { background: rgba(168, 85, 247, 0.15); border-color: rgba(168, 85, 247, 0.5); box-shadow: 0 0 10px rgba(168, 85, 247, 0.1); }
            .export-btn { display: flex; align-items: center; gap: 8px; background: linear-gradient(to right, #6d28d9, #8b5cf6); color: white; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; box-shadow: 0 0 15px rgba(139, 92, 246, 0.3); transition: all 0.3s; font-weight: 600;}
            .export-btn:hover:not(:disabled) { box-shadow: 0 0 20px rgba(139, 92, 246, 0.6); transform: translateY(-1px); }
            .export-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; transform: none; }
            .input-wrapper { display: flex; align-items: center; background: #0a0f18; border: 1px solid rgba(51, 65, 85, 0.6); border-radius: 12px; padding: 8px; transition: all 0.3s; max-width: 896px; margin: 0 auto; width: 100%;}
            .input-wrapper:focus-within { border-color: rgba(168, 85, 247, 0.5); box-shadow: 0 0 15px rgba(168, 85, 247, 0.15); }
            .send-btn { background: #a855f7; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; margin-left: 8px; transition: all 0.3s; display: flex; align-items: center; justify-content: center; }
            .send-btn:hover { background: #c084fc; box-shadow: 0 0 15px rgba(168, 85, 247, 0.4); }
            .send-btn:disabled { background: #334155; color: #64748b; cursor: not-allowed; box-shadow: none; }
            .hide-scrollbar::-webkit-scrollbar { width: 6px; }
            .hide-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .hide-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
            .hide-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

            .markdown-body { padding: 10px 0; }
            .markdown-body h1 { font-size: 22px; color: #fff; margin-top: 30px; margin-bottom: 20px; border-bottom: 2px solid #a855f7; padding-bottom: 10px; font-weight: bold; text-align: center; }
            .markdown-body h2 { font-size: 17px; color: #e2e8f0; margin-top: 24px; margin-bottom: 16px; border-left: 4px solid #a855f7; padding-left: 12px; font-weight: bold; }
            .markdown-body h3 { font-size: 15px; color: #cbd5e1; margin-top: 18px; margin-bottom: 10px; font-weight: 600; }
            .markdown-body h4 { font-size: 15px; color: #94a3b8; margin-top: 14px; margin-bottom: 8px; font-weight: 600; }
            .markdown-body p { margin-bottom: 1.2em; line-height: 1.8; text-align: justify; color: #cbd5e1; }
            .markdown-body ul { padding-left: 24px; margin-bottom: 16px; list-style-type: disc; }
            .markdown-body li { margin-bottom: 8px; line-height: 1.7; color: #cbd5e1; }
            .markdown-body strong { color: #d946ef; font-weight: 600; background: rgba(217, 70, 239, 0.1); padding: 0 4px; border-radius: 4px; }

            .markdown-body table { width: 100%; border-collapse: collapse; margin: 16px 0; background: rgba(255,255,255,0.02); }
            .markdown-body th, .markdown-body td { border: 1px solid #334155; padding: 10px; text-align: center; color: #cbd5e1; font-size: 14px; }
            .markdown-body th { background-color: rgba(168, 85, 247, 0.15); font-weight: bold; color: #f3e8ff; border-bottom: 2px solid #a855f7; }
            .markdown-body tr:hover { background-color: rgba(255,255,255,0.05); }

            .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

            .export-option-btn { width: 100%; height: 80px; display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 18px; font-weight: bold; border-radius: 12px; cursor: pointer; transition: all 0.3s; border: none; }
            .export-pdf { background: linear-gradient(135deg, #ef4444, #b91c1c); color: white; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3); }
            .export-pdf:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(239, 68, 68, 0.5); }
            .export-word { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3); }
            .export-word:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5); }

            .intent-badge { font-size: 11px; color: #a855f7; background: rgba(168,85,247,0.1); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(168,85,247,0.2); }

            /* 导航按钮 — 高级感悬停动效 */
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

          <div style={{ flex: 1, display: 'flex', gap: '20px', minHeight: 0, paddingBottom: '10px' }}>

            <ConversationSidebar
              module="report"
              stockCode={stockCode}
              currentId={convId}
              onSelect={handleSelectConv}
              onNew={(id) => { handleNewConv(id); }}
              refreshKey={convRefreshKey}
            />

            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minHeight: 0 }}>

              <div style={{ flexShrink: 0, height: '64px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'rgba(15, 23, 42, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>
                    <Cpu size={14} style={{ display: 'inline', marginBottom: '-2px', marginRight: '4px' }} /> 智瞻融合检索引擎
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '4px' }}>
                    已自动开启：底层系统RAG知识库{selectedDocs.length > 0 && `+ ${selectedDocs.length} 份私有文件`}
                  </span>
                </div>
                <button
                  className="export-btn"
                  onClick={handleOpenExport}
                  disabled={!hasExportableReport}
                  title={hasExportableReport ? '导出完整深度研报' : '需先生成完整深度研报才可导出'}
                >
                  <Download size={16} /> 导出标准研报
                </button>
              </div>

              <div
                ref={chatContainerRef}
                onScroll={handleChatScroll}
                className="hide-scrollbar"
                style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}
              >
                {chatHistory.map((msg, idx) => {
                  const isLastAiMessage = msg.sender === 'ai' && !msg.isThinking && idx === chatHistory.length - 1;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                        gap: '16px',
                      }}
                    >
                      <div style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '50%', background: msg.sender === 'user' ? '#334155' : '#7e22ce', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {msg.sender === 'user' ? <User size={18} color="#fff" /> : <Bot size={18} color="#fff" />}
                      </div>

                      <div
                        style={{
                          maxWidth: msg.sender === 'ai' ? '100%' : '85%',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        {msg.sender === 'ai' && msg.intent && !msg.isThinking && (
                          <span className="intent-badge">
                            {INTENT_LABELS[msg.intent] || msg.intent}
                            {msg.exportable ? ' · 可导出' : ''}
                          </span>
                        )}

                        {msg.sender === 'ai' && msg.isThinking && !msg.text && (
                          <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BrainCircuit size={18} className="animate-pulse" />
                            {THINKING_TEXT[msg.intent] || THINKING_TEXT.clarify}
                          </div>
                        )}

                        {msg.text && (
                          <div
                            id={isLastAiMessage ? 'latest-report-content' : ''}
                            style={{
                              padding: '12px 20px',
                              borderRadius: '12px',
                              fontSize: '15px',
                              backgroundColor: msg.sender === 'user' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                              border: msg.sender === 'user' ? '1px solid rgba(168, 85, 247, 0.3)' : 'none',
                              color: '#e2e8f0',
                              width: msg.sender === 'user' ? 'fit-content' : '100%',
                            }}
                          >
                            {msg.sender === 'user' ? (
                              msg.text
                            ) : (
                              <div className="markdown-body">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              <div style={{ flexShrink: 0, padding: '24px', background: 'linear-gradient(to top, rgba(6, 10, 18, 1), rgba(15, 23, 42, 0.9), transparent)', paddingTop: '30px', position: 'relative' }}>
                {/* Selected PDF tags */}
                {selectedDocs.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap', padding: '0 4px' }}>
                    {uploadedDocs.filter(d => selectedDocs.includes(d.id)).map(doc => (
                      <Tag key={doc.id} closable color="purple" onClose={() => toggleDocSelection(doc.id)}
                        style={{ fontSize: '11px', margin: 0, cursor: 'pointer' }}>
                        {doc.title.length > 20 ? doc.title.slice(0, 20) + '..' : doc.title}
                      </Tag>
                    ))}
                  </div>
                )}
                <div className="input-wrapper">
                  {/* PDF "+" button */}
                  <button
                    onClick={() => setPdfPopoverOpen(!pdfPopoverOpen)}
                    style={{
                      background: 'transparent', border: 'none', color: '#a855f7', cursor: 'pointer',
                      padding: '4px 6px', display: 'flex', alignItems: 'center', flexShrink: 0,
                    }}
                    title="管理参考文件"
                  >
                    <Paperclip size={18} />
                  </button>
                  <Input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onPressEnter={handleSend}
                    placeholder="输入投研指令，如：重点分析竞争格局 / 生成完整深度研报"
                    disabled={isGenerating}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: '#e2e8f0', padding: '0 8px', boxShadow: 'none' }}
                  />
                  {isGenerating ? (
                    <button onClick={handleStopOutput} className="send-btn" style={{ background: '#ef4444' }} title="终止 AI 输出">
                      <StopCircle size={16} />
                    </button>
                  ) : (
                    <button onClick={handleSend} disabled={!inputText.trim()} className="send-btn">
                      <Send size={16} style={{ transform: inputText.trim() ? 'translate(2px, -2px)' : 'none', transition: 'all 0.3s' }} />
                    </button>
                  )}
                </div>
                {/* PDF popover */}
                {pdfPopoverOpen && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: '24px', marginBottom: '8px',
                    width: '320px', maxHeight: '280px', overflowY: 'auto',
                    background: '#0f172a', border: '1px solid #334155', borderRadius: '12px',
                    padding: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', zIndex: 10,
                  }}>
                    <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                    <div className="upload-box" style={{ zIndex: 1 }} onClick={() => !isUploading && fileInputRef.current.click()}>
                      {isUploading ? <Loader2 size={18} className="animate-spin" style={{ color: '#c084fc' }} /> : <UploadCloud size={18} />}
                      <span style={{ fontSize: '12px' }}>{isUploading ? '正在切片解析中...' : '上传新 PDF 研报'}</span>
                    </div>
                    {uploadedDocs.length > 0 && (
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '12px', marginBottom: '6px' }}>已上传文件（点击选择/取消）</div>
                    )}
                    {uploadedDocs.map((doc) => (
                      <div key={doc.id} onClick={() => toggleDocSelection(doc.id)}
                        className={`doc-item ${selectedDocs.includes(doc.id) ? 'selected' : ''}`}
                        style={{ padding: '8px 10px', borderRadius: '6px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                          <FileCheck2 size={12} color={selectedDocs.includes(doc.id) ? '#c084fc' : '#64748b'} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedDocs.includes(doc.id) ? '#f3e8ff' : '#cbd5e1' }}>
                            {doc.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '8px' }}>
                          <Eye size={12} color="#94a3b8" onClick={(e) => openPreview(e, doc.url, doc.title)} />
                          <Trash2 size={12} color="#ef4444" onClick={(e) => handleDeleteDoc(e, doc.id)} />
                          {selectedDocs.includes(doc.id) && <CheckCircle2 size={12} color="#c084fc" />}
                        </div>
                      </div>
                    ))}
                    {uploadedDocs.length === 0 && !isUploading && (
                      <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', marginTop: '12px' }}>
                        暂无私有文件，上传 PDF 后可被 RAG 检索引擎参考
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
          <div style={{ textAlign: 'center', color: '#475569', fontSize: '12px', padding: '12px 0 0 0', marginTop: 'auto', letterSpacing: '1px' }}>
            ⚠️ AI分析仅供参考，股市有风险，入市需谨慎。
          </div>
        </div>
      </div>

      <Modal
        title={<span style={{ color: '#e2e8f0' }}>{previewTitle}</span>}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={1000}
        styles={{ body: { height: '70vh', padding: 0 }, content: { backgroundColor: '#0f172a', border: '1px solid #334155' }, header: { backgroundColor: '#0f172a', borderBottom: '1px solid #334155', paddingBottom: '12px' } }}
        closeIcon={<span style={{ color: '#94a3b8', fontSize: '16px' }}>✖</span>}
      >
        <iframe src={previewUrl} width="100%" height="100%" style={{ border: 'none', borderRadius: '0 0 8px 8px' }} title="PDF Preview" />
      </Modal>

      <Modal
        title={<div style={{ textAlign: 'center', color: '#fff', fontSize: '20px', marginBottom: '20px' }}><Download size={20} style={{ display: 'inline', marginBottom: '-3px' }} /> 请选择研报导出格式</div>}
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={null}
        width={450}
        styles={{ content: { backgroundColor: '#0f172a', border: '1px solid #334155', padding: '30px' }, header: { backgroundColor: 'transparent', borderBottom: 'none' } }}
        closeIcon={<span style={{ color: '#94a3b8' }}>✖</span>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <button className="export-option-btn export-pdf" onClick={() => handleExport('pdf')}>
            <FileText size={24} /> 导出为高清 PDF (A4/公文格式)
          </button>
          <button className="export-option-btn export-word" onClick={() => handleExport('word')}>
            <File size={24} /> 导出为 Word 文档 (.doc)
          </button>
        </div>
      </Modal>

    </ConfigProvider>
  );
}