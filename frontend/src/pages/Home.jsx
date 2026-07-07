// frontend/src/pages/Home.jsx
import React, { useState, useEffect } from 'react';
import { AutoComplete, Input, Typography, Space, Row, Col, ConfigProvider, theme, message, Button } from 'antd';
import { motion } from 'framer-motion';
import { Search, TrendingUp, Cpu, Globe, ArrowRight, Activity, Zap, Info } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../api';
import AuthModal from '../components/AuthModal';
import UserMenu from '../components/UserMenu';
import CompanyProfile from '../components/CompanyProfile';
import AboutModal from '../components/AboutModal';
import PlatformIntroModal from '../components/PlatformIntroModal';

const { Title, Text } = Typography;

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

function Home() {
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedStock, setSelectedStock] = useState({ code: '600519', name: '贵州茅台' });
  const navigate = useNavigate();
  const location = useLocation();
  const [messageApi, contextHolder] = message.useMessage();
  const { user } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [platformIntroOpen, setPlatformIntroOpen] = useState(false);

  useEffect(() => {
    if (location.state?.showLogin) {
      setAuthModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, []);

  const handleSearch = async (value) => {
    setInputValue(value);
    if (value.length >= 1) {
      try {
        const res = await axios.get(`${API_BASE}/api/search?keyword=${value}`);
        setOptions(res.data);
      } catch (e) {
        console.error('搜索接口请求失败:', e);
      }
    } else {
      setOptions([]);
    }
  };

  // 解析选中的股票并更新公司简介（留在首页，不跳转）
  const selectStock = (rawVal) => {
    if (!rawVal || rawVal.trim() === '') {
      messageApi.warning('请输入公司名称或股票代码！');
      return;
    }

    let finalCode = '';
    let finalName = '';

    if (rawVal.includes(' - ')) {
      const parts = rawVal.split(' - ');
      finalCode = parts[0].trim();
      finalName = parts[1].trim();
    } else {
      const exactMatch = options.find(o => o.value === rawVal || o.label.split(' - ')[1] === rawVal);
      if (exactMatch) {
        const parts = exactMatch.label.split(' - ');
        finalCode = parts[0].trim();
        finalName = parts[1].trim();
      } else {
        const isSixDigit = /^\d{6}$/.test(rawVal);
        if (isSixDigit) {
          finalCode = rawVal;
          finalName = rawVal;
        } else {
          messageApi.error('❌ 请输入完整的公司名称，或正确的 6 位股票代码！');
          return;
        }
      }
    }

    setSelectedStock({ code: finalCode, name: finalName });
    setOptions([]);
    setInputValue('');
  };

  const goToModule = (pathTemplate) => {
    const path = pathTemplate
      .replace('{code}', selectedStock.code)
      .replace('{name}', selectedStock.name);
    navigate(path);
  };

  const { code, name } = selectedStock;

  return (
    <ConfigProvider theme={{
      algorithm: theme.darkAlgorithm,
      token: { colorPrimary: '#10b981', colorBgBase: '#0b0f19', borderRadius: 8 },
    }}>
      {contextHolder}

      <div style={{
        minHeight: '100vh', backgroundColor: '#0b0f19',
        backgroundImage: 'radial-gradient(circle at 15% 50%, rgba(16, 185, 129, 0.08), transparent 25%), radial-gradient(circle at 85% 30%, rgba(0, 112, 243, 0.08), transparent 25%)',
        color: '#f8fafc', display: 'flex', flexDirection: 'column',
      }}>

        {/* ========== 导航栏 ========== */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}
          style={{
            padding: '20px 60px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
          }}
        >
          <Space size="middle">
            <div style={{ width: 32, height: 32, background: '#10b981', borderRadius: '8px', display: 'grid', placeItems: 'center', boxShadow: '0 0 15px rgba(16,185,129,0.4)' }}>
              <Activity size={20} color="#0b0f19" strokeWidth={3} />
            </div>
            <Title level={4} style={{ margin: 0, fontWeight: 800, color: '#fff', letterSpacing: '1px' }}>
              ZHI ZHAN <span style={{ color: '#10b981' }}>.</span>
            </Title>
          </Space>

          <Space size="large" align="center">
            <span
              onClick={() => setPlatformIntroOpen(true)}
              style={{
                cursor: 'pointer', color: '#94a3b8', fontSize: '14px', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.target.style.color = '#10b981'}
              onMouseLeave={e => e.target.style.color = '#94a3b8'}
            >
              <Zap size={15} /> 平台介绍
            </span>
            <span
              onClick={() => setAboutModalOpen(true)}
              style={{
                cursor: 'pointer', color: '#94a3b8', fontSize: '14px', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.target.style.color = '#10b981'}
              onMouseLeave={e => e.target.style.color = '#94a3b8'}
            >
              <Info size={15} /> 关于我们
            </span>
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            {user ? (
              <UserMenu />
            ) : (
              <Button
                type="primary"
                ghost
                onClick={() => setAuthModalOpen(true)}
                style={{
                  borderColor: '#10b981', color: '#10b981', borderRadius: '8px',
                  fontWeight: 600, height: '34px', fontSize: '13px',
                }}
              >
                注册 / 登录
              </Button>
            )}
          </Space>
        </motion.nav>

        {/* ========== Hero 区域 ========== */}
        <div style={{ maxWidth: '1300px', width: '100%', margin: '0 auto', padding: '40px 20px 30px', flex: 1 }}>
          <Row gutter={[48, 36]} align="middle">

            <Col xs={24} lg={11}>
              <motion.div variants={staggerContainer} initial="hidden" animate="visible">
                <motion.div variants={fadeUp} style={{
                  display: 'inline-block', padding: '6px 12px',
                  background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: '30px', color: '#10b981', fontSize: '13px', fontWeight: 600,
                  marginBottom: '20px',
                }}>
                  AI-Powered Investment Research
                </motion.div>

                <motion.h1 variants={fadeUp} style={{
                  fontSize: '46px', fontWeight: 900, marginBottom: '16px',
                  lineHeight: 1.15, color: '#fff',
                }}>
                  探索数据背后的<br /><span style={{ color: '#10b981' }}>核心投资价值</span>
                </motion.h1>

                <motion.p variants={fadeUp} style={{
                  fontSize: '16px', color: '#94a3b8', marginBottom: '40px',
                  lineHeight: 1.7, maxWidth: '460px',
                }}>
                  智瞻系统深度整合财务穿透、实时行情与 RAG 驱动的 AI 研报，
                  为前沿金融机构的每一份投资决策提供硬核数据支撑。
                </motion.p>

                <motion.div variants={fadeUp} style={{ display: 'flex', width: '100%', maxWidth: '520px', gap: '12px' }}>
                  <AutoComplete
                    options={options}
                    style={{ flex: 1 }}
                    onSelect={(val) => selectStock(val)}
                    onSearch={handleSearch}
                    popupClassName="dark-popup"
                    value={inputValue}
                  >
                    <Input
                      prefix={<Search size={18} color="#10b981" style={{ marginRight: '8px' }} />}
                      placeholder="输入公司名、代码 (如: 茅台 / 600519)"
                      onPressEnter={() => selectStock(inputValue)}
                      onChange={(e) => setInputValue(e.target.value)}
                      style={{
                        fontSize: '16px', padding: '12px 16px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px', color: '#fff',
                      }}
                    />
                  </AutoComplete>
                  <Button
                    type="primary"
                    onClick={() => selectStock(inputValue)}
                    style={{
                      height: 'auto', padding: '0 28px', borderRadius: '12px',
                      background: 'linear-gradient(90deg, #10b981, #059669)',
                      border: 'none', fontWeight: 600, fontSize: '15px',
                      boxShadow: '0 4px 15px rgba(16,185,129,0.3)',
                    }}
                  >
                    浏览标的
                  </Button>
                </motion.div>
              </motion.div>
            </Col>

            <Col xs={24} lg={13}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)', width: '80%', height: '80%',
                  background: '#10b981', filter: 'blur(100px)', opacity: 0.15, borderRadius: '50%',
                }} />
                <CompanyProfile stockCode={code} stockName={name} />
              </div>
            </Col>

          </Row>

          {/* ========== 三大模块卡片 ========== */}
          <div>
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" style={{ marginTop: '60px' }}>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <Title level={3} style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '8px' }}>
                  平台核心功能
                </Title>
                <Text style={{ color: '#64748b', fontSize: '14px' }}>
                  当前标的：{name}（{code}）— 三大引擎，覆盖投研全链路
                </Text>
              </div>
              <Row gutter={[24, 24]}>
                {[
                  { title: '财务基本面分析', desc: '可视化深度剖析财务健康度', icon: <Globe />, path: `/fundamentals?code=${code}&name=${name}` },
                  { title: '股市情绪与建议', desc: 'AI 智能感知全网舆论动向', icon: <Cpu />, path: `/sentiment?code=${code}&name=${name}` },
                  { title: '行业研究报告', desc: 'RAG 技术驱动深度研报生成', icon: <TrendingUp />, path: `/report?code=${code}&name=${name}` },
                ].map((item, index) => (
                  <Col xs={24} md={8} key={index}>
                    <motion.div
                      variants={fadeUp}
                      whileHover={{ y: -8, backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(16,185,129,0.3)' }}
                      onClick={() => navigate(item.path)}
                      style={{
                        cursor: 'pointer', background: 'rgba(255,255,255,0.02)', padding: '30px 24px',
                        borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)',
                        transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', height: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', display: 'grid', placeItems: 'center', color: '#10b981', marginRight: '16px' }}>
                          {React.cloneElement(item.icon, { size: 20 })}
                        </div>
                        <Title level={5} style={{ margin: 0, color: '#e2e8f0', fontWeight: 600 }}>{item.title}</Title>
                      </div>
                      <Text style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.5, flexGrow: 1 }}>{item.desc}</Text>
                      <div style={{ marginTop: '20px', color: '#10b981', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        立即探索 <ArrowRight size={14} />
                      </div>
                    </motion.div>
                  </Col>
                ))}
              </Row>
            </motion.div>
          </div>
        </div>

        {/* ========== 站脚 ========== */}
        <div style={{
          textAlign: 'center', padding: '20px 0',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          color: '#475569', fontSize: '12px', letterSpacing: '0.5px',
          flexShrink: 0,
        }}>
          © 2026 智瞻 ZHI ZHAN · AI 投研平台 &nbsp;|&nbsp; 股市有风险，入市需谨慎
        </div>

        {/* ========== 弹窗 ========== */}
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
        <AboutModal open={aboutModalOpen} onClose={() => setAboutModalOpen(false)} />
        <PlatformIntroModal open={platformIntroOpen} onClose={() => setPlatformIntroOpen(false)} />
      </div>
    </ConfigProvider>
  );
}

export default Home;
