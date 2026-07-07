import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Modal, Tabs, Input, Button, message, Progress } from 'antd';
import { PhoneOutlined, LockOutlined, SafetyOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

import { API_BASE } from '../api.js';

function getPasswordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 25;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 25;
  else if (/[a-zA-Z]/.test(pw)) score += 15;
  if (/\d/.test(pw)) score += 25;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 25;
  return Math.min(100, score);
}

function strengthLabel(v) {
  if (v >= 80) return { text: '强', color: '#10b981' };
  if (v >= 50) return { text: '中', color: '#f59e0b' };
  if (v > 0) return { text: '弱', color: '#ef4444' };
  return { text: '', color: '#94a3b8' };
}

export default function AuthModal({ open, onClose }) {
  const { login, register } = useAuth();
  const [view, setView] = useState('login'); // 'login' | 'register' | 'reset'
  const [loading, setLoading] = useState(false);

  // Login form
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPw, setLoginPw] = useState('');

  // Register form
  const [regPhone, setRegPhone] = useState('');
  const [regPw, setRegPw] = useState('');
  const [regSmsCode, setRegSmsCode] = useState('');

  // Reset password form
  const [resetPhone, setResetPhone] = useState('');
  const [resetPw, setResetPw] = useState('');
  const [resetSmsCode, setResetSmsCode] = useState('');

  // SMS
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [smsDevCode, setSmsDevCode] = useState('');
  const cooldownTimer = useRef(null);

  useEffect(() => {
    return () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setView('login');
      setLoginPhone(''); setLoginPw('');
      setRegPhone(''); setRegPw(''); setRegSmsCode('');
      setResetPhone(''); setResetPw(''); setResetSmsCode('');
      setSmsCooldown(0); setSmsDevCode('');
    }
  }, [open]);

  const getCurrentPhone = useCallback(() => {
    if (view === 'register') return regPhone;
    if (view === 'reset') return resetPhone;
    return '';
  }, [view, regPhone, resetPhone]);

  const handleSendSms = useCallback(async () => {
    if (smsCooldown > 0) return;
    const phone = getCurrentPhone();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      message.warning('请输入正确的手机号');
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/api/auth/send-sms`, { phone });
      if (res.data.dev_mode) {
        setSmsDevCode(res.data.code);
        message.info(`开发模式验证码：${res.data.code}`);
      }
      let cd = 60;
      setSmsCooldown(cd);
      cooldownTimer.current = setInterval(() => {
        cd -= 1;
        if (cd <= 0) { clearInterval(cooldownTimer.current); setSmsCooldown(0); }
        else setSmsCooldown(cd);
      }, 1000);
    } catch (e) {
      message.error(e.response?.data?.detail || '发送验证码失败');
    }
  }, [smsCooldown, getCurrentPhone]);

  const handleLogin = async () => {
    if (!loginPhone || !loginPw) { message.warning('请填写手机号和密码'); return; }
    setLoading(true);
    try {
      await login(loginPhone, loginPw);
      message.success('登录成功！');
      onClose();
    } catch (e) {
      message.error(e.response?.data?.detail || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regPhone || !regPw || !regSmsCode) { message.warning('请填写所有字段'); return; }
    if (getPasswordStrength(regPw) < 50) { message.warning('密码过于简单，请设置更复杂的密码'); return; }
    setLoading(true);
    try {
      await register(regPhone, regPw, regSmsCode);
      message.success('注册成功！');
      onClose();
    } catch (e) {
      message.error(e.response?.data?.detail || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPhone || !resetPw || !resetSmsCode) { message.warning('请填写所有字段'); return; }
    if (getPasswordStrength(resetPw) < 50) { message.warning('密码过于简单，请设置更复杂的密码'); return; }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/auth/reset-password`, {
        phone: resetPhone,
        sms_code: resetSmsCode,
        new_password: resetPw,
      });
      message.success('密码重置成功！请使用新密码登录');
      setView('login');
      setLoginPhone(resetPhone);
      setLoginPw('');
    } catch (e) {
      message.error(e.response?.data?.detail || '重置失败');
    } finally {
      setLoading(false);
    }
  };

  const regPwStrength = getPasswordStrength(regPw);
  const regPwLabel = strengthLabel(regPwStrength);
  const resetPwStrength = getPasswordStrength(resetPw);
  const resetPwLabel = strengthLabel(resetPwStrength);

  // --- Reset password view ---
  if (view === 'reset') {
    return (
      <Modal open={open} onCancel={onClose} footer={null} width={420}
        styles={{
          content: { backgroundColor: '#0f172a', border: '1px solid #334155', padding: '30px' },
          header: { backgroundColor: 'transparent', borderBottom: 'none' },
        }}
        closeIcon={<span style={{ color: '#94a3b8', fontSize: '16px' }}>✖</span>}
      >
        <div style={{ marginBottom: '20px' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ color: '#94a3b8', padding: 0 }} onClick={() => setView('login')}>
            返回登录
          </Button>
        </div>
        <h3 style={{ color: '#fff', textAlign: 'center', marginBottom: '20px', fontWeight: 600 }}>重置密码</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input size="large" prefix={<PhoneOutlined style={{ color: '#64748b' }} />} placeholder="已注册的手机号"
            value={resetPhone} onChange={e => setResetPhone(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
          <div>
            <Input.Password size="large" prefix={<LockOutlined style={{ color: '#64748b' }} />} placeholder="新密码（至少8位，包含字母和数字）"
              value={resetPw} onChange={e => setResetPw(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
            {resetPw && (
              <div style={{ marginTop: '8px' }}>
                <Progress percent={resetPwStrength} size="small" strokeColor={resetPwLabel.color} showInfo={false} />
                <span style={{ fontSize: '12px', color: resetPwLabel.color, fontWeight: 500 }}>密码强度：{resetPwLabel.text}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Input size="large" prefix={<SafetyOutlined style={{ color: '#64748b' }} />} placeholder="短信验证码"
              value={resetSmsCode} onChange={e => setResetSmsCode(e.target.value)} onPressEnter={handleResetPassword}
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
            <Button size="large" disabled={smsCooldown > 0} onClick={handleSendSms}
              style={{ whiteSpace: 'nowrap', background: smsCooldown > 0 ? '#334155' : '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 500 }}>
              {smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
            </Button>
          </div>
          {smsDevCode && (
            <div style={{ fontSize: '12px', color: '#f59e0b', textAlign: 'center' }}>开发模式，验证码：{smsDevCode}</div>
          )}
          <Button type="primary" block size="large" loading={loading} onClick={handleResetPassword}
            style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)', border: 'none', fontWeight: 600, borderRadius: '8px', height: '44px' }}>
            重置密码
          </Button>
        </div>
      </Modal>
    );
  }

  // --- Login / Register tabs ---
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={420}
      styles={{
        content: { backgroundColor: '#0f172a', border: '1px solid #334155', padding: '30px' },
        header: { backgroundColor: 'transparent', borderBottom: 'none' },
      }}
      closeIcon={<span style={{ color: '#94a3b8', fontSize: '16px' }}>✖</span>}
    >
      <Tabs activeKey={view} onChange={setView} centered
        items={[
          {
            key: 'login',
            label: <span style={{ color: view === 'login' ? '#10b981' : '#94a3b8', fontWeight: 600 }}>登录</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input size="large" prefix={<PhoneOutlined style={{ color: '#64748b' }} />} placeholder="手机号"
                  value={loginPhone} onChange={e => setLoginPhone(e.target.value)} onPressEnter={handleLogin}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                <Input.Password size="large" prefix={<LockOutlined style={{ color: '#64748b' }} />} placeholder="密码"
                  value={loginPw} onChange={e => setLoginPw(e.target.value)} onPressEnter={handleLogin}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                <Button type="primary" block size="large" loading={loading} onClick={handleLogin}
                  style={{ background: 'linear-gradient(90deg, #10b981, #059669)', border: 'none', fontWeight: 600, borderRadius: '8px', height: '44px' }}>
                  登录
                </Button>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ cursor: 'pointer', color: '#f59e0b', fontSize: '13px' }}
                    onClick={() => setView('reset')}>
                    忘记密码？
                  </span>
                </div>
              </div>
            ),
          },
          {
            key: 'register',
            label: <span style={{ color: view === 'register' ? '#10b981' : '#94a3b8', fontWeight: 600 }}>注册</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input size="large" prefix={<PhoneOutlined style={{ color: '#64748b' }} />} placeholder="手机号"
                  value={regPhone} onChange={e => setRegPhone(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                <div>
                  <Input.Password size="large" prefix={<LockOutlined style={{ color: '#64748b' }} />} placeholder="密码（至少8位，包含字母和数字）"
                    value={regPw} onChange={e => setRegPw(e.target.value)}
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                  {regPw && (
                    <div style={{ marginTop: '8px' }}>
                      <Progress percent={regPwStrength} size="small" strokeColor={regPwLabel.color} showInfo={false} />
                      <span style={{ fontSize: '12px', color: regPwLabel.color, fontWeight: 500 }}>密码强度：{regPwLabel.text}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Input size="large" prefix={<SafetyOutlined style={{ color: '#64748b' }} />} placeholder="短信验证码"
                    value={regSmsCode} onChange={e => setRegSmsCode(e.target.value)} onPressEnter={handleRegister}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                  <Button size="large" disabled={smsCooldown > 0} onClick={handleSendSms}
                    style={{ whiteSpace: 'nowrap', background: smsCooldown > 0 ? '#334155' : '#7e22ce', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 500 }}>
                    {smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
                  </Button>
                </div>
                {smsDevCode && (
                  <div style={{ fontSize: '12px', color: '#f59e0b', textAlign: 'center' }}>开发模式，验证码：{smsDevCode}</div>
                )}
                <Button type="primary" block size="large" loading={loading} onClick={handleRegister}
                  style={{ background: 'linear-gradient(90deg, #7e22ce, #a855f7)', border: 'none', fontWeight: 600, borderRadius: '8px', height: '44px' }}>
                  注册
                </Button>
              </div>
            ),
          },
        ]}
        tabBarStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      />
    </Modal>
  );
}
