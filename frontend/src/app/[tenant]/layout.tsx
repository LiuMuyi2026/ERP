'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import CommandPalette from '@/components/ui/CommandPalette';

import { ThemeProvider } from '@/lib/theme';
import GlobalAIToolbar from '@/components/layout/GlobalAIToolbar';
import { getAuthSnapshot, refreshProfile, logout } from '@/lib/auth';
import { Toaster } from 'react-hot-toast';

type MobileNavItem = {
  key: string;
  label: string;
  href: string;
};

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const tenant = params.tenant as string;
  const router = useRouter();
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Sidebar collapse
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nexus_sidebar_collapsed') === 'true';
    }
    return false;
  });
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('nexus_sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  // Page context for AI
  const [pageContext, setPageContext] = useState('');

  // Workspace page editor has its own AI buttons in its toolbar
  const isWorkspacePage = /\/workspace\/[^/]+$/.test(pathname);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    try {
      const { token, user: u } = getAuthSnapshot();
      if (!token || !u) {
        router.replace('/login');
        return;
      }
      if (u.role === 'platform_admin') {
        router.replace('/platform');
        return;
      }
      if (!u.tenant_slug || u.tenant_slug !== tenant) {
        router.replace('/login');
      }
      // Refresh profile to pick up latest avatar/name
      refreshProfile().then(setUser).catch(() => {});
    } catch {
      router.replace('/login');
    }
  }, [router, tenant]);

  useEffect(() => {
    try {
      const { user: u } = getAuthSnapshot();
      setUser(u);
    } catch {}
    const onAvatarUpdate = () => {
      try {
        const { user: u } = getAuthSnapshot();
        setUser(u);
      } catch {}
    };
    window.addEventListener('avatar-updated', onAvatarUpdate);
    return () => window.removeEventListener('avatar-updated', onAvatarUpdate);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Extract page text whenever pathname changes
  useEffect(() => {
    setPageContext('');
    const timer = setTimeout(() => {
      if (mainRef.current) {
        const text = mainRef.current.innerText?.slice(0, 4000) || '';
        setPageContext(text);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [pathname]);

  const openCmd = useCallback(() => setCmdOpen(true), []);
  const navItems: MobileNavItem[] = [
    { key: 'workspace', label: 'Workspace', href: `/${tenant}/workspace` },
    { key: 'crm', label: 'CRM', href: `/${tenant}/crm` },
    { key: 'messages', label: 'Messages', href: `/${tenant}/messages` },
    { key: 'orders', label: 'Orders', href: `/${tenant}/orders` },
    { key: 'hr', label: 'HR', href: `/${tenant}/hr` },
    { key: 'accounting', label: 'Accounting', href: `/${tenant}/accounting` },
    { key: 'inventory', label: 'Inventory', href: `/${tenant}/inventory` },
    { key: 'operations', label: 'Operations', href: `/${tenant}/operations` },
    { key: 'notifications', label: 'Notifications', href: `/${tenant}/notifications` },
    { key: 'settings', label: 'Settings', href: `/${tenant}/settings` },
    { key: 'admin', label: 'Admin', href: `/${tenant}/admin` },
  ];
  const mobileTabs: MobileNavItem[] = [
    { key: 'workspace', label: 'Workspace', href: `/${tenant}/workspace` },
    { key: 'crm', label: 'CRM', href: `/${tenant}/crm` },
    { key: 'messages', label: 'Messages', href: `/${tenant}/messages` },
    { key: 'notifications', label: 'Alerts', href: `/${tenant}/notifications` },
    { key: 'settings', label: 'Me', href: `/${tenant}/settings` },
  ];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(v => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function isActivePath(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const titleMap: Record<string, string> = {
    workspace: 'Workspace',
    crm: 'CRM',
    messages: 'Messages',
    orders: 'Orders',
    hr: 'HR',
    accounting: 'Accounting',
    inventory: 'Inventory',
    operations: 'Operations',
    notifications: 'Notifications',
    settings: 'Settings',
    admin: 'Admin',
  };
  const currentTitle = titleMap[pathname.split('/')[2] || 'workspace'] || 'Nexus ERP';

  const mobileContent = (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div
        className="h-12 flex items-center justify-between px-3 flex-shrink-0"
        style={{ background: 'var(--notion-card)', borderBottom: '1px solid var(--notion-border)' }}
      >
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ color: 'var(--notion-text-muted)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{currentTitle}</div>
        <button
          onClick={openCmd}
          aria-label="Open search"
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ color: 'var(--notion-text-muted)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" />
          </svg>
        </button>
      </div>

      <main
        ref={mainRef}
        className="flex-1 min-h-0 overflow-auto"
        style={{
          background: 'var(--notion-bg)',
          paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </main>

      <div
        className="fixed bottom-0 left-0 right-0 h-14 px-2 flex items-center justify-between"
        style={{
          background: 'var(--notion-card)',
          borderTop: '1px solid var(--notion-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          zIndex: 80,
        }}
      >
        {mobileTabs.map((tab) => {
          const active = isActivePath(tab.href);
          return (
            <button
              key={tab.key}
              onClick={() => router.push(tab.href)}
              className="flex-1 h-full text-[11px] font-medium"
              style={{ color: active ? 'var(--notion-accent)' : 'var(--notion-text-muted)' }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-[120]" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={() => setMobileNavOpen(false)}>
          <div
            className="h-full w-[82%] max-w-[320px] px-3 py-3"
            style={{ background: 'var(--notion-card)', borderRight: '1px solid var(--notion-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-2 mb-2" style={{ borderBottom: '1px solid var(--notion-border)' }}>
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--notion-text)' }}>{user?.name || user?.email || 'User'}</div>
              <div className="text-xs truncate" style={{ color: 'var(--notion-text-muted)' }}>{tenant}</div>
            </div>
            <div className="space-y-1 max-h-[calc(100%-110px)] overflow-auto">
              {navItems.map((item) => {
                const active = isActivePath(item.href);
                return (
                  <button
                    key={item.key}
                    onClick={() => { router.push(item.href); setMobileNavOpen(false); }}
                    className="w-full h-10 px-3 rounded-lg text-left text-sm"
                    style={{
                      background: active ? 'var(--notion-active)' : 'transparent',
                      color: active ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => logout()}
              className="absolute bottom-4 left-4 right-4 h-10 rounded-lg text-sm font-semibold"
              style={{ background: '#ef4444', color: 'white' }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ThemeProvider>
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: 'var(--notion-bg)' }}>
      {isMobile ? (
        mobileContent
      ) : (
        <>
          <Sidebar
            tenant={tenant}
            userName={user?.name || user?.email}
            userRole={user?.role}
            avatarUrl={user?.avatar_url}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            onOpenCommandPalette={openCmd}
          />

          {/* ── Main area ── */}
          <div className="flex flex-col flex-1 min-w-0">
            {!isWorkspacePage ? (
              <GlobalAIToolbar tenant={tenant} mainRef={mainRef} pageContext={pageContext}>
                <main ref={mainRef} className="flex-1 overflow-auto" style={{ background: 'var(--notion-bg)' }}>
                  {children}
                </main>
              </GlobalAIToolbar>
            ) : (
              <main ref={mainRef} className="flex-1 overflow-auto" style={{ background: 'var(--notion-bg)' }}>
                {children}
              </main>
            )}
          </div>
        </>
      )}

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} tenant={tenant} />
      <Toaster position="top-center" />
    </div>
    </ThemeProvider>
  );
}
