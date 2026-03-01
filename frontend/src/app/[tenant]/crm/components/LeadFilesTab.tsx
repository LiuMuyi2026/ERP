'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import NotionTable, { Column } from '@/components/ui/NotionTable';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
import FileDetailSlideOver from './FileDetailSlideOver';

type TenantUser = { id: string; email: string; full_name: string | null; role: string };
type Lead = { id: string; full_name: string; company?: string };

export type LeadFile = {
  id: string; lead_id: string; file_name: string; file_url: string;
  file_type?: string; file_size?: number; category: string;
  description?: string; tags?: string[];
  uploaded_by: string; created_at: string;
  lead_name?: string; customer_name?: string; uploader_name?: string;
  can_download?: boolean;
  involved_users?: { user_id: string; full_name: string; can_view: boolean; can_download: boolean }[];
  permissions?: { user_id: string; full_name: string; can_view: boolean; can_download: boolean }[];
};

const CATEGORIES = ['contract','quotation','inspection','shipping','invoice','correspondence','other'] as const;

const CAT_COLORS: Record<string, string> = {
  contract: 'bg-blue-100 text-blue-700',
  quotation: 'bg-purple-100 text-purple-700',
  inspection: 'bg-orange-100 text-orange-700',
  shipping: 'bg-green-100 text-green-700',
  invoice: 'bg-yellow-100 text-yellow-700',
  correspondence: 'bg-teal-100 text-teal-700',
  other: 'bg-gray-100 text-gray-600',
};

const CAT_LABEL_KEYS: Record<string, string> = {
  contract: 'catContract', quotation: 'catQuotation', inspection: 'catInspection',
  shipping: 'catShipping', invoice: 'catInvoice', correspondence: 'catCorrespondence', other: 'catOther',
};

