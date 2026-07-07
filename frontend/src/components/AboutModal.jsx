import { Modal, Typography } from 'antd';
import { Mail, Shield, Zap } from 'lucide-react';

const { Text } = Typography;

export default function AboutModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={440}
      styles={{
        content: { backgroundColor: '#0f172a', border: '1px solid #334155', padding: '36px 32px' },
        header: { backgroundColor: 'transparent', borderBottom: 'none', padding: 0, marginBottom: 0 },
      }}
      closeIcon={<span style={{ color: '#94a3b8', fontSize: '16px' }}>✖</span>}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '14px',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', boxShadow: '0 0 24px rgba(16, 185, 129, 0.3)',
        }}>
          <Zap size={28} color="#fff" />
        </div>

        <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
          智瞻 ZHI ZHAN
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.7, marginBottom: '24px' }}>
          深度整合财务穿透、实时行情与 RAG 驱动的 AI 研报，
          为投资决策提供硬核数据支撑。
        </p>

        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px', padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Mail size={18} color="#10b981" />
            <Text style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 500 }}>联系与反馈</Text>
          </div>
          <a
            href="mailto:your-email@example.com"
            style={{
              color: '#10b981', fontSize: '15px', fontWeight: 600,
              textDecoration: 'none', display: 'block', marginBottom: '8px',
            }}
          >
            your-email@example.com
          </a>
          <p style={{ color: '#64748b', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>
            如有问题、建议或合作意向，欢迎发送邮件。
            <br />我们会在 1-2 个工作日内回复。
          </p>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          marginTop: '20px', color: '#475569', fontSize: '12px',
        }}>
          <Shield size={13} />
          <span>您的隐私与信息安全是我们的首要保障</span>
        </div>
      </div>
    </Modal>
  );
}
