'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';

interface ModuleDef {
  id: string;
  module: string;
  doctype: string;
  label: string;
  label_plural: string;
  icon: string;
  fields: any[];
  is_active: boolean;
  is_customized: boolean;
}

const MODULE_META: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  crm: { label: '客户管理', icon: 'people-group', bg: '#dbeafe', color: '#1e40af' },
  hr: { label: '人事管理', icon: 'necktie', bg: '#ede9fe', color: '#5b21b6' },
  accounting: { label: '财务管理', icon: 'money-bag', bg: '#dcfce7', color: '#166534' },
  inventory: { label: '库存管理', icon: 'package', bg: '#ffedd5', color: '#c2410c' },
};

export default function ModulesIndexPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const router = useRouter();
  const [defs, setDefs] = useState<ModuleDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ModuleDef[]>('/api/module-defs')
      .then(d => { setDefs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const grouped = defs.reduce<Record<string, ModuleDef[]>>((acc, d) => {
    if (!d.is_active) return acc;
    if (!acc[d.module]) acc[d.module] = [];
    acc[d.module].push(d);
    return acc;
  }, {});

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: '#9B9A97' }}>
      <svg className="animate-spin mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
      加载中...
    </div>
  );

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--notion-bg)' }}>
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
            <HandIcon name="grid" size={20} style={{ color: 'white' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--notion-text)' }}>业务模块</h1>
            <p className="text-sm" style={{ color: '#9B9A97' }}>基于模块定义自动生成的业务数据页面</p>
          </div>
        </div>

        <div className="space-y-8">
          {Object.entries(grouped).map(([mod, items]) => {
            const meta = MODULE_META[mod] || { label: mod, icon: 'folder', bg: '#f3f4f6', color: '#6b7280' };
            return (
              <div key={mod}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: meta.bg }}>
                    <HandIcon name={meta.icon} size={14} />
                  </div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {items.map(d => (
                    <button key={d.id}
                      onClick={() => router.push(`/${tenant}/modules/${d.module}/${d.doctype}`)}
                      className="text-left p-4 rounded-xl transition-all group"
                      style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = meta.color; e.currentTarget.style.boxShadow = `0 2px 8px ${meta.bg}`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--notion-border)'; e.currentTarget.style.boxShadow = 'none'; }}>
                      <div className="flex items-center gap-2 mb-1">
                        <HandIcon name={d.icon || 'document'} size={16} style={{ color: meta.color }} />
                        <span className="font-medium text-sm" style={{ color: 'var(--notion-text)' }}>{d.label}</span>
                      </div>
                      <p className="text-xs" style={{ color: '#9B9A97' }}>
                        {d.fields.filter((f: any) => !['Section Break', 'Column Break', 'Tab Break'].includes(f.fieldtype)).length} 个字段
                        {d.is_customized && ' · 已自定义'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
