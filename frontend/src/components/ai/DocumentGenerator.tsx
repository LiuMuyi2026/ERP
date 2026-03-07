'use client';

import { useState } from 'react';
import { api, getApiUrl, getAuthHeaders } from '@/lib/api';

const TEMPLATE_TYPES = [
  { key: 'weekly_report', label: 'Weekly Report', icon: '📊', description: 'Auto-generate weekly sales/business report' },
  { key: 'monthly_report', label: 'Monthly Report', icon: '📈', description: 'Comprehensive monthly business analysis' },
  { key: 'contract', label: 'Contract Draft', icon: '📝', description: 'Generate contract from lead/customer data' },
  { key: 'quotation', label: 'Quotation', icon: '💰', description: 'Generate formal price quotation' },
  { key: 'email_template', label: 'Email Template', icon: '✉️', description: 'Generate professional business email' },
  { key: 'meeting_minutes', label: 'Meeting Minutes', icon: '📋', description: 'Generate meeting notes and action items' },
];

export default function DocumentGenerator({ onGenerated }: { onGenerated?: (content: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [instructions, setInstructions] = useState('');
  const [contextIds, setContextIds] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');

  const handleGenerate = async () => {
    if (!selectedType) return;
    setGenerating(true);
    setResult('');

    try {
      const ids = contextIds.split(',').map(s => s.trim()).filter(Boolean);
      const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(`${getApiUrl()}/api/ai/generate-document`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          template_type: selectedType,
          context_ids: ids,
          extra_instructions: instructions || null,
        }),
      });

      if (!response.ok) throw new Error('Generation failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.chunk) {
                fullText += parsed.chunk;
                setResult(fullText);
              }
            } catch {}
          }
        }
      }

      onGenerated?.(fullText);
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        AI Generate
      </button>
    );
  }

  return (
    <div style={{
      background: 'var(--notion-bg-primary, #fff)',
      border: '1px solid var(--notion-border, #e5e5e5)',
      borderRadius: 12,
      padding: 20,
      maxWidth: 600,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--notion-text-primary, #37352f)', margin: 0 }}>
          AI Document Generator
        </h3>
        <button onClick={() => { setOpen(false); setResult(''); }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--notion-text-secondary)' }}>
          &times;
        </button>
      </div>

      {/* Template selection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {TEMPLATE_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => setSelectedType(t.key)}
            style={{
              padding: '10px 8px',
              border: selectedType === t.key ? '2px solid #6366f1' : '1px solid var(--notion-border, #e5e5e5)',
              borderRadius: 8,
              background: selectedType === t.key ? '#eef2ff' : 'var(--notion-bg-secondary, #f7f6f3)',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--notion-text-primary, #37352f)' }}>{t.label}</div>
          </button>
        ))}
      </div>

      {/* Instructions */}
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Additional instructions (optional)..."
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid var(--notion-border, #e5e5e5)',
          borderRadius: 8,
          fontSize: 13,
          minHeight: 60,
          resize: 'vertical',
          background: 'var(--notion-bg-secondary, #f7f6f3)',
          color: 'var(--notion-text-primary, #37352f)',
          marginBottom: 12,
        }}
      />

      <button
        onClick={handleGenerate}
        disabled={!selectedType || generating}
        style={{
          width: '100%',
          padding: '10px',
          background: selectedType && !generating ? '#6366f1' : '#ccc',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          cursor: selectedType && !generating ? 'pointer' : 'not-allowed',
        }}
      >
        {generating ? 'Generating...' : 'Generate Document'}
      </button>

      {/* Result */}
      {result && (
        <div style={{
          marginTop: 16,
          padding: 16,
          background: 'var(--notion-bg-secondary, #f7f6f3)',
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.7,
          color: 'var(--notion-text-primary, #37352f)',
          whiteSpace: 'pre-wrap',
          maxHeight: 400,
          overflowY: 'auto',
        }}>
          {result}
        </div>
      )}
    </div>
  );
}
