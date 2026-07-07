import React, { useState } from 'react';
import { Dropdown, Avatar, Modal, Input, Button, Upload, message } from 'antd';
import { UserOutlined, EditOutlined, CameraOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

import { API_BASE } from '../api.js';

export default function UserMenu() {
  const { user, token, logout, updateUser } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [newUsername, setNewUsername] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);

  const avatarSrc = user?.avatar_url
    ? `${API_BASE}${user.avatar_url}`
    : null;

  const handleUploadAvatar = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/upload-avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser({ avatar_url: res.data.avatar_url + '?t=' + Date.now() });
      message.success('头像更新成功');
    } catch (e) {
      message.error('头像上传失败');
    }
    return false; // Prevent default upload behavior
  };

  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed) { message.warning('用户名不能为空'); return; }
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/api/auth/update-username`, { username: trimmed });
      updateUser({ username: trimmed });
      message.success('用户名更新成功');
      setEditOpen(false);
    } catch (e) {
      message.error('修改失败');
    } finally {
      setSaving(false);
    }
  };

  const menuItems = {
    items: [
      {
        key: 'username',
        label: (
          <div style={{ padding: '4px 0', color: '#e2e8f0', fontSize: '14px', fontWeight: 600 }}>
            {user?.username || '用户'}
          </div>
        ),
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: '编辑资料',
        onClick: () => {
          setNewUsername(user?.username || '');
          setEditOpen(true);
        },
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        danger: true,
        onClick: logout,
      },
    ],
  };

  return (
    <>
      <Dropdown menu={menuItems} trigger={['click']} placement="bottomRight">
        <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <Avatar
            size={36}
            src={avatarSrc}
            icon={!avatarSrc && <UserOutlined />}
            style={{
              backgroundColor: avatarSrc ? 'transparent' : '#10b981',
              border: '2px solid rgba(16, 185, 129, 0.3)',
            }}
          />
        </div>
      </Dropdown>

      <Modal
        title={<span style={{ color: '#e2e8f0' }}>编辑个人资料</span>}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        footer={null}
        styles={{
          content: { backgroundColor: '#0f172a', border: '1px solid #334155' },
          header: { backgroundColor: 'transparent', borderBottom: '1px solid #334155' },
        }}
        closeIcon={<span style={{ color: '#94a3b8' }}>✖</span>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '10px 0' }}>
          <div style={{ position: 'relative' }}>
            <Avatar
              size={80}
              src={avatarSrc}
              icon={!avatarSrc && <UserOutlined />}
              style={{ backgroundColor: '#10b981' }}
            />
            <Upload
              showUploadList={false}
              accept="image/png,image/jpeg,image/gif,image/webp"
              beforeUpload={handleUploadAvatar}
            >
              <div style={{
                position: 'absolute', bottom: 0, right: -4,
                width: 28, height: 28, borderRadius: '50%',
                background: '#7e22ce', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', border: '2px solid #0f172a',
              }}>
                <CameraOutlined style={{ color: '#fff', fontSize: '14px' }} />
              </div>
            </Upload>
          </div>

          <div style={{ width: '100%' }}>
            <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>用户名</div>
            <Input
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              onPressEnter={handleSaveUsername}
              maxLength={30}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }}
            />
          </div>

          <Button
            type="primary"
            block
            loading={saving}
            onClick={handleSaveUsername}
            style={{
              background: 'linear-gradient(90deg, #10b981, #059669)', border: 'none',
              fontWeight: 600, borderRadius: '8px', height: '40px',
            }}
          >
            保存
          </Button>
        </div>
      </Modal>
    </>
  );
}
