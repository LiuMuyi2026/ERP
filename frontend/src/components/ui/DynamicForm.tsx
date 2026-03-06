'use client';

import { useState, useMemo, useEffect, useRef } from 'react';

/**
 * DynamicForm — renders a form view driven by module_definition field configs.
 *
 * Reads the `fields` array from a module_definition and renders input controls
 * for each field. Layout fields (Section Break, Column Break) control structure.
 */

export interface FieldDef {
  fieldname: string;
  fieldtype: string;
  label: string;
  options?: string;
  reqd?: boolean;
  hidden?: boolean;
  read_only?: boolean;
  in_list_view?: boolean;
  in_standard_filter?: boolean;
  default?: string;
  description?: string;
  width?: string;
  sort_order?: number;
}

export interface DynamicFormProps {
  fields: FieldDef[];
  values: Record<string, any>;
  onChange: (fieldname: string, value: any) => void;
  readOnly?: boolean;
  errors?: Record<string, string>;
  /** For Link field resolution: { module, doctype } context for API calls */
  linkContext?: { module: string; doctype: string };
  /** Pre-resolved link names: { LinkType: { id: displayName } } */
  linkNames?: Record<string, Record<string, string>>;
}

/**
 * Validate form values against field definitions.
 * Returns a map of fieldname → error message, or empty object if valid.
 */
export function validateForm(fields: FieldDef[], values: Record<string, any>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.hidden || ['Section Break', 'Column Break', 'Tab Break'].includes(f.fieldtype)) continue;
    if (f.reqd) {
      const v = values[f.fieldname];
      if (v === undefined || v === null || v === '' || (f.fieldtype === 'Check' && !v)) {
        errors[f.fieldname] = `${f.label} 为必填项`;
      }
    }
  }
  return errors;
}

// Group fields into sections → columns for layout
interface Section {
  label: string;
  columns: FieldDef[][];
}

