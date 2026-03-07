'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import SlideOver from '@/components/ui/SlideOver';
import SecureFileLink from '@/components/ui/SecureFileLink';
import { useTranslations } from 'next-intl';
import { usePipelineConfig } from '@/lib/usePipelineConfig';

type TenantUser = { id: string; email: string; full_name: string | null; role: string };

type LeadFile = {
  id: string; lead_id: string; file_name: string; file_url: string;
  file_type?: string; file_size?: number; category: string;
  description?: string; tags?: string[];
  uploaded_by: string; created_at: string;
  lead_name?: string; customer_name?: string; uploader_name?: string;
  can_download?: boolean;
  involved_users?: { user_id: string; full_name: string; can_view: boolean; can_download: boolean }[];
  permissions?: { user_id: string; full_name: string; can_view: boolean; can_download: boolean }[];
};

const CAT_LABEL_KEYS: Record<string, string> = {
  contract: 'catContract', quotation: 'catQuotation', inspection: 'catInspection',
  shipping: 'catShipping', invoice: 'catInvoice', correspondence: 'catCorrespondence', other: 'catOther',
};

function formatFileSize(bytes?: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function FileDetailSlideOver({
  file, open, onClose, isAdmin, users, onUpdate,
}: {
  file: LeadFile | null;
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  users: TenantUser[];
  onUpdate: () => void;
}) {
  const tCrm = useTranslations('crm');
  const tCommon = useTranslations('common');
  const config = usePipelineConfig();
  const CATEGORIES = config.file_categories.map(c => c.key);
  const [activeTab, setActiveTab] = useState<'info' | 'permissions'>('info');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Permission state
  const [permMap, setPermMap] = useState<Record<string, { can_view: boolean; can_download: boolean }>>({});
  const [savingPerms, setSavingPerms] = useState(false);

  useEffect(() => {
    if (file) {
      setCategory(file.category || 'other');
      setDescription(file.description || '');
      setActiveTab('info');
      // Init permission map from file.permissions
      const m: Record<string, { can_view: boolean; can_download: boolean }> = {};
      (file.permissions || file.involved_users || []).forEach(p => {
        m[p.user_id] = { can_view: p.can_view, can_download: p.can_download };
      });
      setPermMap(m);
    }
  }, [file]);

  async function saveInfo() {
    if (!file) return;
    setSaving(true);
    try {
      await api.patch(`/api/crm/lead-files/${file.id}`, { category, description });
      onUpdate();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function savePermissions() {
    if (!file) return;
    setSavingPerms(true);
    try {
      const permissions = Object.entries(permMap).map(([user_id, p]) => ({
        user_id, can_view: p.can_view, can_download: p.can_download,
      }));
      await api.put(`/api/crm/lead-files/${file.id}/permissions`, { permissions });
      alert(tCrm('permissionsSaved'));
      onUpdate();
    } catch (err: any) { alert(err.message); }
    finally { setSavingPerms(false); }
  }

  function togglePerm(userId: string, field: 'can_view' | 'can_download') {
    setPermMap(prev => {
      const cur = prev[userId] || { can_view: false, can_download: false };
      return { ...prev, [userId]: { ...cur, [field]: !cur[field] } };
    });
  }

  function allowAll(field: 'can_view' | 'can_download') {
    setPermMap(prev => {
      const next = { ...prev };
      users.forEach(u => {
        next[u.id] = { ...(next[u.id] || { can_view: false, can_download: false }), [field]: true };
      });
      return next;
    });
  }

  const tabs: ['info', string][] | ['permissions', string][] = [['info', tCrm('fileInfo')]];
  if (isAdmin) (tabs as any[]).push(['permissions', tCrm('filePermissions')]);

  return (
    <SlideOver open={open} onClose={onClose} title={file?.file_name || ''} width="w-[600px]">
      {file && (
        <div className="flex flex-col h-full">
          {/* Tabs */}
          <div className="px-6 pt-4 flex gap-1 border-b" style={{ borderColor: 'var(--notion-border)' }}>
            {([['info', tCrm('fileInfo')] as [string, string]].concat(isAdmin ? [['permissions', tCrm('filePermissions')]] : [])).map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key as any)}
                className="px-3 py-2 text-sm font-medium border-b-2 transition-colors"
                style={{
                  borderColor: activeTab === key ? 'var(--notion-accent, #2563eb)' : 'transparent',
                  color: activeTab === key ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                }}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            {activeTab === 'info' && (
              <div className="space-y-4">
                {/* File meta */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileName')}</p>
                    <p className="text-sm">{file.file_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileType')}</p>
                    <p className="text-sm">{file.file_type || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileSize')}</p>
                    <p className="text-sm">{formatFileSize(file.file_size)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileDate')}</p>
                    <p className="text-sm">{file.created_at?.slice(0, 10) || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileLead')}</p>
                    <p className="text-sm">{file.lead_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileCustomer')}</p>
                    <p className="text-sm">{file.customer_name || '—'}</p>
                  </div>
                </div>

                {/* Editable fields */}
                <div>
                  <label className="text-[10px] uppercase font-semibold block mb-1" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileCategory')}</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', background: 'white' }}>
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{config.file_categories.find(fc => fc.key === c)?.label ?? tCrm(CAT_LABEL_KEYS[c] as any)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-semibold block mb-1" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileDescription')}</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    rows={3} className="w-full px-3 py-2 rounded-md text-sm border resize-none"
                    style={{ borderColor: 'var(--notion-border)' }} />
                </div>

                {/* Involved users */}
                {(file.involved_users || file.permissions || []).length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-semibold mb-1" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileInvolved')}</p>
                    <div className="flex flex-wrap gap-1">
                      {(file.involved_users || file.permissions || []).map(u => (
                        <span key={u.user_id} className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--notion-border)' }}>
                          {u.full_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  {(file.can_download || isAdmin) ? (
                    <SecureFileLink url={file.file_url} name={tCrm('downloadFile')}
                      className="px-3 py-1.5 rounded text-white text-sm"
                      style={{ background: 'var(--notion-accent, #2563eb)' }} />
                  ) : (
                    <span className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}>
                      {tCrm('noDownloadAccess')}
                    </span>
                  )}
                  <button onClick={saveInfo} disabled={saving}
                    className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: 'var(--notion-border)' }}>
                    {saving ? '...' : tCommon('save')}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'permissions' && isAdmin && (
              <div className="space-y-4">
                {/* Bulk actions */}
                <div className="flex gap-2">
                  <button onClick={() => allowAll('can_view')}
                    className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: 'var(--notion-border)' }}>
                    {tCrm('allowAllView')}
                  </button>
                  <button onClick={() => allowAll('can_download')}
                    className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: 'var(--notion-border)' }}>
                    {tCrm('allowAllDownload')}
                  </button>
                </div>

                {/* User permission list */}
                <div className="space-y-1 max-h-[400px] overflow-auto">
                  <div className="grid grid-cols-[1fr_80px_80px] gap-2 text-[10px] uppercase font-semibold pb-1 border-b"
                    style={{ color: 'var(--notion-text-muted)', borderColor: 'var(--notion-border)' }}>
                    <span>{tCrm('fileUploader')}</span>
                    <span className="text-center">{tCrm('canView')}</span>
                    <span className="text-center">{tCrm('canDownload')}</span>
                  </div>
                  {users.map(u => {
                    const p = permMap[u.id] || { can_view: false, can_download: false };
                    return (
                      <div key={u.id} className="grid grid-cols-[1fr_80px_80px] gap-2 items-center py-1.5 border-b"
                        style={{ borderColor: 'var(--notion-border)' }}>
                        <span className="text-sm truncate">{u.full_name || u.email}</span>
                        <div className="flex justify-center">
                          <button onClick={() => togglePerm(u.id, 'can_view')}
                            className="w-8 h-5 rounded-full transition-colors relative"
                            style={{ background: p.can_view ? '#22c55e' : '#d1d5db' }}>
                            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                              style={{ left: p.can_view ? '14px' : '2px' }} />
                          </button>
                        </div>
                        <div className="flex justify-center">
                          <button onClick={() => togglePerm(u.id, 'can_download')}
                            className="w-8 h-5 rounded-full transition-colors relative"
                            style={{ background: p.can_download ? '#22c55e' : '#d1d5db' }}>
                            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                              style={{ left: p.can_download ? '14px' : '2px' }} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-2">
                  <button onClick={savePermissions} disabled={savingPerms}
                    className="px-4 py-1.5 rounded text-white text-sm disabled:opacity-40"
                    style={{ background: 'var(--notion-accent, #2563eb)' }}>
                    {savingPerms ? '...' : tCrm('savePermissions')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </SlideOver>
  );
}
