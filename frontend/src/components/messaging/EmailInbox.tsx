'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useLocale, useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { relTime } from './wa-helpers';
import EmailComposer from './EmailComposer';
import EmailReader from './EmailReader';
import { DEFAULT_EMAIL_UI_PREFS, loadEmailUiPrefs, type EmailUiPrefs } from '@/lib/emailPrefs';

type EmailItem = {
  id: string;
  direction: string;
  from_email: string;
  from_name?: string;
  to_email: string;
  to_name?: string;
  cc?: string;
  subject?: string;
  preview?: string;
  body_text?: string;
  body_html?: string;
  status?: string;
  is_read?: boolean;
  lead_id?: string;
  lead_name?: string;
  sender_name?: string;
  thread_id?: string;
  sent_at?: string;
  received_at?: string;
  created_at?: string;
  mailbox_state?: 'inbox' | 'archived';
  follow_up_state?: 'none' | 'pending' | 'done';
  follow_up_at?: string;
  assigned_to?: string;
  assigned_user_name?: string;
};

type Folder = 'inbox' | 'sent' | 'todo' | 'archived';
type ViewMode = 'list' | 'read' | 'compose' | 'reply';
type EmailTemplate = {
  id: string;
  name: string;
  category?: string;
  locale?: string;
  subject: string;
  body_text: string;
  is_active?: boolean;
};
type SlaItem = {
  id: string;
  thread_id?: string;
  subject?: string;
  from_email: string;
  from_name?: string;
  created_at?: string;
  lead_name?: string;
};

