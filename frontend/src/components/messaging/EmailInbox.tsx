'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useLocale, useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { relTime } from './wa-helpers';
import EmailComposer from './EmailComposer';
import EmailReader from './EmailReader';

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
};

type Folder = 'inbox' | 'sent';
type ViewMode = 'list' | 'read' | 'compose' | 'reply';

export default function EmailInbox() {
  const t = useTranslations('msgCenter');
  const locale = useLocale();
  const params = useParams();
  const tenantSlug = params?.tenant as string || '';
  const translatePrefKey = `wa_auto_translate_${tenantSlug || 'default'}`;
  const [folder, setFolder] = useState<Folder>('inbox');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Lead linking
  const [linkingEmail, setLinkingEmail] = useState<string | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<any[]>([]);
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(false);
  const [threadItems, setThreadItems] = useState<EmailItem[]>([]);
  const [showThread, setShowThread] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(translatePrefKey);
      if (raw === '1') setAutoTranslateEnabled(true);
      if (raw === '0') setAutoTranslateEnabled(false);
    } catch {
      // ignore localStorage errors
    }
  }, [translatePrefKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(translatePrefKey, autoTranslateEnabled ? '1' : '0');
    } catch {
      // ignore localStorage errors
    }
  }, [autoTranslateEnabled, translatePrefKey]);

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
      const endpoint = folder === 'inbox' ? '/api/email/inbox' : '/api/email/sent';
      const params = new URLSearchParams({ page: String(page), page_size: '50' });
      if (search) params.set('search', search);
      const data = await api.get(`${endpoint}?${params}`);
      setEmails(data.items || []);
      setTotal(data.total || 0);
      if (folder === 'inbox') await loadUnreadCount();
    } catch (e: any) {
      console.error('loadEmails:', e);
      toast.error('Failed to load emails');
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [folder, page, search, loadUnreadCount]);

  useEffect(() => { loadEmails(); }, [loadEmails]);
  useEffect(() => { loadUnreadCount(); }, [loadUnreadCount]);

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
      toast.success('Linked');
      setLinkingEmail(null);
      loadEmails();
    } catch { toast.error('Failed to link'); }
  }

  async function handleMarkRead() {
    if (!selectedEmail) return;
    try {
      await api.patch(`/api/email/${selectedEmail.id}/read`, {});
      setSelectedEmail((prev) => prev ? { ...prev, is_read: true } : prev);
      setEmails((prev) => prev.map((it) => it.id === selectedEmail.id ? { ...it, is_read: true } : it));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      toast.success('Marked as read');
    } catch {
      toast.error('Failed to mark as read');
    }
  }

  async function handleDeleteEmail() {
    if (!selectedEmail) return;
    if (!confirm('Delete this email?')) return;
    try {
      await api.delete(`/api/email/${selectedEmail.id}`);
      setEmails((prev) => prev.filter((it) => it.id !== selectedEmail.id));
      if (selectedEmail.is_read === false) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      setSelectedEmail(null);
      setViewMode('list');
      toast.success('Email deleted');
    } catch {
      toast.error('Failed to delete email');
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
      toast.error('Failed to load thread');
      setThreadItems([]);
    } finally {
      setLoadingThread(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      await api.post('/api/email/imap/sync', {});
      toast.success('Email sync started');
      loadEmails();
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('403') || msg.toLowerCase().includes('permission')) {
        toast.error('Only admin can trigger manual sync');
      } else {
        toast.error('Manual sync unavailable');
      }
    } finally {
      setSyncing(false);
    }
  }

  const visibleEmails = unreadOnly && folder === 'inbox'
    ? emails.filter((email) => email.is_read === false)
    : emails;

  return (
    <div className="h-full flex" style={{ background: '#f0f2f5' }}>
      {/* Left: Email List */}
      <div className="flex flex-col" style={{ width: 380, background: 'white', borderRight: '1px solid #e5e7eb' }}>
        {/* Folder tabs + compose */}
        <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
          {(['inbox', 'sent'] as Folder[]).map((f) => (
            <button key={f} onClick={() => { setFolder(f); setPage(1); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: folder === f ? '#e0e7ff' : 'transparent',
                color: folder === f ? '#4338ca' : '#667781',
              }}>
              {f === 'inbox' ? (t('emailInbox') || 'Inbox') : (t('emailSent') || 'Sent')}
            </button>
          ))}
          {folder === 'inbox' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#e0f2fe', color: '#0369a1' }}>
              Unread {unreadCount}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setAutoTranslateEnabled(v => !v)}
            className="text-[11px] px-2 py-1 rounded-lg border"
            style={{
              borderColor: autoTranslateEnabled ? '#86efac' : '#e5e7eb',
              color: autoTranslateEnabled ? '#166534' : '#667781',
              background: autoTranslateEnabled ? '#f0fdf4' : 'white',
            }}
            title={`Auto Translate (${locale})`}
          >
            {autoTranslateEnabled ? 'Auto Translate On' : 'Auto Translate Off'}
          </button>
          <button onClick={handleCompose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: '#3b82f6' }}>
            + {t('emailCompose') || 'Compose'}
          </button>
          <button onClick={handleManualSync} disabled={syncing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-60"
            style={{ borderColor: '#e5e7eb', color: '#3b4a54' }}>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 flex-shrink-0 space-y-2">
          <input type="text" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search emails..."
            className="w-full text-xs border rounded-lg px-3 py-2 outline-none"
            style={{ borderColor: '#e5e7eb' }} />
          {folder === 'inbox' && (
            <label className="inline-flex items-center gap-2 text-[11px]" style={{ color: '#667781' }}>
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Unread only
            </label>
          )}
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-8 text-xs" style={{ color: '#8696a0' }}>Loading...</div>
          ) : visibleEmails.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📧</div>
              <p className="text-xs" style={{ color: '#8696a0' }}>
                {t('emailNoMessages') || 'No emails'}
              </p>
            </div>
          ) : (
            visibleEmails.map((email) => {
              const isActive = selectedEmail?.id === email.id;
              const ts = email.sent_at || email.received_at || email.created_at || '';
              return (
                <div key={email.id}
                  onClick={() => handleSelectEmail(email)}
                  className="px-4 py-3 cursor-pointer transition-colors"
                  style={{
                    background: isActive ? '#e0e7ff' : 'white',
                    borderBottom: '1px solid #f3f4f6',
                  }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate flex-1"
                      style={{ color: '#3b4a54', fontWeight: email.is_read === false ? 700 : 500 }}>
                      {folder === 'inbox'
                        ? (email.from_name || email.from_email)
                        : (email.to_name || email.to_email)}
                    </span>
                    <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: '#8696a0' }}>
                      {relTime(ts)}
                    </span>
                  </div>
                  <div className="text-xs truncate mb-0.5"
                    style={{ color: '#3b4a54', fontWeight: email.is_read === false ? 600 : 400 }}>
                    {email.subject || '(No Subject)'}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: '#8696a0' }}>
                    {email.preview || ''}
                  </div>
                  {email.lead_name && (
                    <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded"
                      style={{ background: '#e0e7ff', color: '#4338ca' }}>
                      {email.lead_name}
                    </span>
                  )}
                </div>
              );
            })
          )}
          {/* Pagination */}
          {total > 50 && (
            <div className="flex items-center justify-center gap-2 py-3">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                className="text-xs px-2 py-1 rounded border disabled:opacity-30" style={{ borderColor: '#e5e7eb' }}>
                Prev
              </button>
              <span className="text-xs" style={{ color: '#8696a0' }}>
                {page} / {Math.ceil(total / 50)}
              </span>
              <button onClick={() => setPage(page + 1)} disabled={page * 50 >= total}
                className="text-xs px-2 py-1 rounded border disabled:opacity-30" style={{ borderColor: '#e5e7eb' }}>
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: Content */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: 'white' }}>
        {viewMode === 'list' && !selectedEmail && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">✉️</div>
              <p className="text-sm" style={{ color: '#8696a0' }}>Select an email to read</p>
            </div>
          </div>
        )}

        {viewMode === 'read' && selectedEmail && (
          <EmailReader
            email={selectedEmail}
            autoTranslateEnabled={autoTranslateEnabled}
            userTargetLanguage={locale}
            onReply={handleReply}
            onForward={handleForward}
            onLinkCustomer={() => setLinkingEmail(selectedEmail.id)}
            onViewThread={handleViewThread}
            onMarkRead={handleMarkRead}
            onDelete={handleDeleteEmail}
            canViewThread={!!selectedEmail.thread_id}
            canMarkRead={selectedEmail.is_read === false}
            onBack={() => { setViewMode('list'); setSelectedEmail(null); }}
          />
        )}

        {viewMode === 'compose' && (
          <EmailComposer
            defaultTo={selectedEmail?.to_email}
            defaultSubject={selectedEmail?.subject}
            autoTranslateEnabled={autoTranslateEnabled}
            userTargetLanguage={locale}
            onSent={handleSent}
            onCancel={() => { setViewMode('list'); setSelectedEmail(null); }}
          />
        )}

        {viewMode === 'reply' && selectedEmail && (
          <EmailComposer
            replyTo={selectedEmail}
            autoTranslateEnabled={autoTranslateEnabled}
            userTargetLanguage={locale}
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
              {t('emailLinkCustomer') || 'Link to Customer'}
            </h3>
            <input type="text" value={leadSearch}
              onChange={(e) => searchLeads(e.target.value)}
              placeholder="Search leads..."
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
              Cancel
            </button>
          </div>
        </div>
      )}

      {showThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowThread(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#e5e7eb' }}>
              <h3 className="text-sm font-semibold" style={{ color: '#3b4a54' }}>Conversation Thread</h3>
              <button onClick={() => setShowThread(false)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#e5e7eb', color: '#667781' }}>
                Close
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 space-y-3">
              {loadingThread ? (
                <p className="text-xs" style={{ color: '#8696a0' }}>Loading thread...</p>
              ) : threadItems.length === 0 ? (
                <p className="text-xs" style={{ color: '#8696a0' }}>No thread data</p>
              ) : (
                threadItems.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3" style={{ borderColor: '#e5e7eb', background: item.direction === 'outbound' ? '#eff6ff' : '#f8fafc' }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold" style={{ color: '#3b4a54' }}>
                        {item.direction === 'outbound' ? 'You → ' : ''}{item.from_name || item.from_email}
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
    </div>
  );
}
