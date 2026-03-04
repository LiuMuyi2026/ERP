'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { HandIcon } from '@/components/ui/HandIcon';
import { api } from '@/lib/api';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  group: string;
  keywords?: string[];
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  tenant: string;
}

export default function CommandPalette({ open, onClose, tenant }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [remoteItems, setRemoteItems] = useState<CommandItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [isAdminScope, setIsAdminScope] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchReqSeq = useRef(0);

  const toRows = useCallback((value: any, extraKeys: string[] = []): any[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    const keys = ['items', 'customers', 'notifications', 'results', 'rows', 'data', ...extraKeys];
    for (const k of keys) {
      const v = (value as any)?.[k];
      if (Array.isArray(v)) return v;
    }
    return [];
  }, []);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [onClose, router]);

  const baseItems: CommandItem[] = useMemo(() => ([
    { id: 'page-workspace', label: 'Workspace', description: 'Pages, docs, templates', icon: 'document', group: 'Pages', keywords: ['docs', 'knowledge'], action: () => navigate(`/${tenant}/workspace`) },
    { id: 'page-crm', label: 'CRM', description: 'Leads, pipeline, contracts', icon: 'people-group', group: 'Pages', keywords: ['leads', 'customers', 'contracts'], action: () => navigate(`/${tenant}/crm`) },
    { id: 'page-customers', label: 'Customer Center', description: 'Customer list and 360 view', icon: 'building', group: 'Pages', keywords: ['customer', 'account'], action: () => navigate(`/${tenant}/crm/customers`) },
    { id: 'page-messages', label: 'Messages', description: 'WhatsApp, email, internal messages', icon: 'chat-bubble', group: 'Pages', keywords: ['whatsapp', 'email', 'inbox'], action: () => navigate(`/${tenant}/messages`) },
    { id: 'page-orders', label: 'Orders', description: 'Purchase and sales orders', icon: 'clipboard', group: 'Pages', keywords: ['purchase', 'sales'], action: () => navigate(`/${tenant}/orders`) },
    { id: 'page-inventory', label: 'Inventory', description: 'Products, stock, suppliers', icon: 'factory', group: 'Pages', keywords: ['stock', 'supplier', 'warehouse'], action: () => navigate(`/${tenant}/inventory`) },
    { id: 'page-accounting', label: 'Accounting', description: 'Financials, invoices, balances', icon: 'money-bag', group: 'Pages', keywords: ['finance', 'invoice'], action: () => navigate(`/${tenant}/accounting`) },
    { id: 'page-hr', label: 'HR & People', description: 'Employees and leave management', icon: 'person', group: 'Pages', keywords: ['employee', 'leave'], action: () => navigate(`/${tenant}/hr`) },
    { id: 'page-operations', label: 'Operations', description: 'Operational workflows', icon: 'package', group: 'Pages', keywords: ['operations'], action: () => navigate(`/${tenant}/operations`) },
    { id: 'sys-settings', label: 'Settings', description: 'Tenant settings and preferences', icon: 'gear', group: 'System', keywords: ['profile', 'preferences'], action: () => navigate(`/${tenant}/settings`) },
    { id: 'sys-integrations', label: 'Integrations', description: 'Connected apps and automations', icon: 'link', group: 'System', keywords: ['app', 'n8n', 'automation'], action: () => navigate(`/${tenant}/settings/integrations`) },
    { id: 'sys-notifications', label: 'Notifications', description: 'Alerts and reminders', icon: 'bell', group: 'System', keywords: ['alerts'], action: () => navigate(`/${tenant}/notifications`) },
    { id: 'sys-admin', label: 'Admin', description: 'Permissions and system administration', icon: 'shield-lock', group: 'System', keywords: ['roles', 'permission', 'users'], action: () => navigate(`/${tenant}/admin`) },
  ]), [navigate, tenant]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get('/api/auth/me')
      .then((me: any) => {
        if (cancelled) return;
        const role = String(me?.role || '').toLowerCase();
        setIsAdminScope(role === 'tenant_admin' || role === 'platform_admin' || role === 'manager' || role === 'admin');
      })
      .catch(() => {
        if (!cancelled) setIsAdminScope(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      searchReqSeq.current += 1;
      setRemoteItems([]);
      setRemoteLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      const reqId = ++searchReqSeq.current;
      setRemoteLoading(true);
      try {
        const queryCalls: Array<Promise<any>> = [
          api.get(`/api/workspace/search?q=${encodeURIComponent(q)}`),
          api.get(`/api/integrations/directory/apps?q=${encodeURIComponent(q)}`),
          api.get(`/api/crm/leads?search=${encodeURIComponent(q)}&limit=10`),
          api.get(`/api/crm/customers?search=${encodeURIComponent(q)}&limit=10`),
          api.get(`/api/hr/employees?search=${encodeURIComponent(q)}`),
          api.get('/api/crm/contracts?limit=30'),
          api.get('/api/crm/receivables'),
          api.get('/api/crm/payables'),
          api.get(`/api/orders/purchase?search=${encodeURIComponent(q)}`),
          api.get(`/api/orders/sales?search=${encodeURIComponent(q)}`),
          api.get(`/api/inventory/products?search=${encodeURIComponent(q)}&limit=20`),
          api.get(`/api/inventory/suppliers?search=${encodeURIComponent(q)}`),
          api.get('/api/whatsapp/dashboard?sort_by=last_message'),
          api.get(`/api/email/inbox?page=1&page_size=12&include_outbound=true&search=${encodeURIComponent(q)}`),
          api.get('/api/messages/conversations'),
          api.get('/api/notifications?limit=30'),
          api.get('/api/operations/orders?limit=30'),
        ];
        if (isAdminScope) {
          queryCalls.push(api.get('/api/admin/users-lite'));
        }

        const [
          workspaceRes, integrationRes, leadsRes, customersRes, employeesRes,
          contractsRes, receivablesRes, payablesRes,
          purchaseOrdersRes, salesOrdersRes,
          productsRes, suppliersRes,
          waConversationsRes, emailInboxRes, internalMessagesRes, notificationsRes,
          operationsOrdersRes, adminUsersRes,
        ] = await Promise.allSettled(queryCalls);

        const includesQ = (value: unknown) => String(value || '').toLowerCase().includes(q.toLowerCase());

        const items: CommandItem[] = [];
        if (workspaceRes.status === 'fulfilled') {
          for (const row of toRows(workspaceRes.value).slice(0, 20)) {
            items.push({
              id: `workspace-page-${row.id}`,
              label: row.title || 'Untitled',
              description: row.workspace_name ? `Workspace: ${row.workspace_name}` : 'Workspace page',
              icon: 'document',
              group: 'Workspace Pages',
              keywords: ['workspace', 'page'],
              action: () => navigate(`/${tenant}/workspace/${row.id}`),
            });
          }
        }
        if (integrationRes.status === 'fulfilled') {
          for (const app of toRows(integrationRes.value).slice(0, 12)) {
            const desc = [app.source, app.category, app.description].filter(Boolean).join(' · ');
            items.push({
              id: `integration-app-${app.app_key || app.id}`,
              label: app.name || app.app_key || 'Integration App',
              description: desc || 'Integration app',
              icon: 'link',
              group: 'System Info',
              keywords: ['integration', 'app', String(app.app_key || '')],
              action: () => navigate(`/${tenant}/settings/integrations`),
            });
          }
        }
        if (leadsRes.status === 'fulfilled') {
          for (const lead of toRows(leadsRes.value).slice(0, 10)) {
            const leadName = lead.full_name || lead.company || lead.email || 'Lead';
            const desc = [lead.company, lead.status, lead.email].filter(Boolean).join(' · ');
            items.push({
              id: `crm-lead-${lead.id}`,
              label: leadName,
              description: desc || 'CRM lead',
              icon: 'people-group',
              group: 'CRM Leads',
              keywords: ['lead', 'crm', '线索'],
              action: () => navigate(`/${tenant}/crm/customer-360/${lead.id}`),
            });
          }
        }
        if (customersRes.status === 'fulfilled') {
          for (const customer of toRows(customersRes.value).slice(0, 10)) {
            const customerName = customer.full_name || customer.company || customer.email || 'Customer';
            const desc = [customer.company, customer.status, customer.email].filter(Boolean).join(' · ');
            items.push({
              id: `crm-customer-${customer.id}`,
              label: customerName,
              description: desc || 'CRM customer',
              icon: 'building',
              group: 'CRM Customers',
              keywords: ['customer', 'crm', '客户'],
              action: () => navigate(`/${tenant}/crm/customer-360/${customer.id}`),
            });
          }
        }
        if (employeesRes.status === 'fulfilled') {
          for (const emp of toRows(employeesRes.value).slice(0, 12)) {
            const empName = emp.full_name || emp.email || emp.employee_number || 'Employee';
            const desc = [emp.department_name, emp.position_name, emp.email].filter(Boolean).join(' · ');
            items.push({
              id: `hr-employee-${emp.id}`,
              label: empName,
              description: desc || 'HR employee',
              icon: 'person',
              group: 'Employees',
              keywords: ['employee', 'hr', '员工'],
              action: () => navigate(`/${tenant}/hr?search=${encodeURIComponent(empName)}`),
            });
          }
        }
        if (contractsRes.status === 'fulfilled') {
          for (const c of toRows(contractsRes.value).slice(0, 40)) {
            if (!includesQ(c.contract_no) && !includesQ(c.account_name) && !includesQ(c.remarks)) continue;
            items.push({
              id: `crm-contract-${c.id}`,
              label: c.contract_no || 'Contract',
              description: [c.account_name, c.status, c.currency].filter(Boolean).join(' · '),
              icon: 'clipboard',
              group: 'CRM Contracts',
              keywords: ['contract', 'crm', '合同'],
              action: () => navigate(`/${tenant}/crm`),
            });
          }
        }
        if (receivablesRes.status === 'fulfilled') {
          for (const r of toRows(receivablesRes.value).slice(0, 40)) {
            if (!includesQ(r.contract_no) && !includesQ(r.invoice_no) && !includesQ(r.lead_name)) continue;
            items.push({
              id: `crm-receivable-${r.id}`,
              label: r.invoice_no || r.contract_no || 'Receivable',
              description: [r.lead_name, r.status, r.contract_no].filter(Boolean).join(' · '),
              icon: 'money-bag',
              group: 'CRM Receivables',
              keywords: ['receivable', 'crm', '应收'],
              action: () => navigate(`/${tenant}/crm`),
            });
          }
        }
        if (payablesRes.status === 'fulfilled') {
          for (const p of toRows(payablesRes.value).slice(0, 40)) {
            if (!includesQ(p.contract_no) && !includesQ(p.invoice_no) && !includesQ(p.supplier_name)) continue;
            items.push({
              id: `crm-payable-${p.id}`,
              label: p.invoice_no || p.contract_no || 'Payable',
              description: [p.supplier_name, p.status, p.contract_no].filter(Boolean).join(' · '),
              icon: 'money-bag',
              group: 'CRM Payables',
              keywords: ['payable', 'crm', '应付'],
              action: () => navigate(`/${tenant}/crm`),
            });
          }
        }
        if (purchaseOrdersRes.status === 'fulfilled') {
          for (const po of toRows(purchaseOrdersRes.value).slice(0, 20)) {
            items.push({
              id: `order-po-${po.id}`,
              label: po.po_number || 'Purchase Order',
              description: [po.supplier_name, po.product_name, po.status].filter(Boolean).join(' · '),
              icon: 'package',
              group: 'Orders - Purchase',
              keywords: ['purchase', 'po', '订单', '采购'],
              action: () => navigate(`/${tenant}/orders`),
            });
          }
        }
        if (salesOrdersRes.status === 'fulfilled') {
          for (const so of toRows(salesOrdersRes.value).slice(0, 20)) {
            items.push({
              id: `order-so-${so.id}`,
              label: so.contract_no || 'Sales Order',
              description: [so.account_name, so.status].filter(Boolean).join(' · '),
              icon: 'clipboard',
              group: 'Orders - Sales',
              keywords: ['sales', 'so', '订单', '销售'],
              action: () => navigate(`/${tenant}/orders`),
            });
          }
        }
        if (productsRes.status === 'fulfilled') {
          for (const p of toRows(productsRes.value).slice(0, 20)) {
            items.push({
              id: `inventory-product-${p.id}`,
              label: p.name || p.sku || 'Product',
              description: [p.sku, p.category].filter(Boolean).join(' · '),
              icon: 'factory',
              group: 'Inventory Products',
              keywords: ['inventory', 'product', '库存', '产品'],
              action: () => navigate(`/${tenant}/inventory`),
            });
          }
        }
        if (suppliersRes.status === 'fulfilled') {
          for (const s of toRows(suppliersRes.value).slice(0, 20)) {
            items.push({
              id: `inventory-supplier-${s.id}`,
              label: s.name || 'Supplier',
              description: [s.contact_person, s.supplier_type].filter(Boolean).join(' · '),
              icon: 'building',
              group: 'Inventory Suppliers',
              keywords: ['supplier', 'inventory', '供应商'],
              action: () => navigate(`/${tenant}/inventory`),
            });
          }
        }
        if (waConversationsRes.status === 'fulfilled') {
          for (const c of toRows(waConversationsRes.value).slice(0, 30)) {
            if (!includesQ(c.display_name) && !includesQ(c.push_name) && !includesQ(c.phone_number) && !includesQ(c.lead_name)) continue;
            const name = c.display_name || c.push_name || c.phone_number || 'WhatsApp';
            items.push({
              id: `wa-conv-${c.id}`,
              label: name,
              description: [c.phone_number, c.lead_name, c.last_message_preview].filter(Boolean).join(' · '),
              icon: 'chat-bubble',
              group: 'Messages - WhatsApp',
              keywords: ['whatsapp', 'message', '聊天'],
              action: () => navigate(`/${tenant}/messages`),
            });
          }
        }
        if (emailInboxRes.status === 'fulfilled') {
          const rows = toRows(emailInboxRes.value);
          if (Array.isArray(rows)) {
            for (const em of rows.slice(0, 20)) {
              items.push({
                id: `email-${em.id}`,
                label: em.subject || em.from_email || 'Email',
                description: [em.from_email, em.preview, em.mailbox_state].filter(Boolean).join(' · '),
                icon: 'envelope',
                group: 'Messages - Email',
                keywords: ['email', 'mail', '邮件'],
                action: () => navigate(`/${tenant}/messages`),
              });
            }
          }
        }
        if (internalMessagesRes.status === 'fulfilled') {
          for (const m of toRows(internalMessagesRes.value).slice(0, 20)) {
            if (!includesQ(m.full_name) && !includesQ(m.email) && !includesQ(m.last_content)) continue;
            items.push({
              id: `internal-msg-${m.other_id}`,
              label: m.full_name || m.email || 'Internal Chat',
              description: [m.email, m.last_content].filter(Boolean).join(' · '),
              icon: 'chat-bubble',
              group: 'Messages - Internal',
              keywords: ['internal', 'message', '内部消息'],
              action: () => navigate(`/${tenant}/messages`),
            });
          }
        }
        if (notificationsRes.status === 'fulfilled') {
          const rows = toRows(notificationsRes.value);
          if (Array.isArray(rows)) {
            for (const n of rows.slice(0, 30)) {
              if (!includesQ(n.title) && !includesQ(n.body) && !includesQ(n.type)) continue;
              items.push({
                id: `notification-${n.id}`,
                label: n.title || 'Notification',
                description: [n.type, n.body].filter(Boolean).join(' · '),
                icon: 'bell',
                group: 'Notifications',
                keywords: ['notification', 'alert', '通知'],
                action: () => navigate(`/${tenant}/notifications`),
              });
            }
          }
        }
        if (operationsOrdersRes.status === 'fulfilled') {
          for (const o of toRows(operationsOrdersRes.value).slice(0, 30)) {
            if (!includesQ(o.contract_no) && !includesQ(o.customer_name) && !includesQ(o.stage)) continue;
            items.push({
              id: `op-order-${o.id}`,
              label: o.contract_no || 'Operation Order',
              description: [o.customer_name, o.stage].filter(Boolean).join(' · '),
              icon: 'package',
              group: 'Operations Orders',
              keywords: ['operations', 'order', '流程'],
              action: () => navigate(`/${tenant}/operations`),
            });
          }
        }
        if (isAdminScope && adminUsersRes && adminUsersRes.status === 'fulfilled') {
          for (const u of toRows(adminUsersRes.value).slice(0, 30)) {
            if (!includesQ(u.full_name) && !includesQ(u.email) && !includesQ(u.role)) continue;
            items.push({
              id: `admin-user-${u.id}`,
              label: u.full_name || u.email || 'User',
              description: [u.email, u.role, u.position_name].filter(Boolean).join(' · '),
              icon: 'person',
              group: 'Admin Users',
              keywords: ['admin', 'user', '权限', '用户'],
              action: () => navigate(`/${tenant}/admin`),
            });
          }
        }
        if (reqId === searchReqSeq.current) {
          setRemoteItems(items);
        }
      } catch {
        if (reqId === searchReqSeq.current) {
          setRemoteItems([]);
        }
      } finally {
        if (reqId === searchReqSeq.current) {
          setRemoteLoading(false);
        }
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [open, query, navigate, tenant, isAdminScope, toRows]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredLocal = normalizedQuery
    ? baseItems.filter(item =>
      item.label.toLowerCase().includes(normalizedQuery) ||
      item.description?.toLowerCase().includes(normalizedQuery) ||
      item.group.toLowerCase().includes(normalizedQuery) ||
      item.keywords?.some((kw) => kw.toLowerCase().includes(normalizedQuery))
    )
    : baseItems;

  const filtered = [...filteredLocal, ...remoteItems];
  const seen = new Set<string>();
  const deduped = filtered.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  const groups = Array.from(new Set(deduped.map(i => i.group)));

  const flatItems = groups.flatMap(g => deduped.filter(i => i.group === g));

  useEffect(() => {
    if (open) {
      searchReqSeq.current += 1;
      setQuery('');
      setRemoteItems([]);
      setRemoteLoading(false);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') { onClose(); return; }
    if (flatItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatItems.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      flatItems[activeIdx]?.action();
    }
  }, [open, flatItems, activeIdx, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  useEffect(() => {
    setActiveIdx((idx) => {
      if (flatItems.length === 0) return 0;
      return Math.min(idx, flatItems.length - 1);
    });
  }, [flatItems.length]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[92vw] max-w-[640px] max-h-[70vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--notion-card-elevated, var(--notion-card, white))', borderColor: 'var(--notion-border)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search or jump to..."
            className="flex-1 outline-none text-sm bg-transparent"
            style={{ color: 'var(--notion-text)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--notion-text-muted)', background: 'var(--notion-active)' }}>
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1.5">
          {remoteLoading && (
            <div className="px-4 py-2 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
              Searching...
            </div>
          )}
          {!remoteLoading && query.trim().length > 0 && query.trim().length < 2 && (
            <div className="px-4 py-2 text-xs" style={{ color: 'var(--notion-text-muted)' }}>
              Type at least 2 characters to search pages, leads, customers, employees, and system data.
            </div>
          )}
          {flatItems.length === 0 && (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--notion-text-muted)' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {groups.map(group => {
            const items = deduped.filter(i => i.group === group);
            const startIdx = flatItems.findIndex(i => i.group === group);
            return (
              <div key={group}>
                <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--notion-text-muted)' }}>
                  {group}
                </div>
                {items.map((item, relIdx) => {
                  const absIdx = startIdx + relIdx;
                  const isActive = absIdx === activeIdx;
                  return (
                    <button
                      key={item.id}
                      data-idx={absIdx}
                      onClick={item.action}
                      onMouseEnter={() => setActiveIdx(absIdx)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                      style={{
                        background: isActive ? 'var(--notion-hover)' : 'transparent',
                        color: 'var(--notion-text)',
                      }}
                    >
                      {item.icon && <span className="w-5 text-center flex-shrink-0"><HandIcon name={item.icon} size={16} /></span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{item.label}</div>
                        {item.description && (
                          <div className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>{item.description}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t flex items-center gap-4 text-xs" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-muted)' }}>
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
