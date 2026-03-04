'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import WhatsAppInbox from '@/components/messaging/WhatsAppInbox';
import WhatsAppBroadcast from '@/components/messaging/WhatsAppBroadcast';
import EmailInbox from '@/components/messaging/EmailInbox';
import InternalMessages from '@/components/messaging/InternalMessages';
import MessageManagement from '../crm/components/MessageManagement';

type MsgTab = 'whatsapp' | 'email' | 'internal' | 'broadcast' | 'commlog';
const VALID_TABS: MsgTab[] = ['whatsapp', 'email', 'internal', 'broadcast', 'commlog'];

const TAB_CONFIG: { key: MsgTab; icon: string; color: string }[] = [
  { key: 'whatsapp',  icon: 'wa',       color: '#00a884' },
  { key: 'email',     icon: 'email',    color: '#3b82f6' },
  { key: 'internal',  icon: 'internal', color: '#7c3aed' },
  { key: 'broadcast', icon: 'broadcast', color: '#7c3aed' },
  { key: 'commlog',   icon: 'commlog',  color: '#667781' },
];

function TabIcon({ type, active, color }: { type: string; active: boolean; color: string }) {
  const c = active ? color : '#8696a0';
  if (type === 'wa') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={c}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.252-.149-2.868.852.852-2.868-.149-.252A7.963 7.963 0 014 12a8 8 0 1116 0 8 8 0 01-8 8z"/>
    </svg>
  );
  if (type === 'email') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  );
  if (type === 'internal') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
  if (type === 'commlog') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  );
  // broadcast
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M17.66 12.34l1.41-1.41M12 18a6 6 0 0 0 0-12"/>
      <circle cx="12" cy="18" r="2"/>
    </svg>
  );
}

export default function MessagesCenter() {
  const t = useTranslations('msgCenter');
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<MsgTab>('whatsapp');

  // Read ?tab= from URL on mount
  useEffect(() => {
    const tab = searchParams.get('tab') as MsgTab | null;
    if (tab && VALID_TABS.includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const tabLabels: Record<MsgTab, string> = {
    whatsapp:  t('tabWhatsApp')  || 'WhatsApp',
    email:     t('tabEmail')     || 'Email',
    internal:  t('tabInternal')  || 'Internal',
    broadcast: t('tabBroadcast') || 'Broadcast',
    commlog:   t('tabCommLog')   || 'Comm Log',
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: '#f0f2f5' }}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 py-2 flex-shrink-0" style={{ background: 'white', borderBottom: '1px solid #e5e7eb' }}>
        <h1 className="text-base font-semibold mr-4" style={{ color: '#3b4a54' }}>
          {t('title') || 'Messages Center'}
        </h1>
        {TAB_CONFIG.map(({ key, icon, color }) => {
          const active = activeTab === key;
          return (
            <button key={key} onClick={() => setActiveTab(key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: active ? `${color}15` : 'transparent',
                color: active ? color : '#667781',
                border: active ? `1px solid ${color}30` : '1px solid transparent',
              }}>
              <TabIcon type={icon} active={active} color={color} />
              {tabLabels[key]}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'whatsapp'  && <WhatsAppInbox />}
        {activeTab === 'email'     && <EmailInbox />}
        {activeTab === 'internal'  && <InternalMessages />}
        {activeTab === 'broadcast' && <WhatsAppBroadcast />}
        {activeTab === 'commlog'   && <div className="px-8 py-4 overflow-auto h-full" style={{ background: 'white' }}><MessageManagement /></div>}
      </div>
    </div>
  );
}
