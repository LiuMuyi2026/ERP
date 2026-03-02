'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';

type AppItem = {
  app_key: string;
  name: string;
  source: string;
  category?: string;
  description?: string;
  capabilities?: string[];
};

type LinkTemplate = {
  id: string;
  name: string;
  source_module: string;
  target_app_key: string;
  description?: string;
  is_active: boolean;
};

export default function IntegrationsPage() {
  const t = useTranslations('settings');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'my-connections' | 'gallery'>('my-connections');
  const [showCreate, setShowCreate] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [editWebhook, setEditWebhook] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [apps, setApps] = useState<AppItem[]>([]);
  const [templates, setTemplates] = useState<LinkTemplate[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any>({ triggers: [], actions: [], operators: [], transforms: [] });
  const [form, setForm] = useState({
    name: '',
    description: '',
    source_module: 'crm',
    source_event: 'lead.created',
    target_app_key: 'feishu',
    target_action: 'send_message',
    automation_mode: 'manual'
  });

  async function loadAll() {
    try {
      const [a, t, c, cat] = await Promise.all([
        api.get('/api/integrations/directory/apps').catch(() => []),
        api.get('/api/integrations/templates').catch(() => []),
        api.get('/api/integrations/configs').catch(() => []),
        api.get('/api/integrations/template-catalog').catch(() => ({ triggers: [], actions: [] })),
      ]);
      setApps(Array.isArray(a) ? a : []);
      setTemplates(Array.isArray(t) ? t : []);
      setConfigs(Array.isArray(c) ? c : []);
      setCatalog(cat);
    } catch (err) {
      console.error('Failed to load connections', err);
    }
  }

  async function connectApp(app: AppItem) {
    setConnecting(app.app_key);
    try {
      // Basic modal logic for connection
      const webhook = window.prompt(`Enter your ${app.name} Webhook URL (optional):`);
      await api.post('/api/integrations/setup', {
        platform: app.app_key,
        credentials: { webhook_url: webhook }
      });
      await loadAll();
      setTab('my-connections');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setConnecting(null);
    }
  }

  async function deleteConfig(configId: string) {
    if (!window.confirm(t('integDeleteConfirm'))) return;
    setDeleting(configId);
    try {
      await api.delete(`/api/integrations/configs/${configId}`);
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeleting(null);
    }
  }

  function openConfigure(config: any) {
    setEditingConfig(config);
    setEditWebhook(config.webhook_url || '');
  }

  async function saveConfigure(e: React.FormEvent) {
    e.preventDefault();
    if (!editingConfig) return;
    setEditSaving(true);
    try {
      await api.patch(`/api/integrations/configs/${editingConfig.id}`, {
        webhook_url: editWebhook,
      });
      setEditingConfig(null);
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  const triggerOptions = useMemo(() => catalog.triggers.filter((t: any) => t.module === form.source_module), [catalog, form.source_module]);
  const actionOptions = useMemo(() => catalog.actions.filter((a: any) => a.app_key === form.target_app_key), [catalog, form.target_app_key]);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/integrations/templates', form);
      setShowCreate(false);
      setForm({ name: '', description: '', source_module: 'crm', source_event: 'lead.created', target_app_key: 'feishu', target_action: 'send_message', automation_mode: 'manual' });
      await loadAll();
    } catch (err: any) { alert(err.message); }
  }

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header — Notion Style */}
      <div className="px-10 py-8 border-b border-gray-100">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--notion-text)' }}>{t('integTitle')}</h1>
        <p className="text-sm mt-1.5 max-w-lg" style={{ color: 'var(--notion-text-muted)' }}>
          {t('integSubtitle')}
        </p>
        
        <div className="flex gap-8 mt-8 relative">
          <button 
            onClick={() => setTab('my-connections')}
            className={`pb-3 text-sm font-semibold transition-all relative z-10 ${tab === 'my-connections' ? 'text-black' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {t('integMyConnections')}
            {tab === 'my-connections' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black rounded-full" />}
          </button>
          <button
            onClick={() => setTab('gallery')}
            className={`pb-3 text-sm font-semibold transition-all relative z-10 ${tab === 'gallery' ? 'text-black' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {t('integGallery')}
            {tab === 'gallery' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black rounded-full" />}
          </button>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-100" />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-10 bg-[#fbfbfa]">
        {tab === 'my-connections' ? (
          <div className="max-w-4xl space-y-10">
            {/* Active Connections List */}
            <section>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('integActiveExtensions')}</h2>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
                {configs.map(config => (
                  <div key={config.id} className="flex items-center justify-between p-5 hover:bg-gray-50/50 transition-colors group">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl shadow-inner group-hover:bg-white transition-colors">
                        {config.platform === 'n8n' ? '♾️' : <HandIcon name={config.platform === 'wecom' ? 'chat-bubble' : config.platform === 'feishu' ? 'kite' : 'plug'} size={24} />}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 capitalize text-[15px]">{config.platform}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex h-1.5 w-1.5 rounded-full bg-green-500"></span>
                          <p className="text-xs text-gray-500 font-medium">{t('integConnected')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => openConfigure(config)}
                        className="px-3 py-1.5 rounded-md text-xs font-bold border border-gray-200 text-gray-600 hover:bg-white hover:shadow-sm transition-all"
                      >
                        {t('integConfigure')}
                      </button>
                      <button
                        onClick={() => deleteConfig(config.id)}
                        disabled={deleting === config.id}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        {deleting === config.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
                {configs.length === 0 && (
                  <div className="p-16 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4"><HandIcon name="plug" size={28} /></div>
                    <p className="text-sm font-bold text-gray-900">{t('integNoActive')}</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-[240px] mx-auto">{t('integNoActiveDesc')}</p>
                    <button onClick={() => setTab('gallery')} className="mt-6 text-xs font-bold text-indigo-600 hover:underline">{t('integBrowseGallery')}</button>
                  </div>
                )}
              </div>
            </section>

            {/* Automation Logic - Notion Style */}
            <section>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('integAutomations')}</h2>
                <button className="text-[11px] font-bold text-indigo-600 hover:underline tracking-wider">{t('integViewAll')}</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {templates.map(tpl => (
                  <div key={tpl.id} className="p-5 bg-white border border-gray-200 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                    <div className="flex justify-between items-start mb-3">
                      <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 14 4-4-4-4"/><path d="M3 3.412C3 2.632 3.632 2 4.412 2H8.5c.4 0 .7.3 1 .7l3 4.3c.3.4.7.7 1.1.7H19.6c.8 0 1.4.6 1.4 1.4v10.2c0 .8-.6 1.4-1.4 1.4H4.4c-.8 0-1.4-.6-1.4-1.4V3.412Z"/></svg>
                      </div>
                      <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${tpl.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {tpl.is_active ? t('integStatusActive') : t('integStatusDisabled')}
                      </div>
                    </div>
                    <h3 className="font-bold text-gray-900 text-[15px] mb-1">{tpl.name}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-4">{tpl.description || t('integAutoProcess')}</p>
                    <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{tpl.source_module}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-tighter">{tpl.target_app_key}</span>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 group-hover:text-indigo-500 transition-colors"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </div>
                  </div>
                ))}
                <button 
                  onClick={() => setShowCreate(true)}
                  className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-xl font-light">+</div>
                  <span className="text-[11px] font-black uppercase tracking-widest">{t('integCreateAutomation')}</span>
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="max-w-6xl">
             <div className="flex items-center justify-between mb-8">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('integDiscover')}</h2>
                <div className="flex gap-2">
                  <input placeholder={t('integSearchApps')} className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs w-64 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all" />
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {apps.map(app => (
                  <div key={app.app_key} className="bg-white border border-gray-100 rounded-2xl p-7 flex flex-col hover:shadow-xl hover:translate-y-[-2px] transition-all group">
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-50 flex items-center justify-center text-3xl shadow-sm group-hover:scale-110 transition-transform">
                        {app.app_key === 'n8n' ? '♾️' : app.app_key === 'notion' ? 'N' : <HandIcon name={app.app_key === 'feishu' ? 'kite' : app.app_key === 'wecom' ? 'chat-bubble' : 'plug'} size={28} />}
                      </div>
                      <span className="px-2 py-1 rounded bg-gray-50 text-gray-400 text-[9px] font-bold uppercase tracking-widest">{app.source}</span>
                    </div>
                    <h3 className="font-black text-gray-900 text-lg mb-2">{app.name}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed flex-1 mb-8">{app.description}</p>
                    <button 
                      onClick={() => connectApp(app)}
                      disabled={connecting === app.app_key}
                      className="w-full py-3 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-[0.1em] hover:bg-black hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      {connecting === app.app_key ? t('integConnecting') : t('integAddConnection')}
                    </button>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>

      {/* Configure Connection Modal */}
      {editingConfig && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xl">
                  {editingConfig.platform === 'n8n' ? '♾️' : <HandIcon name={editingConfig.platform === 'wecom' ? 'chat-bubble' : editingConfig.platform === 'feishu' ? 'kite' : 'plug'} size={22} />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 capitalize">{editingConfig.platform}</h3>
                  <p className="text-xs text-gray-500">{t('integConfigure')}</p>
                </div>
              </div>
              <button onClick={() => setEditingConfig(null)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={saveConfigure} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Webhook URL</label>
                <input
                  value={editWebhook}
                  onChange={e => setEditWebhook(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('integStatus')}</label>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`flex h-2 w-2 rounded-full ${editingConfig.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-gray-700">{editingConfig.is_active ? t('integStatusActive') : t('integStatusDisabled')}</span>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setEditingConfig(null)} className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all">
                  {t('integCancel')}
                </button>
                <button type="submit" disabled={editSaving} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50">
                  {editSaving ? '...' : t('integSave')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">{t('integCreateAutomation')}</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <form onSubmit={createTemplate} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('integAutomationName')}</label>
                <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder={t('integAutomationPlaceholder')} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('integSourceModule')}</label>
                  <select className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" value={form.source_module} onChange={e => setForm({...form, source_module: e.target.value})}>
                    {Array.from(new Set(catalog.triggers.map((t: any) => t.module))).map((m: any) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('integTriggerEvent')}</label>
                  <select className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" value={form.source_event} onChange={e => setForm({...form, source_event: e.target.value})}>
                    {triggerOptions.map((t: any) => <option key={t.event} value={t.event}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('integTargetApp')}</label>
                  <select className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" value={form.target_app_key} onChange={e => setForm({...form, target_app_key: e.target.value})}>
                    {Array.from(new Set(catalog.actions.map((a: any) => a.app_key))).map((k: any) => <option key={k} value={k}>{k.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('integAction')}</label>
                  <select className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" value={form.target_action} onChange={e => setForm({...form, target_action: e.target.value})}>
                    {actionOptions.map((a: any) => <option key={a.action} value={a.action}>{a.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all">{t('integCancel')}</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all">{t('integCreate')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