function groupIntoSections(fields: FieldDef[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section = { label: '', columns: [[]] };

  for (const f of fields) {
    if (f.hidden) continue;
    if (f.fieldtype === 'Tab Break') {
      // Tab breaks treated as section breaks for now
      if (currentSection.columns.some(col => col.length > 0)) sections.push(currentSection);
      currentSection = { label: f.label || '', columns: [[]] };
    } else if (f.fieldtype === 'Section Break') {
      if (currentSection.columns.some(col => col.length > 0)) sections.push(currentSection);
      currentSection = { label: f.label || '', columns: [[]] };
    } else if (f.fieldtype === 'Column Break') {
      currentSection.columns.push([]);
    } else {
      const lastCol = currentSection.columns[currentSection.columns.length - 1];
      lastCol.push(f);
    }
  }
  if (currentSection.columns.some(col => col.length > 0)) sections.push(currentSection);
  return sections;
}

function LinkFieldInput({
  field, value, onChange, readOnly, linkContext, linkNames,
}: {
  field: FieldDef; value: any; onChange: (v: any) => void; readOnly?: boolean;
  linkContext?: { module: string; doctype: string };
  linkNames?: Record<string, Record<string, string>>;
}) {
  const [searchText, setSearchText] = useState('');
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = value
    ? (linkNames?.[field.options || '']?.[value] || value.slice(0, 8) + '…')
    : '';

  const doSearch = (q: string) => {
    if (!linkContext || !field.options) return;
    setLoading(true);
    import('@/lib/api').then(({ api }) => {
      api.get<{ id: string; title: string }[]>(
        `/api/module-data/${linkContext.module}/${linkContext.doctype}/link-search/${field.options}?q=${encodeURIComponent(q)}`
      ).then(results => {
        setOptions(Array.isArray(results) ? results : []);
      }).catch(() => setOptions([])).finally(() => setLoading(false));
    });
  };

  useEffect(() => {
    // Close dropdown on outside click
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const baseInput = "w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:ring-1";
  const baseStyle = {
    borderColor: 'var(--notion-border)',
    background: readOnly ? 'var(--notion-hover)' : 'var(--notion-card, white)',
    color: 'var(--notion-text)',
  };

  if (readOnly || field.read_only) {
    return <input type="text" value={displayName} readOnly className={baseInput} style={baseStyle} />;
  }

  return (
    <div ref={containerRef} className="relative">
      {value && !open ? (
        <div className="flex items-center gap-2">
          <div className={baseInput + ' flex items-center justify-between'} style={baseStyle}>
            <span style={{ color: '#7c3aed' }}>{displayName}</span>
            <button type="button" onClick={() => { onChange(null); setSearchText(''); }}
              className="text-xs" style={{ color: '#9B9A97' }}>✕</button>
          </div>
        </div>
      ) : (
        <input type="text" value={searchText}
          placeholder={field.options ? `搜索 ${field.options}...` : '搜索...'}
          className={baseInput} style={baseStyle}
          onFocus={() => { setOpen(true); doSearch(searchText); }}
          onChange={e => {
            setSearchText(e.target.value);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => doSearch(e.target.value), 300);
          }} />
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg shadow-lg overflow-hidden"
          style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)', maxHeight: 200 }}>
          {loading && <div className="px-3 py-2 text-xs" style={{ color: '#9B9A97' }}>搜索中...</div>}
          {!loading && options.length === 0 && <div className="px-3 py-2 text-xs" style={{ color: '#9B9A97' }}>无结果</div>}
          <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
            {options.map(opt => (
              <button key={opt.id} type="button"
                className="w-full text-left px-3 py-2 text-sm transition-colors"
                style={{ color: 'var(--notion-text)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { onChange(opt.id); setSearchText(''); setOpen(false); }}>
                {opt.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field, value, onChange, readOnly, linkContext, linkNames,
}: {
  field: FieldDef; value: any; onChange: (v: any) => void; readOnly?: boolean;
  linkContext?: { module: string; doctype: string };
  linkNames?: Record<string, Record<string, string>>;
}) {
  const isRO = readOnly || field.read_only;
  const baseInput = "w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors focus:ring-1";
  const baseStyle = {
    borderColor: 'var(--notion-border)',
    background: isRO ? 'var(--notion-hover)' : 'var(--notion-card, white)',
    color: 'var(--notion-text)',
  };

  switch (field.fieldtype) {
    case 'Data':
      return (
        <input type={field.options === 'Email' ? 'email' : field.options === 'Phone' ? 'tel' : field.options === 'URL' ? 'url' : 'text'}
          value={value ?? ''} onChange={e => onChange(e.target.value)}
          readOnly={isRO} required={field.reqd} placeholder={field.description || ''}
          className={baseInput} style={baseStyle} />
      );

    case 'Int':
      return (
        <input type="number" step="1" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : parseInt(e.target.value))}
          readOnly={isRO} required={field.reqd} className={baseInput} style={baseStyle} />
      );

    case 'Float':
    case 'Currency':
      return (
        <input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          readOnly={isRO} required={field.reqd} className={baseInput} style={baseStyle} />
      );

    case 'Check':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
            disabled={isRO} className="w-4 h-4 rounded" />
          <span className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{field.label}</span>
        </label>
      );

    case 'Select': {
      const opts = (field.options || '').split('\n').filter(Boolean);
      return (
        <select value={value ?? ''} onChange={e => onChange(e.target.value)}
          disabled={isRO} required={field.reqd} className={baseInput} style={{ ...baseStyle, cursor: isRO ? 'default' : 'pointer' }}>
          <option value="">请选择...</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    case 'Date':
      return (
        <input type="date" value={value ?? ''} onChange={e => onChange(e.target.value || null)}
          readOnly={isRO} required={field.reqd} className={baseInput} style={baseStyle} />
      );

    case 'Datetime':
      return (
        <input type="datetime-local" value={value ?? ''} onChange={e => onChange(e.target.value || null)}
          readOnly={isRO} required={field.reqd} className={baseInput} style={baseStyle} />
      );

    case 'Text':
      return (
        <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={3}
          readOnly={isRO} required={field.reqd} className={baseInput + ' resize-y'} style={baseStyle} />
      );

    case 'TextEditor':
      return (
        <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={5}
          readOnly={isRO} required={field.reqd} className={baseInput + ' resize-y'} style={baseStyle} />
      );

    case 'JSON':
      return (
        <textarea value={typeof value === 'object' ? JSON.stringify(value, null, 2) : (value ?? '')}
          onChange={e => { try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); } }}
          rows={5} readOnly={isRO} className={baseInput + ' font-mono text-xs resize-y'} style={baseStyle} />
      );

    case 'Link':
      return (
        <LinkFieldInput field={field} value={value} onChange={onChange}
          readOnly={isRO} linkContext={linkContext} linkNames={linkNames} />
      );

    case 'Attach':
      return (
        <input type="file" disabled={isRO}
          onChange={e => onChange(e.target.files?.[0]?.name || null)}
          className="text-sm" style={{ color: 'var(--notion-text-muted)' }} />
      );

    default:
      return (
        <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)}
          readOnly={isRO} className={baseInput} style={baseStyle} />
      );
  }
}

export default function DynamicForm({ fields, values, onChange, readOnly, errors = {}, linkContext, linkNames }: DynamicFormProps) {
  const sections = useMemo(() => groupIntoSections(fields), [fields]);

  return (
    <div className="space-y-6">
      {sections.map((section, si) => (
        <div key={si}>
          {section.label && (
            <h3 className="text-sm font-semibold mb-3 pb-1" style={{ color: 'var(--notion-text)', borderBottom: '1px solid var(--notion-border)' }}>
              {section.label}
            </h3>
          )}
          <div className={`grid gap-4 ${section.columns.length > 1 ? `grid-cols-${section.columns.length}` : ''}`}
            style={section.columns.length > 1 ? { gridTemplateColumns: `repeat(${section.columns.length}, 1fr)` } : undefined}>
            {section.columns.map((col, ci) => (
              <div key={ci} className="space-y-4">
                {col.map(field => (
                  <div key={field.fieldname}>
                    {field.fieldtype !== 'Check' && (
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-muted)' }}>
                        {field.label}
                        {field.reqd && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                    )}
                    <FieldInput field={field} value={values[field.fieldname]} onChange={v => onChange(field.fieldname, v)} readOnly={readOnly} linkContext={linkContext} linkNames={linkNames} />
                    {errors[field.fieldname] && (
                      <p className="text-[11px] mt-0.5 font-medium" style={{ color: '#ef4444' }}>{errors[field.fieldname]}</p>
                    )}
                    {field.description && field.fieldtype !== 'Check' && !errors[field.fieldname] && (
                      <p className="text-[11px] mt-0.5" style={{ color: '#9B9A97' }}>{field.description}</p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
