'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import CommandPalette from '@/components/ui/CommandPalette';

import { ThemeProvider } from '@/lib/theme';
import GlobalAIToolbar from '@/components/layout/GlobalAIToolbar';
import { getAuthSnapshot, refreshProfile } from '@/lib/auth';
import { Toaster } from 'react-hot-toast';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const tenant = params.tenant as string;
  const router = useRouter();
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const mainRef = useRef<HTMLElement>(null);

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

  return (
    <ThemeProvider>
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--notion-bg)' }}>
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

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} tenant={tenant} />
      <Toaster position="top-center" />
    </div>
    </ThemeProvider>
  );
}
