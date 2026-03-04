'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { logout, getAuthSnapshot } from '@/lib/auth';
import { HandIcon } from '@/components/ui/HandIcon';

export default function PlatformDashboard() {
  const router = useRouter();
  const [tenants, setTenants] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', admin_email: '', admin_password: '', admin_name: '' });
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [showAIConfig, setShowAIConfig] = useState<any>(null); // Stores the tenant object being configured
  const [aiForm, setAIForm] = useState({ ai_provider: 'gemini', ai_model: 'gemini-2.0-flash', ai_api_key: '' });
  const [showUserLimitConfig, setShowUserLimitConfig] = useState<any>(null);
  const [userLimitValue, setUserLimitValue] = useState('');

  useEffect(() => {
    try {
      const { token, user } = getAuthSnapshot();
      if (!token || !user) {
        router.replace('/login');
        return;
      }
      if (user.role !== 'platform_admin') {
        router.replace(user.tenant_slug ? `/${user.tenant_slug}/workspace` : '/login');
        return;
      }
    } catch {
      router.replace('/login');
      return;
    }

    api.get('/api/platform/tenants').then(setTenants).catch(() => {});
    api.get('/api/platform/health').then(setHealth).catch(() => {});
    api.get('/api/platform/analytics/ai-usage').then(setUsage).catch(() => {});
  }, [router]);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/platform/tenants', form);
      setShowCreate(false);
      setForm({ name: '', slug: '', admin_email: '', admin_password: '', admin_name: '' });
      api.get('/api/platform/tenants').then(setTenants).catch(() => {});
    } catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  }

  async function impersonate(slug: string) {
    const data = await api.post(`/api/platform/tenants/${slug}/impersonate`, {});
    localStorage.setItem('nexus_token', data.access_token);
    window.location.href = `/${slug}/workspace`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-indigo-600 flex items-center gap-1"><HandIcon name="lightning" size={20} /> Nexus</span>
          <span className="text-sm text-gray-500 bg-indigo-50 px-2 py-0.5 rounded text-xs">Platform Admin</span>
        </div>
        <button onClick={logout} className="text-sm text-gray-600 hover:text-gray-900">Sign out</button>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Tenants</p>
            <p className="text-2xl font-bold text-gray-900">{tenants.length}</p>
          </div>
          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Tenants</p>
            <p className="text-2xl font-bold text-green-600">{tenants.filter((t: any) => t.is_active).length}</p>
          </div>
          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total AI Requests</p>
            <p className="text-2xl font-bold text-indigo-600">
              {usage?.summary?.reduce((acc: number, curr: any) => acc + Number(curr.total_requests), 0) || 0}
            </p>
          </div>
          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total AI Tokens</p>
            <p className="text-2xl font-bold text-purple-600">
              {(usage?.summary?.reduce((acc: number, curr: any) => acc + (curr.total_tokens || 0), 0) / 1000).toFixed(1)}k
            </p>
          </div>
        </div>

        {/* AI Usage Table */}
        {usage?.summary?.length > 0 && (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="text-sm font-bold text-gray-700">AI Usage by Tenant</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-widest">
                <tr>
                  <th className="text-left px-4 py-2 border-b">Tenant</th>
                  <th className="text-right px-4 py-2 border-b">Requests</th>
                  <th className="text-right px-4 py-2 border-b">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {usage.summary.map((s: any) => (
                  <tr key={s.slug} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{s.name} <span className="text-gray-400 text-xs font-mono ml-1">({s.slug})</span></td>
                    <td className="px-4 py-2 text-right">{s.total_requests}</td>
                    <td className="px-4 py-2 text-right font-mono">{s.total_tokens?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-white rounded-lg border shadow-sm">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">Tenants</h2>
            <button
              onClick={() => setShowCreate(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Create Tenant
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead><tr className="border-b">
              {['Name', 'Slug', 'Users', 'Status', 'Schema', 'Created', 'AI', ''].map(h => (
                <th key={h} className="text-left p-4 text-sm font-medium text-gray-500">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {tenants.map((t: any) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 font-medium">{t.name}</td>
                  <td className="p-4 text-sm text-gray-600 font-mono">{t.slug}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">
                        {t.active_user_count ?? 0}{t.user_limit ? ` / ${t.user_limit}` : ' / ∞'}
                      </span>
                      <button
                        onClick={() => { setShowUserLimitConfig(t); setUserLimitValue(t.user_limit ? String(t.user_limit) : ''); }}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800"
                      >
                        Limit
                      </button>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${t.schema_provisioned ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {t.schema_provisioned ? 'Ready' : 'Pending'}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="p-4">
                    <button 
                      onClick={() => { setShowAIConfig(t); setAIForm({ ai_provider: t.ai_provider || 'gemini', ai_model: t.ai_model || 'gemini-2.0-flash', ai_api_key: '' }); }}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 border border-indigo-100 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M21 17v4"/><path d="M19 19h4"/></svg>
                      Config
                    </button>
                  </td>
                  <td className="p-4">
                    <button onClick={() => impersonate(t.slug)} className="text-xs text-gray-400 hover:text-indigo-600 hover:underline">Impersonate</button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
      {/* AI Config Modal */}
      {showAIConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">AI Configuration</h3>
                <p className="text-xs text-gray-500">{showAIConfig.name}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Provider</label>
                <select 
                  value={aiForm.ai_provider} 
                  onChange={e => setAIForm({...aiForm, ai_provider: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI (Coming Soon)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Default Model</label>
                <select 
                  value={aiForm.ai_model} 
                  onChange={e => setAIForm({...aiForm, ai_model: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Custom API Key</label>
                <input 
                  type="password"
                  placeholder="Leave blank to use platform key"
                  value={aiForm.ai_api_key} 
                  onChange={e => setAIForm({...aiForm, ai_api_key: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-8">
              <button 
                onClick={() => setShowAIConfig(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  try {
                    await api.patch(`/api/platform/tenants/${showAIConfig.id}/ai-config`, aiForm);
                    setShowAIConfig(null);
                    alert('AI Config Updated');
                  } catch (err: any) { alert(err.message); }
                }}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-md"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      {/* User Limit Modal */}
      {showUserLimitConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-gray-900">User Limit</h3>
            <p className="text-xs text-gray-500 mt-1">
              {showUserLimitConfig.name} ({showUserLimitConfig.slug})
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Current active users: {showUserLimitConfig.active_user_count ?? 0}
            </p>
            <div className="mt-4">
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Max Active Users</label>
              <input
                type="number"
                min={1}
                placeholder="Leave blank for unlimited"
                value={userLimitValue}
                onChange={e => setUserLimitValue(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowUserLimitConfig(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const payload = { user_limit: userLimitValue.trim() ? Number(userLimitValue) : null };
                    await api.patch(`/api/platform/tenants/${showUserLimitConfig.id}/user-limit`, payload);
                    const fresh = await api.get('/api/platform/tenants');
                    setTenants(fresh);
                    setShowUserLimitConfig(null);
                  } catch (err: any) { alert(err.message); }
                }}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-md"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
          {tenants.length === 0 && <div className="text-center p-12 text-gray-400">No tenants yet. Create your first one.</div>}
        </div>
      </main>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-4">Create New Tenant</h3>
            <form onSubmit={createTenant} className="space-y-3">
              <input required placeholder="Company Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input required placeholder="Slug (e.g. acme-corp)" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
              <input required type="email" placeholder="Admin Email" value={form.admin_email} onChange={e => setForm({...form, admin_email: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input required type="password" placeholder="Admin Password" value={form.admin_password} onChange={e => setForm({...form, admin_password: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="Admin Full Name" value={form.admin_name} onChange={e => setForm({...form, admin_name: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">
                  {loading ? 'Creating...' : 'Create Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