export default function EmailInbox() {
  const t = useTranslations('msgCenter');
  const locale = useLocale();
  const isZh = locale.toLowerCase().startsWith('zh');
  const params = useParams();
  const tenantSlug = params?.tenant as string || '';
  const [folder, setFolder] = useState<Folder>('inbox');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Lead linking
  const [linkingEmail, setLinkingEmail] = useState<string | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<any[]>([]);
  const [emailPrefs, setEmailPrefs] = useState<EmailUiPrefs>({ ...DEFAULT_EMAIL_UI_PREFS });
  const [threadItems, setThreadItems] = useState<EmailItem[]>([]);
  const [showThread, setShowThread] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [canManualSync, setCanManualSync] = useState(true);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name?: string; email?: string }[]>([]);
  const [batchAssignUser, setBatchAssignUser] = useState('');
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState('general');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [showSlaPanel, setShowSlaPanel] = useState(false);
  const [slaLoading, setSlaLoading] = useState(false);
  const [slaItems, setSlaItems] = useState<SlaItem[]>([]);
  const [slaCount, setSlaCount] = useState(0);

  useEffect(() => {
    setEmailPrefs(loadEmailUiPrefs(tenantSlug));
  }, [tenantSlug]);

  useEffect(() => {
    const refreshPrefs = () => setEmailPrefs(loadEmailUiPrefs(tenantSlug));
    window.addEventListener('focus', refreshPrefs);
    return () => window.removeEventListener('focus', refreshPrefs);
  }, [tenantSlug]);

  const loadUnreadCount = useCallback(async () => {
    try {
      const data = await api.get('/api/email/unread-count');
      setUnreadCount(Number(data?.count || 0));
    } catch {
      setUnreadCount(0);
    }
  }, []);

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      let endpoint = '/api/email/inbox';
      const params = new URLSearchParams({ page: String(page), page_size: '50' });
      if (folder === 'sent') endpoint = '/api/email/sent';
      if (search) params.set('search', search);
      if (folder === 'inbox') {
        params.set('mailbox_state', 'inbox');
        if (unreadOnly) params.set('unread_only', '1');
        if (unlinkedOnly) params.set('unlinked_only', '1');
      } else if (folder === 'todo') {
        params.set('include_outbound', '1');
        params.set('mailbox_state', 'inbox');
        params.set('follow_up_only', '1');
        if (unreadOnly) params.set('unread_only', '1');
        if (unlinkedOnly) params.set('unlinked_only', '1');
      } else if (folder === 'archived') {
        params.set('include_outbound', '1');
        params.set('mailbox_state', 'archived');
        if (unreadOnly) params.set('unread_only', '1');
        if (unlinkedOnly) params.set('unlinked_only', '1');
      } else if (folder === 'sent') {
        params.set('mailbox_state', 'inbox');
      }
      const data = await api.get(`${endpoint}?${params}`);
      setEmails(data.items || []);
      setTotal(data.total || 0);
      setSelectedIds([]);
      if (folder === 'inbox') await loadUnreadCount();
    } catch (e: any) {
      console.error('loadEmails:', e);
      toast.error('Failed to load emails');
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [folder, page, search, loadUnreadCount, unreadOnly, unlinkedOnly]);

  useEffect(() => { loadEmails(); }, [loadEmails]);
  useEffect(() => { loadUnreadCount(); }, [loadUnreadCount]);
  useEffect(() => {
    api.get('/api/admin/users-lite')
      .then((d) => setAllUsers(Array.isArray(d) ? d : (d?.items || [])))
      .catch(() => setAllUsers([]));
  }, []);
  useEffect(() => {
    api.get('/api/auth/me')
      .then((me: any) => {
        const role = String(me?.role || '').toLowerCase();
        const allowed = role.includes('admin') || role === 'owner' || role === 'manager';
        setCanManualSync(allowed);
      })
      .catch(() => setCanManualSync(false));
  }, []);
  useEffect(() => {
    loadSlaItems(true);
  }, []);

  async function handleSelectEmail(email: EmailItem) {
    try {
      const wasUnread = email.is_read === false;
      const detail = await api.get(`/api/email/${email.id}`);
      setSelectedEmail(detail);
      if (wasUnread && folder === 'inbox') {
        setEmails((prev) => prev.map((it) => it.id === email.id ? { ...it, is_read: true } : it));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      setViewMode('read');
    } catch {
      toast.error('Failed to load email');
    }
  }

  function handleCompose() {
    setSelectedEmail(null);
    setViewMode('compose');
  }

  function handleReply() {
    if (selectedEmail) setViewMode('reply');
  }

  function handleForward() {
    if (!selectedEmail) return;
    setSelectedEmail({
      ...selectedEmail,
      to_email: '',  // Clear "To" so user enters new recipient
      subject: `Fwd: ${selectedEmail.subject?.replace(/^Fwd:\s*/i, '')}`,
    });
    setViewMode('compose');
  }

  function handleSent() {
    setViewMode('list');
    setSelectedEmail(null);
    loadEmails();
  }

  async function searchLeads(q: string) {
    setLeadSearch(q);
    if (q.length < 2) { setLeadResults([]); return; }
    try {
      const data = await api.get(`/api/crm/leads?search=${encodeURIComponent(q)}&page_size=10`);
      setLeadResults(data.items || []);
    } catch (e: any) { console.error('searchLeads:', e); setLeadResults([]); }
  }

  async function linkToLead(emailId: string, leadId: string) {
    try {
      await api.patch(`/api/email/${emailId}/link`, { lead_id: leadId });
      toast.success(isZh ? '已关联客户' : 'Linked');
      setLinkingEmail(null);
      loadEmails();
    } catch { toast.error(isZh ? '关联失败' : 'Failed to link'); }
  }

  async function handleMarkRead() {
    if (!selectedEmail) return;
    try {
      await api.patch(`/api/email/${selectedEmail.id}/read`, {});
      setSelectedEmail((prev) => prev ? { ...prev, is_read: true } : prev);
      setEmails((prev) => prev.map((it) => it.id === selectedEmail.id ? { ...it, is_read: true } : it));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      toast.success(isZh ? '已标记为已读' : 'Marked as read');
    } catch {
      toast.error(isZh ? '标记失败' : 'Failed to mark as read');
    }
  }

  async function handleDeleteEmail() {
    if (!selectedEmail) return;
    if (!confirm(isZh ? '确认删除这封邮件吗？' : 'Delete this email?')) return;
    try {
      await api.delete(`/api/email/${selectedEmail.id}`);
      setEmails((prev) => prev.filter((it) => it.id !== selectedEmail.id));
      if (selectedEmail.is_read === false) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      setSelectedEmail(null);
      setViewMode('list');
      toast.success(isZh ? '邮件已删除' : 'Email deleted');
    } catch {
      toast.error(isZh ? '删除失败' : 'Failed to delete email');
    }
  }

  async function updateEmailState(emailId: string, patch: Record<string, any>) {
    await api.patch(`/api/email/${emailId}/state`, patch);
    await loadEmails();
  }

  async function handleBatchState(patch: Record<string, any>) {
    if (selectedIds.length === 0) return;
    try {
      await api.post('/api/email/batch/state', { email_ids: selectedIds, ...patch });
      setSelectedIds([]);
      await loadEmails();
      await loadUnreadCount();
      toast.success(isZh ? '批量操作已完成' : 'Batch action completed');
    } catch {
      toast.error(isZh ? '批量操作失败' : 'Batch action failed');
    }
  }

  async function loadTemplates() {
    setTemplateLoading(true);
    try {
      const data = await api.get('/api/email/manage/templates?active_only=0');
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      setTemplates([]);
      toast.error(isZh ? '模板加载失败' : 'Failed to load templates');
    } finally {
      setTemplateLoading(false);
    }
  }

  function resetTemplateForm() {
    setEditingTemplateId(null);
    setTplName('');
    setTplCategory('general');
    setTplSubject('');
    setTplBody('');
  }

  async function saveTemplate() {
    if (!tplName.trim() || !tplSubject.trim() || !tplBody.trim()) {
      toast.error(isZh ? '模板名称、主题、正文不能为空' : 'Template fields are required');
      return;
    }
    try {
      const payload = {
        name: tplName.trim(),
        category: tplCategory,
        locale,
        subject: tplSubject.trim(),
        body_text: tplBody,
        is_active: true,
      };
      if (editingTemplateId) {
        await api.put(`/api/email/manage/templates/${editingTemplateId}`, payload);
      } else {
        await api.post('/api/email/manage/templates', payload);
      }
      await loadTemplates();
      resetTemplateForm();
      toast.success(isZh ? '模板已保存' : 'Template saved');
    } catch {
      toast.error(isZh ? '保存失败' : 'Failed to save template');
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm(isZh ? '确认删除该模板吗？' : 'Delete this template?')) return;
    try {
      await api.delete(`/api/email/manage/templates/${id}`);
      await loadTemplates();
      if (editingTemplateId === id) resetTemplateForm();
      toast.success(isZh ? '模板已删除' : 'Template deleted');
    } catch {
      toast.error(isZh ? '删除失败' : 'Failed to delete template');
    }
  }

  async function loadSlaItems(silent = false) {
    setSlaLoading(true);
    try {
      const data = await api.get('/api/email/sla/overdue?hours=24&limit=200');
      const items = Array.isArray(data) ? data : [];
      setSlaItems(items);
      setSlaCount(items.length);
      return items;
    } catch {
      setSlaItems([]);
      setSlaCount(0);
      if (!silent) toast.error(isZh ? 'SLA 列表加载失败' : 'Failed to load SLA data');
      return [];
    } finally {
      setSlaLoading(false);
    }
  }

  async function triggerSlaNotify() {
    if (slaItems.length === 0) {
      toast((isZh ? '当前没有超时邮件，无需提醒' : 'No overdue emails to notify'));
      return;
    }
    if (!confirm(isZh ? `确认发送 ${slaItems.length} 条 SLA 提醒吗？` : `Send ${slaItems.length} SLA reminders now?`)) return;
    try {
      const data = await api.post('/api/email/sla/notify?hours=24&limit=200', {});
      toast.success(isZh ? `已发送 ${data?.notified || 0} 条提醒` : `Sent ${data?.notified || 0} reminders`);
    } catch {
      toast.error(isZh ? '提醒发送失败' : 'Failed to send reminders');
    }
  }

  async function handleArchiveCurrent(archived: boolean) {
    if (!selectedEmail) return;
    try {
      await updateEmailState(selectedEmail.id, { mailbox_state: archived ? 'archived' : 'inbox' });
      if (archived && folder !== 'archived') {
        setSelectedEmail(null);
        setViewMode('list');
      }
      toast.success(isZh ? (archived ? '已归档' : '已移回收件箱') : (archived ? 'Archived' : 'Moved to inbox'));
    } catch {
      toast.error(isZh ? '操作失败' : 'Action failed');
    }
  }

  async function handleSetFollowUp(pending: boolean) {
    if (!selectedEmail) return;
    try {
      await updateEmailState(selectedEmail.id, {
        follow_up_state: pending ? 'pending' : 'none',
        follow_up_at: pending ? new Date().toISOString() : '',
      });
      setSelectedEmail((prev) => prev ? {
        ...prev,
        follow_up_state: pending ? 'pending' : 'none',
        follow_up_at: pending ? new Date().toISOString() : undefined,
      } : prev);
      toast.success(isZh ? (pending ? '已设为待跟进' : '已清除待跟进') : (pending ? 'Follow-up set' : 'Follow-up cleared'));
    } catch {
      toast.error(isZh ? '操作失败' : 'Action failed');
    }
  }

  async function handleViewThread() {
    if (!selectedEmail?.thread_id) return;
    setLoadingThread(true);
    setShowThread(true);
    try {
      const data = await api.get(`/api/email/thread/${selectedEmail.thread_id}`);
      setThreadItems(Array.isArray(data?.emails) ? data.emails : []);
    } catch {
      toast.error(isZh ? '会话加载失败' : 'Failed to load thread');
      setThreadItems([]);
    } finally {
      setLoadingThread(false);
    }
  }

  async function handleManualSync() {
    if (!canManualSync) {
      toast.error(isZh ? '仅管理员可手动同步' : 'Only admin can trigger manual sync');
      return;
    }
    setSyncing(true);
    try {
      await api.post('/api/email/imap/sync', {});
      toast.success(isZh ? '邮件同步已开始' : 'Email sync started');
      loadEmails();
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('403') || msg.toLowerCase().includes('permission')) {
        toast.error(isZh ? '仅管理员可手动同步' : 'Only admin can trigger manual sync');
      } else {
        toast.error(isZh ? '暂时无法手动同步' : 'Manual sync unavailable');
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleOpenSlaPanel() {
    const items = await loadSlaItems(true);
    if (items.length === 0) {
      toast(isZh ? '当前没有 SLA 超时邮件' : 'No SLA overdue emails right now');
      setShowSlaPanel(false);
      return;
    }
    setShowSlaPanel(true);
  }

  async function handleOpenSlaItem(item: SlaItem) {
    try {
      const detail = await api.get(`/api/email/${item.id}`);
      setSelectedEmail(detail);
      setViewMode('read');
      setShowSlaPanel(false);
    } catch {
      toast.error(isZh ? '邮件详情加载失败' : 'Failed to load email detail');
    }
  }

  const visibleEmails = emails;

  return (
    <div className="h-full flex" style={{ background: '#eef2f6' }}>
      {/* Left: Email List */}
      <div className="flex flex-col" style={{ width: 420, background: 'white', borderRight: '1px solid #dbe3ea' }}>
        {/* Folder tabs + actions */}
        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
          <div className="flex items-center gap-2 flex-wrap">
            {(['inbox', 'todo', 'archived', 'sent'] as Folder[]).map((f) => (
              <button key={f} onClick={() => { setFolder(f); setPage(1); }}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
                style={{
                  background: folder === f ? '#dbeafe' : '#f8fafc',
                  color: folder === f ? '#1d4ed8' : '#64748b',
                  border: `1px solid ${folder === f ? '#93c5fd' : '#e2e8f0'}`,
                }}>
                {f === 'inbox'
                  ? (isZh ? '收件箱' : (t('emailInbox') || 'Inbox'))
                  : f === 'todo'
                  ? (isZh ? '待跟进' : 'Need Follow-up')
                  : f === 'archived'
                  ? (isZh ? '已归档' : 'Archived')
                  : (isZh ? '已发送' : (t('emailSent') || 'Sent'))}
              </button>
            ))}
            {folder === 'inbox' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                {isZh ? `未读 ${unreadCount}` : `Unread ${unreadCount}`}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button onClick={handleCompose}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium text-white"
              style={{ background: '#2563eb' }}>
              + {isZh ? '写邮件' : (t('emailCompose') || 'Compose')}
            </button>
            <button onClick={handleManualSync} disabled={syncing || !canManualSync}
              title={canManualSync ? (isZh ? '手动拉取最新邮件' : 'Manually pull latest emails') : (isZh ? '仅管理员可手动同步' : 'Admin only')}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium border disabled:opacity-60"
              style={{ borderColor: '#dbe3ea', color: '#334155', background: '#f8fafc' }}>
              {syncing ? (isZh ? '同步中...' : 'Syncing...') : (isZh ? '同步' : 'Sync')}
            </button>
            <button
              onClick={() => { setShowTemplateManager(true); loadTemplates(); }}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium border"
              style={{ borderColor: '#dbe3ea', color: '#334155', background: '#f8fafc' }}
            >
              {isZh ? '模板' : 'Templates'}
            </button>
            <button
              onClick={handleOpenSlaPanel}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium border"
              style={{ borderColor: '#fde68a', color: '#92400e', background: '#fffbeb' }}
            >
              SLA {slaCount > 0 ? `(${slaCount})` : ''}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 flex-shrink-0 space-y-2" style={{ background: '#f8fafc', borderBottom: '1px solid #eef2f7' }}>
          <input type="text" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={isZh ? '搜索主题、发件人、内容...' : 'Search emails...'}
            className="w-full text-xs border rounded-xl px-3 py-2 outline-none"
            style={{ borderColor: '#dbe3ea', background: 'white' }} />
          {(folder === 'inbox' || folder === 'todo') && (
            <label className="inline-flex items-center gap-2 text-[11px]" style={{ color: '#667781' }}>
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              {isZh ? '仅看未读' : 'Unread only'}
            </label>
          )}
          {(folder === 'inbox' || folder === 'todo' || folder === 'archived') && (
            <label className="inline-flex items-center gap-2 text-[11px] ml-3" style={{ color: '#667781' }}>
              <input
                type="checkbox"
                checked={unlinkedOnly}
                onChange={(e) => setUnlinkedOnly(e.target.checked)}
              />
              {isZh ? '仅看未关联客户' : 'Unlinked only'}
            </label>
          )}
        </div>

        {selectedIds.length > 0 && (
          <div className="px-3 py-2 flex items-center gap-2 border-b flex-wrap" style={{ borderColor: '#e5e7eb', background: '#f8fafc' }}>
            <span className="text-[11px] font-medium" style={{ color: '#334155' }}>
              {isZh ? `已选 ${selectedIds.length} 封` : `${selectedIds.length} selected`}
            </span>
            <button
              onClick={() => setSelectedIds([])}
              className="text-[11px] px-2 py-1 rounded border"
              style={{ borderColor: '#e5e7eb', color: '#64748b' }}
            >
              {isZh ? '取消选择' : 'Clear Select'}
            </button>
            <button
              onClick={async () => {
                try {
                  await Promise.all(selectedIds.map((id) => api.patch(`/api/email/${id}/read`, {})));
                  setSelectedIds([]);
                  await loadEmails();
                  await loadUnreadCount();
                  toast.success(isZh ? '已批量标记已读' : 'Marked as read');
                } catch {
                  toast.error(isZh ? '操作失败' : 'Action failed');
                }
              }}
              className="text-[11px] px-2 py-1 rounded border"
              style={{ borderColor: '#e5e7eb', color: '#334155' }}
            >
              {isZh ? '标记已读' : 'Mark Read'}
            </button>
            <button
              onClick={() => handleBatchState({ mailbox_state: 'archived' })}
              className="text-[11px] px-2 py-1 rounded border"
              style={{ borderColor: '#e5e7eb', color: '#334155' }}
            >
              {isZh ? '归档' : 'Archive'}
            </button>
            <button
              onClick={() => handleBatchState({ follow_up_state: 'pending' })}
              className="text-[11px] px-2 py-1 rounded border"
              style={{ borderColor: '#fcd34d', color: '#92400e', background: '#fffbeb' }}
            >
              {isZh ? '设为待跟进' : 'Set Follow-up'}
            </button>
            <button
              onClick={() => handleBatchState({ follow_up_state: 'none', follow_up_at: '' })}
              className="text-[11px] px-2 py-1 rounded border"
              style={{ borderColor: '#e5e7eb', color: '#64748b' }}
            >
              {isZh ? '清除待跟进' : 'Clear Follow-up'}
            </button>
            {allUsers.length > 0 && (
              <>
                <select
                  value={batchAssignUser}
                  onChange={(e) => setBatchAssignUser(e.target.value)}
                  className="text-[11px] px-2 py-1 rounded border outline-none"
                  style={{ borderColor: '#e5e7eb', color: '#334155', background: 'white' }}
                >
                  <option value="">{isZh ? '选择负责人' : 'Select owner'}</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleBatchState({ assigned_to: batchAssignUser || '' })}
                  className="text-[11px] px-2 py-1 rounded border"
                  style={{ borderColor: '#e5e7eb', color: '#334155' }}
                  disabled={!batchAssignUser}
                >
                  {isZh ? '分配' : 'Assign'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Email list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-8 text-xs" style={{ color: '#8696a0' }}>{isZh ? '加载中...' : 'Loading...'}</div>
          ) : visibleEmails.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📧</div>
              <p className="text-xs" style={{ color: '#8696a0' }}>
                {isZh ? '暂无邮件' : (t('emailNoMessages') || 'No emails')}
              </p>
            </div>
          ) : (
            visibleEmails.map((email) => {
              const isActive = selectedEmail?.id === email.id;
              const ts = email.sent_at || email.received_at || email.created_at || '';
              const counterpartName = (folder === 'inbox' || folder === 'todo' || folder === 'archived')
                ? (email.direction === 'outbound' ? (email.to_name || email.to_email) : (email.from_name || email.from_email))
                : (email.to_name || email.to_email);
              return (
                <div key={email.id}
                  className="px-4 py-3 cursor-pointer transition-colors hover:bg-[#f8fafc]"
                  style={{
                    background: isActive ? '#eef4ff' : 'white',
                    borderBottom: '1px solid #f3f4f6',
                    borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
                  }}>
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(email.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedIds((prev) => e.target.checked ? [...prev, email.id] : prev.filter((id) => id !== email.id));
                      }}
                    />
                    <span className="text-xs font-medium truncate flex-1 flex items-center gap-1.5"
                      onClick={() => handleSelectEmail(email)}
                      style={{ color: '#3b4a54', fontWeight: email.is_read === false ? 700 : 500 }}>
                      {email.is_read === false && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#3b82f6' }} />
                      )}
                      {counterpartName}
                    </span>
                    <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: '#8696a0' }}>
                      {relTime(ts)}
                    </span>
                  </div>
                  <div className="text-xs truncate mb-0.5"
                    onClick={() => handleSelectEmail(email)}
                    style={{ color: '#3b4a54', fontWeight: email.is_read === false ? 600 : 400 }}>
                    {email.subject || '(No Subject)'}
                  </div>
                  <div className="text-[11px] truncate" onClick={() => handleSelectEmail(email)} style={{ color: '#8696a0' }}>
                    {email.preview || ''}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {email.lead_name && (
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: '#e0e7ff', color: '#4338ca' }}>
                        {email.lead_name}
                      </span>
                    )}
                    {email.follow_up_state === 'pending' && (
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: '#fffbeb', color: '#a16207' }}>
                        {isZh ? '待跟进' : 'Follow-up'}
                      </span>
                    )}
                    {email.assigned_user_name && (
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: '#eef2ff', color: '#4f46e5' }}>
                        {isZh ? `负责人: ${email.assigned_user_name}` : `Owner: ${email.assigned_user_name}`}
                      </span>
                    )}
                    {email.mailbox_state === 'archived' && (
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: '#f1f5f9', color: '#64748b' }}>
                        {isZh ? '已归档' : 'Archived'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {/* Pagination */}
          {total > 50 && (
            <div className="flex items-center justify-center gap-2 py-3">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                className="text-xs px-2 py-1 rounded border disabled:opacity-30" style={{ borderColor: '#e5e7eb' }}>
                {isZh ? '上一页' : 'Prev'}
              </button>
              <span className="text-xs" style={{ color: '#8696a0' }}>
                {page} / {Math.ceil(total / 50)}
              </span>
              <button onClick={() => setPage(page + 1)} disabled={page * 50 >= total}
                className="text-xs px-2 py-1 rounded border disabled:opacity-30" style={{ borderColor: '#e5e7eb' }}>
                {isZh ? '下一页' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: Content */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: '#f8fafc' }}>
        {viewMode === 'list' && !selectedEmail && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">✉️</div>
              <p className="text-sm" style={{ color: '#8696a0' }}>{isZh ? '请选择一封邮件查看' : 'Select an email to read'}</p>
            </div>
          </div>
        )}

        {viewMode === 'read' && selectedEmail && (
          <EmailReader
            email={selectedEmail}
            autoTranslateEnabled={emailPrefs.autoTranslateIncoming}
            userTargetLanguage={emailPrefs.targetLanguage || locale}
            onReply={handleReply}
            onForward={handleForward}
            onLinkCustomer={() => setLinkingEmail(selectedEmail.id)}
            onViewThread={handleViewThread}
            onMarkRead={handleMarkRead}
            onDelete={handleDeleteEmail}
            onArchive={() => handleArchiveCurrent((selectedEmail.mailbox_state || 'inbox') !== 'archived')}
            onSetFollowUp={() => handleSetFollowUp(true)}
            onClearFollowUp={() => handleSetFollowUp(false)}
            canViewThread={!!selectedEmail.thread_id}
            canMarkRead={selectedEmail.is_read === false}
            isArchived={(selectedEmail.mailbox_state || 'inbox') === 'archived'}
            isFollowUpPending={selectedEmail.follow_up_state === 'pending'}
            onBack={() => { setViewMode('list'); setSelectedEmail(null); }}
          />
        )}

        {viewMode === 'compose' && (
          <EmailComposer
            defaultTo={selectedEmail?.to_email}
            defaultSubject={selectedEmail?.subject}
            autoTranslateEnabled={emailPrefs.autoTranslateOutgoing}
            userTargetLanguage={emailPrefs.targetLanguage || locale}
            defaultFontFamily={emailPrefs.composerFontFamily}
            defaultFontSize={emailPrefs.composerFontSize}
            onSent={handleSent}
            onCancel={() => { setViewMode('list'); setSelectedEmail(null); }}
          />
        )}

        {viewMode === 'reply' && selectedEmail && (
          <EmailComposer
            replyTo={selectedEmail}
            autoTranslateEnabled={emailPrefs.autoTranslateOutgoing}
            userTargetLanguage={emailPrefs.targetLanguage || locale}
            defaultFontFamily={emailPrefs.composerFontFamily}
            defaultFontSize={emailPrefs.composerFontSize}
            onSent={handleSent}
            onCancel={() => setViewMode('read')}
          />
        )}
      </div>

      {/* Link to Customer Modal */}
      {linkingEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setLinkingEmail(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#3b4a54' }}>
              {isZh ? '关联客户' : (t('emailLinkCustomer') || 'Link to Customer')}
            </h3>
            <input type="text" value={leadSearch}
              onChange={(e) => searchLeads(e.target.value)}
              placeholder={isZh ? '搜索客户线索...' : 'Search leads...'}
              className="w-full text-sm border rounded-lg px-3 py-2 mb-2 outline-none"
              style={{ borderColor: '#e5e7eb' }} />
            <div className="max-h-48 overflow-auto space-y-1">
              {leadResults.map((lead: any) => (
                <button key={lead.id}
                  onClick={() => linkToLead(linkingEmail, lead.id)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
                  <div className="font-medium" style={{ color: '#3b4a54' }}>{lead.full_name}</div>
                  {lead.company && (
                    <div className="text-xs" style={{ color: '#8696a0' }}>{lead.company}</div>
                  )}
                </button>
              ))}
            </div>
            <button onClick={() => setLinkingEmail(null)}
              className="mt-3 w-full text-xs py-2 rounded-lg border"
              style={{ borderColor: '#e5e7eb', color: '#667781' }}>
              {isZh ? '取消' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {showThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowThread(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#e5e7eb' }}>
              <h3 className="text-sm font-semibold" style={{ color: '#3b4a54' }}>{isZh ? '邮件往来记录' : 'Conversation Thread'}</h3>
              <button onClick={() => setShowThread(false)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#e5e7eb', color: '#667781' }}>
                {isZh ? '关闭' : 'Close'}
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 space-y-3">
              {loadingThread ? (
                <p className="text-xs" style={{ color: '#8696a0' }}>{isZh ? '加载中...' : 'Loading thread...'}</p>
              ) : threadItems.length === 0 ? (
                <p className="text-xs" style={{ color: '#8696a0' }}>{isZh ? '暂无会话记录' : 'No thread data'}</p>
              ) : (
                threadItems.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3" style={{ borderColor: '#e5e7eb', background: item.direction === 'outbound' ? '#eff6ff' : '#f8fafc' }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold" style={{ color: '#3b4a54' }}>
                        {item.direction === 'outbound' ? (isZh ? '我 → ' : 'You → ') : ''}{item.from_name || item.from_email}
                      </span>
                      <span className="text-[10px]" style={{ color: '#8696a0' }}>{relTime(item.sent_at || item.received_at || item.created_at || '')}</span>
                    </div>
                    <p className="text-xs font-medium mb-1" style={{ color: '#334155' }}>{item.subject || '(No Subject)'}</p>
                    <p className="text-xs whitespace-pre-wrap" style={{ color: '#667781' }}>{item.preview || item.body_text || ''}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showTemplateManager && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowTemplateManager(false)}>
          <div className="w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex" onClick={(e) => e.stopPropagation()}>
            <div className="w-[44%] border-r overflow-auto" style={{ borderColor: '#e5e7eb' }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#e5e7eb' }}>
                <h3 className="text-sm font-semibold" style={{ color: '#334155' }}>{isZh ? '邮件模板' : 'Email Templates'}</h3>
                <button onClick={resetTemplateForm} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#e5e7eb', color: '#64748b' }}>
                  {isZh ? '新建' : 'New'}
                </button>
              </div>
              {templateLoading ? (
                <div className="p-4 text-xs" style={{ color: '#94a3b8' }}>{isZh ? '加载中...' : 'Loading...'}</div>
              ) : (
                <div className="p-2 space-y-1">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="rounded-lg border px-3 py-2 cursor-pointer"
                      style={{ borderColor: editingTemplateId === tpl.id ? '#93c5fd' : '#e5e7eb', background: editingTemplateId === tpl.id ? '#eff6ff' : 'white' }}
                      onClick={() => {
                        setEditingTemplateId(tpl.id);
                        setTplName(tpl.name || '');
                        setTplCategory(tpl.category || 'general');
                        setTplSubject(tpl.subject || '');
                        setTplBody(tpl.body_text || '');
                      }}
                    >
                      <p className="text-xs font-semibold truncate" style={{ color: '#334155' }}>{tpl.name}</p>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: '#64748b' }}>{tpl.subject}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col">
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#e5e7eb' }}>
                <h3 className="text-sm font-semibold" style={{ color: '#334155' }}>
                  {editingTemplateId ? (isZh ? '编辑模板' : 'Edit Template') : (isZh ? '新建模板' : 'Create Template')}
                </h3>
                <button onClick={() => setShowTemplateManager(false)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#e5e7eb', color: '#64748b' }}>
                  {isZh ? '关闭' : 'Close'}
                </button>
              </div>
              <div className="p-4 space-y-3 overflow-auto flex-1">
                <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder={isZh ? '模板名称' : 'Template name'} className="w-full text-sm border rounded-lg px-3 py-2 outline-none" style={{ borderColor: '#e5e7eb' }} />
                <input value={tplCategory} onChange={(e) => setTplCategory(e.target.value)} placeholder={isZh ? '分类（如报价、催款）' : 'Category'} className="w-full text-sm border rounded-lg px-3 py-2 outline-none" style={{ borderColor: '#e5e7eb' }} />
                <input value={tplSubject} onChange={(e) => setTplSubject(e.target.value)} placeholder={isZh ? '邮件主题' : 'Email subject'} className="w-full text-sm border rounded-lg px-3 py-2 outline-none" style={{ borderColor: '#e5e7eb' }} />
                <textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} placeholder={isZh ? '邮件正文，可使用 {{to_email}} {{date}} 变量' : 'Body text'} className="w-full h-64 text-sm border rounded-lg px-3 py-2 outline-none resize-none" style={{ borderColor: '#e5e7eb' }} />
              </div>
              <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: '#e5e7eb' }}>
                <div>
                  {editingTemplateId && (
                    <button onClick={() => deleteTemplate(editingTemplateId)} className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#fecaca', color: '#dc2626' }}>
                      {isZh ? '删除模板' : 'Delete'}
                    </button>
                  )}
                </div>
                <button onClick={saveTemplate} className="text-xs px-3 py-1.5 rounded text-white" style={{ background: '#2563eb' }}>
                  {isZh ? '保存模板' : 'Save Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSlaPanel && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowSlaPanel(false)}>
          <div className="w-full max-w-4xl h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#e5e7eb' }}>
              <h3 className="text-sm font-semibold" style={{ color: '#334155' }}>{isZh ? 'SLA 超时未回复邮件' : 'SLA Overdue Emails'}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => loadSlaItems()} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#e5e7eb', color: '#64748b' }}>
                  {isZh ? '刷新' : 'Refresh'}
                </button>
                <button onClick={triggerSlaNotify} disabled={slaItems.length === 0}
                  className="text-xs px-2 py-1 rounded border disabled:opacity-60" style={{ borderColor: '#fde68a', color: '#92400e', background: '#fffbeb' }}>
                  {isZh ? '发送提醒' : 'Notify'}
                </button>
                <button onClick={() => setShowSlaPanel(false)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#e5e7eb', color: '#64748b' }}>
                  {isZh ? '关闭' : 'Close'}
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {slaLoading ? (
                <p className="text-xs" style={{ color: '#94a3b8' }}>{isZh ? '加载中...' : 'Loading...'}</p>
              ) : slaItems.length === 0 ? (
                <p className="text-xs" style={{ color: '#94a3b8' }}>{isZh ? '暂无超时邮件' : 'No overdue emails'}</p>
              ) : (
                <div className="space-y-2">
                  {slaItems.map((item) => (
                    <button key={item.id} onClick={() => handleOpenSlaItem(item)}
                      className="w-full text-left rounded-lg border p-3 hover:bg-amber-50 transition-colors"
                      style={{ borderColor: '#e5e7eb', background: '#fff' }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold truncate" style={{ color: '#334155' }}>{item.subject || '(No Subject)'}</p>
                        <span className="text-[10px]" style={{ color: '#94a3b8' }}>{relTime(item.created_at || '')}</span>
                      </div>
                      <p className="text-[11px] mt-1" style={{ color: '#64748b' }}>{item.from_name || item.from_email} {item.lead_name ? `· ${item.lead_name}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
