import React, { useState, useRef, useEffect } from 'react';
import { Skeleton, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, MapPin, Globe, Briefcase, CalendarDays, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';

import { API_BASE } from '../api.js';

const FALLBACKS = {
  '600519': {
    name: '贵州茅台',
    desc: '贵州茅台是中国白酒行业的龙头企业，主要从事茅台酒及系列酒的生产和销售。公司以"世界蒸馏酒第一品牌"为目标，产品远销海内外，品牌价值约744.46亿美元，是全球最高价值的烈酒品牌。公司总部位于贵州省仁怀市茅台镇，拥有悠久的历史和独特的酿造工艺，是中国高端白酒市场的绝对领导者。',
  },
  '000858': {
    name: '五粮液',
    desc: '五粮液是中国浓香型白酒的杰出代表，主要从事五粮液及其系列酒的生产和销售。公司位于四川省宜宾市，拥有数百年的酿酒历史和独特的五粮酿造工艺，是中国白酒行业第二大的高端品牌，品牌价值和市场占有率均居行业前列。',
  },
  '300750': {
    name: '宁德时代',
    desc: '宁德时代新能源科技股份有限公司是全球领先的新能源创新科技公司，专注于新能源汽车动力电池系统、储能系统的研发、生产和销售。公司在动力电池领域市场份额连续多年位居全球第一，是特斯拉、宝马、奔驰等国际车企的核心供应商。',
  },
};

export default function CompanyProfile({ stockCode, stockName }) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [descOverflows, setDescOverflows] = useState(false);
  const descRef = useRef(null);

  const code = stockCode || '600519';
  const name = stockName || '贵州茅台';

  const { data, isLoading: loading, isError: error } = useQuery({
    queryKey: ['company', code],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/company/${code}`);
      if (!res.data || !res.data.company_name) throw new Error('no data');
      return res.data;
    },
    staleTime: 30 * 60 * 1000,  // 公司简介30分钟不变
  });

  // Detect if description overflows 3 lines
  useEffect(() => {
    if (descRef.current) {
      const el = descRef.current;
      setDescOverflows(el.scrollHeight > el.clientHeight + 2);
    }
  }, [data]);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '24px', padding: '30px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </motion.div>
    );
  }

  const fallback = FALLBACKS[code];
  if (error || !data) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '24px', padding: '40px 30px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          textAlign: 'center',
        }}>
          <Building2 size={48} color="#10b981" style={{ marginBottom: '16px' }} />
          <h2 style={{ color: '#fff', margin: '8px 0', fontSize: '22px', fontWeight: 700 }}>
            {fallback?.name || name}
          </h2>
          <Tag color="green" style={{ fontSize: '13px', padding: '2px 12px' }}>{code}</Tag>
          <p style={{ color: '#94a3b8', marginTop: '16px', lineHeight: 1.8, fontSize: '14px' }}>
            {fallback?.desc || `${name} 是一家A股上市公司（${code}）。请登录后查看完整公司简介。`}
          </p>
        </div>
      </motion.div>
    );
  }

  const infoItems = [
    { icon: <Briefcase size={16} />, label: '所属行业', value: data.industry || '-' },
    { icon: <Users size={16} />, label: '员工人数', value: data.employees ? `${data.employees}人` : '-' },
    { icon: <MapPin size={16} />, label: '总部地址', value: data.headquarters || '-' },
    { icon: <Globe size={16} />, label: '官方网站', value: data.website || '-' },
    { icon: <TrendingUp size={16} />, label: '总市值', value: data.market_cap || '-' },
    { icon: <CalendarDays size={16} />, label: '成立日期', value: data.founded || '-' },
    { icon: <CalendarDays size={16} />, label: '上市日期', value: data.listing_date || '-' },
  ];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '24px', padding: '28px 30px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <Building2 size={40} color="#10b981" style={{ marginBottom: '4px' }} />
          <h2 style={{ color: '#fff', margin: '4px 0', fontSize: '22px', fontWeight: 700 }}>
            {data.company_name || name}
          </h2>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '6px' }}>
            <Tag color="green" style={{ fontSize: '12px', padding: '2px 10px' }}>
              {data.stock_code || code}
            </Tag>
            {data.market_cap_category && (
              <Tag color="purple" style={{ fontSize: '12px', padding: '2px 10px' }}>
                {data.market_cap_category}
              </Tag>
            )}
          </div>
        </div>

        <div style={{
          color: '#cbd5e1', lineHeight: 1.9, fontSize: '13px', marginBottom: '8px',
          padding: '14px 16px', background: 'rgba(255,255,255,0.015)',
          borderRadius: '10px', borderLeft: '3px solid rgba(16, 185, 129, 0.4)',
          textAlign: 'justify', textAlignLast: 'left',
          overflowWrap: 'break-word',
          ...(descExpanded ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
        }}
          ref={descRef}
        >
          {data.short_description || '暂无公司简介'}
        </div>
        {descOverflows && (
          <div style={{ textAlign: 'right', marginBottom: '14px' }}>
            <span
              onClick={() => setDescExpanded(!descExpanded)}
              style={{
                cursor: 'pointer', color: '#10b981', fontSize: '12px',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                userSelect: 'none',
              }}
            >
              {descExpanded ? <>收起 <ChevronUp size={14} /></> : <>展开全部 <ChevronDown size={14} /></>}
            </span>
          </div>
        )}
        {!descOverflows && <div style={{ marginBottom: '14px' }} />}

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px',
          borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px',
        }}>
          {infoItems.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              color: '#64748b', fontSize: '12px',
            }}>
              <span style={{ color: '#10b981', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ flexShrink: 0 }}>{item.label}:</span>
              <span style={{
                color: '#e2e8f0', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
