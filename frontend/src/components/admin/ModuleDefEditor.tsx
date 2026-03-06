'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { HandIcon } from '@/components/ui/HandIcon';
import SlideOver from '@/components/ui/SlideOver';
import DynamicForm from '@/components/ui/DynamicForm';

// ── Types ────────────────────────────────────────────────────────────────────

interface FieldDef {
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
}

interface ModuleDef {
  id: string;
  module: string;
  doctype: string;
  label: string;
  label_plural: string;
  icon: string;
  table_name: string;
  fields: FieldDef[];
  list_settings: any;
  form_settings: any;
  dashboard_settings: any;
  workflow_settings: any;
  is_active: boolean;
  is_customized: boolean;
  updated_at: string;
}

interface FieldTypeMeta {
  value: string;
  label: string;
  icon?: string;
  has_options?: boolean;
  options_hint?: string;
  is_layout?: boolean;
}

const MODULE_LABELS: Record<string, string> = {
  crm: '客户管理', hr: '人事管理', accounting: '财务管理', inventory: '库存管理',
};

const MODULE_ICONS: Record<string, string> = {
  crm: 'people-group', hr: 'necktie', accounting: 'money-bag', inventory: 'package',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: bg, color }}>{text}</span>
  );
}

const EMPTY_FIELD: FieldDef = {
  fieldname: '', fieldtype: 'Data', label: '', options: '',
  reqd: false, hidden: false, read_only: false,
  in_list_view: false, in_standard_filter: false, default: '', description: '',
};

// ── Main Component ──────────────────────────────────────────────────────────

