import React from 'react';
import { Button, Result } from 'antd';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          height: '100vh', backgroundColor: '#0b0f19',
        }}>
          <Result
            status="error"
            title="页面出现异常"
            subTitle="请尝试刷新页面，如问题持续请联系管理员"
            extra={
              <Button type="primary" onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}>
                刷新页面
              </Button>
            }
            style={{ color: '#e2e8f0' }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
