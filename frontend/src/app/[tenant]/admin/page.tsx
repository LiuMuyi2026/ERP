'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { HandIcon } from '@/components/ui/HandIcon';

// ── Constants (colors only; labels come from i18n) ───────────────────────────
const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  tenant_admin: { bg: '#ede9fe', color: '#7c3aed' },
  tenant_user:  { bg: '#dbeafe', color: '#1d4ed8' },
  manager:      { bg: '#dcfce7', color: '#15803d' },
};
const PERM_COLORS = [
  { value: 'edit', color: '#15803d', bg: '#dcfce7' },
  { value: 'view', color: '#1d4ed8', bg: '#dbeafe' },
  { value: 'none', color: '#6b7280', bg: '#f3f4f6' },
];

const DEFAULT_PASSWORD = 'Happy2026';

type TabKey = 'users' | 'positions' | 'permissions' | 'notifications' | 'audit' | 'ai-providers' | 'settings';

const NOTIF_TYPE_KEYS: { value: string; key: string; icon: string }[] = [
  { value: 'system',  key: 'notifSystem',  icon: 'bell' },
  { value: 'hr',      key: 'notifHr',      icon: 'necktie' },
  { value: 'crm',     key: 'notifCrm',     icon: 'people-group' },
  { value: 'task',    key: 'notifTask',     icon: 'checkmark' },
  { value: 'finance', key: 'notifFinance',  icon: 'money-bag' },
  { value: 'alert',   key: 'notifAlert',    icon: 'warning' },
];

// ── Small UI helpers ──────────────────────────────────────────────────────────
function Badge({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: bg, color }}>{text}</span>
  );
}

