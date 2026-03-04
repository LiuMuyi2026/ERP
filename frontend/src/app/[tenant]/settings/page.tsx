'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getCurrentUser, updateStoredUser } from '@/lib/auth';
import { useTranslations, useLocale } from 'next-intl';
import { LangCode, setLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme';
import { HandIcon } from '@/components/ui/HandIcon';
import { UserAvatar, parseAvatarConfig, serializeAvatarConfig, AvatarConfig } from '@/components/ui/UserAvatar';
import { AvatarPicker } from '@/components/ui/AvatarPicker';

const LANGUAGES: { code: LangCode; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'zh-CN', label: 'Simplified Chinese', native: '简体中文' },
  { code: 'zh-TW', label: 'Traditional Chinese', native: '繁體中文' },
  { code: 'ja', label: 'Japanese', native: '日本語' },
  { code: 'it', label: 'Italian', native: 'Italiano' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
];

type Section = 'account' | 'appearance' | 'workspace' | 'members' | 'notifications' | 'email' | 'integrations' | 'ai' | 'ai-providers' | 'ai-finder' | 'whatsapp';

const NAV_ITEMS: { id: Section; icon: string; labelKey: string }[] = [
  { id: 'account', icon: 'person', labelKey: 'navAccount' },
  { id: 'appearance', icon: 'palette', labelKey: 'navAppearance' },
  { id: 'ai', icon: 'brain', labelKey: 'navAI' },
  { id: 'ai-providers', icon: 'key', labelKey: 'navAIProviders' },
  { id: 'ai-finder', icon: 'magnifier', labelKey: 'aiFinderNav' },
  { id: 'workspace', icon: 'folder', labelKey: 'navWorkspace' },
  { id: 'members', icon: 'people-group', labelKey: 'navMembers' },
  { id: 'notifications', icon: 'bell', labelKey: 'navNotifications' },
  { id: 'email', icon: 'envelope', labelKey: 'navEmail' },
  { id: 'integrations', icon: 'plug', labelKey: 'navIntegrations' },
  { id: 'whatsapp', icon: 'chat-bubble', labelKey: 'navWhatsApp' },
];

export default function SettingsPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const tSettings = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [section, setSection] = useState<Section>('account');

  return (
    <div className="h-full flex overflow-hidden">
      {/* Settings sidebar nav */}
      <div className="w-56 flex-shrink-0 border-r flex flex-col py-6 px-3"
        style={{ background: 'var(--notion-sidebar)', borderColor: 'var(--notion-border)' }}>
        <div className="px-3 mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--notion-text-muted)' }}>
            {tSettings('settingsTitle')}
          </h2>
        </div>

        <div className="space-y-0.5">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'integrations') {
                  router.push(`/${tenant}/settings/integrations`);
                } else {
                  setSection(item.id);
                }
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors text-left"
              style={{
                background: section === item.id ? 'var(--notion-active)' : 'transparent',
                color: section === item.id ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                fontWeight: section === item.id ? 500 : 400,
              }}
              onMouseEnter={e => { if (section !== item.id) e.currentTarget.style.background = 'var(--notion-hover)'; }}
              onMouseLeave={e => { if (section !== item.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <span className="w-5 flex-shrink-0 flex items-center justify-center"><HandIcon name={item.icon} size={16} /></span>
              {tSettings(item.labelKey as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-10 py-8">
          {section === 'account' && <AccountSection />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'ai' && <AISection />}
          {section === 'ai-providers' && <AIProvidersSection />}
          {section === 'ai-finder' && <AIFinderSettingsSection />}
          {section === 'workspace' && <WorkspaceSection tenant={tenant} />}
          {section === 'members' && <MembersSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'email' && <EmailSettingsSection />}
          {section === 'whatsapp' && <WhatsAppSettingsSection />}
        </div>
      </div>
    </div>
  );
}

// ── AI Section ────────────────────────────────────────────────────────────

function AISection() {
  const [profile, setProfile] = useState<any>({ style_preference: 'professional', custom_instructions: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/integrations/ai/profile')
      .then(data => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch('/api/integrations/ai/profile', profile);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading AI Profile...</div>;

  return (
    <div>
      <SectionHeader title="Personalized AI" subtitle="Tailor the AI assistant to your work style and preferences." />

      <div className="space-y-6">
        <SettingsCard>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--notion-text)' }}>Writing Style</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'professional', label: 'Professional', icon: 'necktie' },
              { id: 'concise', label: 'Concise', icon: 'ruler' },
              { id: 'creative', label: 'Creative', icon: 'palette' },
              { id: 'friendly', label: 'Friendly', icon: 'wave-hand' },
            ].map(opt => (
              <button key={opt.id} 
                onClick={() => setProfile({ ...profile, style_preference: opt.id })}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all text-left"
                style={{
                  borderColor: profile.style_preference === opt.id ? 'var(--notion-accent)' : 'var(--notion-border)',
                  background: profile.style_preference === opt.id ? '#EBF5FB' : 'transparent',
                }}>
                <HandIcon name={opt.icon} size={20} />
                <span className="text-sm font-medium" style={{ color: profile.style_preference === opt.id ? 'var(--notion-accent)' : 'var(--notion-text)' }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </SettingsCard>

        <SettingsCard>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--notion-text)' }}>Custom Instructions</p>
          <p className="text-xs text-gray-500 mb-3">
            Tell the AI how you want it to behave. (e.g., &quot;Always use metric units&quot;, &quot;Prefer bullet points for summaries&quot;).
          </p>
          <textarea
            value={profile.custom_instructions || ''}
            onChange={e => setProfile({ ...profile, custom_instructions: e.target.value })}
            rows={5}
            className="w-full px-3 py-2 rounded-md text-sm outline-none border focus:border-indigo-500 transition-colors"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}
            placeholder="Type your custom instructions here..."
          />
        </SettingsCard>

        <div className="flex justify-end">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium text-white shadow-md transition-all hover:brightness-105"
            style={{ background: 'var(--notion-accent)' }}
          >
            {saving ? 'Saving...' : 'Save AI Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI Providers Section ──────────────────────────────────────────────────────

function AIProvidersSection() {
  const tSettings = useTranslations('settings');
  const [configs, setConfigs] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ provider: '', api_key: '', base_url: '', default_model: '', is_default: false });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ api_key: '', base_url: '', default_model: '', is_default: false, is_active: true });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [permError, setPermError] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/ai-providers').catch((e: any) => { if (e?.status === 403) setPermError(true); return []; }),
      api.get('/api/admin/ai-providers/catalog').catch(() => ({})),
    ]).then(([cfgs, cat]) => {
      setConfigs(Array.isArray(cfgs) ? cfgs : []);
      if (cat && typeof cat === 'object') setCatalog(cat);
    }).finally(() => setLoading(false));
  }, []);

  const configuredKeys = new Set(configs.map((c: any) => c.provider));
  const available = Object.entries(catalog).filter(([k]) => !configuredKeys.has(k));
  const usItems = available.filter(([, v]) => (v as any).region === 'US');
  const cnItems = available.filter(([, v]) => (v as any).region === 'CN');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/admin/ai-providers', form);
      const cfgs = await api.get('/api/admin/ai-providers').catch(() => []);
      setConfigs(Array.isArray(cfgs) ? cfgs : []);
      setShowAdd(false);
      setForm({ provider: '', api_key: '', base_url: '', default_model: '', is_default: false });
    } catch (err: any) { alert(err.message || 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    try {
      await api.patch(`/api/admin/ai-providers/${id}`, editForm);
      const cfgs = await api.get('/api/admin/ai-providers').catch(() => []);
      setConfigs(Array.isArray(cfgs) ? cfgs : []);
      setEditing(null);
    } catch (err: any) { alert(err.message || 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this AI provider config?')) return;
    try {
      await api.delete(`/api/admin/ai-providers/${id}`);
      setConfigs(prev => prev.filter((c: any) => c.id !== id));
    } catch (err: any) { alert(err.message); }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const res = await api.post(`/api/admin/ai-providers/${id}/test`, {});
      setTestResults(prev => ({ ...prev, [id]: { ok: res.success, msg: res.success ? 'OK' : (res.error || 'Failed') } }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, msg: err.message || 'Error' } }));
    } finally { setTestingId(null); }
  }

  async function handleSetDefault(id: string) {
    try {
      await api.patch(`/api/admin/ai-providers/${id}`, { is_default: true });
      const cfgs = await api.get('/api/admin/ai-providers').catch(() => []);
      setConfigs(Array.isArray(cfgs) ? cfgs : []);
    } catch (err: any) { alert(err.message); }
  }

  if (loading) return <div className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading...</div>;

  if (permError) return (
    <div>
      <SectionHeader title="AI Providers" subtitle="Configure AI service provider API keys for your team." />
      <SettingsCard>
        <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>
          You need admin permissions to manage AI provider configurations.
        </p>
      </SettingsCard>
    </div>
  );

  return (
    <div>
      <SectionHeader title={tSettings('aiProvidersTitle')} subtitle={tSettings('aiProvidersSubtitle')} />

      <div className="space-y-4">
        {/* Existing configs */}
        {configs.map((cfg: any) => {
          const cat = catalog[cfg.provider] || {};
          const tr = testResults[cfg.id];
          return (
            <SettingsCard key={cfg.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{cfg.label || cfg.provider}</span>
                  {cfg.region && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: cfg.region === 'US' ? '#dbeafe' : '#fef3c7', color: cfg.region === 'US' ? '#1d4ed8' : '#92400e' }}>
                      {cfg.region}
                    </span>
                  )}
                  {cfg.is_default && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: '#dcfce7', color: '#15803d' }}>Default</span>
                  )}
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: cfg.is_active ? '#dcfce7' : '#f3f4f6', color: cfg.is_active ? '#15803d' : '#6b7280' }}>
                    {cfg.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>
              </div>

              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                  <span>Key:</span>
                  <span className="font-mono" style={{ color: 'var(--notion-text)' }}>{cfg.api_key_masked || '****'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                  <span>Model:</span>
                  <span className="font-mono" style={{ color: 'var(--notion-text)' }}>{cfg.default_model || '-'}</span>
                </div>
                {cfg.base_url && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                    <span>URL:</span>
                    <span className="font-mono text-[11px]" style={{ color: 'var(--notion-text)' }}>{cfg.base_url}</span>
                  </div>
                )}
              </div>

              <SettingsDivider />

              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => handleTest(cfg.id)} disabled={testingId === cfg.id}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {testingId === cfg.id ? tSettings('aiProvidersTesting') : tSettings('aiProvidersTestConnection')}
                </button>
                {!cfg.is_default && (
                  <button onClick={() => handleSetDefault(cfg.id)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                    style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-accent)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {tSettings('aiProvidersSetDefault')}
                  </button>
                )}
                <button onClick={() => {
                    setEditing(cfg);
                    setEditForm({ api_key: '', base_url: cfg.base_url || '', default_model: cfg.default_model || '', is_default: cfg.is_default, is_active: cfg.is_active });
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {tSettings('aiProvidersEdit')}
                </button>
                <button onClick={() => handleDelete(cfg.id)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                  style={{ borderColor: '#fecaca', color: '#ef4444' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {tSettings('aiProvidersDelete')}
                </button>
                {tr && (
                  <span className="ml-auto text-xs font-medium" style={{ color: tr.ok ? '#15803d' : '#ef4444' }}>
                    {tr.ok ? tSettings('aiProvidersConnected') : tr.msg}
                  </span>
                )}
              </div>
            </SettingsCard>
          );
        })}

        {configs.length === 0 && !showAdd && (
          <SettingsCard>
            <div className="text-center py-4">
              <p className="text-sm mb-3" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('aiProvidersNoConfigs')}</p>
              <button onClick={() => setShowAdd(true)}
                className="px-4 py-2 rounded-md text-sm font-medium text-white"
                style={{ background: 'var(--notion-accent)' }}>
                + {tSettings('aiProvidersAdd')}
              </button>
            </div>
          </SettingsCard>
        )}

        {configs.length > 0 && available.length > 0 && !showAdd && (
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-md text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            + {tSettings('aiProvidersAdd')}
          </button>
        )}

        {/* Add form */}
        {showAdd && (
          <SettingsCard>
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--notion-text)' }}>{tSettings('aiProvidersAddProvider')}</p>
            <form onSubmit={handleAdd} className="space-y-4">
              {/* Provider selector by region */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--notion-text-muted)' }}>Provider</p>
                {usItems.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--notion-text-muted)' }}>US</p>
                    <div className="flex flex-wrap gap-2">
                      {usItems.map(([key, val]: [string, any]) => (
                        <button key={key} type="button"
                          onClick={() => setForm({ ...form, provider: key, base_url: val.base_url || '', default_model: val.models?.[0] || '' })}
                          className="px-3 py-1.5 rounded-md text-xs font-medium border-2 transition-all"
                          style={{
                            borderColor: form.provider === key ? 'var(--notion-accent)' : 'var(--notion-border)',
                            background: form.provider === key ? '#EBF5FB' : 'transparent',
                            color: form.provider === key ? 'var(--notion-accent)' : 'var(--notion-text)',
                          }}>
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {cnItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--notion-text-muted)' }}>CN</p>
                    <div className="flex flex-wrap gap-2">
                      {cnItems.map(([key, val]: [string, any]) => (
                        <button key={key} type="button"
                          onClick={() => setForm({ ...form, provider: key, base_url: val.base_url || '', default_model: val.models?.[0] || '' })}
                          className="px-3 py-1.5 rounded-md text-xs font-medium border-2 transition-all"
                          style={{
                            borderColor: form.provider === key ? 'var(--notion-accent)' : 'var(--notion-border)',
                            background: form.provider === key ? '#EBF5FB' : 'transparent',
                            color: form.provider === key ? 'var(--notion-accent)' : 'var(--notion-text)',
                          }}>
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {form.provider && catalog[form.provider] && (
                <>
                  <div>
                    <label className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>API Key</label>
                    <input required type="password" placeholder={catalog[form.provider]?.key_placeholder || 'API Key'}
                      value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-md text-sm font-mono outline-none border"
                      style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>Model</label>
                    <select value={form.default_model} onChange={e => setForm({ ...form, default_model: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none border bg-white"
                      style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                      {(catalog[form.provider]?.models || []).map((m: string) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>Base URL (optional)</label>
                    <input placeholder={catalog[form.provider]?.base_url || 'https://...'}
                      value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-md text-sm font-mono outline-none border"
                      style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--notion-text)' }}>
                    <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} />
                    Set as default provider
                  </label>
                </>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowAdd(false); setForm({ provider: '', api_key: '', base_url: '', default_model: '', is_default: false }); }}
                  className="flex-1 py-2 rounded-md text-sm border transition-colors"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  Cancel
                </button>
                <button type="submit" disabled={saving || !form.provider || !form.api_key}
                  className="flex-1 py-2 rounded-md text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: 'var(--notion-accent)' }}>
                  {saving ? 'Saving...' : 'Add Provider'}
                </button>
              </div>
            </form>
          </SettingsCard>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--notion-text)' }}>Edit {editing.label || editing.provider}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>API Key (leave empty to keep current)</label>
                <input type="password" placeholder="Leave empty to keep"
                  value={editForm.api_key} onChange={e => setEditForm({ ...editForm, api_key: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md text-sm font-mono outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>Model</label>
                <select value={editForm.default_model} onChange={e => setEditForm({ ...editForm, default_model: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none border bg-white"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                  {(catalog[editing.provider]?.models || []).map((m: string) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>Base URL</label>
                <input placeholder="https://..."
                  value={editForm.base_url} onChange={e => setEditForm({ ...editForm, base_url: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md text-sm font-mono outline-none border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--notion-text)' }}>
                <input type="checkbox" checked={editForm.is_default} onChange={e => setEditForm({ ...editForm, is_default: e.target.checked })} />
                Set as default
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--notion-text)' }}>
                <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} />
                Enabled
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditing(null)}
                  className="flex-1 py-2 rounded-md text-sm border"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}>
                  Cancel
                </button>
                <button type="button" onClick={() => handleUpdate(editing.id)} disabled={saving}
                  className="flex-1 py-2 rounded-md text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: 'var(--notion-accent)' }}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Password Change Card ───────────────────────────────────────────────────────

function PasswordChangeCard() {
  const tSettings = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function reset() {
    setOldPw(''); setNewPw(''); setConfirmPw('');
    setError(''); setSuccess(false);
    setShowOld(false); setShowNew(false); setShowConfirm(false);
  }

  async function handleSubmit() {
    setError('');
    if (!oldPw) { setError(tSettings('errEnterCurrentPassword')); return; }
    if (newPw.length < 6) { setError(tSettings('errMinLength')); return; }
    if (newPw !== confirmPw) { setError(tSettings('errPasswordsMismatch')); return; }
    if (newPw === oldPw) { setError(tSettings('errSamePassword')); return; }

    setSaving(true);
    try {
      await api.post('/api/auth/change-password', { old_password: oldPw, new_password: newPw });
      setSuccess(true);
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      setError(err.message || tSettings('errChangeFailed'));
    } finally {
      setSaving(false);
    }
  }

  const strength = newPw.length === 0 ? 0
    : newPw.length < 6 ? 1
    : newPw.length < 10 || !/[A-Z]/.test(newPw) || !/[0-9]/.test(newPw) ? 2
    : 3;
  const strengthLabel = ['', tSettings('strengthWeak'), tSettings('strengthMedium'), tSettings('strengthStrong')];
  const strengthColor = ['', '#ef4444', '#f59e0b', '#10b981'];

  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{tSettings('password')}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('passwordSubtitle')}</p>
        </div>
        {!open && (
          <button
            onClick={() => { setOpen(true); reset(); }}
            className="px-3 py-1.5 rounded-md text-sm border transition-colors"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {tSettings('changePassword')}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <SettingsDivider />

          {/* Success banner */}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {tSettings('passwordChanged')}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* Old password */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('currentPassword')}</label>
            <div className="flex items-center rounded-md overflow-hidden"
              style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)' }}>
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPw}
                onChange={e => { setOldPw(e.target.value); setError(''); setSuccess(false); }}
                className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
                style={{ color: 'var(--notion-text)' }}
                placeholder={tSettings('currentPasswordPlaceholder')}
              />
              <button onClick={() => setShowOld(v => !v)}
                className="px-3 py-2 text-xs"
                style={{ color: 'var(--notion-text-muted)' }}>
                {showOld ? tSettings('hide') : tSettings('show')}
              </button>
            </div>
          </div>

          {/* New password */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('newPassword')}</label>
            <div className="flex items-center rounded-md overflow-hidden"
              style={{ border: `1px solid ${newPw && strength < 2 ? '#fca5a5' : 'var(--notion-border)'}`, background: 'var(--notion-bg)' }}>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={e => { setNewPw(e.target.value); setError(''); setSuccess(false); }}
                className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
                style={{ color: 'var(--notion-text)' }}
                placeholder={tSettings('newPasswordPlaceholder')}
              />
              <button onClick={() => setShowNew(v => !v)}
                className="px-3 py-2 text-xs"
                style={{ color: 'var(--notion-text-muted)' }}>
                {showNew ? tSettings('hide') : tSettings('show')}
              </button>
            </div>
            {/* Strength indicator */}
            {newPw.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3].map(level => (
                    <div key={level} className="h-1 flex-1 rounded-full transition-colors"
                      style={{ background: strength >= level ? strengthColor[strength] : '#e5e7eb' }} />
                  ))}
                </div>
                <span className="text-[10px] font-medium" style={{ color: strengthColor[strength] }}>
                  {strengthLabel[strength]}
                </span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('confirmNewPassword')}</label>
            <div className="flex items-center rounded-md overflow-hidden"
              style={{
                border: `1px solid ${confirmPw && confirmPw !== newPw ? '#fca5a5' : 'var(--notion-border)'}`,
                background: 'var(--notion-bg)',
              }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setError(''); setSuccess(false); }}
                className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
                style={{ color: 'var(--notion-text)' }}
                placeholder={tSettings('confirmPasswordPlaceholder')}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              />
              <button onClick={() => setShowConfirm(v => !v)}
                className="px-3 py-2 text-xs"
                style={{ color: 'var(--notion-text-muted)' }}>
                {showConfirm ? tSettings('hide') : tSettings('show')}
              </button>
            </div>
            {confirmPw && confirmPw !== newPw && (
              <p className="text-[11px]" style={{ color: '#ef4444' }}>{tSettings('passwordMismatch')}</p>
            )}
            {confirmPw && confirmPw === newPw && newPw.length >= 6 && (
              <p className="text-[11px]" style={{ color: '#10b981' }}>{'\u2713'} {tSettings('passwordMatch')}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setOpen(false); reset(); }}
              className="flex-1 py-2 rounded-md text-sm border transition-colors"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {tCommon('cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !oldPw || !newPw || !confirmPw}
              className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--notion-accent)' }}
            >
              {saving ? tSettings('changing') : tSettings('confirmChange')}
            </button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

// ── Account Section ────────────────────────────────────────────────────────────

function AccountSection() {
  const tSettings = useTranslations('settings');
  const [user, setUser] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<AvatarConfig | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waJid, setWaJid] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    setName(currentUser?.full_name || currentUser?.email || '');
    setAvatarUrl(currentUser?.avatar_url || null);
    // Fetch WA binding info from API (not in JWT)
    api.get('/api/auth/me').then((me: any) => {
      setWaPhone(me.phone_number || null);
      setWaJid(me.wa_jid || null);
    }).catch(() => {});
  }, []);

  const roleColors: Record<string, string> = {
    tenant_admin: '#2383E2',
    platform_admin: '#8B5CF6',
    employee: '#16a34a',
  };

  const saveAvatar = async () => {
    if (!pendingAvatar) return;
    setSavingAvatar(true);
    const serialized = serializeAvatarConfig(pendingAvatar);
    try {
      await api.put('/api/auth/profile', { avatar_url: serialized });
      setAvatarUrl(serialized);
      updateStoredUser({ avatar_url: serialized });
      window.dispatchEvent(new Event('avatar-updated'));
      setPendingAvatar(null);
      setShowAvatarPicker(false);
    } catch (err) {
      console.error('Failed to save avatar:', err);
    } finally {
      setSavingAvatar(false);
    }
  };

  return (
    <div>
      <SectionHeader title={tSettings('accountTitle')} subtitle={tSettings('accountSubtitle')} />

      <div className="space-y-6">
        {/* Avatar + Name */}
        <SettingsCard>
          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <UserAvatar
                userId={user?.sub || user?.id || ''}
                name={name}
                avatarUrl={pendingAvatar ? serializeAvatarConfig(pendingAvatar) : avatarUrl}
                size={64}
              />
              <button
                onClick={() => { setShowAvatarPicker(v => !v); if (showAvatarPicker) setPendingAvatar(null); }}
                className="px-2 py-0.5 rounded text-[11px] transition-colors"
                style={{ color: 'var(--notion-accent)', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {showAvatarPicker ? tSettings('closeAvatar') : tSettings('changeAvatar')}
              </button>
            </div>
            <div className="flex-1">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input value={name} onChange={e => setName(e.target.value)}
                    autoFocus
                    className="flex-1 px-3 py-1.5 rounded-md text-sm outline-none"
                    style={{ border: '1px solid var(--notion-accent)', color: 'var(--notion-text)' }} />
                  <button onClick={async () => { setSaving(true); setTimeout(() => { setEditing(false); setSaving(false); }, 500); }}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
                    style={{ background: 'var(--notion-accent)' }}>
                    {saving ? tSettings('saving') : tSettings('save')}
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="px-3 py-1.5 rounded-md text-sm border"
                    style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                    {tSettings('cancel')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--notion-text)' }}>{name || 'No name set'}</p>
                    <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{user?.email}</p>
                  </div>
                  <button onClick={() => setEditing(true)}
                    className="px-2.5 py-1 rounded-md text-xs border transition-colors"
                    style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {tSettings('edit')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Avatar Picker */}
          {showAvatarPicker && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--notion-border)' }}>
              <AvatarPicker
                value={parseAvatarConfig(pendingAvatar ? serializeAvatarConfig(pendingAvatar) : avatarUrl)}
                userId={user?.sub || user?.id || ''}
                onChange={(config: AvatarConfig) => {
                  setPendingAvatar(config);
                }}
              />
              <div className="flex justify-end mt-4 gap-2">
                <button
                  onClick={() => { setPendingAvatar(null); setShowAvatarPicker(false); }}
                  className="px-4 py-1.5 rounded-md text-sm border transition-colors"
                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {tSettings('cancel')}
                </button>
                <button
                  onClick={saveAvatar}
                  disabled={!pendingAvatar || savingAvatar}
                  className="px-4 py-1.5 rounded-md text-sm text-white disabled:opacity-50 transition-colors"
                  style={{ background: 'var(--notion-accent)' }}
                >
                  {savingAvatar ? tSettings('saving') : tSettings('saveAvatar')}
                </button>
              </div>
            </div>
          )}
        </SettingsCard>

        {/* Role & Tenant */}
        <SettingsCard>
          <SettingsRow label={tSettings('role')} value={
            <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ background: roleColors[user?.role] || '#6b7280' }}>
              {user?.role?.replace('_', ' ') || 'User'}
            </span>
          } />
          <SettingsDivider />
          <SettingsRow label={tSettings('tenant')} value={
            <span className="text-sm" style={{ color: 'var(--notion-text)' }}>{user?.tenant_slug || '—'}</span>
          } />
          <SettingsDivider />
          <SettingsRow label={tSettings('email')} value={
            <span className="text-sm" style={{ color: 'var(--notion-text)' }}>{user?.email || '—'}</span>
          } />
        </SettingsCard>

        {/* WhatsApp binding */}
        {(waPhone || waJid) && (
          <SettingsCard>
            <SettingsRow label="WhatsApp" value={
              <span className="text-sm" style={{ color: 'var(--notion-text)' }}>
                {waPhone || waJid || '—'}
              </span>
            } />
            <SettingsDivider />
            <SettingsRow label={tSettings('bindingStatus')} value={
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: '#dcfce7', color: '#166534' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                {tSettings('connected')}
              </span>
            } />
          </SettingsCard>
        )}

        {/* Password change */}
        <PasswordChangeCard />

        {/* Danger zone */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#ef4444' }}>{tSettings('dangerZone')}</p>
          <SettingsCard style={{ borderColor: '#fecaca' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{tSettings('logoutAll')}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('logoutAllDesc')}</p>
              </div>
              <button className="px-3 py-1.5 rounded-md text-sm border transition-colors"
                style={{ borderColor: '#fecaca', color: '#ef4444' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { localStorage.clear(); window.location.href = '/login'; }}>
                {tSettings('logoutAllBtn')}
              </button>
            </div>
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}

// ── Appearance Section ─────────────────────────────────────────────────────────

function AppearanceSection() {
  const tSettings = useTranslations('settings');
  const lang = useLocale();
  const { theme, setTheme } = useTheme();

  function changeLang(code: LangCode) {
    setLocale(code);
  }

  return (
    <div>
      <SectionHeader title={tSettings('appearanceTitle')} subtitle={tSettings('appearanceSubtitle')} />

      <div className="space-y-6">
        {/* Theme */}
        <SettingsCard>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--notion-text)' }}>{tSettings('theme')}</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'light', labelKey: 'themeLight' as const, preview: 'sunrise' },
              { id: 'dark', labelKey: 'themeDark' as const, preview: 'night-sky' },
              { id: 'system', labelKey: 'themeSystem' as const, preview: 'gear' },
            ].map(opt => (
              <button key={opt.id} onClick={() => setTheme(opt.id as 'light' | 'dark' | 'system')}
                className="flex flex-col items-center gap-2 px-3 py-4 rounded-lg border-2 transition-all"
                style={{
                  borderColor: theme === opt.id ? 'var(--notion-accent)' : 'var(--notion-border)',
                  background: theme === opt.id ? 'var(--notion-active)' : 'transparent',
                }}>
                <HandIcon name={opt.preview} size={24} />
                <span className="text-xs font-medium" style={{ color: theme === opt.id ? 'var(--notion-accent)' : 'var(--notion-text-muted)' }}>
                  {tSettings(opt.labelKey)}
                </span>
              </button>
            ))}
          </div>
        </SettingsCard>

        {/* Language */}
        <SettingsCard>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--notion-text)' }}>{tSettings('language')}</p>
          <div className="space-y-0.5">
            {LANGUAGES.map(l => (
              <button key={l.code}
                onClick={() => changeLang(l.code)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-colors text-left"
                style={{ background: lang === l.code ? 'var(--notion-active)' : 'transparent' }}
                onMouseEnter={e => { if (lang !== l.code) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                onMouseLeave={e => { if (lang !== l.code) e.currentTarget.style.background = 'transparent'; }}>
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{l.native}</span>
                  <span className="text-xs ml-2" style={{ color: 'var(--notion-text-muted)' }}>{l.label}</span>
                </div>
                {lang === l.code && (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--notion-accent)', flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </SettingsCard>

        {/* Date & Time Format */}
        <SettingsCard>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--notion-text)' }}>{tSettings('dateTime')}</p>
          <SettingsRow label={tSettings('dateFormat')} value={
            <select className="text-sm px-2 py-1 rounded-md outline-none border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
              <option>MM/DD/YYYY</option>
              <option>DD/MM/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          } />
          <SettingsDivider />
          <SettingsRow label={tSettings('startWeekOn')} value={
            <select className="text-sm px-2 py-1 rounded-md outline-none border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
              <option>Sunday</option>
              <option>Monday</option>
              <option>Saturday</option>
            </select>
          } />
        </SettingsCard>
      </div>
    </div>
  );
}

// ── Workspace Section ─────────────────────────────────────────────────────────

function WorkspaceSection({ tenant }: { tenant: string }) {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWs, setEditingWs] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => {
    api.get('/api/workspace/workspaces')
      .then(data => setWorkspaces(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveWs(ws: any) {
    try {
      await api.patch(`/api/workspace/workspaces/${ws.id}`, { name: editName, description: editDesc });
      setWorkspaces(prev => prev.map(w => w.id === ws.id ? { ...w, name: editName, description: editDesc } : w));
      setEditingWs(null);
    } catch (err: any) { alert(err.message); }
  }

  async function deleteWs(wsId: string) {
    if (!confirm('Delete this space and all its pages?')) return;
    try {
      await api.delete(`/api/workspace/workspaces/${wsId}`);
      setWorkspaces(prev => prev.filter(w => w.id !== wsId));
    } catch (err: any) { alert(err.message); }
  }

  if (loading) return <div className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading...</div>;

  return (
    <div>
      <SectionHeader title="Workspace" subtitle="Manage your spaces and their settings." />

      <div className="space-y-3">
        {workspaces.map(ws => (
          <SettingsCard key={ws.id}>
            {editingWs === ws.id ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <HandIcon name={ws.icon || 'folder'} size={20} />
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-md text-sm outline-none font-medium"
                    style={{ border: '1px solid var(--notion-accent)', color: 'var(--notion-text)' }} />
                </div>
                <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-1.5 rounded-md text-sm outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditingWs(null)}
                    className="flex-1 py-1.5 rounded-md text-xs border"
                    style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>Cancel</button>
                  <button onClick={() => saveWs(ws)}
                    className="flex-1 py-1.5 rounded-md text-xs text-white"
                    style={{ background: 'var(--notion-accent)' }}>Save</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0"><HandIcon name={ws.icon || 'folder'} size={20} /></span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{ws.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        background: ws.visibility === 'private' ? '#fef3c7' : '#dbeafe',
                        color: ws.visibility === 'private' ? '#92400e' : '#1e40af',
                      }}>
                      <span className="inline-flex items-center gap-1"><HandIcon name={ws.visibility === 'private' ? 'lock' : 'people-group'} size={10} /> {ws.visibility === 'private' ? 'Private' : 'Shared'}</span>
                    </span>
                  </div>
                  {ws.description && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>{ws.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditingWs(ws.id); setEditName(ws.name); setEditDesc(ws.description || ''); }}
                    className="px-2.5 py-1 rounded-md text-xs border transition-colors"
                    style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    Edit
                  </button>
                  <button onClick={() => deleteWs(ws.id)}
                    className="px-2.5 py-1 rounded-md text-xs border transition-colors"
                    style={{ borderColor: '#fecaca', color: '#ef4444' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </SettingsCard>
        ))}
        {workspaces.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>No spaces yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Members Section ────────────────────────────────────────────────────────────

function MembersSection() {
  const tSettings = useTranslations('settings');
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/api/hr/employees')
      .then(data => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const ROLE_COLORS: Record<string, string> = {
    admin: '#2383E2',
    manager: '#8B5CF6',
    employee: '#16a34a',
  };

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    return !q || e.full_name?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q) || e.title?.toLowerCase().includes(q);
  });

  return (
    <div>
      <SectionHeader title={tSettings('membersTitle')} subtitle={tSettings('membersSubtitle')} />

      <div className="mb-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ border: '1px solid var(--notion-border)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--notion-text-muted)' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tSettings('membersSearch')} className="flex-1 text-sm outline-none bg-transparent"
            style={{ color: 'var(--notion-text)' }} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <svg className="animate-spin h-4 w-4" style={{ color: 'var(--notion-text-muted)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('membersLoading')}</span>
        </div>
      ) : error ? (
        <SettingsCard>
          <div className="py-6 text-center">
            <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>
              {tSettings('membersLoadError')}
            </p>
            <button
              onClick={() => { setError(false); setLoading(true); api.get('/api/hr/employees').then(data => setEmployees(Array.isArray(data) ? data : [])).catch(() => setError(true)).finally(() => setLoading(false)); }}
              className="mt-3 px-4 py-1.5 rounded-md text-sm transition-colors"
              style={{ color: 'var(--notion-accent)', border: '1px solid var(--notion-border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {tSettings('membersRetry')}
            </button>
          </div>
        </SettingsCard>
      ) : (
        <SettingsCard>
          <div className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--notion-border)' }}>
            {filtered.map((emp, i) => (
              <div key={emp.id} className="flex items-center gap-3 py-3"
                style={{ borderTop: i > 0 ? '1px solid var(--notion-border)' : 'none' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                  style={{ background: emp.is_active ? 'var(--notion-accent)' : '#9ca3af' }}>
                  {(emp.full_name || emp.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{emp.full_name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>
                    {emp.title || '—'} {emp.department_name ? `· ${emp.department_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: emp.is_active ? '#dcfce7' : '#f3f4f6', color: emp.is_active ? '#16a34a' : '#6b7280' }}>
                    {emp.is_active ? tSettings('membersActive') : tSettings('membersInactive')}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{emp.employment_type || tSettings('membersFullTime')}</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="py-4 text-sm text-center" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('membersNoResults')}</p>
            )}
          </div>
        </SettingsCard>
      )}
    </div>
  );
}

// ── Notifications Section ──────────────────────────────────────────────────────

type NotificationPrefs = {
  email_mentions: boolean;
  email_updates: boolean;
  email_weekly: boolean;
  push_mentions: boolean;
  push_comments: boolean;
  browser_alerts: boolean;
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  email_mentions: true,
  email_updates: false,
  email_weekly: true,
  push_mentions: true,
  push_comments: false,
  browser_alerts: true,
};

type NotificationSmtpForm = {
  email_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  smtp_use_tls: boolean;
  smtp_use_ssl: boolean;
  smtp_timeout_seconds: number;
};

const DEFAULT_NOTIFICATION_SMTP: NotificationSmtpForm = {
  email_enabled: false,
  smtp_host: '',
  smtp_port: 587,
  smtp_username: '',
  smtp_password: '',
  smtp_from_email: '',
  smtp_from_name: 'Nexus ERP',
  smtp_use_tls: true,
  smtp_use_ssl: false,
  smtp_timeout_seconds: 20,
};

function NotificationsSection() {
  const tSettings = useTranslations('settings');

  const [prefs, setPrefs] = useState({ ...DEFAULT_NOTIFICATION_PREFS });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof NotificationPrefs | null>(null);

  useEffect(() => {
    let alive = true;
    api.get('/api/notifications/preferences')
      .then((remote: Partial<NotificationPrefs>) => {
        if (!alive) return;
        setPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...(remote || {}) });
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingPrefs(false);
      });
    return () => { alive = false; };
  }, []);

  async function toggle(key: keyof NotificationPrefs) {
    const previous = { ...prefs };
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSavingKey(key);
    try {
      await api.patch('/api/notifications/preferences', { [key]: next[key] });
    } catch (err: any) {
      setPrefs(previous);
      alert(err.message || tSettings('notifSaveFailed'));
    } finally {
      setSavingKey(null);
    }
  }

  const groups = [
    {
      title: tSettings('notifEmail'),
      items: [
        { key: 'email_mentions', label: tSettings('notifEmailMentions'), desc: tSettings('notifEmailMentionsDesc') },
        { key: 'email_updates', label: tSettings('notifEmailUpdates'), desc: tSettings('notifEmailUpdatesDesc') },
        { key: 'email_weekly', label: tSettings('notifEmailWeekly'), desc: tSettings('notifEmailWeeklyDesc') },
      ],
    },
    {
      title: tSettings('notifPush'),
      items: [
        { key: 'push_mentions', label: tSettings('notifPushMentions'), desc: tSettings('notifPushMentionsDesc') },
        { key: 'push_comments', label: tSettings('notifPushComments'), desc: tSettings('notifPushCommentsDesc') },
      ],
    },
    {
      title: tSettings('notifBrowser'),
      items: [
        { key: 'browser_alerts', label: tSettings('notifBrowserAlerts'), desc: tSettings('notifBrowserAlertsDesc') },
      ],
    },
  ];

  return (
    <div>
      <SectionHeader title={tSettings('notifTitle')} subtitle={tSettings('notifSubtitle')} />

      <div className="space-y-6">
        {groups.map(group => (
          <div key={group.title}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--notion-text-muted)' }}>
              {group.title}
            </p>
            <SettingsCard>
              {group.items.map((item, i) => (
                <div key={item.key}>
                  {i > 0 && <SettingsDivider />}
                  <div className="flex items-center justify-between py-0.5">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{item.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>{item.desc}</p>
                      {savingKey === (item.key as keyof NotificationPrefs) && (
                        <p className="text-[11px] mt-1" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSaving')}</p>
                      )}
                    </div>
                    <Toggle
                      value={prefs[item.key as keyof NotificationPrefs]}
                      onChange={() => toggle(item.key as keyof NotificationPrefs)}
                      disabled={loadingPrefs}
                    />
                  </div>
                </div>
              ))}
            </SettingsCard>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Email Settings Section ───────────────────────────────────────────────────

function EmailSettingsSection() {
  const tSettings = useTranslations('settings');
  const currentUser = getCurrentUser();
  const canManageAdminSMTP = currentUser?.role === 'tenant_admin' || currentUser?.role === 'platform_admin';

  const [adminSmtpConfig, setAdminSmtpConfig] = useState<NotificationSmtpForm>({ ...DEFAULT_NOTIFICATION_SMTP });
  const [adminSmtpPassword, setAdminSmtpPassword] = useState('');
  const [loadingAdminSmtp, setLoadingAdminSmtp] = useState(true);
  const [savingAdminSmtp, setSavingAdminSmtp] = useState(false);
  const [adminSmtpSaved, setAdminSmtpSaved] = useState<string | null>(null);

  // IMAP state
  const [imapConfig, setImapConfig] = useState({
    imap_enabled: false, imap_host: '', imap_port: 993,
    imap_username: '', imap_use_ssl: true, imap_mailbox: 'INBOX',
    imap_timeout_seconds: 30, imap_has_password: false,
    imap_last_sync_at: null as string | null,
  });
  const [imapPassword, setImapPassword] = useState('');
  const [loadingImap, setLoadingImap] = useState(true);
  const [savingImap, setSavingImap] = useState(false);
  const [imapSaved, setImapSaved] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [userSmtpConfig, setUserSmtpConfig] = useState<NotificationSmtpForm>({ ...DEFAULT_NOTIFICATION_SMTP });
  const [userSmtpPassword, setUserSmtpPassword] = useState('');
  const [loadingUserSmtp, setLoadingUserSmtp] = useState(true);
  const [savingUserSmtp, setSavingUserSmtp] = useState(false);
  const [userSmtpSaved, setUserSmtpSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageAdminSMTP) {
      setLoadingAdminSmtp(false);
      return;
    }
    let alive = true;
    api.get('/api/admin/notifications/smtp')
      .then((remote: Partial<NotificationSmtpForm>) => {
        if (!alive) return;
        if (remote) {
          setAdminSmtpConfig(prev => ({ ...prev, ...remote }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingAdminSmtp(false);
      });
    return () => { alive = false; };
  }, [canManageAdminSMTP]);

  // Load IMAP config
  useEffect(() => {
    if (!canManageAdminSMTP) { setLoadingImap(false); return; }
    let alive = true;
    api.get('/api/admin/notifications/imap')
      .then((remote: any) => {
        if (!alive) return;
        if (remote) setImapConfig(prev => ({ ...prev, ...remote }));
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingImap(false); });
    return () => { alive = false; };
  }, [canManageAdminSMTP]);

  useEffect(() => {
    let alive = true;
    api.get('/api/notifications/user-smtp')
      .then((remote: Partial<NotificationSmtpForm>) => {
        if (!alive) return;
        if (remote) {
          setUserSmtpConfig(prev => ({ ...prev, ...remote }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingUserSmtp(false);
      });
    return () => { alive = false; };
  }, []);

  function updateAdminSmtp<K extends keyof NotificationSmtpForm>(field: K, value: NotificationSmtpForm[K]) {
    setAdminSmtpConfig(prev => ({ ...prev, [field]: value }));
  }

  async function saveAdminSmtpConfig() {
    if (!canManageAdminSMTP) return;
    setSavingAdminSmtp(true);
    setAdminSmtpSaved(null);
    try {
      const payload: Partial<NotificationSmtpForm> = { ...adminSmtpConfig };
      if (!adminSmtpPassword) {
        delete payload.smtp_password;
      } else {
        payload.smtp_password = adminSmtpPassword;
      }
      await api.patch('/api/admin/notifications/smtp', payload);
      setAdminSmtpPassword('');
      setAdminSmtpSaved(tSettings('notifSmtpSaved'));
    } catch (err: any) {
      alert(err.message || tSettings('notifSmtpSaveFailed'));
    } finally {
      setSavingAdminSmtp(false);
    }
  }

  // IMAP helpers
  function updateImap(field: string, value: any) {
    setImapConfig(prev => ({ ...prev, [field]: value }));
  }

  async function saveImapConfig() {
    if (!canManageAdminSMTP) return;
    setSavingImap(true);
    setImapSaved(null);
    try {
      const payload: any = { ...imapConfig };
      delete payload.imap_last_sync_at;
      if (!imapPassword) {
        delete payload.imap_password;
      } else {
        payload.imap_password = imapPassword;
      }
      await api.patch('/api/admin/notifications/imap', payload);
      setImapPassword('');
      setImapSaved(tSettings('imapSaved'));
    } catch (err: any) {
      alert(err.message || tSettings('imapSaveFailed'));
    } finally {
      setSavingImap(false);
    }
  }

  async function triggerImapSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.post('/api/email/imap/sync', {});
      setSyncResult(tSettings('imapSyncResult', { count: res.synced ?? 0 }));
      // Refresh last sync time
      const status = await api.get('/api/email/imap/status');
      if (status?.last_sync_at) {
        setImapConfig(prev => ({ ...prev, imap_last_sync_at: status.last_sync_at }));
      }
    } catch (err: any) {
      alert(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  function updateUserSmtp<K extends keyof NotificationSmtpForm>(field: K, value: NotificationSmtpForm[K]) {
    setUserSmtpConfig(prev => ({ ...prev, [field]: value }));
  }

  async function saveUserSmtpConfig() {
    setSavingUserSmtp(true);
    setUserSmtpSaved(null);
    try {
      const payload: Partial<NotificationSmtpForm> = { ...userSmtpConfig };
      if (!userSmtpPassword) {
        delete payload.smtp_password;
      } else {
        payload.smtp_password = userSmtpPassword;
      }
      await api.patch('/api/notifications/user-smtp', payload);
      setUserSmtpPassword('');
      setUserSmtpSaved(tSettings('notifPersonalSmtpSaved'));
    } catch (err: any) {
      alert(err.message || tSettings('notifPersonalSmtpSaveFailed'));
    } finally {
      setSavingUserSmtp(false);
    }
  }

  return (
    <div>
      <SectionHeader title={tSettings('emailTitle')} subtitle={tSettings('emailSubtitle')} />

      {canManageAdminSMTP && (
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--notion-text-muted)' }}>
            {tSettings('notifTenantEmail')}
          </p>
          <SettingsCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{tSettings('notifSmtpEnable')}</p>
                <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpDesc')}</p>
              </div>
              <Toggle
                value={adminSmtpConfig.email_enabled}
                onChange={() => updateAdminSmtp('email_enabled', !adminSmtpConfig.email_enabled)}
                disabled={loadingAdminSmtp}
              />
            </div>
            <div className="grid gap-3 mt-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpHost')}</label>
                <input
                  value={adminSmtpConfig.smtp_host}
                  onChange={e => updateAdminSmtp('smtp_host', e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  disabled={loadingAdminSmtp}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpPort')}</label>
                <input
                  type="number"
                  value={adminSmtpConfig.smtp_port}
                  onChange={e => updateAdminSmtp('smtp_port', Number(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  disabled={loadingAdminSmtp}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpUsername')}</label>
                <input
                  value={adminSmtpConfig.smtp_username}
                  onChange={e => updateAdminSmtp('smtp_username', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  disabled={loadingAdminSmtp}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpPassword')}</label>
                <input
                  type="password"
                  value={adminSmtpPassword}
                  onChange={e => setAdminSmtpPassword(e.target.value)}
                  placeholder={tSettings('notifSmtpPasswordPlaceholder')}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  disabled={loadingAdminSmtp}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpFromEmail')}</label>
                <input
                  value={adminSmtpConfig.smtp_from_email}
                  onChange={e => updateAdminSmtp('smtp_from_email', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  disabled={loadingAdminSmtp}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpFromName')}</label>
                <input
                  value={adminSmtpConfig.smtp_from_name}
                  onChange={e => updateAdminSmtp('smtp_from_name', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  disabled={loadingAdminSmtp}
                />
              </div>
              <div className="flex items-center gap-3">
                <Toggle
                  value={adminSmtpConfig.smtp_use_tls}
                  onChange={() => updateAdminSmtp('smtp_use_tls', !adminSmtpConfig.smtp_use_tls)}
                  disabled={loadingAdminSmtp}
                />
                <p className="text-xs text-[var(--notion-text-muted)]">{tSettings('notifSmtpTls')}</p>
              </div>
              <div className="flex items-center gap-3">
                <Toggle
                  value={adminSmtpConfig.smtp_use_ssl}
                  onChange={() => updateAdminSmtp('smtp_use_ssl', !adminSmtpConfig.smtp_use_ssl)}
                  disabled={loadingAdminSmtp}
                />
                <p className="text-xs text-[var(--notion-text-muted)]">{tSettings('notifSmtpSsl')}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpTimeout')}</label>
                <input
                  type="number"
                  value={adminSmtpConfig.smtp_timeout_seconds}
                  onChange={e => updateAdminSmtp('smtp_timeout_seconds', Number(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  disabled={loadingAdminSmtp}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                type="button"
                onClick={saveAdminSmtpConfig}
                disabled={savingAdminSmtp || loadingAdminSmtp}
                className="px-4 py-2 text-sm font-semibold rounded-xl"
                style={{
                  background: savingAdminSmtp ? '#c4b5fd' : 'var(--notion-accent)',
                  color: 'white',
                  opacity: savingAdminSmtp || loadingAdminSmtp ? 0.7 : 1,
                }}
              >
                {tSettings('notifSmtpSave')}
              </button>
              {adminSmtpSaved && <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{adminSmtpSaved}</span>}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpAdminOnly')}</p>
          </SettingsCard>

          {/* ── IMAP Config Card ── */}
          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--notion-text-muted)' }}>
              {tSettings('imapTitle')}
            </p>
            <SettingsCard>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{tSettings('imapEnable')}</p>
                  <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('imapDesc')}</p>
                </div>
                <Toggle
                  value={imapConfig.imap_enabled}
                  onChange={() => updateImap('imap_enabled', !imapConfig.imap_enabled)}
                  disabled={loadingImap}
                />
              </div>
              <div className="grid gap-3 mt-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('imapHost')}</label>
                  <input
                    value={imapConfig.imap_host}
                    onChange={e => updateImap('imap_host', e.target.value)}
                    placeholder="imap.example.com"
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                    disabled={loadingImap}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('imapPort')}</label>
                  <input
                    type="number"
                    value={imapConfig.imap_port}
                    onChange={e => updateImap('imap_port', Number(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                    disabled={loadingImap}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('imapUsername')}</label>
                  <input
                    value={imapConfig.imap_username}
                    onChange={e => updateImap('imap_username', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                    disabled={loadingImap}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('imapPassword')}</label>
                  <input
                    type="password"
                    value={imapPassword}
                    onChange={e => setImapPassword(e.target.value)}
                    placeholder={tSettings('imapPasswordPlaceholder')}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                    disabled={loadingImap}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('imapMailbox')}</label>
                  <input
                    value={imapConfig.imap_mailbox}
                    onChange={e => updateImap('imap_mailbox', e.target.value)}
                    placeholder="INBOX"
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                    disabled={loadingImap}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('imapTimeout')}</label>
                  <input
                    type="number"
                    value={imapConfig.imap_timeout_seconds}
                    onChange={e => updateImap('imap_timeout_seconds', Number(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                    disabled={loadingImap}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Toggle
                    value={imapConfig.imap_use_ssl}
                    onChange={() => updateImap('imap_use_ssl', !imapConfig.imap_use_ssl)}
                    disabled={loadingImap}
                  />
                  <p className="text-xs text-[var(--notion-text-muted)]">{tSettings('imapSsl')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={saveImapConfig}
                  disabled={savingImap || loadingImap}
                  className="px-4 py-2 text-sm font-semibold rounded-xl"
                  style={{
                    background: savingImap ? '#c4b5fd' : 'var(--notion-accent)',
                    color: 'white',
                    opacity: savingImap || loadingImap ? 0.7 : 1,
                  }}
                >
                  {tSettings('imapSave')}
                </button>
                {imapConfig.imap_enabled && (
                  <button
                    type="button"
                    onClick={triggerImapSync}
                    disabled={syncing}
                    className="px-4 py-2 text-sm font-semibold rounded-xl"
                    style={{
                      background: 'var(--notion-bg-secondary)',
                      border: '1px solid var(--notion-border)',
                      color: 'var(--notion-text)',
                      opacity: syncing ? 0.7 : 1,
                    }}
                  >
                    {syncing ? tSettings('imapSyncing') : tSettings('imapSyncNow')}
                  </button>
                )}
                {imapSaved && <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{imapSaved}</span>}
                {syncResult && <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{syncResult}</span>}
              </div>
              {imapConfig.imap_has_password && !imapPassword && (
                <p className="text-xs mt-2" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('imapPasswordStored')}</p>
              )}
              <p className="text-xs mt-2" style={{ color: 'var(--notion-text-muted)' }}>
                {tSettings('imapLastSync')}: {imapConfig.imap_last_sync_at ? new Date(imapConfig.imap_last_sync_at).toLocaleString() : tSettings('imapNeverSynced')}
              </p>
            </SettingsCard>
          </div>
        </div>
      )}

      <div className={canManageAdminSMTP ? 'mt-10' : ''}>
        <p className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--notion-text-muted)' }}>
          {tSettings('notifPersonalEmail')}
        </p>
        <SettingsCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{tSettings('notifPersonalSmtpEnable')}</p>
              <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifPersonalSmtpDesc')}</p>
            </div>
            <Toggle
              value={userSmtpConfig.email_enabled}
              onChange={() => updateUserSmtp('email_enabled', !userSmtpConfig.email_enabled)}
              disabled={loadingUserSmtp}
            />
          </div>
          <div className="grid gap-3 mt-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpHost')}</label>
              <input
                value={userSmtpConfig.smtp_host}
                onChange={e => updateUserSmtp('smtp_host', e.target.value)}
                placeholder="smtp.example.com"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                disabled={loadingUserSmtp}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpPort')}</label>
              <input
                type="number"
                value={userSmtpConfig.smtp_port}
                onChange={e => updateUserSmtp('smtp_port', Number(e.target.value) || 0)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                disabled={loadingUserSmtp}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpUsername')}</label>
              <input
                value={userSmtpConfig.smtp_username}
                onChange={e => updateUserSmtp('smtp_username', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                disabled={loadingUserSmtp}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpPassword')}</label>
              <input
                type="password"
                value={userSmtpPassword}
                onChange={e => setUserSmtpPassword(e.target.value)}
                placeholder={tSettings('notifSmtpPasswordPlaceholder')}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                disabled={loadingUserSmtp}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpFromEmail')}</label>
              <input
                value={userSmtpConfig.smtp_from_email}
                onChange={e => updateUserSmtp('smtp_from_email', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                disabled={loadingUserSmtp}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpFromName')}</label>
              <input
                value={userSmtpConfig.smtp_from_name}
                onChange={e => updateUserSmtp('smtp_from_name', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                disabled={loadingUserSmtp}
              />
            </div>
            <div className="flex items-center gap-3">
              <Toggle
                value={userSmtpConfig.smtp_use_tls}
                onChange={() => updateUserSmtp('smtp_use_tls', !userSmtpConfig.smtp_use_tls)}
                disabled={loadingUserSmtp}
              />
              <p className="text-xs text-[var(--notion-text-muted)]">{tSettings('notifSmtpTls')}</p>
            </div>
            <div className="flex items-center gap-3">
              <Toggle
                value={userSmtpConfig.smtp_use_ssl}
                onChange={() => updateUserSmtp('smtp_use_ssl', !userSmtpConfig.smtp_use_ssl)}
                disabled={loadingUserSmtp}
              />
              <p className="text-xs text-[var(--notion-text-muted)]">{tSettings('notifSmtpSsl')}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifSmtpTimeout')}</label>
              <input
                type="number"
                value={userSmtpConfig.smtp_timeout_seconds}
                onChange={e => updateUserSmtp('smtp_timeout_seconds', Number(e.target.value) || 0)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                disabled={loadingUserSmtp}
              />
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                type="button"
                onClick={saveUserSmtpConfig}
                disabled={savingUserSmtp || loadingUserSmtp}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{
                  background: savingUserSmtp ? '#c4b5fd' : 'var(--notion-accent)',
                  color: 'white',
                  opacity: savingUserSmtp || loadingUserSmtp ? 0.7 : 1,
                }}
              >
                {tSettings('notifPersonalSmtpSave')}
              </button>
              {userSmtpSaved && <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{userSmtpSaved}</span>}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('notifPersonalSmtpNote')}</p>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

// ── WhatsApp Settings Section ────────────────────────────────────────────────

type WaSettingsAccount = {
  id: string; display_name?: string; phone_number?: string; status: string;
  label?: string; last_seen_at?: string; created_at?: string;
  wa_jid?: string; owner_user_id?: string;
};

type WaAdminAccount = WaSettingsAccount & {
  owner_name?: string; owner_email?: string; employee_name?: string;
};

function WhatsAppSettingsSection() {
  const tSettings = useTranslations('settings');
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'tenant_admin' || currentUser?.role === 'platform_admin' || currentUser?.role === 'manager';

  const [accounts, setAccounts] = useState<WaSettingsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<string>('');
  const [creating, setCreating] = useState(false);

  // Admin state
  const [adminAccounts, setAdminAccounts] = useState<WaAdminAccount[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; user_id?: string }[]>([]);
  const [transferTarget, setTransferTarget] = useState<{ accountId: string; employeeId: string } | null>(null);

  // Number check state
  const [checkPhone, setCheckPhone] = useState('');
  const [checkResult, setCheckResult] = useState<null | { exists: boolean; jid?: string }>(null);
  const [checking, setChecking] = useState(false);

  async function loadAccounts() {
    try {
      const data = await api.get('/api/whatsapp/accounts');
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setAccounts([]); }
    finally { setLoading(false); }
  }

  async function loadAdminAccounts() {
    try {
      const data = await api.get('/api/whatsapp/admin/accounts');
      setAdminAccounts(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function loadEmployees() {
    try {
      const data = await api.get('/api/hr/employees');
      setEmployees(Array.isArray(data) ? data : []);
    } catch {}
  }

  useEffect(() => {
    loadAccounts();
    if (isAdmin) { loadAdminAccounts(); loadEmployees(); }
  }, []);

  // Poll QR when modal is open
  useEffect(() => {
    if (!showQrModal) return;
    let active = true;
    const poll = async () => {
      try {
        const data = await api.get(`/api/whatsapp/accounts/${showQrModal}/qr`);
        if (!active) return;
        setQrData(data.qr_data || '');
        setQrStatus(data.status || '');
        if (data.status === 'connected') { setShowQrModal(null); loadAccounts(); if (isAdmin) loadAdminAccounts(); }
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [showQrModal]);

  async function connectNew() {
    setCreating(true);
    try {
      const res = await api.post('/api/whatsapp/accounts', {});
      setShowQrModal(res.id);
    } catch (err: any) { alert(err.message || 'Failed'); }
    finally { setCreating(false); }
  }

  async function reconnect(id: string) {
    try { await api.post(`/api/whatsapp/accounts/${id}/reconnect`, {}); setShowQrModal(id); } catch {}
  }

  async function disconnect(id: string) {
    if (!confirm('Disconnect this WhatsApp account?')) return;
    try { await api.delete(`/api/whatsapp/accounts/${id}`); loadAccounts(); if (isAdmin) loadAdminAccounts(); } catch {}
  }

  async function adminTransfer(accountId: string, employeeId: string) {
    if (!confirm(tSettings('waTransferConfirm', { name: employees.find(e => e.id === employeeId)?.full_name || '' }))) return;
    try { await api.post(`/api/whatsapp/admin/accounts/${accountId}/transfer`, { target_employee_id: employeeId }); loadAdminAccounts(); loadAccounts(); } catch {}
    setTransferTarget(null);
  }

  async function adminUnbind(accountId: string) {
    if (!confirm(tSettings('waUnbindConfirm'))) return;
    try { await api.post(`/api/whatsapp/admin/accounts/${accountId}/unbind`, {}); loadAdminAccounts(); } catch {}
  }

  async function adminLogout(accountId: string) {
    if (!confirm(tSettings('waLogoutConfirm'))) return;
    try { await api.post(`/api/whatsapp/admin/accounts/${accountId}/logout`, {}); loadAdminAccounts(); loadAccounts(); } catch {}
  }

  async function checkNumber() {
    if (!checkPhone.trim() || accounts.length === 0) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await api.post('/api/whatsapp/check-numbers', { phone_numbers: [checkPhone.trim()], account_id: accounts[0].id });
      const results = res.results || [];
      setCheckResult(results[0] || { exists: false });
    } catch { setCheckResult({ exists: false }); }
    finally { setChecking(false); }
  }

  const statusColors: Record<string, string> = {
    connected: '#16a34a', pending_qr: '#d97706', disconnected: '#9ca3af',
  };

  if (loading) return <div className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>Loading WhatsApp...</div>;

  return (
    <div>
      <SectionHeader title="WhatsApp" subtitle={tSettings('navWhatsApp')} />

      {/* ── My Accounts ── */}
      <div className="space-y-4">
        {accounts.map(acc => (
          <SettingsCard key={acc.id}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0" style={{ background: '#25D366' }}>
                W
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
                    {acc.display_name || acc.phone_number || acc.label || 'WhatsApp Account'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: `${statusColors[acc.status] || '#9ca3af'}20`, color: statusColors[acc.status] || '#9ca3af' }}>
                    {tSettings(acc.status === 'connected' ? 'waConnected' : acc.status === 'pending_qr' ? 'waPendingQr' : 'waDisconnected')}
                  </span>
                </div>
                {acc.phone_number && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>
                    {tSettings('waPhoneNumber')}: {acc.phone_number}
                  </p>
                )}
                {acc.wa_jid && (
                  <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--notion-text-muted)', fontSize: 10 }}>
                    {tSettings('waJid')}: {acc.wa_jid}
                  </p>
                )}
                {acc.last_seen_at && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>
                    {tSettings('waLastActive')}: {new Date(acc.last_seen_at).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {acc.status !== 'connected' && (
                  <button onClick={() => reconnect(acc.id)} className="px-3 py-1.5 rounded-md text-xs font-medium border"
                    style={{ borderColor: '#25D366', color: '#25D366' }}>
                    {tSettings('waConnected') === 'Connected' ? 'Reconnect' : '重新连接'}
                  </button>
                )}
                <button onClick={() => disconnect(acc.id)} className="px-3 py-1.5 rounded-md text-xs font-medium border"
                  style={{ borderColor: 'var(--notion-border)', color: '#dc2626' }}>
                  {tSettings('waDisconnected') === 'Disconnected' ? 'Disconnect' : '断开连接'}
                </button>
              </div>
            </div>
          </SettingsCard>
        ))}

        <button onClick={connectNew} disabled={creating}
          className="w-full py-3 rounded-lg border-2 border-dashed text-sm font-medium transition-colors"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.color = '#25D366'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--notion-border)'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}>
          {creating ? '...' : '+ WhatsApp'}
        </button>
      </div>

      {/* ── Admin Panel ── */}
      {isAdmin && adminAccounts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--notion-text)' }}>{tSettings('waAdminPanel')}</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('waAllTenantAccounts')}</p>
          <div className="space-y-3">
            {adminAccounts.map(acc => (
              <SettingsCard key={acc.id}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>
                        {acc.display_name || acc.phone_number || acc.label || 'Account'}
                      </span>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColors[acc.status] || '#9ca3af' }} />
                    </div>
                    <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                      {tSettings('waOwner')}: {acc.owner_name || acc.employee_name || '-'}
                      {acc.owner_email && <span className="ml-1">({acc.owner_email})</span>}
                    </p>
                    {acc.phone_number && (
                      <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{acc.phone_number}</p>
                    )}
                    {acc.wa_jid && (
                      <p className="text-xs font-mono" style={{ color: 'var(--notion-text-muted)', fontSize: 10 }}>{acc.wa_jid}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Transfer */}
                    {transferTarget?.accountId === acc.id ? (
                      <div className="flex items-center gap-1">
                        <select value={transferTarget.employeeId}
                          onChange={e => setTransferTarget({ accountId: acc.id, employeeId: e.target.value })}
                          className="text-xs h-7 rounded px-1.5 border outline-none"
                          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}>
                          <option value="">{tSettings('waSelectEmployee')}</option>
                          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                        </select>
                        <button onClick={() => transferTarget.employeeId && adminTransfer(acc.id, transferTarget.employeeId)}
                          disabled={!transferTarget.employeeId}
                          className="px-2 py-1 rounded text-xs font-medium text-white disabled:opacity-40"
                          style={{ background: '#25D366' }}>OK</button>
                        <button onClick={() => setTransferTarget(null)}
                          className="px-2 py-1 rounded text-xs border"
                          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}>X</button>
                      </div>
                    ) : (
                      <button onClick={() => setTransferTarget({ accountId: acc.id, employeeId: '' })}
                        className="px-2 py-1 rounded text-xs font-medium border"
                        style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                        {tSettings('waTransfer')}
                      </button>
                    )}
                    <button onClick={() => adminUnbind(acc.id)}
                      className="px-2 py-1 rounded text-xs font-medium border"
                      style={{ borderColor: 'var(--notion-border)', color: '#d97706' }}>
                      {tSettings('waUnbind')}
                    </button>
                    <button onClick={() => adminLogout(acc.id)}
                      className="px-2 py-1 rounded text-xs font-medium border"
                      style={{ borderColor: '#dc262640', color: '#dc2626' }}>
                      {tSettings('waForceLogout')}
                    </button>
                  </div>
                </div>
              </SettingsCard>
            ))}
          </div>
        </div>
      )}

      {/* ── Number Check ── */}
      {accounts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--notion-text)' }}>{tSettings('waCheckNumber')}</h2>
          <SettingsCard>
            <div className="flex items-center gap-2">
              <input value={checkPhone} onChange={e => setCheckPhone(e.target.value)}
                placeholder={tSettings('waCheckPlaceholder')}
                onKeyDown={e => { if (e.key === 'Enter') checkNumber(); }}
                className="flex-1 text-sm px-3 py-2 rounded-md border outline-none"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }} />
              <button onClick={checkNumber} disabled={checking || !checkPhone.trim()}
                className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-40"
                style={{ background: '#25D366' }}>
                {checking ? '...' : tSettings('waCheckBtn')}
              </button>
            </div>
            {checkResult && (
              <p className="text-sm mt-3 flex items-center gap-2" style={{ color: checkResult.exists ? '#16a34a' : '#dc2626' }}>
                <span>{checkResult.exists ? '\u2705' : '\u274C'}</span>
                {checkResult.exists ? tSettings('waNumberRegistered') : tSettings('waNumberNotRegistered')}
                {checkResult.jid && <span className="text-xs font-mono" style={{ color: 'var(--notion-text-muted)' }}>({checkResult.jid})</span>}
              </p>
            )}
          </SettingsCard>
        </div>
      )}

      {/* ── Reply Templates ── */}
      <div className="mt-8">
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--notion-text)' }}>Reply Templates</h2>
        <TemplateManager />
      </div>

      {/* ── Profile & Privacy ── */}
      {accounts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--notion-text)' }}>Profile & Privacy</h2>
          {accounts.filter(a => a.status === 'connected').map(acc => (
            <ProfileEditor key={acc.id} accountId={acc.id} displayName={acc.display_name || ''} />
          ))}
        </div>
      )}

      {/* ── WhatsApp Status ── */}
      {accounts.filter(a => a.status === 'connected').length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--notion-text)' }}>Publish Status</h2>
          <StatusPublisher accountId={accounts.find(a => a.status === 'connected')!.id} />
        </div>
      )}

      {/* ── AI Chatbot ── */}
      {accounts.filter(a => a.status === 'connected').length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--notion-text)' }}>AI Auto-Reply (Chatbot)</h2>
          {accounts.filter(a => a.status === 'connected').map(acc => (
            <ChatbotConfig key={acc.id} accountId={acc.id} accountName={acc.display_name || acc.phone_number || acc.id} />
          ))}
        </div>
      )}

      {/* ── Broadcast ── */}
      {accounts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--notion-text)' }}>Broadcast Messages</h2>
          <BroadcastManager />
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl shadow-2xl p-8 w-full max-w-sm text-center" style={{ background: 'var(--notion-bg)' }}>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--notion-text)' }}>Scan QR</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--notion-text-muted)' }}>
              WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
            </p>
            <div className="w-56 h-56 mx-auto rounded-xl border-2 flex items-center justify-center mb-4"
              style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-hover)' }}>
              {qrData && qrData !== 'STUB_QR_PLACEHOLDER' ? (
                <img src={qrData} alt="QR" className="w-full h-full object-contain rounded-lg" />
              ) : qrStatus === 'bridge_unavailable' ? (
                <div className="text-center px-4">
                  <div className="text-4xl mb-3" style={{ color: '#dc2626' }}>
                    <HandIcon name="exclamation-triangle" size={48} />
                  </div>
                  <p className="text-xs leading-relaxed font-medium" style={{ color: '#dc2626' }}>
                    WhatsApp Bridge unavailable
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--notion-text-muted)' }}>
                    Retrying every 2 seconds...
                  </p>
                </div>
              ) : qrStatus === 'disconnected' ? (
                <div className="text-center px-4">
                  <div className="inline-block animate-spin mb-3" style={{ width: 32, height: 32, border: '3px solid var(--notion-border)', borderTopColor: '#d97706', borderRadius: '50%' }} />
                  <p className="text-xs leading-relaxed font-medium" style={{ color: '#d97706' }}>
                    Reconnecting...
                  </p>
                </div>
              ) : (
                <div className="text-center px-4">
                  <div className="inline-block animate-spin mb-3" style={{ width: 32, height: 32, border: '3px solid var(--notion-border)', borderTopColor: '#25D366', borderRadius: '50%' }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--notion-text-muted)' }}>
                    {qrStatus === 'restarting' ? 'Reinitializing...' : 'Loading QR...'}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#d97706' }} />
              <span className="text-xs font-medium" style={{ color: '#d97706' }}>Waiting...</span>
            </div>
            <button onClick={() => setShowQrModal(null)}
              className="px-6 py-2 rounded-md text-sm font-medium border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Template Manager ───────────────────────────────────────────────────────────
function TemplateManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [shortcut, setShortcut] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadTemplates() {
    try {
      const data = await api.get('/api/whatsapp/templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadTemplates(); }, []);

  function openEdit(tpl: any) {
    setEditId(tpl.id);
    setName(tpl.name);
    setContent(tpl.content);
    setCategory(tpl.category || 'general');
    setShortcut(tpl.shortcut || '');
    setShowForm(true);
  }

  function openNew() {
    setEditId(null);
    setName(''); setContent(''); setCategory('general'); setShortcut('');
    setShowForm(true);
  }

  async function handleSave() {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/api/whatsapp/templates/${editId}`, { name, content, category, shortcut: shortcut || null });
      } else {
        await api.post('/api/whatsapp/templates', { name, content, category, shortcut: shortcut || null });
      }
      setShowForm(false);
      loadTemplates();
    } catch {}
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return;
    try { await api.delete(`/api/whatsapp/templates/${id}`); loadTemplates(); } catch {}
  }

  if (loading) return <div className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>Loading...</div>;

  return (
    <div>
      {templates.map(tpl => (
        <SettingsCard key={tpl.id}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{tpl.name}</span>
                <span className="text-[9px] px-1.5 rounded" style={{ background: 'var(--notion-hover)', color: 'var(--notion-text-muted)' }}>{tpl.category}</span>
                {tpl.shortcut && <span className="text-[9px] font-mono" style={{ color: '#7c3aed' }}>/{tpl.shortcut}</span>}
              </div>
              <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--notion-text-muted)' }}>{tpl.content}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0 ml-2">
              <button onClick={() => openEdit(tpl)} className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>Edit</button>
              <button onClick={() => handleDelete(tpl.id)} className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: 'var(--notion-border)', color: '#dc2626' }}>Delete</button>
            </div>
          </div>
        </SettingsCard>
      ))}
      {!showForm ? (
        <button onClick={openNew} className="w-full py-2.5 rounded-lg border-2 border-dashed text-xs font-medium mt-2"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}>
          + New Template
        </button>
      ) : (
        <SettingsCard>
          <div className="space-y-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name"
              className="w-full text-sm px-3 py-2 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Template content..."
              rows={3} className="w-full text-sm px-3 py-2 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            <div className="flex gap-2">
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="text-xs h-8 rounded px-2 border outline-none"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                <option value="general">General</option>
                <option value="greeting">Greeting</option>
                <option value="follow_up">Follow Up</option>
                <option value="closing">Closing</option>
                <option value="support">Support</option>
              </select>
              <input value={shortcut} onChange={e => setShortcut(e.target.value)} placeholder="Shortcut (optional)"
                className="flex-1 text-xs px-2 h-8 rounded border outline-none"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded text-xs font-medium text-white"
                style={{ background: '#25D366' }}>{saving ? '...' : (editId ? 'Update' : 'Create')}</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-1.5 rounded text-xs border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>Cancel</button>
            </div>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}

// ── Profile Editor ─────────────────────────────────────────────────────────────
function ProfileEditor({ accountId, displayName }: { accountId: string; displayName: string }) {
  const [name, setName] = useState(displayName);
  const [statusText, setStatusText] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const body: any = {};
      if (name.trim()) body.name = name;
      if (statusText.trim()) body.status_text = statusText;
      await api.put(`/api/whatsapp/accounts/${accountId}/profile`, body);
    } catch {}
    finally { setSaving(false); }
  }

  return (
    <SettingsCard>
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>
          {displayName || accountId.slice(0, 8)}
        </span>
        <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Display name"
            className="w-full text-sm px-3 py-2 rounded border outline-none"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          <input value={statusText} onChange={e => setStatusText(e.target.value)} placeholder="Status text / About"
            className="w-full text-sm px-3 py-2 rounded border outline-none"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded text-xs font-medium text-white"
            style={{ background: '#25D366' }}>{saving ? '...' : 'Save'}</button>
        </div>
      )}
    </SettingsCard>
  );
}

// ── Status Publisher ───────────────────────────────────────────────────────────
function StatusPublisher({ accountId }: { accountId: string }) {
  const [type, setType] = useState<'text' | 'image'>('text');
  const [content, setContent] = useState('');
  const [bgColor, setBgColor] = useState('#25D366');
  const [caption, setCaption] = useState('');
  const [publishing, setPublishing] = useState(false);

  const BG_COLORS = ['#25D366', '#075E54', '#128C7E', '#1DA1F2', '#E91E63', '#FF5722', '#673AB7', '#000000'];

  async function handlePublish() {
    if (!content.trim()) return;
    setPublishing(true);
    try {
      await api.post(`/api/whatsapp/accounts/${accountId}/send-status`, {
        status_type: type, content, background_color: bgColor,
        caption: type !== 'text' ? caption : undefined,
        all_contacts: true,
      });
      setContent(''); setCaption('');
      alert('Status published!');
    } catch {}
    finally { setPublishing(false); }
  }

  return (
    <SettingsCard>
      <div className="space-y-3">
        <div className="flex gap-2">
          <button onClick={() => setType('text')} className="text-xs px-3 py-1.5 rounded font-medium"
            style={{ background: type === 'text' ? '#25D366' : 'var(--notion-hover)', color: type === 'text' ? 'white' : 'var(--notion-text)' }}>
            Text Status
          </button>
          <button onClick={() => setType('image')} className="text-xs px-3 py-1.5 rounded font-medium"
            style={{ background: type === 'image' ? '#25D366' : 'var(--notion-hover)', color: type === 'image' ? 'white' : 'var(--notion-text)' }}>
            Image Status
          </button>
        </div>

        {type === 'text' ? (
          <>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder="What's on your mind?" rows={3}
              className="w-full text-sm px-3 py-2 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            <div className="flex gap-1.5">
              {BG_COLORS.map(c => (
                <button key={c} onClick={() => setBgColor(c)}
                  className="w-6 h-6 rounded-full border-2"
                  style={{ background: c, borderColor: bgColor === c ? 'var(--notion-text)' : 'transparent' }} />
              ))}
            </div>
          </>
        ) : (
          <>
            <input value={content} onChange={e => setContent(e.target.value)}
              placeholder="Image URL" className="w-full text-sm px-3 py-2 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            <input value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Caption (optional)" className="w-full text-sm px-3 py-2 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          </>
        )}

        <button onClick={handlePublish} disabled={publishing || !content.trim()}
          className="px-4 py-1.5 rounded text-xs font-medium text-white disabled:opacity-40"
          style={{ background: '#25D366' }}>{publishing ? '...' : 'Publish'}</button>
      </div>
    </SettingsCard>
  );
}

// ── Chatbot Config ─────────────────────────────────────────────────────────────
function ChatbotConfig({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful customer service assistant.');
  const [triggerType, setTriggerType] = useState('all');
  const [triggerValue, setTriggerValue] = useState('');
  const [keywordFinish, setKeywordFinish] = useState('#human');
  const [expire, setExpire] = useState(20);
  const [speechToText, setSpeechToText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isSetup, setIsSetup] = useState(false);

  async function handleSetup() {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/whatsapp/accounts/${accountId}/chatbot/setup`, {
        openai_api_key: apiKey, model,
        system_messages: [systemPrompt],
        trigger_type: triggerType,
        trigger_value: triggerValue || undefined,
        keyword_finish: keywordFinish,
        expire, speech_to_text: speechToText,
      });
      setIsSetup(true);
    } catch {}
    finally { setSaving(false); }
  }

  async function handleUpdate() {
    setSaving(true);
    try {
      await api.put(`/api/whatsapp/accounts/${accountId}/chatbot/settings`, {
        model, system_messages: [systemPrompt],
        trigger_type: triggerType,
        trigger_value: triggerValue || undefined,
        keyword_finish: keywordFinish,
        expire, speech_to_text: speechToText,
      });
    } catch {}
    finally { setSaving(false); }
  }

  return (
    <SettingsCard>
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{accountName}</span>
        <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          {!isSetup && (
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="OpenAI API Key"
              type="password" className="w-full text-sm px-3 py-2 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          )}
          <select value={model} onChange={e => setModel(e.target.value)}
            className="w-full text-sm h-9 rounded px-3 border outline-none"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          </select>
          <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
            placeholder="System prompt (bot personality)" rows={3}
            className="w-full text-sm px-3 py-2 rounded border outline-none"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          <div className="flex gap-2">
            <select value={triggerType} onChange={e => setTriggerType(e.target.value)}
              className="text-xs h-8 rounded px-2 border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
              <option value="all">All messages</option>
              <option value="keyword">Keyword trigger</option>
              <option value="none">Manual only</option>
            </select>
            {triggerType === 'keyword' && (
              <input value={triggerValue} onChange={e => setTriggerValue(e.target.value)}
                placeholder="Trigger keyword" className="flex-1 text-xs px-2 h-8 rounded border outline-none"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            )}
          </div>
          <div className="flex gap-2 items-center">
            <input value={keywordFinish} onChange={e => setKeywordFinish(e.target.value)}
              placeholder="End keyword (e.g. #human)" className="flex-1 text-xs px-2 h-8 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={speechToText} onChange={e => setSpeechToText(e.target.checked)} />
              Voice-to-text
            </label>
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>Session timeout (min):</label>
            <input type="number" value={expire} onChange={e => setExpire(Number(e.target.value))}
              className="w-20 text-xs px-2 h-8 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          </div>
          <button onClick={isSetup ? handleUpdate : handleSetup} disabled={saving}
            className="px-4 py-1.5 rounded text-xs font-medium text-white"
            style={{ background: '#25D366' }}>{saving ? '...' : (isSetup ? 'Update Settings' : 'Setup Chatbot')}</button>
        </div>
      )}
    </SettingsCard>
  );
}

// ── Broadcast Manager ──────────────────────────────────────────────────────────
function BroadcastManager() {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function loadBroadcasts() {
    try {
      const data = await api.get('/api/whatsapp/broadcasts');
      setBroadcasts(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); }
  }

  async function loadContacts() {
    try {
      const data = await api.get('/api/whatsapp/conversations?include_archived=true');
      setContacts(Array.isArray(data) ? data : []);
    } catch {}
  }

  useEffect(() => { loadBroadcasts(); }, []);

  async function handleCreate() {
    if (!content.trim() || selectedContacts.length === 0) return;
    setCreating(true);
    try {
      await api.post('/api/whatsapp/broadcasts', {
        name: name || 'Broadcast', message_content: content,
        target_contacts: selectedContacts,
      });
      setShowCreate(false);
      setName(''); setContent(''); setSelectedContacts([]);
      loadBroadcasts();
    } catch {}
    finally { setCreating(false); }
  }

  async function handleSend(id: string) {
    if (!confirm('Send this broadcast now?')) return;
    setSendingId(id);
    try {
      await api.post(`/api/whatsapp/broadcasts/${id}/send`, {});
      loadBroadcasts();
    } catch {}
    finally { setSendingId(null); }
  }

  function toggleContact(id: string) {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  if (loading) return <div className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>Loading...</div>;

  return (
    <div>
      {broadcasts.map(bc => (
        <SettingsCard key={bc.id}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{bc.name || 'Broadcast'}</span>
              <span className="text-[9px] ml-2 px-1.5 rounded"
                style={{
                  background: bc.status === 'completed' ? '#dcfce7' : bc.status === 'sending' ? '#fef9c3' : '#f3f4f6',
                  color: bc.status === 'completed' ? '#15803d' : bc.status === 'sending' ? '#a16207' : '#6b7280',
                }}>{bc.status}</span>
              <p className="text-xs mt-0.5" style={{ color: 'var(--notion-text-muted)' }}>
                Sent: {bc.sent_count || 0} | Failed: {bc.failed_count || 0} | Recipients: {JSON.parse(bc.target_contacts || '[]').length}
              </p>
            </div>
            {bc.status === 'draft' && (
              <button onClick={() => handleSend(bc.id)} disabled={sendingId === bc.id}
                className="px-3 py-1.5 rounded text-xs font-medium text-white"
                style={{ background: '#25D366' }}>{sendingId === bc.id ? '...' : 'Send Now'}</button>
            )}
          </div>
        </SettingsCard>
      ))}

      {!showCreate ? (
        <button onClick={() => { setShowCreate(true); loadContacts(); }}
          className="w-full py-2.5 rounded-lg border-2 border-dashed text-xs font-medium mt-2"
          style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}>
          + New Broadcast
        </button>
      ) : (
        <SettingsCard>
          <div className="space-y-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Broadcast name"
              className="w-full text-sm px-3 py-2 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Message content..."
              rows={3} className="w-full text-sm px-3 py-2 rounded border outline-none"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />

            {/* Contact selector */}
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--notion-text)' }}>
                Recipients ({selectedContacts.length} selected)
              </p>
              <input value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                placeholder="Search contacts..." className="w-full text-xs px-2 py-1.5 rounded border outline-none mb-1"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
              <div className="max-h-[150px] overflow-y-auto border rounded" style={{ borderColor: 'var(--notion-border)' }}>
                {contacts
                  .filter(c => !c.is_group && (!contactSearch || (c.display_name || c.push_name || c.phone_number || '').toLowerCase().includes(contactSearch.toLowerCase())))
                  .map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer text-xs border-b"
                      style={{ borderColor: 'var(--notion-border)' }}>
                      <input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={() => toggleContact(c.id)} />
                      <span style={{ color: 'var(--notion-text)' }}>{c.display_name || c.push_name || c.phone_number || c.wa_jid}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={handleCreate} disabled={creating || !content.trim() || selectedContacts.length === 0}
                className="px-4 py-1.5 rounded text-xs font-medium text-white disabled:opacity-40"
                style={{ background: '#25D366' }}>{creating ? '...' : 'Create Broadcast'}</button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-1.5 rounded text-xs border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>Cancel</button>
            </div>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}

// ── Shared UI components ───────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 pb-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--notion-text)' }}>{title}</h1>
      <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{subtitle}</p>
    </div>
  );
}

function SettingsCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="rounded-lg border px-4 py-4" style={{ borderColor: 'var(--notion-border)', background: 'var(--notion-card, white)', ...style }}>
      {children}
    </div>
  );
}

function SettingsDivider() {
  return <div className="h-px my-3" style={{ background: 'var(--notion-border)' }} />;
}

function SettingsRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{label}</p>
      {value}
    </div>
  );
}

// ── AI Finder Settings ─────────────────────────────────────────────────
function AIFinderSettingsSection() {
  const tSettings = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [depth, setDepth] = useState<'fast' | 'standard' | 'thorough'>('standard');
  const [defaultMode, setDefaultMode] = useState<'people' | 'company'>('people');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ai_finder_settings');
      if (raw) {
        const s = JSON.parse(raw);
        if (s.search_depth) setDepth(s.search_depth);
        if (s.default_mode) setDefaultMode(s.default_mode);
      }
    } catch {}
  }, []);

  function save(updates: Record<string, string>) {
    try {
      const raw = localStorage.getItem('ai_finder_settings');
      const current = raw ? JSON.parse(raw) : {};
      const next = { ...current, ...updates };
      localStorage.setItem('ai_finder_settings', JSON.stringify(next));
    } catch {}
  }

  const depthOptions: { key: 'fast' | 'standard' | 'thorough'; icon: string; label: string; desc: string }[] = [
    { key: 'fast', icon: '⚡', label: tSettings('depthFast'), desc: tSettings('depthFastDesc') },
    { key: 'standard', icon: '🔍', label: tSettings('depthStandard'), desc: tSettings('depthStandardDesc') },
    { key: 'thorough', icon: '🔬', label: tSettings('depthThorough'), desc: tSettings('depthThoroughDesc') },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--notion-text)' }}>{tSettings('aiFinderTitle')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--notion-text-muted)' }}>{tSettings('aiFinderSubtitle')}</p>

      {/* Search depth */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--notion-text)', marginBottom: 4 }}>{tSettings('searchDepth')}</div>
        <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', marginBottom: 12 }}>{tSettings('searchDepthDesc')}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {depthOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => { setDepth(opt.key); save({ search_depth: opt.key }); }}
              style={{
                flex: 1, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${depth === opt.key ? '#7c3aed' : 'var(--notion-border)'}`,
                background: depth === opt.key ? '#faf5ff' : 'var(--notion-card, white)',
                textAlign: 'center', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{opt.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: depth === opt.key ? '#7c3aed' : 'var(--notion-text)' }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Default mode */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--notion-text)', marginBottom: 4 }}>{tSettings('defaultMode')}</div>
        <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', marginBottom: 12 }}>{tSettings('defaultModeDesc')}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {([
            { key: 'people' as const, icon: '🔍', label: tSettings('modePeople'), desc: tSettings('modePeopleDesc') },
            { key: 'company' as const, icon: '🏢', label: tSettings('modeCompany'), desc: tSettings('modeCompanyDesc') },
          ]).map(opt => (
            <button
              key={opt.key}
              onClick={() => { setDefaultMode(opt.key); save({ default_mode: opt.key }); }}
              style={{
                flex: 1, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${defaultMode === opt.key ? '#7c3aed' : 'var(--notion-border)'}`,
                background: defaultMode === opt.key ? '#faf5ff' : 'var(--notion-card, white)',
                textAlign: 'center', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{opt.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: defaultMode === opt.key ? '#7c3aed' : 'var(--notion-text)' }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 flex items-center"
      style={{
        background: value ? 'var(--notion-accent)' : '#d1d5db',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: 40,
        height: 22,
        padding: 2,
        transition: 'background 0.2s',
      }}
    >
      <span
        className="block rounded-full bg-white transition-transform"
        style={{
          width: 18,
          height: 18,
          transform: value ? 'translateX(18px)' : 'translateX(0)',
          transition: 'transform 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}
