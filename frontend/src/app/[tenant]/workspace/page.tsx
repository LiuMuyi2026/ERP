'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useLocale, useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';
import TemplateGallery from '@/components/workspace/TemplateGallery';
import { HandIcon } from '@/components/ui/HandIcon';
import { IconOrEmoji } from '@/components/ui/IconOrEmoji';
import { WS_ICON_LIST } from '@/lib/icon-map';

const SharePanel = dynamic(() => import('@/components/workspace/SharePanel'), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
interface Workspace {
  id: string;
  name: string;
  visibility: 'private' | 'team';
  icon: string;
  description: string;
  owner_id: string;
  is_owned?: boolean;
}

interface Page {
  id: string;
  workspace_id: string;
  parent_page_id: string | null;
  title: string;
  icon: string | null;
  content_type: string | null;  // 'task_tracker' | 'voice_memo' | null
  updated_at: string;
  created_at: string;
  child_count?: number;
}

interface TodoOverviewItem {
  page: Page;
  total: number;
  done: number;
}

interface Breadcrumb {
  id: string | null; // null = root
  title: string;
}

interface Member {
  user_id: string;
  full_name: string;
  email: string;
  title?: string;
  role: string;
}

interface Employee {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  title: string;
}

type ViewMode = 'list' | 'grid';
type SortField = 'updated_at' | 'created_at' | 'title';
type SortDir = 'desc' | 'asc';
type ContentFilter = '' | 'task_tracker' | 'voice_memo';

const PAGE_SIZE = 30;
const WS_ICON_LIST_LOCAL = WS_ICON_LIST;

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(iso: string, tw: (key: any, params?: any) => string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return tw('justNow');
  if (diff < 3600) return tw('minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return tw('hoursAgo', { n: Math.floor(diff / 3600) });
  if (diff < 86400 * 7) return tw('daysAgo', { n: Math.floor(diff / 86400) });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function contentTypeBadge(ct: string | null, tw: (key: any) => string) {
  if (ct === 'task_tracker') return { label: tw('taskTracker'), color: '#74819e', bg: 'rgba(116,129,158,0.1)' };
  if (ct === 'voice_memo')   return { label: tw('voiceMemoType'), color: '#b57070', bg: 'rgba(181,112,112,0.09)' };
  return { label: tw('document'), color: '#0284c7', bg: 'rgba(2,132,199,0.09)' };
}

function contentTypeIcon(ct: string | null): string | null {
  if (ct === 'task_tracker') return 'checkmark';
  if (ct === 'voice_memo')   return 'megaphone';
  return null;
}

function buildMonthCells(base = new Date()) {
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const tWorkspace = useTranslations('workspace');
  const tCommon = useTranslations('common');

  // Workspaces
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [wsLoading, setWsLoading] = useState(true);

  // File browser state
  const [pages, setPages]     = useState<Page[]>([]);
  const [total, setTotal]     = useState(0);
  const [skip, setSkip]       = useState(0);
  const [loadingPages, setLoadingPages] = useState(false);
  const [homeLoading, setHomeLoading] = useState(false);
  const [recentPages, setRecentPages] = useState<Page[]>([]);
  const [calendarPages, setCalendarPages] = useState<Page[]>([]);
  const [todoOverview, setTodoOverview] = useState<TodoOverviewItem[]>([]);

  // Controls
  const [search, setSearch]             = useState('');
  const [viewMode, setViewMode]         = useState<ViewMode>('list');
  const [sortField, setSortField]       = useState<SortField>('updated_at');
  const [sortDir, setSortDir]           = useState<SortDir>('desc');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Selection & clipboard
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [clipboard, setClipboard]       = useState<Page[]>([]);

  // Per-row action menu
  const [menuPageId, setMenuPageId]     = useState<string | null>(null);

  // Share panel
  const [sharePageId, setSharePageId]   = useState<string | null>(null);
  const [shareTitle, setShareTitle]     = useState('');

  // Template gallery
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);

  // Folder navigation
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, title: tWorkspace('rootFolder') }]);

  // Workspace management
  const [showNewTeamWs, setShowNewTeamWs] = useState(false);
  const [newWsName, setNewWsName]       = useState('');
  const [newWsIcon, setNewWsIcon]       = useState('folder');
  const [newWsDesc, setNewWsDesc]       = useState('');
  const [editWs, setEditWs]             = useState<Workspace | null>(null);
  const [editWsName, setEditWsName]     = useState('');
  const [editWsIcon, setEditWsIcon]     = useState('folder');
  const [editWsDesc, setEditWsDesc]     = useState('');
  const [deleteWs, setDeleteWs]         = useState<Workspace | null>(null);
  const [pendingDeletePageIds, setPendingDeletePageIds] = useState<string[] | null>(null);
  const [pendingDeleteText, setPendingDeleteText] = useState('');

  // Member management
  const [memberWs, setMemberWs]         = useState<Workspace | null>(null);
  const [members, setMembers]           = useState<Member[]>([]);
  const [employees, setEmployees]       = useState<Employee[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const homeLabels = {
    home: tWorkspace('homeHome'),
    recent: tWorkspace('homeRecent'),
    calendar: tWorkspace('homeCalendar'),
    todos: tWorkspace('homeTodos'),
    createCalendar: tWorkspace('homeCreateCalendar'),
    createTodo: tWorkspace('homeCreateTodo'),
    open: tWorkspace('openPage'),
    emptyRecent: tWorkspace('homeEmptyRecent'),
    emptyCalendar: tWorkspace('homeEmptyCalendar'),
    emptyTodos: tWorkspace('homeEmptyTodos'),
    loading: tWorkspace('loadingMembers'),
    today: tWorkspace('homeToday'),
  };
  const opFailed = tWorkspace('operationFailed');

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadWorkspaces = useCallback(async () => {
    try {
      await api.post('/api/workspace/setup', {}).catch(() => {});
      const wsList: Workspace[] = await api.get('/api/workspace/workspaces');
      setWorkspaces(wsList);
      return wsList;
    } catch { return []; }
    finally { setWsLoading(false); }
  }, []);

  const loadPages = useCallback(async (wsId: string, newSkip = 0, append = false, parentId?: string | null) => {
    setLoadingPages(true);
    try {
      const effectiveParent = parentId !== undefined ? parentId : currentParentId;
      // When searching, search across all levels; otherwise filter by parent
      const parentParam = search.trim() ? '' : (effectiveParent ?? 'root');
      const params = new URLSearchParams({
        search,
        sort: sortField,
        sort_dir: sortDir,
        skip: String(newSkip),
        limit: String(PAGE_SIZE),
        ...(parentParam ? { parent: parentParam } : {}),
        ...(contentFilter ? { content_type: contentFilter } : {}),
      });
      const res = await api.get(`/api/workspace/workspaces/${wsId}/pages?${params}`);
      const newPages: Page[] = res.pages ?? [];
      setTotal(res.total ?? 0);
      setPages(prev => append ? [...prev, ...newPages] : newPages);
      setSkip(newSkip + newPages.length);
    } catch { }
    finally { setLoadingPages(false); }
  }, [search, sortField, sortDir, contentFilter, currentParentId]);

  const loadHomeData = useCallback(async (wsId: string) => {
    setHomeLoading(true);
    try {
      const [recentRes, allRes, todoRes] = await Promise.all([
        api.get(`/api/workspace/workspaces/${wsId}/pages?sort=updated_at&sort_dir=desc&skip=0&limit=8&parent=`),
        api.get(`/api/workspace/workspaces/${wsId}/pages?sort=updated_at&sort_dir=desc&skip=0&limit=40&parent=`),
        api.get(`/api/workspace/workspaces/${wsId}/pages?sort=updated_at&sort_dir=desc&skip=0&limit=6&content_type=task_tracker&parent=`),
      ]);

      const recent = Array.isArray(recentRes?.pages) ? recentRes.pages as Page[] : [];
      const allPages = Array.isArray(allRes?.pages) ? allRes.pages as Page[] : [];
      const todos = Array.isArray(todoRes?.pages) ? todoRes.pages as Page[] : [];
      setRecentPages(recent);

      const calKeywords = /(calendar|schedule|timeline|roadmap|日历|排期|行程|计划)/i;
      setCalendarPages(allPages.filter(p => calKeywords.test(String(p.title || ''))).slice(0, 6));

      const todoDetails = await Promise.all(todos.map(async (p) => {
        try {
          const full = await api.get(`/api/workspace/pages/${p.id}`);
          const tasks = Array.isArray(full?.content?._tasks) ? full.content._tasks : [];
          const done = tasks.filter((x: any) => ['done', 'completed'].includes(String(x?.status || '').toLowerCase())).length;
          return { page: p, total: tasks.length, done };
        } catch {
          return { page: p, total: 0, done: 0 };
        }
      }));
      setTodoOverview(todoDetails);
    } catch {
      setRecentPages([]);
      setCalendarPages([]);
      setTodoOverview([]);
    } finally {
      setHomeLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadWorkspaces().then(wsList => {
      const wsParam = searchParams.get('ws');
      const target = wsParam
        ? wsList.find(w => w.id === wsParam)
        : wsList.find(w => w.visibility === 'private') ?? wsList[0];
      if (target) setActiveWsId(target.id);
    });
  }, []); // eslint-disable-line

  // Sync activeWsId when URL ws param changes (e.g. sidebar navigation)
  useEffect(() => {
    const wsParam = searchParams.get('ws');
    if (wsParam && wsParam !== activeWsId && workspaces.some(w => w.id === wsParam)) {
      setActiveWsId(wsParam);
    }
  }, [searchParams]); // eslint-disable-line

  // Reload pages when workspace / filters change
  useEffect(() => {
    if (!activeWsId) return;
    setSelectedIds(new Set());
    loadPages(activeWsId, 0, false);
    loadHomeData(activeWsId);
  }, [activeWsId, sortField, sortDir, contentFilter, currentParentId]); // eslint-disable-line

  // Reset folder navigation when switching workspaces
  useEffect(() => {
    setCurrentParentId(null);
    setBreadcrumbs([{ id: null, title: tWorkspace('rootFolder') }]);
  }, [activeWsId, tWorkspace]);

  // Debounce search
  useEffect(() => {
    if (!activeWsId) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadPages(activeWsId, 0, false);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]); // eslint-disable-line

  // Sync URL ws param when active workspace changes
  useEffect(() => {
    if (!activeWsId) return;
    const current = searchParams.get('ws');
    if (current !== activeWsId) {
      router.replace(`/${tenant}/workspace?ws=${activeWsId}`, { scroll: false });
    }
  }, [activeWsId]); // eslint-disable-line

  // ── Page actions ──────────────────────────────────────────────────────────

  async function createFromTemplate(templateId: string, templateTitle: string) {
    if (!activeWsId) return;
    setShowTemplateGallery(false);
    try {
      const page = await api.post(`/api/workspace/templates/${templateId}/use`, {
        workspace_id: activeWsId, title: templateTitle,
        lang: locale,
        ...(currentParentId ? { parent_page_id: currentParentId } : {}),
      });
      window.dispatchEvent(new CustomEvent('workspace-changed'));
      await loadPages(activeWsId, 0, false);
      router.push(`/${tenant}/workspace/${page.id}`);
    } catch (err: any) { toast.error(err?.message || opFailed); }
  }

  async function createBlankPage() {
    if (!activeWsId) return;
    setShowTemplateGallery(false);
    try {
      const page = await api.post('/api/workspace/pages', {
        workspace_id: activeWsId, title: tWorkspace('newBlankPage'), icon: null,
        ...(currentParentId ? { parent_page_id: currentParentId } : {}),
      });
      window.dispatchEvent(new CustomEvent('workspace-changed'));
      await loadPages(activeWsId, 0, false);
      router.push(`/${tenant}/workspace/${page.id}`);
    } catch (err: any) { toast.error(err?.message || opFailed); }
  }

  async function createCalendarPage() {
    if (!activeWsId) return;
    try {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const calendarTitle = tWorkspace('homeCalendarTitleWithMonth', { month: monthKey });
      const viewTitle = tWorkspace('homeCalendar');
      const fieldTitle = tWorkspace('homeCalendarFieldEvent');
      const fieldDate = tWorkspace('homeCalendarFieldDate');
      const fieldOwner = tWorkspace('homeCalendarFieldOwner');
      const fieldStatus = tWorkspace('homeCalendarFieldStatus');
      const fieldNotes = tWorkspace('homeCalendarFieldNotes');
      const statusPlanned = tWorkspace('homeCalendarStatusPlanned');
      const statusInProgress = tWorkspace('homeCalendarStatusInProgress');
      const statusDone = tWorkspace('homeCalendarStatusDone');
      const page = await api.post('/api/workspace/pages', {
        workspace_id: activeWsId,
        title: calendarTitle,
        icon: '📅',
        content: {
          _views: [
            {
              id: 'calendar',
              type: 'database',
              title: viewTitle,
              icon: '📅',
              dbData: {
                schema: {
                  columns: [
                    { key: 'title', title: fieldTitle, type: 'title' },
                    { key: 'date', title: fieldDate, type: 'date' },
                    { key: 'owner', title: fieldOwner, type: 'text' },
                    { key: 'status', title: fieldStatus, type: 'status', options: [{ value: statusPlanned }, { value: statusInProgress }, { value: statusDone }] },
                    { key: 'notes', title: fieldNotes, type: 'text' },
                  ],
                  groupBy: 'status',
                  dateField: 'date',
                },
                rows: [],
              },
            },
          ],
        },
      });
      await loadHomeData(activeWsId);
      await loadPages(activeWsId, 0, false);
      router.push(`/${tenant}/workspace/${page.id}`);
    } catch (err: any) {
      toast.error(err?.message || tWorkspace('homeCreateCalendarFailed'));
    }
  }

  async function createWorkspaceTodoPage() {
    if (!activeWsId) return;
    try {
      const page = await api.post('/api/workspace/pages', {
        workspace_id: activeWsId,
        title: tWorkspace('homeTodos'),
        icon: '✅',
        content: { _type: 'task_tracker', _tasks: [] },
      });
      await loadHomeData(activeWsId);
      await loadPages(activeWsId, 0, false);
      router.push(`/${tenant}/workspace/${page.id}`);
    } catch (err: any) {
      toast.error(err?.message || tWorkspace('homeCreateTodoFailed'));
    }
  }

  async function duplicatePage(pageId: string) {
    if (!activeWsId) return;
    setMenuPageId(null);
    try {
      await api.post(`/api/workspace/pages/${pageId}/copy-to`, {
        target_workspace_id: activeWsId,
      });
      await loadPages(activeWsId, 0, false);
    } catch (err: any) { toast.error(err?.message || opFailed); }
  }

  async function deletePage(pageId: string) {
    setMenuPageId(null);
    setPendingDeletePageIds([pageId]);
    setPendingDeleteText(tWorkspace('confirmDeletePage'));
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setPendingDeletePageIds(ids);
    setPendingDeleteText(tWorkspace('confirmDeletePages', { n: ids.length }));
  }

  async function confirmDeletePagesAction() {
    if (!pendingDeletePageIds || pendingDeletePageIds.length === 0) return;
    const ids = [...pendingDeletePageIds];
    setPendingDeletePageIds(null);
    for (const id of ids) {
      try { await api.patch(`/api/workspace/pages/${id}`, { is_archived: true }); } catch {}
    }
    const deletedSet = new Set(ids);
    setPages(prev => prev.filter(p => !deletedSet.has(p.id)));
    setTotal(t => t - ids.length);
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }

  function copySelected() {
    const toCopy = pages.filter(p => selectedIds.has(p.id));
    setClipboard(toCopy);
    setSelectedIds(new Set());
  }

  async function pasteClipboard() {
    if (!activeWsId || clipboard.length === 0) return;
    for (const page of clipboard) {
      try {
        await api.post(`/api/workspace/pages/${page.id}/copy-to`, {
          target_workspace_id: activeWsId,
        });
      } catch {}
    }
    setClipboard([]);
    await loadPages(activeWsId, 0, false);
  }

  // ── Folder navigation ────────────────────────────────────────────────────
  function navigateToFolder(page: Page) {
    setCurrentParentId(page.id);
    setBreadcrumbs(prev => [...prev, { id: page.id, title: page.title || tWorkspace('untitled') }]);
    setSelectedIds(new Set());
  }

  function navigateToBreadcrumb(index: number) {
    const crumb = breadcrumbs[index];
    setCurrentParentId(crumb.id);
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setSelectedIds(new Set());
  }

  async function createSubPage(parentPageId: string) {
    if (!activeWsId) return;
    setMenuPageId(null);
    try {
      const page = await api.post('/api/workspace/pages', {
        workspace_id: activeWsId, title: tWorkspace('newBlankPage'), icon: null,
        parent_page_id: parentPageId,
      });
      window.dispatchEvent(new CustomEvent('workspace-changed'));
      // If we're currently viewing this parent, reload
      if (currentParentId === parentPageId) {
        await loadPages(activeWsId, 0, false);
      } else {
        // Navigate into the parent and then the new page is there
        await loadPages(activeWsId, 0, false);
      }
      router.push(`/${tenant}/workspace/${page.id}`);
    } catch (err: any) { toast.error(err?.message || opFailed); }
  }

  // ── Workspace actions ──────────────────────────────────────────────────────

  async function createTeamWorkspace() {
    if (!newWsName.trim()) return;
    try {
      const ws = await api.post('/api/workspace/workspaces', {
        name: newWsName.trim(), visibility: 'team', icon: newWsIcon,
        description: newWsDesc.trim() || undefined,
      });
      const full: Workspace = { ...ws, description: newWsDesc.trim(), owner_id: '', is_owned: true };
      setWorkspaces(prev => [...prev, full]);
      setActiveWsId(ws.id);
      setShowNewTeamWs(false);
      setNewWsName(''); setNewWsIcon('folder'); setNewWsDesc('');
      window.dispatchEvent(new CustomEvent('workspace-changed'));
    } catch (err: any) { toast.error(err?.message || opFailed); }
  }

  async function saveEdit() {
    if (!editWs) return;
    try {
      await api.patch(`/api/workspace/workspaces/${editWs.id}`, {
        name: editWsName.trim() || editWs.name,
        icon: editWsIcon, description: editWsDesc,
      });
      setWorkspaces(prev => prev.map(w => w.id === editWs.id
        ? { ...w, name: editWsName.trim() || w.name, icon: editWsIcon, description: editWsDesc } : w));
      setEditWs(null);
      window.dispatchEvent(new CustomEvent('workspace-changed'));
    } catch (err: any) { toast.error(err?.message || opFailed); }
  }

  async function confirmDeleteWs() {
    if (!deleteWs) return;
    try {
      await api.delete(`/api/workspace/workspaces/${deleteWs.id}`);
      const remaining = workspaces.filter(w => w.id !== deleteWs.id);
      setWorkspaces(remaining);
      if (activeWsId === deleteWs.id) setActiveWsId(remaining[0]?.id ?? null);
      setDeleteWs(null);
      // Notify sidebar to refresh its tree
      window.dispatchEvent(new CustomEvent('workspace-changed'));
    } catch (err: any) { toast.error(err?.message || opFailed); }
  }

  async function openMembers(ws: Workspace) {
    setMemberWs(ws); setMemberSearch('');
    try {
      const [mems, emps] = await Promise.all([
        api.get(`/api/workspace/workspaces/${ws.id}/members`).catch(() => []),
        api.get('/api/hr/employees').catch(() => []),
      ]);
      setMembers(Array.isArray(mems) ? mems : []);
      setEmployees(Array.isArray(emps) ? emps : []);
    } catch {}
  }

  async function addMember(empUserId: string, emp: Employee) {
    if (!memberWs) return;
    setAddingMember(true);
    try {
      await api.post(`/api/workspace/workspaces/${memberWs.id}/members`, { user_id: empUserId, role: 'editor' });
      setMembers(prev => [...prev.filter(m => m.user_id !== empUserId),
        { user_id: empUserId, full_name: emp.full_name, email: emp.email, title: emp.title || '', role: 'editor' }]);
    } catch (err: any) { toast.error(err?.message || opFailed); }
    finally { setAddingMember(false); }
  }

  async function removeMember(userId: string) {
    if (!memberWs) return;
    try {
      await api.delete(`/api/workspace/workspaces/${memberWs.id}/members/${userId}`);
      setMembers(prev => prev.filter(m => m.user_id !== userId));
    } catch (err: any) { toast.error(err?.message || opFailed); }
  }

  async function updateMemberRole(userId: string, role: string) {
    if (!memberWs) return;
    try {
      await api.post(`/api/workspace/workspaces/${memberWs.id}/members`, { user_id: userId, role });
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role } : m));
    } catch (err: any) { toast.error(err?.message || opFailed); }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const activeWorkspace = workspaces.find(w => w.id === activeWsId) ?? null;
  const isPrivateWs = activeWorkspace?.visibility === 'private';
  const memberIds = new Set(members.map(m => m.user_id));
  const filteredEmployees = employees.filter(e => {
    const uid = e.user_id || e.id;
    const q = memberSearch.toLowerCase();
    return !memberIds.has(uid) && (!q || e.full_name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
  });
  const hasMore = pages.length < total;
  const monthCells = buildMonthCells(new Date());

  const SORT_OPTIONS: { field: SortField; dir: SortDir; label: string }[] = [
    { field: 'updated_at', dir: 'desc', label: tWorkspace('sortRecentModified') },
    { field: 'updated_at', dir: 'asc',  label: tWorkspace('sortOldestModified') },
    { field: 'created_at', dir: 'desc', label: tWorkspace('sortNewestCreated') },
    { field: 'created_at', dir: 'asc',  label: tWorkspace('sortOldestCreated') },
    { field: 'title',      dir: 'asc',  label: tWorkspace('sortNameAZ') },
    { field: 'title',      dir: 'desc', label: tWorkspace('sortNameZA') },
  ];
  const activeSortLabel = SORT_OPTIONS.find(o => o.field === sortField && o.dir === sortDir)?.label ?? tWorkspace('sortRecentModified');

  const FILTER_OPTIONS: { value: ContentFilter; label: string }[] = [
    { value: '', label: tWorkspace('allTypes') },
    { value: 'task_tracker', label: tWorkspace('taskTracker') },
    { value: 'voice_memo', label: tWorkspace('voiceMemoType') },
  ];

  // ── Loading ────────────────────────────────────────────────────────────────

  if (wsLoading) return (
    <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--notion-text-muted)' }}>
      {tCommon('loading')}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--notion-bg)' }}>

      {/* ── Workspace Tab Bar ──────────────────────────────────────────── */}
      <div
        className="flex items-center flex-shrink-0 px-5 pt-2.5 gap-1"
        style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}
      >
        {workspaces.map(ws => {
          const active = activeWsId === ws.id;
          return (
            <button
              key={ws.id}
              onClick={() => setActiveWsId(ws.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] transition-all rounded-t-lg"
              style={{
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                borderBottom: `2px solid ${active ? '#74819e' : 'transparent'}`,
                background: active ? 'rgba(116,129,158,0.06)' : 'transparent',
                marginBottom: -1,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--notion-hover)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <IconOrEmoji value={ws.icon || (ws.visibility === 'private' ? 'lock' : 'building')} size={16} />
              <span className="truncate max-w-[120px]">{ws.name}</span>
              {ws.visibility === 'private' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                  style={{ background: 'rgba(116,129,158,0.1)', color: '#74819e' }}>{tWorkspace('private')}</span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setShowNewTeamWs(true)}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 mb-1 rounded-lg text-[11px] transition-colors"
          style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {tWorkspace('newWorkspace')}
        </button>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {!activeWorkspace ? (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="text-5xl"><HandIcon name="folder-open" size={48} /></div>
          <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('selectWorkspace')}</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">

          {/* ── Workspace header ── */}
          <div className="flex items-center gap-4 px-6 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{
                background: isPrivateWs
                  ? 'linear-gradient(135deg,#f5f3ff,#ece8df)'
                  : 'linear-gradient(135deg,#f2f4f0,#e5ebea)',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <IconOrEmoji value={activeWorkspace.icon || 'folder'} size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold truncate" style={{ color: 'var(--notion-text)' }}>
                  {activeWorkspace.name}
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                  style={{ background: isPrivateWs ? 'rgba(116,129,158,0.1)' : 'rgba(109,148,135,0.12)', color: isPrivateWs ? '#74819e' : '#6d9487' }}>
                  {isPrivateWs ? <><HandIcon name="lock" size={10} style={{ display: 'inline', marginRight: 2 }} /> {tWorkspace('private')}</> : <><HandIcon name="people-group" size={10} style={{ display: 'inline', marginRight: 2 }} /> {tWorkspace('team')}</>}
                </span>
              </div>
              {activeWorkspace.description && (
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--notion-text-muted)' }}>
                  {activeWorkspace.description}
                </p>
              )}
            </div>
            {/* Header action buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {!isPrivateWs && (
                <HdrBtn onClick={() => openMembers(activeWorkspace)} title={tWorkspace('memberManagement')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  {tWorkspace('memberManagement')}
                </HdrBtn>
              )}
              <HdrBtn onClick={() => { setEditWs(activeWorkspace); setEditWsName(activeWorkspace.name); setEditWsIcon(activeWorkspace.icon || 'folder'); setEditWsDesc(activeWorkspace.description || ''); }} title={tWorkspace('editWorkspace')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                {tCommon('edit')}
              </HdrBtn>
              {activeWorkspace.is_owned && (
                <HdrBtn onClick={() => setDeleteWs(activeWorkspace)} title={tWorkspace('deleteWorkspace')} danger>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  {tCommon('delete')}
                </HdrBtn>
              )}
            </div>
          </div>

          {/* ── Workspace Home ── */}
          <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-bg)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{homeLabels.home}</h2>
              <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{homeLabels.today}: {new Date().toLocaleDateString()}</span>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              <div className="rounded-2xl p-4" style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{homeLabels.recent}</p>
                </div>
                {homeLoading ? (
                  <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{homeLabels.loading}</p>
                ) : recentPages.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{homeLabels.emptyRecent}</p>
                ) : (
                  <div className="space-y-1.5">
                    {recentPages.slice(0, 5).map(p => (
                      <button key={p.id} onClick={() => router.push(`/${tenant}/workspace/${p.id}`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
                        style={{ background: 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <IconOrEmoji value={p.icon || contentTypeIcon(p.content_type) || 'document'} size={14} />
                        <span className="text-xs truncate flex-1" style={{ color: 'var(--notion-text)' }}>{p.title || tWorkspace('untitled')}</span>
                        <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{relativeTime(p.updated_at, tWorkspace)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl p-4" style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{homeLabels.calendar}</p>
                  <button onClick={createCalendarPage} className="text-xs px-2.5 py-1 rounded-md"
                    style={{ color: '#5e7688', background: 'rgba(37,99,235,0.08)' }}>{homeLabels.createCalendar}</button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                    <div key={d} className="text-[11px] text-center" style={{ color: 'var(--notion-text-muted)' }}>{d}</div>
                  ))}
                  {monthCells.map((d, i) => (
                    <div key={`${d}-${i}`} className="text-[11px] text-center py-1 rounded"
                      style={{
                        color: d ? 'var(--notion-text)' : 'transparent',
                        background: d === new Date().getDate() ? 'rgba(116,129,158,0.12)' : 'transparent',
                        fontWeight: d === new Date().getDate() ? 700 : 400,
                      }}>
                      {d || '-'}
                    </div>
                  ))}
                </div>
                {homeLoading ? (
                  <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{homeLabels.loading}</p>
                ) : calendarPages.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{homeLabels.emptyCalendar}</p>
                ) : (
                  <div className="space-y-1.5">
                    {calendarPages.slice(0, 3).map(p => (
                      <button key={p.id} onClick={() => router.push(`/${tenant}/workspace/${p.id}`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
                        style={{ background: 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <IconOrEmoji value={p.icon || '📅'} size={14} />
                        <span className="text-xs truncate flex-1" style={{ color: 'var(--notion-text)' }}>{p.title || tWorkspace('untitled')}</span>
                        <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{homeLabels.open}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl p-4" style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{homeLabels.todos}</p>
                  <button onClick={createWorkspaceTodoPage} className="text-xs px-2.5 py-1 rounded-md"
                    style={{ color: '#6d9487', background: 'rgba(5,150,105,0.09)' }}>{homeLabels.createTodo}</button>
                </div>
                {homeLoading ? (
                  <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{homeLabels.loading}</p>
                ) : todoOverview.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{homeLabels.emptyTodos}</p>
                ) : (
                  <div className="space-y-2">
                    {todoOverview.map(item => {
                      const pct = item.total > 0 ? Math.round((item.done / item.total) * 100) : 0;
                      return (
                        <button key={item.page.id} onClick={() => router.push(`/${tenant}/workspace/${item.page.id}`)}
                          className="w-full text-left px-2 py-1.5 rounded-lg transition-colors"
                          style={{ background: 'transparent' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs truncate" style={{ color: 'var(--notion-text)' }}>{item.page.title || tWorkspace('untitled')}</span>
                            <span className="text-[10px]" style={{ color: 'var(--notion-text-muted)' }}>{item.done}/{item.total}</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 999, background: 'var(--notion-hover)' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: '#7ca493' }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── File browser toolbar ── */}
          <div className="flex items-center gap-2 px-3 sm:px-6 py-2.5 flex-shrink-0 flex-wrap"
            style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>

            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg flex-1 min-w-0 max-w-full sm:min-w-[180px] sm:max-w-[320px]"
              style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tWorkspace('searchFiles')}
                className="flex-1 text-sm outline-none bg-transparent"
                style={{ color: 'var(--notion-text)' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ color: 'var(--notion-text-muted)', fontSize: 11 }}>✕</button>
              )}
            </div>

            {/* New page */}
            <button
              onClick={() => setShowTemplateGallery(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-all flex-shrink-0"
              style={{ background: '#74819e', boxShadow: '0 1px 3px rgba(116,129,158,0.3)' }}
              onMouseEnter={e => e.currentTarget.style.background = '#64708b'}
              onMouseLeave={e => e.currentTarget.style.background = '#74819e'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {tWorkspace('newBtn')}
            </button>

            {/* Sort */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => { setShowSortMenu(v => !v); setShowFilterMenu(false); }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)', background: showSortMenu ? 'var(--notion-hover)' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                onMouseLeave={e => { if (!showSortMenu) e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5h10M11 9h7M11 13h4"/><path d="M3 17l3 3 3-3"/><path d="M6 20V4"/>
                </svg>
                {activeSortLabel}
              </button>
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 rounded-xl overflow-hidden py-1"
                    style={{ minWidth: 150, background: 'var(--notion-card-elevated, white)', border: '1px solid var(--notion-border)', boxShadow: '0 6px 16px rgba(0,0,0,0.10)' }}>
                    {SORT_OPTIONS.map(o => (
                      <button key={`${o.field}-${o.dir}`}
                        onClick={() => { setSortField(o.field); setSortDir(o.dir); setShowSortMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                        style={{ color: (sortField === o.field && sortDir === o.dir) ? '#74819e' : 'var(--notion-text)', fontWeight: (sortField === o.field && sortDir === o.dir) ? 600 : 400 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {sortField === o.field && sortDir === o.dir && <span style={{ color: '#74819e' }}>✓</span>}
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Filter by type */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => { setShowFilterMenu(v => !v); setShowSortMenu(false); }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors"
                style={{
                  border: `1px solid ${contentFilter ? '#74819e' : 'var(--notion-border)'}`,
                  color: contentFilter ? '#74819e' : 'var(--notion-text-muted)',
                  background: contentFilter ? 'rgba(116,129,158,0.07)' : (showFilterMenu ? 'var(--notion-hover)' : 'transparent'),
                }}
                onMouseEnter={e => { if (!contentFilter) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                onMouseLeave={e => { if (!contentFilter) e.currentTarget.style.background = showFilterMenu ? 'var(--notion-hover)' : 'transparent'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
                {FILTER_OPTIONS.find(o => o.value === contentFilter)?.label ?? tWorkspace('allTypes')}
              </button>
              {showFilterMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowFilterMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 rounded-xl overflow-hidden py-1"
                    style={{ minWidth: 140, background: 'var(--notion-card-elevated, white)', border: '1px solid var(--notion-border)', boxShadow: '0 6px 16px rgba(0,0,0,0.10)' }}>
                    {FILTER_OPTIONS.map(o => (
                      <button key={o.value}
                        onClick={() => { setContentFilter(o.value); setShowFilterMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                        style={{ color: contentFilter === o.value ? '#74819e' : 'var(--notion-text)', fontWeight: contentFilter === o.value ? 600 : 400 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {contentFilter === o.value && <span style={{ color: '#74819e' }}>✓</span>}
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* View mode toggle */}
            <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0"
              style={{ border: '1px solid var(--notion-border)' }}>
              {(['list', 'grid'] as ViewMode[]).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className="p-2 transition-colors"
                  style={{ background: viewMode === mode ? 'var(--notion-hover)' : 'transparent', color: viewMode === mode ? 'var(--notion-text)' : 'var(--notion-text-muted)' }}
                  title={mode === 'list' ? tWorkspace('listView') : tWorkspace('gridView')}
                >
                  {mode === 'list' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Bulk actions: shown when items selected */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto">
                <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('selectedCount', { n: selectedIds.size })}</span>
                <button onClick={copySelected} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                  style={{ background: 'var(--notion-hover)', color: 'var(--notion-text)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-active)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--notion-hover)'}>
                  {tWorkspace('copyBtn')}
                </button>
                <button onClick={deleteSelected} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                  style={{ background: 'rgba(181,112,112,0.08)', color: '#b57070' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(181,112,112,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(181,112,112,0.08)'}>
                  {tWorkspace('deleteBtn')}
                </button>
              </div>
            )}

            {/* Paste button when clipboard has items */}
            {clipboard.length > 0 && selectedIds.size === 0 && (
              <button onClick={pasteClipboard} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors w-full sm:w-auto sm:ml-auto"
                style={{ background: 'rgba(116,129,158,0.1)', color: '#74819e', border: '1px solid rgba(116,129,158,0.2)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(116,129,158,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(116,129,158,0.1)'}>
                {tWorkspace('pasteFiles', { n: clipboard.length })}
                <span onClick={e => { e.stopPropagation(); setClipboard([]); }}
                  style={{ marginLeft: 4, opacity: 0.6, cursor: 'pointer' }}>✕</span>
              </button>
            )}

            {/* Total count */}
            <span className="text-xs w-full sm:w-auto sm:ml-auto" style={{ color: 'var(--notion-text-muted)', whiteSpace: 'nowrap' }}>
              {tWorkspace('totalFiles', { n: total })}
            </span>
          </div>

          {/* ── Breadcrumb navigation ── */}
          {currentParentId && (
              <div className="flex items-center gap-1.5 px-6 py-2.5 flex-shrink-0"
                style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
              {breadcrumbs.map((crumb, idx) => (
                <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
                  {idx > 0 && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  )}
                  <button
                    onClick={() => navigateToBreadcrumb(idx)}
                    className="text-xs px-2 py-1 rounded transition-colors truncate max-w-[160px]"
                    style={{
                      color: idx === breadcrumbs.length - 1 ? 'var(--notion-text)' : '#74819e',
                      fontWeight: idx === breadcrumbs.length - 1 ? 600 : 400,
                      cursor: idx === breadcrumbs.length - 1 ? 'default' : 'pointer',
                    }}
                    onMouseEnter={e => { if (idx < breadcrumbs.length - 1) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {idx === 0 ? (
                      <span className="flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                        {crumb.title}
                      </span>
                    ) : crumb.title}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* ── File list ── */}
          <div className="flex-1 overflow-auto">

            {/* List column headers */}
            {viewMode === 'list' && pages.length > 0 && (
              <div className="flex items-center gap-3 px-6 py-2 sticky top-0"
                style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-card, white)', zIndex: 10 }}>
                <div style={{ width: 20, flexShrink: 0 }}>
                  <input type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === pages.length}
                    onChange={e => setSelectedIds(e.target.checked ? new Set(pages.map(p => p.id)) : new Set())}
                    style={{ accentColor: '#74819e', cursor: 'pointer' }}
                  />
                </div>
                <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--notion-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tWorkspace('colTitle')}</div>
                <div style={{ width: 90, fontSize: 11, fontWeight: 600, color: 'var(--notion-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{tWorkspace('colType')}</div>
                <div style={{ width: 100, fontSize: 11, fontWeight: 600, color: 'var(--notion-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{tWorkspace('colModified')}</div>
                <div style={{ width: 100, fontSize: 11, fontWeight: 600, color: 'var(--notion-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{tWorkspace('colCreated')}</div>
                <div style={{ width: 80, flexShrink: 0 }} />
              </div>
            )}

            {loadingPages && pages.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                {tCommon('loading')}
              </div>
            ) : pages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="opacity-50">{search ? <HandIcon name="magnifier" size={48} /> : <HandIcon name="document" size={48} />}</div>
                <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>
                  {search ? tWorkspace('noFilesSearch', { q: search }) : tWorkspace('noFilesEmpty')}
                </p>
                {!search && (
                  <button onClick={() => setShowTemplateGallery(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white mt-1"
                    style={{ background: '#74819e' }}>
                    {tWorkspace('newPageBtn')}
                  </button>
                )}
              </div>
            ) : viewMode === 'list' ? (
              /* ── List view ── */
              <div>
                {pages.map(page => {
                  const badge = contentTypeBadge(page.content_type, tWorkspace);
                  const ctIcon = contentTypeIcon(page.content_type);
                  const isSelected = selectedIds.has(page.id);
                  const menuOpen = menuPageId === page.id;
                  return (
                    <div
                      key={page.id}
                      className="group flex items-center gap-3 px-6 py-3 cursor-pointer transition-colors"
                      style={{
                        borderBottom: '1px solid var(--notion-border)',
                        background: isSelected ? 'rgba(116,129,158,0.05)' : 'transparent',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => router.push(`/${tenant}/workspace/${page.id}`)}
                    >
                      {/* Checkbox */}
                      <div style={{ width: 20, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={isSelected}
                          onChange={e => setSelectedIds(prev => {
                            const n = new Set(prev);
                            e.target.checked ? n.add(page.id) : n.delete(page.id);
                            return n;
                          })}
                          style={{ accentColor: '#74819e', cursor: 'pointer' }}
                        />
                      </div>
                      {/* Icon + title */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="flex-shrink-0"><IconOrEmoji value={page.icon || ctIcon || 'document'} size={20} /></span>
                        <span className="truncate text-sm font-medium" style={{ color: 'var(--notion-text)' }}>
                          {page.title || tWorkspace('untitled')}
                        </span>
                        {(page.child_count ?? 0) > 0 && (
                          <button
                            className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md transition-colors flex-shrink-0"
                            style={{ color: 'var(--notion-text-muted)', background: 'var(--notion-hover)' }}
                            onClick={e => { e.stopPropagation(); navigateToFolder(page); }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(116,129,158,0.1)'; e.currentTarget.style.color = '#74819e'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            </svg>
                            {page.child_count}
                          </button>
                        )}
                      </div>
                      {/* Type badge */}
                      <div style={{ width: 90, flexShrink: 0 }}>
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                      {/* Modified */}
                      <div style={{ width: 100, fontSize: 12, color: 'var(--notion-text-muted)', flexShrink: 0 }}>
                        {relativeTime(page.updated_at, tWorkspace)}
                      </div>
                      {/* Created */}
                      <div style={{ width: 100, fontSize: 12, color: 'var(--notion-text-muted)', flexShrink: 0 }}>
                        {relativeTime(page.created_at, tWorkspace)}
                      </div>
                      {/* Actions */}
                      <div style={{ width: 80, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', position: 'relative' }}
                        onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuPageId(menuOpen ? null : page.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all"
                          style={{ color: 'var(--notion-text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-active)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
                          </svg>
                        </button>
                        {menuOpen && (
                          <PageActionMenu
                            page={page}
                            onOpen={() => { setMenuPageId(null); router.push(`/${tenant}/workspace/${page.id}`); }}
                            onDuplicate={() => duplicatePage(page.id)}
                            onShare={() => { setMenuPageId(null); setSharePageId(page.id); setShareTitle(page.title || tWorkspace('untitled')); }}
                            onDelete={() => deletePage(page.id)}
                            onClose={() => setMenuPageId(null)}
                            onAddSubPage={() => createSubPage(page.id)}
                            onEnterFolder={() => { setMenuPageId(null); navigateToFolder(page); }}
                            labels={{ open: tWorkspace('openPage'), enter: tWorkspace('enterFolder'), addSub: tWorkspace('addSubPage'), copy: tWorkspace('copyBtn'), share: tWorkspace('share'), delete: tWorkspace('deleteBtn') }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Grid view ── */
              <div className="grid gap-3 p-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {pages.map(page => {
                  const badge = contentTypeBadge(page.content_type, tWorkspace);
                  const ctIcon = contentTypeIcon(page.content_type);
                  const isSelected = selectedIds.has(page.id);
                  const menuOpen = menuPageId === page.id;
                  return (
                    <div
                      key={page.id}
                      className="group relative rounded-2xl cursor-pointer transition-all"
                      style={{
                        background: isSelected ? 'rgba(116,129,158,0.08)' : 'var(--notion-card, white)',
                        border: `1px solid ${isSelected ? 'rgba(116,129,158,0.3)' : 'var(--notion-border)'}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'none'; }}
                      onClick={() => router.push(`/${tenant}/workspace/${page.id}`)}
                    >
                      {/* Color accent top bar */}
                      <div style={{ height: 4, background: badge.color, opacity: 0.7 }} />
                      <div style={{ padding: '14px 14px 12px' }}>
                        {/* Checkbox + More */}
                        <div className="flex items-center justify-between mb-3" onClick={e => e.stopPropagation()}>
                          <input type="checkbox"
                            checked={isSelected}
                            onChange={e => setSelectedIds(prev => {
                              const n = new Set(prev);
                              e.target.checked ? n.add(page.id) : n.delete(page.id);
                              return n;
                            })}
                            style={{ accentColor: '#74819e', cursor: 'pointer' }}
                          />
                          <div style={{ position: 'relative' }}>
                            <button
                              onClick={() => setMenuPageId(menuOpen ? null : page.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded transition-colors"
                              style={{ color: 'var(--notion-text-muted)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-active)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
                              </svg>
                            </button>
                            {menuOpen && (
                              <PageActionMenu
                                page={page}
                                onOpen={() => { setMenuPageId(null); router.push(`/${tenant}/workspace/${page.id}`); }}
                                onDuplicate={() => duplicatePage(page.id)}
                                onShare={() => { setMenuPageId(null); setSharePageId(page.id); setShareTitle(page.title || tWorkspace('untitled')); }}
                                onDelete={() => deletePage(page.id)}
                                onClose={() => setMenuPageId(null)}
                                onAddSubPage={() => createSubPage(page.id)}
                                onEnterFolder={() => { setMenuPageId(null); navigateToFolder(page); }}
                                labels={{ open: tWorkspace('openPage'), enter: tWorkspace('enterFolder'), addSub: tWorkspace('addSubPage'), copy: tWorkspace('copyBtn'), share: tWorkspace('share'), delete: tWorkspace('deleteBtn') }}
                              />
                            )}
                          </div>
                        </div>
                        {/* Icon + title */}
                        <div className="flex items-start gap-2 mb-3">
                          <span className="leading-none flex-shrink-0"><IconOrEmoji value={page.icon || ctIcon || 'document'} size={28} /></span>
                          <span className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: 'var(--notion-text)', wordBreak: 'break-word' }}>
                            {page.title || tWorkspace('untitled')}
                          </span>
                        </div>
                        {/* Badge + child count + time */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: badge.bg, color: badge.color }}>
                              {badge.label}
                            </span>
                            {(page.child_count ?? 0) > 0 && (
                              <button
                                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md transition-colors"
                                style={{ color: 'var(--notion-text-muted)', background: 'var(--notion-hover)' }}
                                onClick={e => { e.stopPropagation(); navigateToFolder(page); }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(116,129,158,0.1)'; e.currentTarget.style.color = '#74819e'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                </svg>
                                {page.child_count}
                              </button>
                            )}
                          </div>
                          <span className="text-[11px]" style={{ color: 'var(--notion-text-muted)' }}>
                            {relativeTime(page.updated_at, tWorkspace)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Load more */}
            {hasMore && !loadingPages && (
              <div className="flex justify-center py-6">
                <button
                  onClick={() => loadPages(activeWsId!, skip, true)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  {tWorkspace('loadMore', { n: total - pages.length })}
                </button>
              </div>
            )}
            {loadingPages && pages.length > 0 && (
              <div className="flex justify-center py-4 text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</div>
            )}
          </div>
        </div>
      )}

      {/* ── Share Panel ── */}
      {sharePageId && (
        <SharePanel
          pageId={sharePageId}
          pageTitle={shareTitle}
          onClose={() => { setSharePageId(null); setShareTitle(''); }}
        />
      )}

      {/* ── Template Gallery ── */}
      <TemplateGallery
        open={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
        onSelect={createFromTemplate}
        onBlank={createBlankPage}
      />

      {/* ── Modals: New Team Space ── */}
      {showNewTeamWs && (
        <Modal title={tWorkspace('createTeamWorkspace')} onClose={() => setShowNewTeamWs(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text)' }}>{tWorkspace('icon')}</label>
              <div className="flex flex-wrap gap-1">
                {WS_ICON_LIST_LOCAL.map(iconName => (
                  <button key={iconName} onClick={() => setNewWsIcon(iconName)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: newWsIcon === iconName ? '#ece8df' : 'var(--notion-hover)', outline: newWsIcon === iconName ? '2px solid #74819e' : 'none' }}
                  ><HandIcon name={iconName} size={20} /></button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text)' }}>{tWorkspace('nameRequired')}</label>
              <input value={newWsName} onChange={e => setNewWsName(e.target.value)} placeholder={tWorkspace('workspaceName')}
                className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text)' }}>{tWorkspace('description')}</label>
              <input value={newWsDesc} onChange={e => setNewWsDesc(e.target.value)} placeholder={tWorkspace('optionalDesc')}
                className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }} />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowNewTeamWs(false)} className="flex-1 py-2 text-sm rounded-lg"
                style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}>{tCommon('cancel')}</button>
              <button onClick={createTeamWorkspace} disabled={!newWsName.trim()}
                className="flex-1 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-50"
                style={{ background: '#74819e' }}>{tCommon('create')}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modals: Edit workspace ── */}
      {editWs && (
        <Modal title={tWorkspace('editWorkspace')} onClose={() => setEditWs(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text)' }}>{tWorkspace('icon')}</label>
              <div className="flex flex-wrap gap-1">
                {WS_ICON_LIST_LOCAL.map(iconName => (
                  <button key={iconName} onClick={() => setEditWsIcon(iconName)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: editWsIcon === iconName ? '#ece8df' : 'var(--notion-hover)', outline: editWsIcon === iconName ? '2px solid #74819e' : 'none' }}
                  ><HandIcon name={iconName} size={20} /></button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text)' }}>{tCommon('name')}</label>
              <input value={editWsName} onChange={e => setEditWsName(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text)' }}>{tWorkspace('description')}</label>
              <input value={editWsDesc} onChange={e => setEditWsDesc(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }} />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditWs(null)} className="flex-1 py-2 text-sm rounded-lg"
                style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}>{tCommon('cancel')}</button>
              <button onClick={saveEdit} className="flex-1 py-2 text-sm rounded-lg font-medium text-white"
                style={{ background: '#74819e' }}>{tCommon('save')}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modals: Confirm delete workspace ── */}
      {deleteWs && (
        <Modal title={tWorkspace('deleteWorkspace')} onClose={() => setDeleteWs(null)}>
          <p className="text-sm mb-4" style={{ color: 'var(--notion-text-muted)' }}>
            {tWorkspace('confirmDeleteWorkspace', { name: deleteWs.name })}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setDeleteWs(null)} className="flex-1 py-2 text-sm rounded-lg"
              style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}>{tCommon('cancel')}</button>
            <button onClick={confirmDeleteWs} className="flex-1 py-2 text-sm rounded-lg font-medium text-white"
              style={{ background: '#b57070' }}>{tCommon('delete')}</button>
          </div>
        </Modal>
      )}

      {/* ── Modals: Confirm delete page(s) ── */}
      {pendingDeletePageIds && (
        <Modal title={tCommon('delete')} onClose={() => setPendingDeletePageIds(null)}>
          <p className="text-sm mb-4" style={{ color: 'var(--notion-text-muted)' }}>
            {pendingDeleteText}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingDeletePageIds(null)}
              className="flex-1 py-2 text-sm rounded-lg"
              style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
            >
              {tCommon('cancel')}
            </button>
            <button
              onClick={confirmDeletePagesAction}
              className="flex-1 py-2 text-sm rounded-lg font-medium text-white"
              style={{ background: '#b57070' }}
            >
              {tCommon('delete')}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modals: Member management ── */}
      {memberWs && (
        <Modal title={tWorkspace('memberManagementTitle', { name: memberWs.name })} onClose={() => setMemberWs(null)} wide>
          <div className="space-y-4">
            {/* Current members */}
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('currentMembers')}</p>
              {members.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('noMembers')}</p>
              ) : members.map(m => (
                <div key={m.user_id} className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: 'var(--notion-border)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#8a95b2,#9ca6bf)', color: 'white' }}>
                    {m.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{m.full_name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>{m.email}</p>
                  </div>
                  <select value={m.role} onChange={e => updateMemberRole(m.user_id, e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg outline-none"
                    style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }}>
                    <option value="admin">{tWorkspace('admin')}</option>
                    <option value="editor">{tWorkspace('editor')}</option>
                    <option value="viewer">{tWorkspace('viewer')}</option>
                  </select>
                  <button onClick={() => removeMember(m.user_id)} className="text-xs px-2 py-1 rounded-lg transition-colors"
                    style={{ color: '#b57070' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(181,112,112,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{tWorkspace('removeMember')}</button>
                </div>
              ))}
            </div>
            {/* Add member */}
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('addMember')}</p>
              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder={tWorkspace('searchEmployees')}
                className="w-full text-sm px-3 py-2 rounded-lg outline-none mb-2"
                style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }} />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredEmployees.slice(0, 10).map(emp => {
                  const uid = emp.user_id || emp.id;
                  return (
                    <div key={uid} className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors"
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => !addingMember && addMember(uid, emp)}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg,#6f8696,#6366f1)', color: 'white' }}>
                        {emp.full_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: 'var(--notion-text)' }}>{emp.full_name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>{emp.email}</p>
                      </div>
                      <span className="text-xs" style={{ color: '#74819e' }}>{tWorkspace('addBtn')}</span>
                    </div>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <p className="text-sm text-center py-3" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('noMatchEmployees')}</p>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function HdrBtn({ onClick, title, danger, children }: {
  onClick: () => void; title?: string; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
      style={{ color: danger ? '#b57070' : 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? 'rgba(181,112,112,0.08)' : 'var(--notion-hover)';
        e.currentTarget.style.color = danger ? '#b57070' : 'var(--notion-text)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = danger ? '#b57070' : 'var(--notion-text-muted)';
      }}
    >
      {children}
    </button>
  );
}

function PageActionMenu({ page, onOpen, onDuplicate, onShare, onDelete, onClose, onAddSubPage, onEnterFolder, labels }: {
  page: Page;
  onOpen: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
  onAddSubPage: () => void;
  onEnterFolder: () => void;
  labels: { open: string; enter: string; addSub: string; copy: string; share: string; delete: string };
}) {
  const items = [
    { label: labels.open, icon: '↗', onClick: onOpen },
    { label: labels.enter, icon: '→', onClick: onEnterFolder },
    { label: labels.addSub, icon: '+', onClick: onAddSubPage },
    { label: labels.copy, icon: '⎘', onClick: onDuplicate },
    { label: labels.share, icon: '↗', onClick: onShare },
    { label: labels.delete, icon: '✕', onClick: onDelete, danger: true },
  ];
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden py-1"
        style={{ minWidth: 150, background: 'var(--notion-card-elevated, white)', border: '1px solid var(--notion-border)', boxShadow: '0 6px 16px rgba(0,0,0,0.12)' }}>
        {items.map(item => (
          <button key={item.label}
            onClick={e => { e.stopPropagation(); item.onClick(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors"
            style={{ color: item.danger ? '#b57070' : 'var(--notion-text)' }}
            onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(181,112,112,0.07)' : 'var(--notion-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 13 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: wide ? 560 : 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--notion-border)' }}>
          <h3 className="text-base font-semibold" style={{ color: 'var(--notion-text)' }}>{title}</h3>
          <button onClick={onClose} style={{ color: 'var(--notion-text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
