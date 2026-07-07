import { Modal } from 'antd';
import { Zap, TrendingUp, Shield, Layers } from 'lucide-react';

export default function PlatformIntroModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      styles={{
        content: { backgroundColor: '#0f172a', border: '1px solid #334155', padding: '36px 32px' },
        header: { backgroundColor: 'transparent', borderBottom: 'none', padding: 0, marginBottom: 0 },
      }}
      closeIcon={<span style={{ color: '#94a3b8', fontSize: '16px' }}>✖</span>}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 60, height: 60, borderRadius: '16px',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', boxShadow: '0 0 32px rgba(16, 185, 129, 0.35)',
        }}>
          <Zap size={30} color="#fff" />
        </div>

        <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.5px' }}>
          智瞻 ZHI ZHAN
        </h2>
        <p style={{ color: '#10b981', fontSize: '14px', fontWeight: 600, marginBottom: '20px' }}>
          新一代 AI 投研智能体
        </p>

        <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.9, marginBottom: '28px', textAlign: 'left', textIndent: '2em' }}>
          智瞻深度融合大语言模型与异构金融数据引擎，打通财务穿透、实时行情、全网舆情与 RAG 研报四大信息链路，
          为投资者构建从数据采集到智能分析的完整闭环，让投研决策不再依赖碎片化信息与低效人工筛选。
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
          marginBottom: '24px',
        }}>
          {[
            { icon: <TrendingUp size={18} />, title: '智能研判', desc: '多维数据交叉验证，AI 驱动深度解读' },
            { icon: <Layers size={18} />, title: '异构数据融合', desc: '财报、行情、舆情、研报一站聚合' },
            { icon: <Zap size={18} />, title: '实时响应', desc: '流式推理引擎，秒级产出分析结论' },
            { icon: <Shield size={18} />, title: '专业合规', desc: '严格免责声明，辅助决策不替代决策' },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '10px', padding: '14px',
                display: 'flex', flexDirection: 'column', gap: '6px',
              }}
            >
              <span style={{ color: '#10b981' }}>{item.icon}</span>
              <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>{item.title}</span>
              <span style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.5 }}>{item.desc}</span>
            </div>
          ))}
        </div>

        <p style={{ color: '#475569', fontSize: '12px', margin: 0 }}>
          适合追求高效投研体验的个人投资者与专业机构用户
        </p>
      </div>
    </Modal>
  );
}
