'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/auth';
import { useTranslations } from 'next-intl';

const WORKSPACE_KEY = 'nexus_last_workspace';
const CREDENTIALS_KEY = 'nexus_saved_credentials';

export default function LoginPage() {
  return <LoginPageInner />;
}

function LoginPageInner() {
  const t = useTranslations('login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WORKSPACE_KEY);
      if (saved) setTenantSlug(saved);
    } catch {}
    try {
      const creds = localStorage.getItem(CREDENTIALS_KEY);
      if (creds) {
        const { email: savedEmail } = JSON.parse(creds);
        setEmail(savedEmail ?? '');
        setRememberMe(true);
      }
    } catch {
      localStorage.removeItem(CREDENTIALS_KEY);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password, tenantSlug || undefined);
      try { localStorage.setItem(WORKSPACE_KEY, tenantSlug); } catch {}
      try {
        if (rememberMe) {
          localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ email }));
        } else {
          localStorage.removeItem(CREDENTIALS_KEY);
        }
      } catch {}
      if (data.role === 'platform_admin') {
        router.push('/platform');
      } else {
        router.push(`/${data.tenant_slug}/workspace`);
      }
    } catch (err: any) {
      setError(err.message || t('loginFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--notion-bg)',
    }}>
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>

        {/* Logo + Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'var(--notion-accent)',
            marginBottom: 16,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--notion-text)', letterSpacing: '-0.02em', margin: 0 }}>
            Nexus ERP
          </h1>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--notion-card)',
          border: '1px solid var(--notion-border)',
          borderRadius: 16,
          padding: '28px 28px 24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)',
        }}>
          {error && (
            <div style={{
              marginBottom: 18,
              padding: '10px 12px',
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 10,
              color: '#dc2626',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--notion-text-muted)', marginBottom: 5 }}>
                {t('workspace')}
              </label>
              <input
                type="text"
                name="workspace"
                value={tenantSlug}
                onChange={e => setTenantSlug(e.target.value)}
                autoComplete="organization"
                placeholder={t('workspacePlaceholder')}
                className="login-input"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--notion-text-muted)', marginBottom: 5 }}>
                {t('email')}
              </label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username email"
                placeholder={t('emailPlaceholder')}
                className="login-input"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--notion-text-muted)', marginBottom: 5 }}>
                {t('password')}
              </label>
              <input
                type="password"
                name="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder={t('passwordPlaceholder')}
                className="login-input"
              />
            </div>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 20,
              cursor: 'pointer',
              userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: 'var(--notion-accent)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: 'var(--notion-text-muted)' }}>{t('rememberCredentials')}</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 0',
                fontSize: 14,
                fontWeight: 600,
                color: '#fff',
                background: 'var(--notion-accent)',
                border: 'none',
                borderRadius: 10,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = loading ? '0.6' : '1'; }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('signingIn')}
                </span>
              ) : t('signIn')}
            </button>
          </form>
        </div>
      </div>

      <style jsx>{`
        .login-input {
          width: 100%;
          padding: 9px 12px;
          font-size: 14px;
          background: var(--notion-bg);
          border: 1px solid var(--notion-border);
          border-radius: 8px;
          color: var(--notion-text);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .login-input:focus {
          border-color: var(--notion-accent);
          box-shadow: 0 0 0 2px rgba(124,58,237,0.12);
        }
        .login-input::placeholder {
          color: var(--notion-text-faint);
        }
      `}</style>
    </div>
  );
}
