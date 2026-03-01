'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/auth';
import { useTranslations } from 'next-intl';
const WORKSPACE_KEY = 'nexus_last_workspace';
const CREDENTIALS_KEY = 'nexus_saved_credentials';

export default function LoginPage() {
  return (
<LoginPageInner />
);
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

  // Restore last workspace name and saved credentials from localStorage
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
      // Remember workspace for next login
      try { localStorage.setItem(WORKSPACE_KEY, tenantSlug); } catch {}
      // Save or clear credentials
      try {
        if (rememberMe) {
          // Never persist plaintext passwords in localStorage.
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
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: '#fff',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #312e81 50%, #1e1b4b 70%, #0f172a 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow orbs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div className="animate-float" style={{ position: 'absolute', top: -160, left: -160, width: 320, height: 320, background: 'rgba(99,102,241,0.15)', borderRadius: '50%', filter: 'blur(80px)' }} />
        <div className="animate-float" style={{ position: 'absolute', top: '50%', right: -128, width: 384, height: 384, background: 'rgba(168,85,247,0.10)', borderRadius: '50%', filter: 'blur(80px)', animationDelay: '1s' }} />
        <div className="animate-float" style={{ position: 'absolute', bottom: -80, left: '33%', width: 288, height: 288, background: 'rgba(59,130,246,0.08)', borderRadius: '50%', filter: 'blur(80px)', animationDelay: '2s' }} />
      </div>

      {/* Card */}
      <div className="animate-fade-in" style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        maxWidth: 420,
        padding: '0 20px',
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1, #9333ea)',
            boxShadow: '0 0 30px rgba(99,102,241,0.25)',
            marginBottom: 16,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
            Nexus ERP
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            Intelligent Multi-Tenant Enterprise Platform
          </p>
        </div>

        {/* Glass card */}
        <div style={{
          background: 'rgba(255,255,255,0.07)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20,
          padding: 32,
          boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
        }}>
          {error && (
            <div style={{
              marginBottom: 20,
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.20)',
              borderRadius: 12,
              color: '#fca5a5',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#cbd5e1', marginBottom: 6 }}>
                Workspace
              </label>
              <input
                type="text"
                name="workspace"
                value={tenantSlug}
                onChange={e => setTenantSlug(e.target.value)}
                autoComplete="organization"
                placeholder="your-company (blank = platform admin)"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#cbd5e1', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username email"
                placeholder="you@company.com"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#cbd5e1', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                name="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
            </div>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 24,
              cursor: 'pointer',
              userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{
                  width: 16,
                  height: 16,
                  accentColor: '#6366f1',
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{t('rememberCredentials')}</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px 0',
                fontSize: 14,
                fontWeight: 600,
                color: '#fff',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                border: 'none',
                borderRadius: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                boxShadow: '0 4px 16px rgba(99,102,241,0.25)',
                transition: 'opacity 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 4px 24px rgba(99,102,241,0.35)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.25)'; }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Powered by Gemini AI &middot; n8n Automation</p>
          </div>
        </div>
      </div>
    </div>
  );
}
