import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Fundamentals from './pages/Fundamentals';
import Sentiment from './pages/Sentiment';
import Report from './pages/Report';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5分钟内不重新请求
      gcTime: 10 * 60 * 1000,      // 切走后缓存保留10分钟
      refetchOnWindowFocus: false,  // 切回页面不自动刷新
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/fundamentals" element={<ProtectedRoute><Fundamentals /></ProtectedRoute>} />
          <Route path="/sentiment" element={<ProtectedRoute><Sentiment /></ProtectedRoute>} />
          <Route path="/report" element={<ProtectedRoute><Report /></ProtectedRoute>} />
        </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
