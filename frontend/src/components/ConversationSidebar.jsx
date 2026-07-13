import React, { useState } from 'react';
import { Button, Spin, Popconfirm, Tag, message } from 'antd';
import { PlusOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

import { API_BASE } from '../api.js';

export default function ConversationSidebar({ module, stockCode, currentId, onSelect, onNew, refreshKey }) {
  const { token } = useAuth();
  const [hoveredId, setHoveredId] = useState(null);
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading: loading } = useQuery({
    queryKey: ['conversations', module, refreshKey],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/chat/conversations?module=${module}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token,  // token 就绪后才请求
  });

  const refreshConversations = () => {
    queryClient.invalidateQueries({ queryKey: ['conversations', module] });
  };

  const handleNew = async () => {
    try {
      const res = await axios.post(`${API_BASE}/api/chat/conversations`, {
        module,
        stock_code: stockCode || '',
        stock_name: '',
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (onNew) onNew(res.data.id);
      refreshConversations();
    } catch (e) {
      message.error('创建对话失败');
    }
  };

  const handleDelete = async (e, convId) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API_BASE}/api/chat/conversations/${convId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (convId === currentId && onNew) {
        onNew(null);
      }
      refreshConversations();
    } catch (e) {
      message.error('删除失败');
    }
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div style={{
      width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(16px)',
      borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageOutlined style={{ color: module === 'report' ? '#a855f7' : '#3b82f6' }} />
          聊天记录
        </span>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleNew}
          style={{
            background: module === 'report' ? '#a855f7' : '#3b82f6',
            border: 'none', borderRadius: '6px', fontWeight: 600,
          }}
        >
          新对话
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }} className="conv-scroll">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="small" /></div>
        ) : conversations.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '40px 16px', lineHeight: 1.8 }}>
            暂无对话记录<br />点击「新对话」开始
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelect && onSelect(conv)}
              onMouseEnter={() => setHoveredId(conv.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                padding: '12px', marginBottom: '4px', borderRadius: '10px',
                cursor: 'pointer', transition: 'all 0.2s',
                background: conv.id === currentId
                  ? (module === 'report' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)')
                  : 'transparent',
                border: conv.id === currentId
                  ? `1px solid ${module === 'report' ? 'rgba(168,85,247,0.3)' : 'rgba(59,130,246,0.3)'}`
                  : '1px solid transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, overflow: 'hidden', marginRight: '8px' }}>
                  <div style={{
                    color: '#e2e8f0', fontSize: '13px', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginBottom: '4px',
                  }}>
                    {conv.title || '新对话'}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {conv.stock_code && (
                      <Tag color={module === 'report' ? 'purple' : 'blue'} style={{ fontSize: '10px', lineHeight: '16px', padding: '0 6px', margin: 0 }}>
                        {conv.stock_name || conv.stock_code}
                      </Tag>
                    )}
                    <span style={{ color: '#475569', fontSize: '11px' }}>{formatTime(conv.updated_at)}</span>
                  </div>
                </div>
                {hoveredId === conv.id && (
                  <Popconfirm
                    title="删除此对话？"
                    description="对话记录将永久删除"
                    onConfirm={(e) => handleDelete(e, conv.id)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <span style={{ color: '#ef4444', cursor: 'pointer', padding: '4px' }} onClick={e => e.stopPropagation()}>
                      <DeleteOutlined style={{ fontSize: '14px' }} />
                    </span>
                  </Popconfirm>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        .conv-scroll::-webkit-scrollbar { width: 4px; }
        .conv-scroll::-webkit-scrollbar-track { background: transparent; }
        .conv-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      `}</style>
    </div>
  );
}
