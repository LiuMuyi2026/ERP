'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
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
  const [folder, setFolder] = useState<Folder>('inbox');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Lead linking
  const [linkingEmail, setLinkingEmail] = useState<string | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<any[]>([]);

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = folder === 'inbox' ? '/api/email/inbox' : '/api/email/sent';
      const params = new URLSearchParams({ page: String(page), page_size: '50' });
      if (search) params.set('search', search);
      const data = await api.get(`${endpoint}?${params}`);
      setEmails(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [folder, page, search]);

  useEffect(() => { loadEmails(); }, [loadEmails]);

  async function handleSelectEmail(email: EmailItem) {
    try {
      const detail = await api.get(`/api/email/${email.id}`);
      setSelectedEmail(detail);
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
    } catch { setLeadResults([]); }
  }

  async function linkToLead(emailId: string, leadId: string) {
    try {
      await api.patch(`/api/email/${emailId}/link`, { lead_id: leadId });
      toast.success('Linked');
      setLinkingEmail(null);
      loadEmails();
    } catch { toast.error('Failed to link'); }
  }

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
          <div className="flex-1" />
          <button onClick={handleCompose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: '#3b82f6' }}>
            + {t('emailCompose') || 'Compose'}
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 flex-shrink-0">
          <input type="text" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search emails..."
            className="w-full text-xs border rounded-lg px-3 py-2 outline-none"
            style={{ borderColor: '#e5e7eb' }} />
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-8 text-xs" style={{ color: '#8696a0' }}>Loading...</div>
          ) : emails.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📧</div>
              <p className="text-xs" style={{ color: '#8696a0' }}>
                {t('emailNoMessages') || 'No emails'}
              </p>
            </div>
          ) : (
            emails.map((email) => {
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
            onReply={handleReply}
            onForward={handleForward}
            onLinkCustomer={() => setLinkingEmail(selectedEmail.id)}
            onBack={() => { setViewMode('list'); setSelectedEmail(null); }}
          />
        )}

        {viewMode === 'compose' && (
          <EmailComposer
            defaultTo={selectedEmail?.to_email}
            defaultSubject={selectedEmail?.subject}
            onSent={handleSent}
            onCancel={() => { setViewMode('list'); setSelectedEmail(null); }}
          />
        )}

        {viewMode === 'reply' && selectedEmail && (
          <EmailComposer
            replyTo={selectedEmail}
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
    </div>
  );
}
