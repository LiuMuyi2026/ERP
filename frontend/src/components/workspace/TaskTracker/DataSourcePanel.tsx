'use client';

import { useState } from 'react';
import { HandIcon } from '@/components/ui/HandIcon';
import { useTranslations } from 'next-intl';
interface DataSourceConfig {
  internalPageId?: string;
  dingtalk?: { webhookUrl?: string };
  feishu?: { appId?: string; appSecret?: string };
  wecom?: { corpId?: string; agentId?: string };
  subProjectPageId?: string;
  dependency?: { fromTaskId?: string; toTaskId?: string };
}

interface DataSourcePanelProps {
  config: DataSourceConfig;
  onChange: (cfg: DataSourceConfig) => void;
  onClose: () => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B9A97' }}>{children}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--notion-border)' }} />
    </div>
  );
}

function InputField({ label, value, placeholder, onChange, type = 'text' }: {
  label: string; value: string; placeholder?: string;
  onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="mb-2">
      <label className="text-[10px] font-medium block mb-1" style={{ color: '#9B9A97' }}>{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full text-xs px-3 py-2 rounded-lg outline-none"
        style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-bg)', color: 'var(--notion-text)' }}
      />
    </div>
  );
}

export default function DataSourcePanel({ config, onChange, onClose }: DataSourcePanelProps) {
  const t = useTranslations('taskTracker');
  const [saved, setSaved] = useState<string | null>(null);

  function patch(updates: Partial<DataSourceConfig>) {
    onChange({ ...config, ...updates });
  }

  function saveSection(section: string) {
    setSaved(section);
    setTimeout(() => setSaved(null), 2000);
  }

  const btnStyle = {
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '5px 14px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div className="fixed right-0 top-0 h-full z-[90] flex flex-col shadow-2xl"
      style={{ width: 480, background: 'var(--notion-card-elevated, var(--notion-card, white))', borderLeft: '1px solid var(--notion-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--notion-border)' }}>
        <span className="text-sm font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--notion-text)' }}><HandIcon name="package" size={14} /> {t('dataSourceTitle')}</span>
        <button onClick={onClose} style={{ color: '#9B9A97' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--notion-text)'}
          onMouseLeave={e => e.currentTarget.style.color = '#9B9A97'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">

        {/* Internal database */}
        <SectionHeader>{t('internalDb')}</SectionHeader>
        <div className="rounded-xl p-4" style={{ border: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
          <InputField
            label={t('linkedPageId')}
            value={config.internalPageId ?? ''}
            placeholder={t('pastePageId')}
            onChange={v => patch({ internalPageId: v })}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px]" style={{ color: '#9B9A97' }}>
              {config.internalPageId ? `✓ ${t('internalConfigured')}` : t('notConfigured')}
            </span>
            <button style={btnStyle} onClick={() => saveSection('internal')}>
              {saved === 'internal' ? `✓ ${t('saved')}` : <><HandIcon name="link" size={11} /> {t('linkBtn')}</>}
            </button>
          </div>
        </div>

        {/* 钉钉 */}
        <SectionHeader>{t('dingtalkIntegration')}</SectionHeader>
        <div className="rounded-xl p-4" style={{ border: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
          <div className="flex items-center gap-2 mb-3">
            <HandIcon name="phone" size={18} />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{t('dingtalkWebhook')}</p>
              <p className="text-[10px]" style={{ color: '#9B9A97' }}>{t('dingtalkDesc')}</p>
            </div>
          </div>
          <InputField
            label="Webhook URL"
            value={config.dingtalk?.webhookUrl ?? ''}
            placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
            onChange={v => patch({ dingtalk: { ...config.dingtalk, webhookUrl: v } })}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: '#FFF3E0', color: '#F2994A' }}>
              {t('configOnlyNoSync')}
            </span>
            <button style={btnStyle} onClick={() => saveSection('dingtalk')}>
              {saved === 'dingtalk' ? `✓ ${t('saved')}` : <><HandIcon name="plug" size={11} /> {t('saveBtn')}</>}
            </button>
          </div>
        </div>

        {/* 飞书 */}
        <SectionHeader>{t('feishuIntegration')}</SectionHeader>
        <div className="rounded-xl p-4" style={{ border: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
          <div className="flex items-center gap-2 mb-3">
            <HandIcon name="kite" size={18} />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{t('feishuOpenPlatform')}</p>
              <p className="text-[10px]" style={{ color: '#9B9A97' }}>{t('feishuDesc')}</p>
            </div>
          </div>
          <InputField
            label="App ID"
            value={config.feishu?.appId ?? ''}
            placeholder="cli_xxxxxxxx"
            onChange={v => patch({ feishu: { ...config.feishu, appId: v } })}
          />
          <InputField
            label="App Secret"
            value={config.feishu?.appSecret ?? ''}
            placeholder="xxxxxxxxxxxxxxxx"
            type="password"
            onChange={v => patch({ feishu: { ...config.feishu, appSecret: v } })}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: '#FFF3E0', color: '#F2994A' }}>
              {t('configOnlyNoSync')}
            </span>
            <button style={btnStyle} onClick={() => saveSection('feishu')}>
              {saved === 'feishu' ? `✓ ${t('saved')}` : <><HandIcon name="plug" size={11} /> {t('saveBtn')}</>}
            </button>
          </div>
        </div>

        {/* 企业微信 */}
        <SectionHeader>{t('wecomIntegration')}</SectionHeader>
        <div className="rounded-xl p-4" style={{ border: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
          <div className="flex items-center gap-2 mb-3">
            <HandIcon name="chat-bubble" size={18} />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{t('wecomApi')}</p>
              <p className="text-[10px]" style={{ color: '#9B9A97' }}>{t('wecomDesc')}</p>
            </div>
          </div>
          <InputField
            label={t('corpId')}
            value={config.wecom?.corpId ?? ''}
            placeholder="ww..."
            onChange={v => patch({ wecom: { ...config.wecom, corpId: v } })}
          />
          <InputField
            label={t('agentId')}
            value={config.wecom?.agentId ?? ''}
            placeholder="1000001"
            onChange={v => patch({ wecom: { ...config.wecom, agentId: v } })}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: '#FFF3E0', color: '#F2994A' }}>
              {t('configOnlyNoSync')}
            </span>
            <button style={btnStyle} onClick={() => saveSection('wecom')}>
              {saved === 'wecom' ? `✓ ${t('saved')}` : <><HandIcon name="plug" size={11} /> {t('saveBtn')}</>}
            </button>
          </div>
        </div>

        {/* Sub-project */}
        <SectionHeader>{t('subProject')}</SectionHeader>
        <div className="rounded-xl p-4" style={{ border: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
          <InputField
            label={t('linkedSubPageId')}
            value={config.subProjectPageId ?? ''}
            placeholder={t('pasteSubPageId')}
            onChange={v => patch({ subProjectPageId: v })}
          />
          <div className="flex items-center gap-2 mt-2">
            <button style={btnStyle} onClick={() => saveSection('sub')}>
              {saved === 'sub' ? `✓ ${t('saved')}` : t('linkSubProject')}
            </button>
            <button className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
              {t('newSubProject')}
            </button>
          </div>
        </div>

        {/* Dependencies */}
        <SectionHeader>{t('taskDependency')}</SectionHeader>
        <div className="rounded-xl p-4" style={{ border: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
          <p className="text-xs mb-3" style={{ color: '#9B9A97' }}>{t('dependencyDesc')}</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <InputField
                label={t('currentTask')}
                value={config.dependency?.fromTaskId ?? ''}
                placeholder={t('taskIdPlaceholder')}
                onChange={v => patch({ dependency: { ...config.dependency, fromTaskId: v } })}
              />
            </div>
            <div className="pt-4 text-xs" style={{ color: '#9B9A97' }}>{t('dependsOn')}</div>
            <div className="flex-1">
              <InputField
                label={t('predecessorTask')}
                value={config.dependency?.toTaskId ?? ''}
                placeholder={t('taskIdPlaceholder')}
                onChange={v => patch({ dependency: { ...config.dependency, toTaskId: v } })}
              />
            </div>
          </div>
          <button style={btnStyle} onClick={() => saveSection('dependency')}>
            {saved === 'dependency' ? `✓ ${t('saved')}` : t('saveDependency')}
          </button>
        </div>

        <div className="mt-6 pb-4 text-xs text-center" style={{ color: '#9B9A97' }}>
          {t('dataSourceFooter')}
        </div>
      </div>
    </div>
  );
}