export default function LeadFilesTab({
  users, leads,
}: {
  users: TenantUser[];
  leads: Lead[];
}) {
  const tCrm = useTranslations('crm');
  const tCommon = useTranslations('common');
  const me = getCurrentUser();
  const isAdmin = me?.role === 'tenant_admin' || me?.role === 'platform_admin';

  // Data
  const [files, setFiles] = useState<LeadFile[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterLead, setFilterLead] = useState('');
  const [filterUploader, setFilterUploader] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    lead_id: '', category: 'other', description: '', involved_user_ids: [] as string[],
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // SlideOver
  const [selectedFile, setSelectedFile] = useState<LeadFile | null>(null);

  // Lead search
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);
  const leadDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (leadDropdownRef.current && !leadDropdownRef.current.contains(e.target as Node)) setShowLeadDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredLeads = useMemo(() => {
    if (!leadSearch) return leads.slice(0, 20);
    const q = leadSearch.toLowerCase();
    return leads.filter(l => l.full_name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q)).slice(0, 20);
  }, [leads, leadSearch]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterLead) params.set('lead_id', filterLead);
      if (filterUploader) params.set('uploaded_by', filterUploader);
      if (filterDateFrom) params.set('date_from', filterDateFrom);
      if (filterDateTo) params.set('date_to', filterDateTo);
      const qs = params.toString();
      const data = await api.get(`/api/crm/lead-files${qs ? '?' + qs : ''}`);
      setFiles(Array.isArray(data) ? data : []);
    } catch { setFiles([]); }
    finally { setLoading(false); }
  }, [filterCategory, filterLead, filterUploader, filterDateFrom, filterDateTo]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile || !uploadForm.lead_id) return;
    setUploading(true);
    try {
      // Upload file first
      const uploadResult: any = await api.upload('/api/workspace/upload', uploadFile);
      // Create lead file record
      await api.post('/api/crm/lead-files', {
        lead_id: uploadForm.lead_id,
        file_name: uploadFile.name,
        file_url: uploadResult.url,
        file_type: uploadFile.type || null,
        file_size: uploadFile.size,
        category: uploadForm.category,
        description: uploadForm.description || null,
        involved_user_ids: uploadForm.involved_user_ids.length ? uploadForm.involved_user_ids : null,
      });
      setShowUpload(false);
      setUploadFile(null);
      setUploadForm({ lead_id: '', category: 'other', description: '', involved_user_ids: [] });
      setLeadSearch('');
      await loadFiles();
    } catch (err: any) { alert(err.message || 'Upload failed'); }
    finally { setUploading(false); }
  }

  async function handleDelete(fileId: string) {
    if (!confirm(tCommon('delete') + '?')) return;
    try {
      await api.delete(`/api/crm/lead-files/${fileId}`);
      await loadFiles();
    } catch (err: any) { alert(err.message); }
  }

  async function openDetail(file: LeadFile) {
    try {
      const detail = await api.get(`/api/crm/lead-files/${file.id}`);
      setSelectedFile(detail);
    } catch {
      setSelectedFile(file);
    }
  }

  const selectedLeadName = useMemo(() => {
    if (!filterLead) return '';
    return leads.find(l => l.id === filterLead)?.full_name || '';
  }, [filterLead, leads]);

  const columns: Column<LeadFile>[] = useMemo(() => [
    {
      key: 'file_name', label: tCrm('fileName'), width: '200px',
      render: (v: any) => (
        <span className="flex items-center gap-1.5">
          <HandIcon name="document" size={14} />
          <span className="truncate">{v}</span>
        </span>
      ),
    },
    {
      key: 'category', label: tCrm('fileCategory'), width: '90px',
      render: (v: any) => (
        <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${CAT_COLORS[v] || CAT_COLORS.other}`}>
          {tCrm(CAT_LABEL_KEYS[v] as any || 'catOther')}
        </span>
      ),
    },
    { key: 'lead_name', label: tCrm('fileLead'), width: '120px' },
    { key: 'customer_name', label: tCrm('fileCustomer'), width: '120px', render: (v: any) => v || '—' },
    {
      key: 'involved_users', label: tCrm('fileInvolved'), width: '140px',
      render: (_v: any, row: LeadFile) => {
        const users = row.involved_users || [];
        if (!users.length) return <span style={{ color: 'var(--notion-text-muted)' }}>—</span>;
        const show = users.slice(0, 3);
        const rest = users.length - 3;
        return (
          <span className="flex items-center gap-1 flex-wrap">
            {show.map(u => (
              <span key={u.user_id} className="text-[11px] px-1.5 py-0.5 rounded border truncate max-w-[80px]"
                style={{ borderColor: 'var(--notion-border)' }}>
                {u.full_name}
              </span>
            ))}
            {rest > 0 && <span className="text-[11px]" style={{ color: 'var(--notion-text-muted)' }}>+{rest}</span>}
          </span>
        );
      },
    },
    { key: 'uploader_name', label: tCrm('fileUploader'), width: '100px' },
    {
      key: 'created_at', label: tCrm('fileDate'), width: '100px', type: 'date' as const,
      render: (v: any) => v?.slice(0, 10) || '—',
    },
  ], [tCrm]);

  // Upload lead search
  const [uploadLeadSearch, setUploadLeadSearch] = useState('');
  const [showUploadLeadDropdown, setShowUploadLeadDropdown] = useState(false);
  const uploadLeadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (uploadLeadRef.current && !uploadLeadRef.current.contains(e.target as Node)) setShowUploadLeadDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const uploadFilteredLeads = useMemo(() => {
    if (!uploadLeadSearch) return leads.slice(0, 20);
    const q = uploadLeadSearch.toLowerCase();
    return leads.filter(l => l.full_name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q)).slice(0, 20);
  }, [leads, uploadLeadSearch]);

  const uploadSelectedLeadName = useMemo(() => {
    if (!uploadForm.lead_id) return '';
    return leads.find(l => l.id === uploadForm.lead_id)?.full_name || '';
  }, [uploadForm.lead_id, leads]);

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', background: 'white' }}>
          <option value="">{tCrm('allCategories')}</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{tCrm(CAT_LABEL_KEYS[c] as any)}</option>)}
        </select>

        {/* Lead filter with search */}
        <div className="relative" ref={leadDropdownRef}>
          <button onClick={() => setShowLeadDropdown(!showLeadDropdown)}
            className="px-3 py-1.5 rounded-md text-sm border flex items-center gap-1"
            style={{ borderColor: 'var(--notion-border)', background: 'white', minWidth: 120 }}>
            {filterLead ? selectedLeadName : tCrm('allLeads')}
            <span className="text-[10px] ml-auto">▾</span>
          </button>
          {showLeadDropdown && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border z-50 max-h-[300px] overflow-auto"
              style={{ borderColor: 'var(--notion-border)' }}>
              <div className="p-2 border-b" style={{ borderColor: 'var(--notion-border)' }}>
                <input type="text" placeholder={tCommon('search')} value={leadSearch}
                  onChange={e => setLeadSearch(e.target.value)} autoFocus
                  className="w-full px-2 py-1 text-sm rounded border" style={{ borderColor: 'var(--notion-border)' }} />
              </div>
              <button onClick={() => { setFilterLead(''); setShowLeadDropdown(false); setLeadSearch(''); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">
                {tCrm('allLeads')}
              </button>
              {filteredLeads.map(l => (
                <button key={l.id} onClick={() => { setFilterLead(l.id); setShowLeadDropdown(false); setLeadSearch(''); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 truncate"
                  style={{ color: filterLead === l.id ? 'var(--notion-accent)' : undefined }}>
                  {l.full_name} {l.company ? `(${l.company})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <select value={filterUploader} onChange={e => setFilterUploader(e.target.value)}
          className="px-3 py-1.5 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', background: 'white' }}>
          <option value="">{tCrm('allUploaders')}</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
        </select>

        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
          className="px-3 py-1.5 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)' }} />
        <span className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>—</span>
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
          className="px-3 py-1.5 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)' }} />

        <button onClick={() => setShowUpload(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
          style={{ background: '#7c3aed' }}>
          + {tCrm('fileUpload')}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
          {tCommon('loading')}
        </div>
      ) : (
        <NotionTable
          columns={columns}
          data={files}
          onRowClick={openDetail}
          emptyMessage={tCrm('noFiles')}
          rowActions={(r: LeadFile) => (
            <div className="flex items-center gap-1">
              {(r.can_download || isAdmin) && (
                <button className="px-2 py-1 rounded text-xs border whitespace-nowrap"
                  style={{ borderColor: 'var(--notion-border)' }}
                  onClick={e => { e.stopPropagation(); window.open(r.file_url, '_blank'); }}>
                  {tCrm('downloadFile')}
                </button>
              )}
              {isAdmin && (
                <button className="px-2 py-1 rounded text-xs border whitespace-nowrap text-red-600"
                  style={{ borderColor: 'var(--notion-border)' }}
                  onClick={e => { e.stopPropagation(); handleDelete(r.id); }}>
                  {tCommon('delete')}
                </button>
              )}
            </div>
          )}
        />
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowUpload(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[500px] max-h-[90vh] overflow-auto"
            style={{ border: '1px solid var(--notion-border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--notion-text)' }}>{tCrm('fileUpload')}</h3>
              <button onClick={() => setShowUpload(false)} className="text-lg" style={{ color: 'var(--notion-text-muted)' }}>✕</button>
            </div>
            <form onSubmit={handleUpload} className="px-6 py-4 space-y-3">
              {/* Lead selection with search */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('selectLead')} *</label>
                <div className="relative" ref={uploadLeadRef}>
                  <input type="text"
                    placeholder={tCrm('selectLead')}
                    value={uploadForm.lead_id ? uploadSelectedLeadName : uploadLeadSearch}
                    onChange={e => {
                      setUploadLeadSearch(e.target.value);
                      setUploadForm(f => ({ ...f, lead_id: '' }));
                      setShowUploadLeadDropdown(true);
                    }}
                    onFocus={() => setShowUploadLeadDropdown(true)}
                    className="w-full px-3 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)' }} />
                  {uploadForm.lead_id && (
                    <button type="button" onClick={() => { setUploadForm(f => ({ ...f, lead_id: '' })); setUploadLeadSearch(''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--notion-text-muted)' }}>✕</button>
                  )}
                  {showUploadLeadDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-lg shadow-lg border z-50 max-h-[200px] overflow-auto"
                      style={{ borderColor: 'var(--notion-border)' }}>
                      {uploadFilteredLeads.map(l => (
                        <button key={l.id} type="button"
                          onClick={() => {
                            setUploadForm(f => ({ ...f, lead_id: l.id }));
                            setUploadLeadSearch('');
                            setShowUploadLeadDropdown(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 truncate">
                          {l.full_name} {l.company ? `(${l.company})` : ''}
                        </button>
                      ))}
                      {uploadFilteredLeads.length === 0 && (
                        <p className="px-3 py-2 text-sm" style={{ color: 'var(--notion-text-muted)' }}>No results</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* File input */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileName')} *</label>
                <input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-sm" />
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('selectCategory')}</label>
                <select value={uploadForm.category} onChange={e => setUploadForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md text-sm border" style={{ borderColor: 'var(--notion-border)', background: 'white' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{tCrm(CAT_LABEL_KEYS[c] as any)}</option>)}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('fileDescription')}</label>
                <textarea value={uploadForm.description} onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 rounded-md text-sm border resize-none" style={{ borderColor: 'var(--notion-border)' }} />
              </div>

              {/* Involved users multi-select */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--notion-text-muted)' }}>{tCrm('selectUsers')}</label>
                <div className="border rounded-md p-2 max-h-[150px] overflow-auto space-y-1" style={{ borderColor: 'var(--notion-border)' }}>
                  {users.map(u => (
                    <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                      <input type="checkbox"
                        checked={uploadForm.involved_user_ids.includes(u.id)}
                        onChange={() => {
                          setUploadForm(f => ({
                            ...f,
                            involved_user_ids: f.involved_user_ids.includes(u.id)
                              ? f.involved_user_ids.filter(x => x !== u.id)
                              : [...f.involved_user_ids, u.id],
                          }));
                        }} />
                      {u.full_name || u.email}
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowUpload(false)}
                  className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: 'var(--notion-border)' }}>
                  {tCommon('cancel')}
                </button>
                <button type="submit" disabled={uploading || !uploadFile || !uploadForm.lead_id}
                  className="px-4 py-1.5 rounded text-white text-sm disabled:opacity-40"
                  style={{ background: '#7c3aed' }}>
                  {uploading ? tCrm('uploading') : tCrm('fileUpload')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Detail SlideOver */}
      <FileDetailSlideOver
        file={selectedFile}
        open={!!selectedFile}
        onClose={() => setSelectedFile(null)}
        isAdmin={isAdmin}
        users={users}
        onUpdate={() => { loadFiles(); setSelectedFile(null); }}
      />
    </div>
  );
}
