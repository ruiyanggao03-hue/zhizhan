import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

import { API_BASE } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const saved = localStorage.getItem('auth_token');
    if (saved) {
      setToken(saved);
      axios.get(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${saved}` },
      })
        .then(res => { if (!cancelled) setUser(res.data); })
        .catch(() => { if (!cancelled) { localStorage.removeItem('auth_token'); setToken(null); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, []);

  const login = async (phone, password) => {
    const res = await axios.post(`${API_BASE}/api/auth/login`, { phone, password });
    const { access_token, user: userData } = res.data;
    localStorage.setItem('auth_token', access_token);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const register = async (phone, password) => {
    const res = await axios.post(`${API_BASE}/api/auth/register`, {
      phone,
      password,
    });
    const { access_token, user: userData } = res.data;
    localStorage.setItem('auth_token', access_token);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  const updateUser = (fields) => {
    setUser(prev => (prev ? { ...prev, ...fields } : prev));
  };

  // Request interceptor: attach JWT to all requests
  useEffect(() => {
    const id = axios.interceptors.request.use(config => {
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    return () => axios.interceptors.request.eject(id);
  }, [token]);

  // Response interceptor: handle 401 (expired token)
  useEffect(() => {
    const id = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401 && token) {
          localStorage.removeItem('auth_token');
          setToken(null);
          setUser(null);
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
