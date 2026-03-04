'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { HandIcon } from '@/components/ui/HandIcon';
import { UserAvatar } from '@/components/ui/UserAvatar';

type Permission = 'full_access' | 'edit' | 'comment' | 'view' | 'none';

const PERMISSION_ICONS: Record<Permission, string> = {
  full_access: 'lock-open',
  edit: 'pencil',
  comment: 'chat-bubble',
  view: 'eye',
  none: 'no-entry',
};

interface PermissionsData {
  workspace_id?: string;
  default_permission: Permission;
  overrides: Record<string, Permission>;
}

interface Member {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  role?: string;
}

interface Workspace {
  id: string;
  name: string;
  icon?: string;
}

interface SharePanelProps {
  pageId: string;
  pageTitle?: string;
  onClose: () => void;
}

function PermissionSelect({ value, onChange, t }: { value: Permission; onChange: (p: Permission) => void; t: any }) {
  const [open, setOpen] = useState(false);

  const permLabels: Record<Permission, { label: string; desc: string }> = {
    full_access: { label: t('permFullAccess'), desc: t('permFullAccessDesc') },
    edit:        { label: t('permEdit'),       desc: t('permEditDesc') },
    comment:     { label: t('permComment'),    desc: t('permCommentDesc') },
    view:        { label: t('permView'),       desc: t('permViewDesc') },
    none:        { label: t('permNone'),       desc: t('permNoneDesc') },
  };

  const icon = PERMISSION_ICONS[value];
  const currentLabel = permLabels[value];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors"
        style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-card-elevated, var(--notion-card, white))' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--notion-card-elevated, var(--notion-card, white))'}
      >
        <HandIcon name={icon} size={16} />
        <span>{currentLabel.label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[149]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-[150] rounded-xl overflow-hidden"
            style={{ width: 220, background: 'var(--notion-card-elevated, var(--notion-card, white))', border: '1px solid var(--notion-border)', boxShadow: '0 6px 16px rgba(0,0,0,0.10)' }}>
            {(Object.keys(permLabels) as Permission[]).map(p => {
              const c = permLabels[p];
              const ic = PERMISSION_ICONS[p];
              return (
                <button key={p}
                  onClick={() => { onChange(p); setOpen(false); }}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors"
                  style={{ background: value === p ? 'var(--notion-active)' : 'transparent' }}
                  onMouseEnter={e => { if (value !== p) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { if (value !== p) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="flex-shrink-0 mt-0.5"><HandIcon name={ic} size={16} /></span>
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{c.label}</p>
                    <p className="text-[11px]" style={{ color: 'var(--notion-text-muted)' }}>{c.desc}</p>
                  </div>
                  {value === p && (
                    <span className="ml-auto mt-1 text-xs" style={{ color: '#74819e' }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MemberAvatar({ member }: { member: Member }) {
  return <UserAvatar userId={member.id} name={member.full_name || member.email} avatarUrl={member.avatar_url} size={28} />;
}

export default function SharePanel({ pageId, pageTitle, onClose }: SharePanelProps) {
  const t = useTranslations('workspace');
  const [permissions, setPermissions] = useState<PermissionsData>({
    default_permission: 'view',
    overrides: {},
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [savedWorkspaceId, setSavedWorkspaceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [copied, setCopied] = useState(false);
  const readyToAutoSaveRef = useRef(false);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';

  useEffect(() => {
    async function load() {
      readyToAutoSaveRef.current = false;
      setLoading(true);
      try {
        let workspaceFromPermissions = '';

        // Load sharing config
        try {
          const data = await api.get(`/api/workspace/pages/${pageId}/sharing`);
          if (data?.permissions) {
            setPermissions(data.permissions);
            if (data.permissions.workspace_id) {
              workspaceFromPermissions = data.permissions.workspace_id;
            }
          }
          if (data?.members) setMembers(data.members);
        } catch {}

        // Load all users
        try {
          const usersData = await api.get('/api/admin/users-lite');
          if (Array.isArray(usersData?.users)) setMembers(usersData.users);
          else if (Array.isArray(usersData)) setMembers(usersData);
        } catch {}

        // Load workspaces from sidebar
        try {
          const treeData = await api.get('/api/workspace/sidebar/tree');
          if (Array.isArray(treeData)) {
            const workspaceList = treeData.map((ws: any) => ({ id: ws.id, name: ws.name, icon: ws.icon }));
            setWorkspaces(workspaceList);
            const defaultWorkspaceId = workspaceFromPermissions || workspaceList[0]?.id || '';
            setSelectedWorkspaceId(defaultWorkspaceId);
            setSavedWorkspaceId(defaultWorkspaceId);
          }
        } catch {}
      } finally {
        setLoading(false);
        readyToAutoSaveRef.current = true;
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  async function save(updated: PermissionsData, workspaceIdOverride?: string) {
    const workspaceId = workspaceIdOverride ?? selectedWorkspaceId;
    setSaving(true);
    setSaveStatus('idle');
    try {
      await api.patch(`/api/workspace/pages/${pageId}/sharing`, {
        permissions: { ...updated, workspace_id: workspaceId || undefined },
      });
      setSavedWorkspaceId(workspaceId || '');
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1800);
    }
  }

  function setDefault(p: Permission) {
    const updated = { ...permissions, default_permission: p };
    setPermissions(updated);
    save(updated);
  }

  function setOverride(userId: string, p: Permission) {
    const overrides = { ...permissions.overrides };
    if (p === permissions.default_permission) {
      delete overrides[userId];
    } else {
      overrides[userId] = p;
    }
    const updated = { ...permissions, overrides };
    setPermissions(updated);
    save(updated);
  }

  function copyLink() {
    navigator.clipboard.writeText(pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    if (!readyToAutoSaveRef.current) return;
    if (!selectedWorkspaceId || selectedWorkspaceId === savedWorkspaceId) return;
    save(permissions, selectedWorkspaceId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId]);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Overlay */}
      <div className="flex-1" onClick={onClose} />

      {/* Panel */}
      <div className="h-full flex flex-col animate-slide-in"
        style={{ width: 480, background: 'var(--notion-card-elevated, var(--notion-card, white))', borderLeft: '1px solid var(--notion-border)', boxShadow: '0 12px 24px rgba(0,0,0,0.12)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--notion-border)' }}>
          <div className="flex items-center gap-2">
            <HandIcon name="link" size={16} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
              {pageTitle ? t('shareTitleWithPage', { title: pageTitle }) : t('share')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{t('savingText')}</span>}
            {!saving && saveStatus === 'saved' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ color: '#6d9487', background: 'rgba(109,148,135,0.12)', border: '1px solid rgba(109,148,135,0.22)' }}
              >
                {t('shareSavedStatus')}
              </span>
            )}
            {!saving && saveStatus === 'error' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ color: '#b57070', background: 'rgba(181,112,112,0.10)', border: '1px solid rgba(181,112,112,0.24)' }}
              >
                {t('shareSaveFailedStatus')}
              </span>
            )}
            <button onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--notion-text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Copy link section */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--notion-border)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#9B9A97' }}>{t('pageLink')}</p>
            <div className="flex items-center gap-2 p-2 rounded-xl"
              style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)' }}>
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--notion-text-muted)', fontFamily: 'monospace' }}>
                {pageUrl}
              </span>
              <button
                onClick={copyLink}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: copied ? 'rgba(124,164,147,0.2)' : 'rgba(116,129,158,0.12)',
                  color: copied ? '#6d9487' : '#74819e',
                }}
              >
                {copied ? t('copied') : t('copyBtn')}
              </button>
            </div>
          </div>

          {/* Workspace selection + default permission */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--notion-border)' }}>
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--notion-text-muted)' }}>{t('shareToWorkspace')}</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {workspaces.length > 0 ? (
                  <select
                    value={selectedWorkspaceId}
                    onChange={e => setSelectedWorkspaceId(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                    style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }}
                  >
                    {workspaces.map(ws => (
                      <option key={ws.id} value={ws.id}>
                        {ws.icon ? `${ws.icon} ` : ''}{ws.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs px-3 py-2 rounded-lg"
                    style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)', background: 'var(--notion-bg)' }}>
                    {t('personalSpace')}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
                <p className="text-[11px] mb-1" style={{ color: 'var(--notion-text-muted)' }}>{t('defaultPermission')}</p>
                <PermissionSelect
                  value={permissions.default_permission}
                  onChange={setDefault}
                  t={t}
                />
              </div>
            </div>
          </div>

          {/* Members list */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>
                {t('memberPermissions', { n: members.length })}
              </p>
              {loading && (
                <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{t('loadingMembers')}</span>
              )}
            </div>

            {!loading && members.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{t('noMembers')}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--notion-text-muted)' }}>
                  {t('inviteHint')}
                </p>
              </div>
            )}

            <div className="space-y-1">
              {members.map(member => {
                const perm = permissions.overrides[member.id] ?? permissions.default_permission;
                return (
                  <div key={member.id} className="flex items-center gap-3 py-2.5 rounded-xl px-2.5"
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <MemberAvatar member={member} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>
                        {member.full_name || member.email}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--notion-text-muted)' }}>
                        {member.email}
                        {member.role === 'admin' && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: 'rgba(116,129,158,0.14)', color: '#74819e' }}>{t('admin')}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <PermissionSelect
                        value={perm}
                        onChange={p => setOverride(member.id, p)}
                        t={t}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 flex-shrink-0 text-xs"
          style={{ borderTop: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)', background: 'var(--notion-bg)' }}>
          {t('permSaveHint')}
        </div>
      </div>
    </div>
  );
}