function PermCell({ value, onChange, permOptions }: { value: string; onChange: (v: string) => void; permOptions: { value: string; label: string; color: string; bg: string }[] }) {
  const cur = permOptions.find(p => p.value === value) ?? permOptions[1];
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs rounded-lg px-2 py-1 font-medium border-0 outline-none cursor-pointer"
      style={{ background: cur.bg, color: cur.color }}
    >
      {permOptions.map(p => (
        <option key={p.value} value={p.value}>{p.label}</option>
      ))}
    </select>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminPage() {
  const t = useTranslations('admin');
  const [tab, setTab] = useState<TabKey>('users');
  const [loading, setLoading] = useState(true);

  // Derived i18n constants
  const ROLE_LABELS: Record<string, string> = {
    tenant_admin: t('roleSuperAdmin'), tenant_user: t('roleUser'), manager: t('roleManager'),
  };
  const EMP_TYPE_LABELS: Record<string, string> = {
    full_time: t('empTypeFullTime'), part_time: t('empTypePartTime'), contract: t('empTypeContract'), intern: t('empTypeIntern'),
  };
  const APPS = [
    { key: 'workspace',  label: t('appWorkspace'),   icon: 'folder' },
    { key: 'crm',        label: t('appCrm'),         icon: 'people-group' },
    { key: 'hr',         label: t('appHr'),           icon: 'necktie' },
    { key: 'accounting', label: t('appAccounting'),   icon: 'money-bag' },
    { key: 'inventory',  label: t('appInventory'),    icon: 'package' },
  ];
  const PERM_OPTIONS = [
    { ...PERM_COLORS[0], label: t('permEdit') },
    { ...PERM_COLORS[1], label: t('permView') },
    { ...PERM_COLORS[2], label: t('permNone') },
  ];
  const NOTIF_TYPE_OPTIONS = NOTIF_TYPE_KEYS.map(nt => ({
    value: nt.value,
    label: t(nt.key as any) as string,
    icon: nt.icon,
  }));

  // Staff (merged users + employees)
  const [staff, setStaff] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const EMPTY_INVITE = {
    email: '', full_name: '', password: DEFAULT_PASSWORD, role: 'tenant_user',
    phone: '', department_id: '', position_id: '', title: '',
    employment_type: 'full_time', start_date: '',
  };
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);
  const [inviting, setInviting] = useState(false);
  // Inline edit row
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingStaffPatch, setEditingStaffPatch] = useState<any>({});
  // Password management
  const [pwdVisible, setPwdVisible] = useState<Set<string>>(new Set());
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null);
  const [resetPwdValue, setResetPwdValue] = useState(DEFAULT_PASSWORD);
  const [resettingPwd, setResettingPwd] = useState(false);

  // Positions
  const [positions, setPositions] = useState<any[]>([]);
  const [showAddPos, setShowAddPos] = useState(false);
  const [posForm, setPosForm] = useState({ name: '', description: '' });
  const [editingPos, setEditingPos] = useState<any | null>(null);

  // App permissions
  const [permData, setPermData] = useState<{ permissions: any[]; apps: string[] } | null>(null);
  const [permTarget, setPermTarget] = useState<'position' | 'department'>('position');
  const [departments, setDepartments] = useState<any[]>([]);
  // local override map: `${app}:${target_id}` → permission
  const [permOverrides, setPermOverrides] = useState<Record<string, string>>({});
  const [savingPerms, setSavingPerms] = useState(false);

  // Notifications
  const [notifForm, setNotifForm] = useState({
    title: '', body: '', type: 'system', link: '',
    target: 'all' as 'all' | 'select',
    selectedUserIds: [] as string[],
  });
  const [sendingNotif, setSendingNotif] = useState(false);
  const [notifSent, setNotifSent] = useState<number | null>(null);

  // Audit / settings
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [settingsForm, setSettingsForm] = useState({ logo_url: '', primary_color: '#6366f1', currency: 'USD', locale: 'zh-CN' });
  const [savingSettings, setSavingSettings] = useState(false);

  // AI providers
  const [aiConfigs, setAiConfigs] = useState<any[]>([]);
  const [aiCatalog, setAiCatalog] = useState<Record<string, any>>({});
  const [showAddAI, setShowAddAI] = useState(false);
  const [aiForm, setAiForm] = useState({ provider: '', api_key: '', base_url: '', default_model: '', is_default: false });
  const [savingAI, setSavingAI] = useState(false);
  const [editingAI, setEditingAI] = useState<any | null>(null);
  const [editAIForm, setEditAIForm] = useState({ api_key: '', base_url: '', default_model: '', is_default: false, is_active: true });
  const [testingAI, setTestingAI] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string }>>({});

  // Load everything on mount
  useEffect(() => {
    Promise.all([
      api.get('/api/hr/staff').catch(() => []),
      api.get('/api/admin/positions').catch(() => []),
      api.get('/api/admin/app-permissions').catch(() => null),
      api.get('/api/hr/departments').catch(() => []),
      api.get('/api/admin/audit-logs').catch(() => []),
      api.get('/api/admin/settings').catch(() => null),
      api.get('/api/admin/ai-providers').catch(() => []),
      api.get('/api/admin/ai-providers/catalog').catch(() => ({})),
      api.get('/api/admin/users').catch(() => []),
    ]).then(([staffList, pos, perms, depts, logs, cfg, aiCfgs, aiCat, adminUsers]) => {
      // Merge plain_password from admin/users into staff list
      const pwdMap: Record<string, string> = {};
      for (const u of (Array.isArray(adminUsers) ? adminUsers : [])) {
        if (u.id) pwdMap[u.id] = u.plain_password ?? '';
      }
      const mergedStaff = (Array.isArray(staffList) ? staffList : []).map((s: any) => ({
        ...s,
        plain_password: pwdMap[s.user_id] ?? s.plain_password ?? '',
      }));
      setStaff(mergedStaff);
      setPositions(Array.isArray(pos) ? pos : []);
      if (perms) {
        setPermData(perms);
        const map: Record<string, string> = {};
        for (const p of (perms.permissions ?? [])) {
          map[`${p.app}:${p.target_type}:${p.target_id}`] = p.permission;
        }
        setPermOverrides(map);
      }
      setDepartments(Array.isArray(depts) ? depts : []);
      setAuditLogs(Array.isArray(logs) ? logs : []);
      setSettings(cfg);
      if (cfg) setSettingsForm({
        logo_url: cfg.logo_url || '',
        primary_color: cfg.primary_color || '#6366f1',
        currency: cfg.currency || 'USD',
        locale: cfg.locale || 'zh-CN',
      });
      setAiConfigs(Array.isArray(aiCfgs) ? aiCfgs : []);
      if (aiCat && typeof aiCat === 'object') setAiCatalog(aiCat);
    }).finally(() => setLoading(false));
  }, []);

  // ── Staff ───────────────────────────────────────────────────────────────────
  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await api.post('/api/hr/staff', inviteForm);
      const dept = departments.find(d => d.id === inviteForm.department_id);
      const pos = positions.find(p => p.id === inviteForm.position_id);
      setStaff(prev => [...prev, {
        ...inviteForm,
        user_id: res.user_id,
        employee_id: res.employee_id,
        employee_number: res.employee_number,
        department_name: dept?.name || null,
        position_name: pos?.name || null,
        plain_password: inviteForm.password || DEFAULT_PASSWORD,
        is_active: true,
        is_admin: false,
        user_created_at: new Date().toISOString(),
      }]);
      setShowInvite(false);
      setInviteForm(EMPTY_INVITE);
    } catch (err: any) { alert(err.message || t('createFailed')); }
    finally { setInviting(false); }
  }

  async function toggleAdmin(userId: string, currentVal: boolean) {
    try {
      await api.patch(`/api/admin/users/${userId}/promote?is_admin=${!currentVal}`, {});
      setStaff(prev => prev.map(s => s.user_id === userId ? { ...s, is_admin: !currentVal } : s));
    } catch (err: any) { alert(err.message); }
  }

  async function resetPassword(userId: string) {
    setResettingPwd(true);
    try {
      const res = await api.patch(`/api/admin/users/${userId}/reset-password`, { new_password: resetPwdValue || DEFAULT_PASSWORD });
      const newPwd = res.plain_password || resetPwdValue || DEFAULT_PASSWORD;
      setStaff(prev => prev.map(s => s.user_id === userId ? { ...s, plain_password: newPwd } : s));
      setResetPwdUserId(null);
      setResetPwdValue(DEFAULT_PASSWORD);
    } catch (err: any) { alert(err.message || t('resetFailed')); }
    finally { setResettingPwd(false); }
  }

  async function saveStaffEdit(userId: string) {
    try {
      await api.patch(`/api/hr/staff/${userId}`, editingStaffPatch);
      const dept = departments.find(d => d.id === editingStaffPatch.department_id);
      const pos = positions.find(p => p.id === editingStaffPatch.position_id);
      setStaff(prev => prev.map(s => s.user_id === userId ? {
        ...s,
        ...editingStaffPatch,
        department_name: dept?.name ?? s.department_name,
        position_name: pos?.name ?? s.position_name,
      } : s));
      setEditingStaffId(null);
      setEditingStaffPatch({});
    } catch (err: any) { alert(err.message); }
  }

  // ── Positions ──────────────────────────────────────────────────────────────
  async function addPosition(e: React.FormEvent) {
    e.preventDefault();
    try {
      const pos = await api.post('/api/admin/positions', posForm);
      setPositions(prev => [...prev, { ...posForm, id: pos.id, is_builtin: false, sort_order: 99 }]);
      setShowAddPos(false);
      setPosForm({ name: '', description: '' });
    } catch (err: any) { alert(err.message); }
  }

  async function savePosition(pos: any) {
    try {
      await api.patch(`/api/admin/positions/${pos.id}`, { name: pos.name, description: pos.description });
      setPositions(prev => prev.map(p => p.id === pos.id ? pos : p));
      setEditingPos(null);
    } catch (err: any) { alert(err.message); }
  }

  async function deletePosition(posId: string) {
    if (!confirm(t('confirmDeletePos'))) return;
    try {
      await api.delete(`/api/admin/positions/${posId}`);
      setPositions(prev => prev.filter(p => p.id !== posId));
    } catch (err: any) { alert(err.message); }
  }

  // ── Permissions ────────────────────────────────────────────────────────────
  const targets = permTarget === 'position' ? positions : departments;

  function getPerm(app: string, targetId: string): string {
    return permOverrides[`${app}:${permTarget}:${targetId}`] ?? 'view';
  }

  function setPerm(app: string, targetId: string, value: string) {
    setPermOverrides(prev => ({ ...prev, [`${app}:${permTarget}:${targetId}`]: value }));
  }

  async function savePermissions() {
    setSavingPerms(true);
    try {
      const permsToSave: any[] = [];
      for (const tgt of targets) {
        for (const a of APPS) {
          const v = permOverrides[`${a.key}:${permTarget}:${tgt.id}`];
          if (v) permsToSave.push({ app: a.key, target_type: permTarget, target_id: tgt.id, permission: v });
        }
      }
      await api.patch('/api/admin/app-permissions', { permissions: permsToSave });
      alert(t('permSaved'));
    } catch (err: any) { alert(err.message); }
    finally { setSavingPerms(false); }
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  async function sendNotification(e: React.FormEvent) {
    e.preventDefault();
    setSendingNotif(true);
    setNotifSent(null);
    try {
      const payload: any = {
        title: notifForm.title,
        body: notifForm.body || undefined,
        type: notifForm.type,
        link: notifForm.link || undefined,
        user_ids: notifForm.target === 'select' && notifForm.selectedUserIds.length
          ? notifForm.selectedUserIds : undefined,
      };
      const res = await api.post('/api/notifications/send', payload);
      setNotifSent(res.sent);
      setNotifForm({ title: '', body: '', type: 'system', link: '', target: 'all', selectedUserIds: [] });
    } catch (err: any) { alert(err.message); }
    finally { setSendingNotif(false); }
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.patch('/api/admin/settings', settingsForm);
      alert(t('settingsSaved'));
    } catch (err: any) { alert(err.message); }
    finally { setSavingSettings(false); }
  }

  // ── AI Provider CRUD ─────────────────────────────────────────────────────
  const configuredProviders = new Set(aiConfigs.map((c: any) => c.provider));
  const availableProviders = Object.entries(aiCatalog).filter(([k]) => !configuredProviders.has(k));
  const usProviders = availableProviders.filter(([, v]) => (v as any).region === 'US');
  const cnProviders = availableProviders.filter(([, v]) => (v as any).region === 'CN');

  async function addAIProvider(e: React.FormEvent) {
    e.preventDefault();
    setSavingAI(true);
    try {
      const res = await api.post('/api/admin/ai-providers', aiForm);
      // Reload configs
      const cfgs = await api.get('/api/admin/ai-providers').catch(() => []);
      setAiConfigs(Array.isArray(cfgs) ? cfgs : []);
      setShowAddAI(false);
      setAiForm({ provider: '', api_key: '', base_url: '', default_model: '', is_default: false });
    } catch (err: any) { alert(err.message || 'Failed to add provider'); }
    finally { setSavingAI(false); }
  }

  async function updateAIProvider(configId: string) {
    setSavingAI(true);
    try {
      await api.patch(`/api/admin/ai-providers/${configId}`, editAIForm);
      const cfgs = await api.get('/api/admin/ai-providers').catch(() => []);
      setAiConfigs(Array.isArray(cfgs) ? cfgs : []);
      setEditingAI(null);
    } catch (err: any) { alert(err.message || 'Failed to update'); }
    finally { setSavingAI(false); }
  }

  async function deleteAIProvider(configId: string) {
    if (!confirm(t('confirmDeleteAI'))) return;
    try {
      await api.delete(`/api/admin/ai-providers/${configId}`);
      setAiConfigs(prev => prev.filter((c: any) => c.id !== configId));
    } catch (err: any) { alert(err.message); }
  }

  async function testAIProvider(configId: string) {
    setTestingAI(configId);
    setTestResult(prev => ({ ...prev, [configId]: { success: false, message: '...' } }));
    try {
      const res = await api.post(`/api/admin/ai-providers/${configId}/test`, {});
      setTestResult(prev => ({
        ...prev,
        [configId]: { success: res.success, message: res.success ? 'OK' : (res.error || 'Failed') },
      }));
    } catch (err: any) {
      setTestResult(prev => ({ ...prev, [configId]: { success: false, message: err.message || 'Error' } }));
    } finally { setTestingAI(null); }
  }

  async function setDefaultAI(configId: string) {
    try {
      await api.patch(`/api/admin/ai-providers/${configId}`, { is_default: true });
      const cfgs = await api.get('/api/admin/ai-providers').catch(() => []);
      setAiConfigs(Array.isArray(cfgs) ? cfgs : []);
    } catch (err: any) { alert(err.message); }
  }

  // ── TABS config ───────────────────────────────────────────────────────────
  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'users',         label: t('tabUsers'), icon: 'people-group' },
    { key: 'positions',     label: t('tabPositions'), icon: 'tag' },
    { key: 'permissions',   label: t('tabPermissions'), icon: 'shield-lock' },
    { key: 'notifications', label: t('tabNotifications'), icon: 'loudspeaker' },
    { key: 'audit',         label: t('tabAudit'), icon: 'clipboard' },
    { key: 'ai-providers',  label: t('tabAI'),  icon: 'brain' },
    { key: 'settings',      label: t('tabSettings'), icon: 'gear' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: '#9B9A97' }}>
      <svg className="animate-spin mr-2" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      {t('loading')}
    </div>
  );

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--notion-bg)' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-base font-bold"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
              <HandIcon name="gear" size={18} style={{ color: 'white' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--notion-text)' }}>{t('adminConsole')}</h1>
              <p className="text-xs" style={{ color: '#9B9A97' }}>{(t('staffCount') as any)(settings?.name || '', staff.length)}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'users' && (
            <button onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ background: '#7c3aed' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('newStaff')}
            </button>
          )}
          {tab === 'positions' && (
            <button onClick={() => setShowAddPos(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ background: '#7c3aed' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('newPosition')}
            </button>
          )}
          {tab === 'permissions' && (
            <button onClick={savePermissions} disabled={savingPerms}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#7c3aed' }}>
              {savingPerms ? t('savingPerms') : <><HandIcon name="document-pen" size={14} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />{t('savePermissions')}</>}
            </button>
          )}
          {tab === 'ai-providers' && availableProviders.length > 0 && (
            <button onClick={() => setShowAddAI(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ background: '#7c3aed' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('addProvider')}
            </button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex-shrink-0 flex items-center gap-1 px-8 pt-4 pb-0"
        style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all relative"
            style={{
              color: tab === tb.key ? '#7c3aed' : '#9B9A97',
              borderBottom: tab === tb.key ? '2px solid #7c3aed' : '2px solid transparent',
            }}>
            <HandIcon name={tb.icon} size={14} />
            <span>{tb.label}</span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-8">

        {/* ── People (merged staff) Tab ── */}
        {tab === 'users' && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
                    {[t('thName'), t('thEmail'), t('thPassword'), t('thDept'), t('thPosition'), t('thEmpType'), t('thRole'), t('thAdmin'), t('thStatus'), t('thActions')].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => {
                    const roleColor = ROLE_COLORS[s.role] ?? { bg: '#f3f4f6', color: '#6b7280' };
                    const isEditing = editingStaffId === s.user_id;
                    const patch = isEditing ? editingStaffPatch : {};
                    return (
                      <tr key={s.user_id} style={{ borderBottom: '1px solid var(--notion-border)' }}
                        onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                        onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = 'white'; }}>

                        {/* Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                              style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
                              {(s.full_name?.[0] || s.email?.[0] || 'U').toUpperCase()}
                            </div>
                            {isEditing ? (
                              <input
                                value={patch.full_name ?? s.full_name ?? ''}
                                onChange={e => setEditingStaffPatch((p: any) => ({ ...p, full_name: e.target.value }))}
                                className="text-sm px-2 py-1 rounded-lg outline-none w-28"
                                style={{ border: '1px solid #7c3aed' }}
                              />
                            ) : (
                              <span className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{s.full_name || '—'}</span>
                            )}
                            {s.employee_number && (
                              <span className="text-[10px] font-mono flex-shrink-0" style={{ color: '#9B9A97' }}>{s.employee_number}</span>
                            )}
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3 text-sm max-w-[160px] truncate" style={{ color: '#5F5E5B' }}>{s.email}</td>

                        {/* Password */}
                        <td className="px-4 py-3">
                          {resetPwdUserId === s.user_id ? (
                            <div className="flex items-center gap-1">
                              <input
                                value={resetPwdValue}
                                onChange={e => setResetPwdValue(e.target.value)}
                                placeholder={DEFAULT_PASSWORD}
                                className="text-xs px-2 py-1 rounded-lg outline-none w-24"
                                style={{ border: '1px solid #7c3aed', color: 'var(--notion-text)' }}
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') resetPassword(s.user_id); if (e.key === 'Escape') { setResetPwdUserId(null); setResetPwdValue(DEFAULT_PASSWORD); } }}
                              />
                              <button onClick={() => resetPassword(s.user_id)} disabled={resettingPwd}
                                className="text-xs px-2 py-1 rounded-lg font-medium text-white disabled:opacity-50" style={{ background: '#7c3aed' }}>
                                {resettingPwd ? '...' : t('confirm')}
                              </button>
                              <button onClick={() => { setResetPwdUserId(null); setResetPwdValue(DEFAULT_PASSWORD); }}
                                className="text-xs px-1.5 py-1 rounded-lg" style={{ color: '#9B9A97' }}><HandIcon name="cross-mark" size={10} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono" style={{ color: '#5F5E5B', letterSpacing: pwdVisible.has(s.user_id) ? 0 : 2 }}>
                                {pwdVisible.has(s.user_id) ? (s.plain_password || '—') : '••••••'}
                              </span>
                              <button
                                onClick={() => setPwdVisible(prev => { const n = new Set(prev); n.has(s.user_id) ? n.delete(s.user_id) : n.add(s.user_id); return n; })}
                                className="text-xs px-1 py-0.5 rounded"
                                style={{ color: '#9B9A97' }}
                                title={pwdVisible.has(s.user_id) ? t('hidePwdTooltip') : t('viewPwdTooltip')}>
                                <HandIcon name={pwdVisible.has(s.user_id) ? 'cross-mark' : 'eye'} size={12} />
                              </button>
                              <button
                                onClick={() => { setResetPwdUserId(s.user_id); setResetPwdValue(DEFAULT_PASSWORD); }}
                                className="text-xs px-1.5 py-0.5 rounded transition-colors"
                                style={{ color: '#7c3aed' }}
                                title={t('resetPwdTooltip')}
                                onMouseEnter={e => { e.currentTarget.style.background = '#ede9fe'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                {t('resetPwd')}
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Department */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select
                              value={patch.department_id ?? s.department_id ?? ''}
                              onChange={e => setEditingStaffPatch((p: any) => ({ ...p, department_id: e.target.value }))}
                              className="text-xs px-2 py-1 rounded-lg outline-none bg-white w-28"
                              style={{ border: '1px solid var(--notion-border)' }}>
                              <option value="">{t('noDept')}</option>
                              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs" style={{ color: s.department_name ? 'var(--notion-text)' : '#9B9A97' }}>
                              {s.department_name || '—'}
                            </span>
                          )}
                        </td>

                        {/* Position */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select
                              value={patch.position_id ?? s.position_id ?? ''}
                              onChange={e => setEditingStaffPatch((p: any) => ({ ...p, position_id: e.target.value }))}
                              className="text-xs px-2 py-1 rounded-lg outline-none bg-white w-28"
                              style={{ border: '1px solid var(--notion-border)' }}>
                              <option value="">{t('noPosition')}</option>
                              {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs" style={{ color: s.position_name ? 'var(--notion-text)' : '#9B9A97' }}>
                              {s.position_name || '—'}
                            </span>
                          )}
                        </td>

                        {/* Employment type */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select
                              value={patch.employment_type ?? s.employment_type ?? 'full_time'}
                              onChange={e => setEditingStaffPatch((p: any) => ({ ...p, employment_type: e.target.value }))}
                              className="text-xs px-2 py-1 rounded-lg outline-none bg-white"
                              style={{ border: '1px solid var(--notion-border)' }}>
                              {Object.entries(EMP_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs" style={{ color: '#5F5E5B' }}>
                              {EMP_TYPE_LABELS[s.employment_type] || s.employment_type || '—'}
                            </span>
                          )}
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select
                              value={patch.role ?? s.role ?? 'tenant_user'}
                              onChange={e => setEditingStaffPatch((p: any) => ({ ...p, role: e.target.value }))}
                              className="text-xs px-2 py-1 rounded-lg outline-none bg-white"
                              style={{ border: '1px solid var(--notion-border)' }}>
                              <option value="tenant_user">{t('roleUser')}</option>
                              <option value="manager">{t('roleManager')}</option>
                              <option value="tenant_admin">{t('roleSuperAdmin')}</option>
                            </select>
                          ) : (
                            <Badge text={ROLE_LABELS[s.role] ?? s.role} bg={roleColor.bg} color={roleColor.color} />
                          )}
                        </td>

                        {/* Admin */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleAdmin(s.user_id, !!s.is_admin)}
                            className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 font-medium transition-all"
                            style={{
                              background: s.is_admin ? '#ede9fe' : '#f3f4f6',
                              color: s.is_admin ? '#7c3aed' : '#9B9A97',
                            }}
                            disabled={s.role === 'tenant_admin'}
                            title={s.role === 'tenant_admin' ? t('adminInherent') : ''}
                          >
                            {s.is_admin ? <span className="inline-flex items-center gap-1"><HandIcon name="checkmark" size={12} />{t('authorized')}</span> : t('grant')}
                          </button>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select
                              value={patch.is_active !== undefined ? String(patch.is_active) : String(s.is_active ?? true)}
                              onChange={e => setEditingStaffPatch((p: any) => ({ ...p, is_active: e.target.value === 'true' }))}
                              className="text-xs px-2 py-1 rounded-lg outline-none bg-white"
                              style={{ border: '1px solid var(--notion-border)' }}>
                              <option value="true">{t('statusOnJob')}</option>
                              <option value="false">{t('statusDisabled')}</option>
                            </select>
                          ) : (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{ background: s.is_active ? '#dcfce7' : '#fee2e2', color: s.is_active ? '#15803d' : '#dc2626' }}>
                              {s.is_active ? t('statusOnJob') : t('statusDisabled')}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => saveStaffEdit(s.user_id)}
                                className="text-xs px-2.5 py-1 rounded-lg font-medium text-white" style={{ background: '#7c3aed' }}>{t('saveBtn')}</button>
                              <button onClick={() => { setEditingStaffId(null); setEditingStaffPatch({}); }}
                                className="text-xs px-2.5 py-1 rounded-lg" style={{ color: '#9B9A97' }}>{t('cancelBtn')}</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingStaffId(s.user_id); setEditingStaffPatch({}); }}
                              className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                              style={{ color: '#9B9A97' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}>
                              {t('editBtn')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {staff.length === 0 && (
              <div className="py-16 text-center text-sm" style={{ color: '#9B9A97' }}>{t('noStaff')}</div>
            )}
          </div>
        )}

        {/* ── Positions Tab ── */}
        {tab === 'positions' && (
          <div className="max-w-2xl">
            <p className="text-sm mb-4" style={{ color: '#9B9A97' }}>
              {t('positionsDesc')}
            </p>
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
              {positions.map((pos, i) => (
                <div key={pos.id}
                  style={{ borderBottom: i < positions.length - 1 ? '1px solid var(--notion-border)' : 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  {editingPos?.id === pos.id ? (
                    <div className="flex items-center gap-3 px-5 py-3">
                      <input
                        value={editingPos.name}
                        onChange={e => setEditingPos({ ...editingPos, name: e.target.value })}
                        className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none"
                        style={{ border: '1px solid #7c3aed', color: 'var(--notion-text)' }}
                        autoFocus
                      />
                      <input
                        value={editingPos.description || ''}
                        onChange={e => setEditingPos({ ...editingPos, description: e.target.value })}
                        placeholder={t('descOptional')}
                        className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none"
                        style={{ border: '1px solid var(--notion-border)', color: '#9B9A97' }}
                      />
                      <button onClick={() => savePosition(editingPos)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ background: '#7c3aed' }}>{t('saveBtn')}</button>
                      <button onClick={() => setEditingPos(null)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ color: '#9B9A97' }}>{t('cancelBtn')}</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                        style={{ background: '#ede9fe', color: '#7c3aed' }}>
                        <HandIcon name="tag" size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{pos.name}</span>
                        {pos.description && <p className="text-xs mt-0.5" style={{ color: '#9B9A97' }}>{pos.description}</p>}
                      </div>
                      <div className="flex items-center gap-1" style={{ opacity: 1 }}>
                        <button onClick={() => setEditingPos({ ...pos })}
                          className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                          style={{ color: '#9B9A97' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9A97'; }}>
                          {t('editBtn')}
                        </button>
                        <button onClick={() => deletePosition(pos.id)}
                          className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                          style={{ color: '#EB5757' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FFEAEA'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                          {t('deleteBtn')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {positions.length === 0 && (
                <div className="py-16 text-center text-sm" style={{ color: '#9B9A97' }}>{t('noPositions')}</div>
              )}
            </div>
          </div>
        )}

        {/* ── Permissions Tab ── */}
        {tab === 'permissions' && (
          <div>
            {/* Target type switcher */}
            <div className="flex items-center gap-4 mb-6">
              <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{t('permDimensionLabel')}</p>
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--notion-active)' }}>
                {(['position', 'department'] as const).map(pt => (
                  <button key={pt} onClick={() => setPermTarget(pt)}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: permTarget === pt ? 'white' : 'transparent',
                      color: permTarget === pt ? 'var(--notion-text)' : '#9B9A97',
                      boxShadow: permTarget === pt ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    }}>
                    <span className="inline-flex items-center gap-1"><HandIcon name={pt === 'position' ? 'tag' : 'building'} size={13} />{pt === 'position' ? t('byPosition') : t('byDepartment')}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs mb-3" style={{ color: '#9B9A97' }}>
              {t('permPriorityNote')}
            </div>

            {targets.length === 0 ? (
              <div className="py-16 text-center rounded-2xl" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                <p className="text-sm" style={{ color: '#9B9A97' }}>
                  {permTarget === 'position' ? t('noPositionsForPerm') : t('noDeptForPerm')}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
                        <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: '#9B9A97', minWidth: 140 }}>
                          {permTarget === 'position' ? t('colPositionOrDept') : t('colDepartmentOrDept')}
                        </th>
                        {APPS.map(a => (
                          <th key={a.key} className="text-center px-3 py-3 text-[11px] font-semibold uppercase tracking-wider"
                            style={{ color: '#9B9A97', minWidth: 100 }}>
                            <span className="inline-flex items-center justify-center gap-1"><HandIcon name={a.icon} size={13} />{a.label}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((target, i) => (
                        <tr key={target.id}
                          style={{ borderBottom: i < targets.length - 1 ? '1px solid var(--notion-border)' : 'none' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                          <td className="px-5 py-3">
                            <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{target.name}</span>
                          </td>
                          {APPS.map(a => (
                            <td key={a.key} className="px-3 py-3 text-center">
                              <PermCell
                                value={getPerm(a.key, target.id)}
                                onChange={v => setPerm(a.key, target.id, v)}
                                permOptions={PERM_OPTIONS}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Notifications Tab ── */}
        {tab === 'notifications' && (
          <div className="max-w-xl">
            <p className="text-sm mb-5" style={{ color: '#9B9A97' }}>
              {t('notifDesc')}
            </p>

            {notifSent !== null && (
              <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl text-sm font-medium"
                style={{ background: '#dcfce7', color: '#15803d' }}>
                <HandIcon name="checkmark" size={14} />
                <span>{(t('sentSuccess') as any)(notifSent)}</span>
                <button onClick={() => setNotifSent(null)} className="ml-auto text-xs opacity-60">{t('closeBtn')}</button>
              </div>
            )}

            <form onSubmit={sendNotification} className="rounded-2xl p-6 space-y-4"
              style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#9B9A97' }}>{t('notifTitleLabel')}</label>
                <input
                  required
                  placeholder={t('notifTitlePlaceholder')}
                  value={notifForm.title}
                  onChange={e => setNotifForm({ ...notifForm, title: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#9B9A97' }}>{t('notifBodyLabel')}</label>
                <textarea
                  rows={3}
                  placeholder={t('notifBodyPlaceholder')}
                  value={notifForm.body}
                  onChange={e => setNotifForm({ ...notifForm, body: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                />
              </div>

              {/* Type + Link row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#9B9A97' }}>{t('notifTypeLabel')}</label>
                  <select
                    value={notifForm.type}
                    onChange={e => setNotifForm({ ...notifForm, type: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none bg-white"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  >
                    {NOTIF_TYPE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#9B9A97' }}>{t('notifLinkLabel')}</label>
                  <input
                    placeholder="/tenant/crm ..."
                    value={notifForm.link}
                    onChange={e => setNotifForm({ ...notifForm, link: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}
                  />
                </div>
              </div>

              {/* Target */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: '#9B9A97' }}>{t('notifTargetLabel')}</label>
                <div className="flex items-center gap-1 p-1 rounded-xl w-fit mb-3" style={{ background: 'var(--notion-active)' }}>
                  {(['all', 'select'] as const).map(nt => (
                    <button key={nt} type="button" onClick={() => setNotifForm({ ...notifForm, target: nt, selectedUserIds: [] })}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background: notifForm.target === nt ? 'white' : 'transparent',
                        color: notifForm.target === nt ? 'var(--notion-text)' : '#9B9A97',
                        boxShadow: notifForm.target === nt ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      }}>
                      <span className="inline-flex items-center gap-1"><HandIcon name={nt === 'all' ? 'globe' : 'person'} size={13} />{nt === 'all' ? t('targetAll') : t('targetSelect')}</span>
                    </button>
                  ))}
                </div>

                {notifForm.target === 'select' && (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
                    <div className="max-h-48 overflow-y-auto">
                      {staff.map(s => {
                        const checked = notifForm.selectedUserIds.includes(s.user_id);
                        return (
                          <label key={s.user_id}
                            className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                            style={{ borderBottom: '1px solid var(--notion-border)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setNotifForm(prev => ({
                                  ...prev,
                                  selectedUserIds: checked
                                    ? prev.selectedUserIds.filter(id => id !== s.user_id)
                                    : [...prev.selectedUserIds, s.user_id],
                                }));
                              }}
                              className="rounded"
                              style={{ accentColor: '#7c3aed' }}
                            />
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
                              {(s.full_name?.[0] || s.email?.[0] || 'U').toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>
                                {s.full_name || s.email}
                              </div>
                              {s.full_name && <div className="text-xs truncate" style={{ color: '#9B9A97' }}>{s.email}</div>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {notifForm.selectedUserIds.length > 0 && (
                      <div className="px-4 py-2 text-xs" style={{ background: 'var(--notion-hover)', color: '#9B9A97' }}>
                        {(t('selectedCount') as any)(notifForm.selectedUserIds.length)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={sendingNotif || !notifForm.title.trim() ||
                  (notifForm.target === 'select' && notifForm.selectedUserIds.length === 0)}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                style={{ background: '#7c3aed' }}
                onMouseEnter={e => { if (!sendingNotif) e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                {sendingNotif ? t('sending') : (
                  notifForm.target === 'all'
                    ? <span className="inline-flex items-center justify-center gap-1"><HandIcon name="bell" size={14} style={{ color: 'white' }} />{t('broadcastAll')}</span>
                    : <span className="inline-flex items-center justify-center gap-1"><HandIcon name="bell" size={14} style={{ color: 'white' }} />{(t('sendToN') as any)(notifForm.selectedUserIds.length || 0)}</span>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── Audit Tab ── */}
        {tab === 'audit' && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-hover)' }}>
                  {[t('auditTime'), t('auditUser'), t('auditAction'), t('auditResource'), t('auditIP')].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--notion-border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                    <td className="px-5 py-3 text-xs" style={{ color: '#9B9A97' }}>{new Date(log.created_at).toLocaleString('zh-CN')}</td>
                    <td className="px-5 py-3 text-sm" style={{ color: 'var(--notion-text)' }}>{log.user_email || log.user_id?.slice(0, 8) || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: '#f3f4f6', color: '#374151' }}>{log.action}</span>
                    </td>
                    <td className="px-5 py-3 text-sm" style={{ color: '#5F5E5B' }}>
                      {log.resource_type}{log.resource_id ? ` #${log.resource_id.slice(0, 8)}` : ''}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono" style={{ color: '#9B9A97' }}>{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditLogs.length === 0 && (
              <div className="py-16 text-center text-sm" style={{ color: '#9B9A97' }}>{t('noAuditLogs')}</div>
            )}
          </div>
        )}

        {/* ── AI Providers Tab ── */}
        {tab === 'ai-providers' && (
          <div className="max-w-2xl">
            <div className="mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{t('aiProviderConfig')}</h3>
              <p className="text-xs mt-1" style={{ color: '#9B9A97' }}>{t('aiProviderDesc')}</p>
            </div>

            {aiConfigs.length === 0 && (
              <div className="rounded-2xl p-8 text-center" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                <p className="text-sm" style={{ color: '#9B9A97' }}>{t('noAIProviders')}</p>
                {availableProviders.length > 0 && (
                  <button onClick={() => setShowAddAI(true)}
                    className="mt-3 px-4 py-2 rounded-xl text-sm font-medium text-white"
                    style={{ background: '#7c3aed' }}>{t('addProviderBtn')}</button>
                )}
              </div>
            )}

            <div className="space-y-3">
              {aiConfigs.map((cfg: any) => {
                const catEntry = aiCatalog[cfg.provider] || {};
                const tr = testResult[cfg.id];
                return (
                  <div key={cfg.id} className="rounded-2xl p-5" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm" style={{ color: 'var(--notion-text)' }}>
                          {cfg.label || cfg.provider}
                        </span>
                        {cfg.region && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ background: cfg.region === 'US' ? '#dbeafe' : '#fef3c7', color: cfg.region === 'US' ? '#1d4ed8' : '#92400e' }}>
                            {cfg.region}
                          </span>
                        )}
                        {cfg.is_default && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ background: '#dcfce7', color: '#15803d' }}>{t('defaultBadge')}</span>
                        )}
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{ background: cfg.is_active ? '#dcfce7' : '#f3f4f6', color: cfg.is_active ? '#15803d' : '#9B9A97' }}>
                          {cfg.is_active ? t('enabledBadge') : t('disabledBadge')}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#9B9A97' }}>
                        <span>Key:</span>
                        <span className="font-mono" style={{ color: 'var(--notion-text)' }}>{cfg.api_key_masked || '****'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#9B9A97' }}>
                        <span>Model:</span>
                        <span className="font-mono" style={{ color: 'var(--notion-text)' }}>{cfg.default_model || '-'}</span>
                      </div>
                      {cfg.base_url && (
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#9B9A97' }}>
                          <span>URL:</span>
                          <span className="font-mono text-[11px]" style={{ color: 'var(--notion-text)' }}>{cfg.base_url}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--notion-border)' }}>
                      <button onClick={() => testAIProvider(cfg.id)} disabled={testingAI === cfg.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                        {testingAI === cfg.id ? t('testing') : t('testConnection')}
                      </button>
                      {!cfg.is_default && (
                        <button onClick={() => setDefaultAI(cfg.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ border: '1px solid var(--notion-border)', color: '#7c3aed' }}>
                          {t('setDefault')}
                        </button>
                      )}
                      <button onClick={() => {
                        setEditingAI(cfg);
                        setEditAIForm({
                          api_key: '',
                          base_url: cfg.base_url || '',
                          default_model: cfg.default_model || '',
                          is_default: cfg.is_default,
                          is_active: cfg.is_active,
                        });
                      }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                        {t('editBtn')}
                      </button>
                      <button onClick={() => deleteAIProvider(cfg.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ border: '1px solid var(--notion-border)', color: '#ef4444' }}>
                        {t('deleteBtn')}
                      </button>
                      {tr && (
                        <span className="ml-auto text-xs font-medium" style={{ color: tr.success ? '#15803d' : '#ef4444' }}>
                          {tr.success ? t('connectionSuccess') : tr.message}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {tab === 'settings' && (
          <div className="max-w-xl">
            <div className="rounded-2xl p-6" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--notion-text)' }}>{t('tenantInfo')}</h3>
              {settings && (
                <div className="space-y-2 mb-5 pb-5" style={{ borderBottom: '1px solid var(--notion-border)' }}>
                  {[
                    { label: t('tenantName'), value: settings.name },
                    { label: t('slugLabel'), value: settings.slug },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between text-sm">
                      <span style={{ color: '#9B9A97' }}>{row.label}</span>
                      <span className="font-medium font-mono" style={{ color: 'var(--notion-text)' }}>{row.value}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    {[
                      { label: t('crm'), enabled: settings.crm_enabled },
                      { label: t('hr'), enabled: settings.hr_enabled },
                      { label: t('finance'), enabled: settings.accounting_enabled },
                      { label: t('inventory'), enabled: settings.inventory_enabled },
                    ].map(m => (
                      <div key={m.label} className="flex items-center justify-between px-3 py-2 rounded-xl"
                        style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)' }}>
                        <span className="text-xs" style={{ color: '#9B9A97' }}>{m.label}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{ background: m.enabled ? '#dcfce7' : '#f3f4f6', color: m.enabled ? '#15803d' : '#9B9A97' }}>
                          {m.enabled ? t('enabled') : t('disabled')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={saveSettings} className="space-y-4">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{t('appearanceLocale')}</h3>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{t('logoUrl')}</label>
                  <input placeholder="https://..." value={settingsForm.logo_url}
                    onChange={e => setSettingsForm({ ...settingsForm, logo_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{t('themeColor')}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={settingsForm.primary_color}
                      onChange={e => setSettingsForm({ ...settingsForm, primary_color: e.target.value })}
                      className="w-10 h-10 rounded-xl border-0 cursor-pointer"
                      style={{ border: '1px solid var(--notion-border)' }} />
                    <input value={settingsForm.primary_color}
                      onChange={e => setSettingsForm({ ...settingsForm, primary_color: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl text-sm font-mono outline-none"
                      style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{t('currency')}</label>
                    <select value={settingsForm.currency}
                      onChange={e => setSettingsForm({ ...settingsForm, currency: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)', color: 'var(--notion-text)' }}>
                      {['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW', 'CAD', 'AUD'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{t('language')}</label>
                    <select value={settingsForm.locale}
                      onChange={e => setSettingsForm({ ...settingsForm, locale: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)', color: 'var(--notion-text)' }}>
                      {[['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en-US', 'English (US)'],
                        ['ja-JP', '日本語'], ['ko-KR', '한국어'], ['de-DE', 'Deutsch'], ['fr-FR', 'Français']].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={savingSettings}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: '#7c3aed' }}>
                  {savingSettings ? t('savingBtn') : t('saveSettings')}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ── Create Staff Modal ── */}
      {showInvite && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--notion-text)' }}>{t('createStaffTitle')}</h3>
            <form onSubmit={createStaff} className="space-y-3">

              {/* Basic account fields */}
              <div className="pb-3 mb-1" style={{ borderBottom: '1px solid var(--notion-border)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#9B9A97' }}>{t('accountInfo')}</p>
                <div className="space-y-2">
                  <input required placeholder={t('nameReq')} value={inviteForm.full_name}
                    onChange={e => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)' }} />
                  <input required type="email" placeholder={t('emailReq')} value={inviteForm.email}
                    onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)' }} />
                  <input required type="password" placeholder={t('passwordReq')} value={inviteForm.password}
                    onChange={e => setInviteForm({ ...inviteForm, password: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)' }} />
                  <select value={inviteForm.role}
                    onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none bg-white"
                    style={{ border: '1px solid var(--notion-border)' }}>
                    <option value="tenant_user">{t('roleUser')}</option>
                    <option value="manager">{t('roleManager')}</option>
                    <option value="tenant_admin">{t('roleSuperAdmin')}</option>
                  </select>
                </div>
              </div>

              {/* HR fields */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#9B9A97' }}>{t('hrInfoOptional')}</p>
                <div className="space-y-2">
                  <input placeholder={t('phonePlaceholder')} value={inviteForm.phone}
                    onChange={e => setInviteForm({ ...inviteForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)' }} />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={inviteForm.department_id}
                      onChange={e => setInviteForm({ ...inviteForm, department_id: e.target.value })}
                      className="px-3 py-2 rounded-xl text-sm outline-none bg-white"
                      style={{ border: '1px solid var(--notion-border)' }}>
                      <option value="">{t('deptSelect')}</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select value={inviteForm.position_id}
                      onChange={e => setInviteForm({ ...inviteForm, position_id: e.target.value })}
                      className="px-3 py-2 rounded-xl text-sm outline-none bg-white"
                      style={{ border: '1px solid var(--notion-border)' }}>
                      <option value="">{t('posSelect')}</option>
                      {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <input placeholder={t('titlePlaceholder')} value={inviteForm.title}
                    onChange={e => setInviteForm({ ...inviteForm, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ border: '1px solid var(--notion-border)' }} />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={inviteForm.employment_type}
                      onChange={e => setInviteForm({ ...inviteForm, employment_type: e.target.value })}
                      className="px-3 py-2 rounded-xl text-sm outline-none bg-white"
                      style={{ border: '1px solid var(--notion-border)' }}>
                      <option value="full_time">{t('empTypeFullTime')}</option>
                      <option value="part_time">{t('empTypePartTime')}</option>
                      <option value="contract">{t('empTypeContract')}</option>
                      <option value="intern">{t('empTypeIntern')}</option>
                    </select>
                    <input type="date" placeholder={t('startDatePlaceholder')} value={inviteForm.start_date}
                      onChange={e => setInviteForm({ ...inviteForm, start_date: e.target.value })}
                      className="px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ border: '1px solid var(--notion-border)' }} />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowInvite(false); setInviteForm(EMPTY_INVITE); }}
                  className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--notion-border)' }}>{t('cancelBtn')}</button>
                <button type="submit" disabled={inviting}
                  className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: '#7c3aed' }}>
                  {inviting ? t('creatingStaff') : t('createStaff')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Position Modal ── */}
      {showAddPos && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--notion-text)' }}>{t('newPosition')}</h3>
            <form onSubmit={addPosition} className="space-y-3">
              <input required placeholder={t('posNameReq')} value={posForm.name}
                onChange={e => setPosForm({ ...posForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)' }} />
              <input placeholder={t('posDescOptional')} value={posForm.description}
                onChange={e => setPosForm({ ...posForm, description: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ border: '1px solid var(--notion-border)' }} />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAddPos(false)}
                  className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--notion-border)' }}>{t('cancelBtn')}</button>
                <button type="submit"
                  className="flex-1 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: '#7c3aed' }}>{t('posCreateBtn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add AI Provider Modal ── */}
      {showAddAI && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--notion-text)' }}>{t('addAITitle')}</h3>
            <form onSubmit={addAIProvider} className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>Provider *</label>
                {usProviders.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#9B9A97' }}>US</p>
                    <div className="flex flex-wrap gap-2">
                      {usProviders.map(([key, val]: [string, any]) => (
                        <button key={key} type="button"
                          onClick={() => {
                            setAiForm({ ...aiForm, provider: key, base_url: val.base_url || '', default_model: val.models?.[0] || '' });
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{
                            border: aiForm.provider === key ? '2px solid #7c3aed' : '1px solid var(--notion-border)',
                            color: aiForm.provider === key ? '#7c3aed' : 'var(--notion-text)',
                            background: aiForm.provider === key ? '#ede9fe' : 'white',
                          }}>
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {cnProviders.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#9B9A97' }}>CN</p>
                    <div className="flex flex-wrap gap-2">
                      {cnProviders.map(([key, val]: [string, any]) => (
                        <button key={key} type="button"
                          onClick={() => {
                            setAiForm({ ...aiForm, provider: key, base_url: val.base_url || '', default_model: val.models?.[0] || '' });
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{
                            border: aiForm.provider === key ? '2px solid #7c3aed' : '1px solid var(--notion-border)',
                            color: aiForm.provider === key ? '#7c3aed' : 'var(--notion-text)',
                            background: aiForm.provider === key ? '#ede9fe' : 'white',
                          }}>
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {aiForm.provider && aiCatalog[aiForm.provider] && (
                <>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>API Key *</label>
                    <input required type="password" placeholder={aiCatalog[aiForm.provider]?.key_placeholder || 'API Key'}
                      value={aiForm.api_key}
                      onChange={e => setAiForm({ ...aiForm, api_key: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm font-mono outline-none"
                      style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>Model</label>
                    <select value={aiForm.default_model}
                      onChange={e => setAiForm({ ...aiForm, default_model: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none bg-white"
                      style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                      {(aiCatalog[aiForm.provider]?.models || []).map((m: string) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{t('baseUrlOptional')}</label>
                    <input placeholder={aiCatalog[aiForm.provider]?.base_url || 'https://...'}
                      value={aiForm.base_url}
                      onChange={e => setAiForm({ ...aiForm, base_url: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm font-mono outline-none"
                      style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
                  </div>
                  <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--notion-text)' }}>
                    <input type="checkbox" checked={aiForm.is_default}
                      onChange={e => setAiForm({ ...aiForm, is_default: e.target.checked })} />
                    {t('setDefaultProvider')}
                  </label>
                </>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowAddAI(false); setAiForm({ provider: '', api_key: '', base_url: '', default_model: '', is_default: false }); }}
                  className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--notion-border)' }}>{t('cancelBtn')}</button>
                <button type="submit" disabled={savingAI || !aiForm.provider || !aiForm.api_key}
                  className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: '#7c3aed' }}>
                  {savingAI ? t('savingBtn') : t('addBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit AI Provider Modal ── */}
      {editingAI && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--notion-text)' }}>{(t('editAITitle') as any)(editingAI.label || editingAI.provider)}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>{t('apiKeyKeep')}</label>
                <input type="password" placeholder={t('apiKeyKeepPlaceholder')}
                  value={editAIForm.api_key}
                  onChange={e => setEditAIForm({ ...editAIForm, api_key: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>Model</label>
                <select value={editAIForm.default_model}
                  onChange={e => setEditAIForm({ ...editAIForm, default_model: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none bg-white"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
                  {(aiCatalog[editingAI.provider]?.models || []).map((m: string) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#9B9A97' }}>Base URL</label>
                <input placeholder="https://..."
                  value={editAIForm.base_url}
                  onChange={e => setEditAIForm({ ...editAIForm, base_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
              </div>
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--notion-text)' }}>
                <input type="checkbox" checked={editAIForm.is_default}
                  onChange={e => setEditAIForm({ ...editAIForm, is_default: e.target.checked })} />
                {t('setDefault')}
              </label>
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--notion-text)' }}>
                <input type="checkbox" checked={editAIForm.is_active}
                  onChange={e => setEditAIForm({ ...editAIForm, is_active: e.target.checked })} />
                {t('enableProvider')}
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditingAI(null)}
                  className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--notion-border)' }}>{t('cancelBtn')}</button>
                <button type="button" onClick={() => updateAIProvider(editingAI.id)} disabled={savingAI}
                  className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: '#7c3aed' }}>
                  {savingAI ? t('savingBtn') : t('saveBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