export default function ModuleDefEditor() {
  const [defs, setDefs] = useState<ModuleDef[]>([]);
  const [fieldTypes, setFieldTypes] = useState<FieldTypeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDef, setSelectedDef] = useState<ModuleDef | null>(null);
  const [editFields, setEditFields] = useState<FieldDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({});
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newField, setNewField] = useState<FieldDef>({ ...EMPTY_FIELD });
  const [editingFieldIdx, setEditingFieldIdx] = useState<number | null>(null);
  const [inlineEditIdx, setInlineEditIdx] = useState<number | null>(null);
  const [inlineLabel, setInlineLabel] = useState('');
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Drag-and-drop handlers
  const handleDragStart = (idx: number) => {
    dragItem.current = idx;
  };
  const handleDragEnter = (idx: number) => {
    dragOverItem.current = idx;
  };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) { dragItem.current = null; dragOverItem.current = null; return; }
    const arr = [...editFields];
    const item = arr.splice(dragItem.current, 1)[0];
    arr.splice(dragOverItem.current, 0, item);
    setEditFields(arr);
    if (editingFieldIdx === dragItem.current) setEditingFieldIdx(dragOverItem.current);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  // Inline label rename
  const startInlineEdit = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setInlineEditIdx(idx);
    setInlineLabel(editFields[idx].label);
  };
  const commitInlineEdit = () => {
    if (inlineEditIdx !== null && inlineLabel.trim()) {
      updateFieldProp(inlineEditIdx, 'label', inlineLabel.trim());
    }
    setInlineEditIdx(null);
  };

  // Load data
  useEffect(() => {
    Promise.all([
      api.get<ModuleDef[]>('/api/module-defs').catch(() => []),
      api.get<FieldTypeMeta[]>('/api/module-defs/meta/field-types').catch(() => []),
    ]).then(([d, ft]) => {
      setDefs(Array.isArray(d) ? d : []);
      setFieldTypes(Array.isArray(ft) ? ft : []);
      setLoading(false);
    });
  }, []);

  // Group defs by module
  const grouped = defs.reduce<Record<string, ModuleDef[]>>((acc, d) => {
    if (!acc[d.module]) acc[d.module] = [];
    acc[d.module].push(d);
    return acc;
  }, {});

  // Select a definition for editing
  const selectDef = useCallback((def: ModuleDef) => {
    setSelectedDef(def);
    setEditFields(JSON.parse(JSON.stringify(def.fields)));
    setEditingFieldIdx(null);
    setShowPreview(false);
  }, []);

  // Save changes
  const handleSave = async () => {
    if (!selectedDef) return;
    setSaving(true);
    try {
      await api.patch(`/api/module-defs/${selectedDef.id}`, { fields: editFields });
      // Refresh
      const updated = await api.get<ModuleDef[]>('/api/module-defs').catch(() => []);
      setDefs(Array.isArray(updated) ? updated : []);
      const refreshed = (updated as ModuleDef[]).find(d => d.id === selectedDef.id);
      if (refreshed) { setSelectedDef(refreshed); setEditFields(JSON.parse(JSON.stringify(refreshed.fields))); }
    } catch (err: any) {
      alert('保存失败: ' + (err.message || err));
    } finally { setSaving(false); }
  };

  // Reset to defaults
  const handleReset = async () => {
    if (!selectedDef || !confirm('确定要恢复默认设置吗？所有自定义修改将丢失。')) return;
    try {
      await api.post(`/api/module-defs/reset/${selectedDef.id}`, {});
      const updated = await api.get<ModuleDef[]>('/api/module-defs').catch(() => []);
      setDefs(Array.isArray(updated) ? updated : []);
      const refreshed = (updated as ModuleDef[]).find(d => d.id === selectedDef.id);
      if (refreshed) { setSelectedDef(refreshed); setEditFields(JSON.parse(JSON.stringify(refreshed.fields))); }
    } catch (err: any) { alert(err.message); }
  };

  // Move field up/down
  const moveField = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= editFields.length) return;
    const arr = [...editFields];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    setEditFields(arr);
    if (editingFieldIdx === idx) setEditingFieldIdx(target);
    else if (editingFieldIdx === target) setEditingFieldIdx(idx);
  };

  // Delete field
  const deleteField = (idx: number) => {
    setEditFields(prev => prev.filter((_, i) => i !== idx));
    if (editingFieldIdx === idx) setEditingFieldIdx(null);
    else if (editingFieldIdx !== null && editingFieldIdx > idx) setEditingFieldIdx(editingFieldIdx - 1);
  };

  // Add new field
  const addField = () => {
    if (!newField.fieldname || !newField.label) { alert('字段名和标签必填'); return; }
    // Check duplicate
    if (editFields.some(f => f.fieldname === newField.fieldname)) { alert('字段名已存在'); return; }
    setEditFields(prev => [...prev, { ...newField }]);
    setNewField({ ...EMPTY_FIELD });
    setAddFieldOpen(false);
  };

  // Update field property
  const updateFieldProp = (idx: number, key: keyof FieldDef, value: any) => {
    setEditFields(prev => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [key]: value };
      return arr;
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: '#9B9A97' }}>
      <svg className="animate-spin mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
      加载中...
    </div>
  );

  return (
    <div className="flex gap-6" style={{ minHeight: 500 }}>
      {/* ── Left: Module list ── */}
      <div className="w-64 flex-shrink-0 space-y-4">
        {Object.entries(grouped).map(([mod, items]) => (
          <div key={mod}>
            <div className="flex items-center gap-2 mb-2">
              <HandIcon name={MODULE_ICONS[mod] || 'folder'} size={14} style={{ color: '#9B9A97' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#9B9A97' }}>
                {MODULE_LABELS[mod] || mod}
              </span>
            </div>
            <div className="space-y-1">
              {items.map(d => (
                <button key={d.id} onClick={() => selectDef(d)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors"
                  style={{
                    background: selectedDef?.id === d.id ? 'var(--notion-active)' : 'transparent',
                    color: selectedDef?.id === d.id ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                  }}
                  onMouseEnter={e => { if (selectedDef?.id !== d.id) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { if (selectedDef?.id !== d.id) e.currentTarget.style.background = 'transparent'; }}>
                  <span>{d.label || d.doctype}</span>
                  <div className="flex items-center gap-1">
                    {d.is_customized && <Badge text="已修改" bg="#ede9fe" color="#7c3aed" />}
                    <span className="text-[10px]" style={{ color: '#9B9A97' }}>{d.fields.length}字段</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Right: Field editor ── */}
      <div className="flex-1 min-w-0">
        {!selectedDef ? (
          <div className="text-center py-20" style={{ color: '#9B9A97' }}>
            <p className="text-sm">← 选择一个实体来编辑字段定义</p>
            <p className="text-xs mt-2">类似 Odoo Studio / Frappe Customize Form</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: 'var(--notion-text)' }}>
                  {selectedDef.label} ({selectedDef.doctype})
                </h3>
                <p className="text-xs" style={{ color: '#9B9A97' }}>
                  表: {selectedDef.table_name} · {editFields.length} 个字段
                  {selectedDef.is_customized && ' · 已自定义'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowPreview(!showPreview); setPreviewValues({}); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>
                  {showPreview ? '字段列表' : '预览表单'}
                </button>
                {selectedDef.is_customized && (
                  <button onClick={handleReset}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ border: '1px solid #fecaca', color: '#dc2626' }}>
                    恢复默认
                  </button>
                )}
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: '#7c3aed' }}>
                  {saving ? '保存中...' : '保存修改'}
                </button>
              </div>
            </div>

            {showPreview ? (
              /* ── Preview mode: render the form ── */
              <div className="rounded-xl p-6" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
                <p className="text-xs mb-4" style={{ color: '#9B9A97' }}>表单预览（模拟新建 {selectedDef.label}）</p>
                <DynamicForm fields={editFields} values={previewValues}
                  onChange={(fn, v) => setPreviewValues(prev => ({ ...prev, [fn]: v }))} />
              </div>
            ) : (
              /* ── Field list editor ── */
              <div className="space-y-1">
                {editFields.map((field, idx) => {
                  const isLayout = ['Section Break', 'Column Break', 'Tab Break'].includes(field.fieldtype);
                  const ftMeta = fieldTypes.find(ft => ft.value === field.fieldtype);
                  const isEditing = editingFieldIdx === idx;

                  return (
                    <div key={idx}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragEnter={() => handleDragEnter(idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => e.preventDefault()}>
                      {/* Field row */}
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${isLayout ? 'bg-opacity-50' : ''}`}
                        style={{
                          background: isEditing ? 'var(--notion-active)' : isLayout ? 'var(--notion-hover)' : 'transparent',
                          borderLeft: isLayout ? '3px solid #7c3aed' : '3px solid transparent',
                        }}
                        onClick={() => setEditingFieldIdx(isEditing ? null : idx)}
                        onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = 'var(--notion-hover)'; }}
                        onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = isLayout ? 'var(--notion-hover)' : 'transparent'; }}>

                        {/* Drag handle */}
                        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                          title="Drag to reorder">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2">
                            <circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/>
                            <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
                            <circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
                          </svg>
                        </div>

                        {/* Field type badge */}
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono"
                          style={{ background: isLayout ? '#ede9fe' : '#dbeafe', color: isLayout ? '#7c3aed' : '#1d4ed8', minWidth: 70, justifyContent: 'center' }}>
                          {ftMeta?.label || field.fieldtype}
                        </span>

                        {/* Field name & label (double-click to rename) */}
                        {inlineEditIdx === idx ? (
                          <input
                            autoFocus
                            value={inlineLabel}
                            onChange={e => setInlineLabel(e.target.value)}
                            onBlur={commitInlineEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitInlineEdit(); if (e.key === 'Escape') setInlineEditIdx(null); }}
                            onClick={e => e.stopPropagation()}
                            className="text-sm font-medium flex-1 px-1 py-0.5 rounded border outline-none"
                            style={{ borderColor: '#7c3aed', color: 'var(--notion-text)', minWidth: 0 }}
                          />
                        ) : (
                          <span
                            className="text-sm font-medium flex-1 truncate cursor-text"
                            style={{ color: 'var(--notion-text)' }}
                            onDoubleClick={e => startInlineEdit(idx, e)}
                            title="Double-click to rename">
                            {isLayout ? (field.label || field.fieldtype) : field.label || field.fieldname}
                          </span>
                        )}
                        {!isLayout && (
                          <span className="text-[10px] font-mono" style={{ color: '#9B9A97' }}>{field.fieldname}</span>
                        )}

                        {/* Property badges */}
                        <div className="flex items-center gap-1">
                          {field.reqd && <Badge text="必填" bg="#fee2e2" color="#dc2626" />}
                          {field.in_list_view && <Badge text="列表" bg="#dbeafe" color="#1d4ed8" />}
                          {field.in_standard_filter && <Badge text="筛选" bg="#dcfce7" color="#15803d" />}
                          {field.read_only && <Badge text="只读" bg="#f3f4f6" color="#6b7280" />}
                          {field.hidden && <Badge text="隐藏" bg="#f3f4f6" color="#6b7280" />}
                        </div>

                        {/* Quick toggles */}
                        {!isLayout && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={e => { e.stopPropagation(); updateFieldProp(idx, 'in_list_view', !field.in_list_view); }}
                              className="p-1 rounded transition-colors"
                              title={field.in_list_view ? 'Hide from list' : 'Show in list'}
                              style={{ color: field.in_list_view ? '#1d4ed8' : '#9B9A97' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                              </svg>
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); updateFieldProp(idx, 'hidden', !field.hidden); }}
                              className="p-1 rounded transition-colors"
                              title={field.hidden ? 'Make visible' : 'Hide field'}
                              style={{ color: field.hidden ? '#ef4444' : '#9B9A97' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                {field.hidden
                                  ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/></>
                                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                                }
                              </svg>
                            </button>
                          </div>
                        )}

                        {/* Delete button */}
                        <button onClick={e => { e.stopPropagation(); deleteField(idx); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded transition-colors"
                          style={{ color: '#ef4444' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>

                      {/* Expanded field editor */}
                      {isEditing && (
                        <div className="ml-8 mr-4 my-2 p-4 rounded-lg space-y-3"
                          style={{ background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium mb-1" style={{ color: '#9B9A97' }}>字段名 (fieldname)</label>
                              <input value={field.fieldname} onChange={e => updateFieldProp(idx, 'fieldname', e.target.value)}
                                className="w-full px-2 py-1.5 text-sm rounded border font-mono"
                                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium mb-1" style={{ color: '#9B9A97' }}>标签 (label)</label>
                              <input value={field.label} onChange={e => updateFieldProp(idx, 'label', e.target.value)}
                                className="w-full px-2 py-1.5 text-sm rounded border"
                                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium mb-1" style={{ color: '#9B9A97' }}>字段类型</label>
                              <select value={field.fieldtype} onChange={e => updateFieldProp(idx, 'fieldtype', e.target.value)}
                                className="w-full px-2 py-1.5 text-sm rounded border"
                                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
                                {fieldTypes.map(ft => (
                                  <option key={ft.value} value={ft.value}>{ft.label} ({ft.value})</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium mb-1" style={{ color: '#9B9A97' }}>
                                选项/关联 (options)
                                {ftMeta?.options_hint && <span className="ml-1 font-normal">{ftMeta.options_hint}</span>}
                              </label>
                              {field.fieldtype === 'Select' ? (
                                <textarea value={field.options || ''} onChange={e => updateFieldProp(idx, 'options', e.target.value)}
                                  rows={3} placeholder="每行一个选项"
                                  className="w-full px-2 py-1.5 text-sm rounded border font-mono"
                                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                              ) : (
                                <input value={field.options || ''} onChange={e => updateFieldProp(idx, 'options', e.target.value)}
                                  className="w-full px-2 py-1.5 text-sm rounded border"
                                  style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                              )}
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium mb-1" style={{ color: '#9B9A97' }}>默认值</label>
                              <input value={field.default || ''} onChange={e => updateFieldProp(idx, 'default', e.target.value)}
                                className="w-full px-2 py-1.5 text-sm rounded border"
                                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium mb-1" style={{ color: '#9B9A97' }}>描述/帮助文本</label>
                              <input value={field.description || ''} onChange={e => updateFieldProp(idx, 'description', e.target.value)}
                                className="w-full px-2 py-1.5 text-sm rounded border"
                                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
                            </div>
                          </div>
                          {/* Checkboxes */}
                          {!isLayout && (
                            <div className="flex flex-wrap gap-4 pt-2" style={{ borderTop: '1px solid var(--notion-border)' }}>
                              {[
                                { key: 'reqd', label: '必填' },
                                { key: 'in_list_view', label: '列表显示' },
                                { key: 'in_standard_filter', label: '筛选' },
                                { key: 'read_only', label: '只读' },
                                { key: 'hidden', label: '隐藏' },
                              ].map(opt => (
                                <label key={opt.key} className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--notion-text-muted)' }}>
                                  <input type="checkbox" checked={!!(field as any)[opt.key]}
                                    onChange={e => updateFieldProp(idx, opt.key as keyof FieldDef, e.target.checked)}
                                    className="w-3.5 h-3.5 rounded" />
                                  {opt.label}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add field button */}
                <button onClick={() => setAddFieldOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors mt-2"
                  style={{ color: '#7c3aed', border: '1px dashed var(--notion-border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--notion-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  添加字段
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Add Field SlideOver ── */}
      <SlideOver open={addFieldOpen} onClose={() => setAddFieldOpen(false)} title="添加字段" width="w-[400px]">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#9B9A97' }}>字段名 (fieldname) <span className="text-red-500">*</span></label>
            <input value={newField.fieldname} onChange={e => setNewField(prev => ({ ...prev, fieldname: e.target.value.replace(/[^a-z0-9_]/g, '') }))}
              placeholder="如: custom_field_1"
              className="w-full px-3 py-2 text-sm rounded-lg border font-mono"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#9B9A97' }}>标签 <span className="text-red-500">*</span></label>
            <input value={newField.label} onChange={e => setNewField(prev => ({ ...prev, label: e.target.value }))}
              placeholder="显示名称"
              className="w-full px-3 py-2 text-sm rounded-lg border"
              style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#9B9A97' }}>字段类型</label>
            <div className="grid grid-cols-2 gap-1.5">
              {fieldTypes.map(ft => (
                <button key={ft.value} onClick={() => setNewField(prev => ({ ...prev, fieldtype: ft.value }))}
                  className="px-2 py-1.5 rounded-lg text-xs text-left transition-colors"
                  style={{
                    background: newField.fieldtype === ft.value ? '#ede9fe' : 'var(--notion-hover)',
                    color: newField.fieldtype === ft.value ? '#7c3aed' : 'var(--notion-text-muted)',
                    border: newField.fieldtype === ft.value ? '1px solid #7c3aed' : '1px solid transparent',
                  }}>
                  {ft.label}
                </button>
              ))}
            </div>
          </div>
          {(newField.fieldtype === 'Select') && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#9B9A97' }}>选项（每行一个）</label>
              <textarea value={newField.options || ''} onChange={e => setNewField(prev => ({ ...prev, options: e.target.value }))}
                rows={4} className="w-full px-3 py-2 text-sm rounded-lg border font-mono"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            </div>
          )}
          {(newField.fieldtype === 'Link' || newField.fieldtype === 'Data') && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#9B9A97' }}>
                {newField.fieldtype === 'Link' ? '关联实体' : '验证类型 (Email/Phone/URL)'}
              </label>
              <input value={newField.options || ''} onChange={e => setNewField(prev => ({ ...prev, options: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border"
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }} />
            </div>
          )}
          <div className="flex flex-wrap gap-4">
            {[
              { key: 'reqd', label: '必填' },
              { key: 'in_list_view', label: '列表显示' },
              { key: 'in_standard_filter', label: '筛选' },
            ].map(opt => (
              <label key={opt.key} className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--notion-text-muted)' }}>
                <input type="checkbox" checked={!!(newField as any)[opt.key]}
                  onChange={e => setNewField(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded" />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setAddFieldOpen(false)}
              className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--notion-border)' }}>取消</button>
            <button onClick={addField}
              className="flex-1 py-2 rounded-xl text-sm font-medium text-white"
              style={{ background: '#7c3aed' }}>添加</button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
