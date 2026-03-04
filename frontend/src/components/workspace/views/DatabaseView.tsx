'use client';

import { useState, useCallback, useRef } from 'react';
import { useLocale } from 'next-intl';
import { DBColumn, DBRow, DBSchema, DatabaseViewData, ColumnType, generateRowId } from './types';
import { HandIcon } from '@/components/ui/HandIcon';
import TableView from './TableView';
import KanbanView from './KanbanView';
import CalendarView from './CalendarView';
import GalleryView from './GalleryView';
import ListView from './ListView';

// ── View mode definitions ─────────────────────────────────────────────────────

type ViewMode = 'table' | 'kanban' | 'calendar' | 'gallery' | 'list';

const VIEW_MODES_EN: { id: ViewMode; label: string; icon: string }[] = [
  { id: 'table',    label: 'Table', icon: '⊞' },
  { id: 'kanban',   label: 'Board', icon: '⋮⋮' },
  { id: 'calendar', label: 'Calendar', icon: 'alarm-clock' },
  { id: 'gallery',  label: 'Gallery', icon: '⊟' },
  { id: 'list',     label: 'List', icon: '☰' },
];

const COLUMN_TYPES_EN: { type: ColumnType; label: string; icon: string }[] = [
  { type: 'title',        label: 'Title', icon: '𝐀' },
  { type: 'text',         label: 'Text', icon: '¶' },
  { type: 'number',       label: 'Number', icon: '#' },
  { type: 'select',       label: 'Select', icon: '◉' },
  { type: 'multi_select', label: 'Multi-select', icon: '⊕' },
  { type: 'status',       label: 'Status', icon: 'lightning' },
  { type: 'date',         label: 'Date', icon: 'alarm-clock' },
  { type: 'checkbox',     label: 'Checkbox', icon: '☑' },
  { type: 'url',          label: 'URL', icon: 'link' },
  { type: 'email',        label: 'Email', icon: 'envelope' },
];

// ── Default schema builder ────────────────────────────────────────────────────

function buildDefaultSchema(isZh: boolean): DBSchema {
  return {
    columns: [
      { key: 'title', title: isZh ? '名称' : 'Name', type: 'title' },
      { key: 'status', title: isZh ? '状态' : 'Status', type: 'status', options: [
        { value: isZh ? '未开始' : 'Not started' }, { value: isZh ? '进行中' : 'In progress' }, { value: isZh ? '已完成' : 'Done' }
      ]},
      { key: 'due', title: isZh ? '截止日期' : 'Due Date', type: 'date' },
      { key: 'priority', title: isZh ? '优先级' : 'Priority', type: 'select', options: [
        { value: isZh ? '高' : 'High' }, { value: isZh ? '中' : 'Medium' }, { value: isZh ? '低' : 'Low' }
      ]},
    ],
    groupBy: 'status',
    dateField: 'due',
  };
}

// ── Add Column Modal ──────────────────────────────────────────────────────────

function AddColumnModal({ onAdd, onClose }: {
  onAdd: (col: DBColumn) => void;
  onClose: () => void;
}) {
  const isZh = String(useLocale() || '').toLowerCase().startsWith('zh');
  const columnTypes = isZh ? [
    { type: 'title', label: '标题', icon: '𝐀' },
    { type: 'text', label: '文本', icon: '¶' },
    { type: 'number', label: '数字', icon: '#' },
    { type: 'select', label: '单选', icon: '◉' },
    { type: 'multi_select', label: '多选', icon: '⊕' },
    { type: 'status', label: '状态', icon: 'lightning' },
    { type: 'date', label: '日期', icon: 'alarm-clock' },
    { type: 'checkbox', label: '复选框', icon: '☑' },
    { type: 'url', label: '链接', icon: 'link' },
    { type: 'email', label: '邮箱', icon: 'envelope' },
  ] as { type: ColumnType; label: string; icon: string }[] : COLUMN_TYPES_EN;
  const [name, setName] = useState('');
  const [type, setType] = useState<ColumnType>('text');

  const handleAdd = () => {
    if (!name.trim()) return;
    const key = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    onAdd({ key: key || `col_${Date.now()}`, title: name.trim(), type });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.3)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rounded-xl p-5 shadow-xl" style={{ background: 'var(--notion-card-elevated, var(--notion-card, white))', width: 320, border: '1px solid var(--notion-border)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--notion-text)' }}>{isZh ? '新增字段' : 'Add Column'}</h3>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onClose(); }}
          placeholder={isZh ? '字段名称...' : 'Column name...'}
          className="w-full text-sm px-3 py-2 rounded-lg outline-none mb-3"
          style={{ border: '1.5px solid #7c3aed', color: 'var(--notion-text)', background: '#faf9ff' }}
        />
        <p className="text-xs mb-2" style={{ color: 'var(--notion-text-muted)' }}>{isZh ? '字段类型' : 'Type'}</p>
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {columnTypes.map(ct => (
            <button key={ct.type}
              onClick={() => setType(ct.type)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors"
              style={{
                background: type === ct.type ? '#ede9fe' : 'var(--notion-hover)',
                color: type === ct.type ? '#7c3aed' : 'var(--notion-text)',
                border: type === ct.type ? '1.5px solid #7c3aed' : '1.5px solid transparent',
                fontWeight: type === ct.type ? 600 : 400,
              }}
            >
              <HandIcon name={ct.icon} size={12} />
              {ct.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={handleAdd}
            className="flex-1 py-2 text-sm rounded-lg text-white font-medium"
            style={{ background: '#7c3aed' }}>
            {isZh ? '添加' : 'Add'}
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 text-sm rounded-lg"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}>
            {isZh ? '取消' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Column Manager (schema sidebar) ──────────────────────────────────────────

function SchemaPanel({ schema, onSchemaChange, onClose }: {
  schema: DBSchema;
  onSchemaChange: (s: DBSchema) => void;
  onClose: () => void;
}) {
  const isZh = String(useLocale() || '').toLowerCase().startsWith('zh');
  const columnTypes = isZh ? [
    { type: 'title', label: '标题', icon: '𝐀' },
    { type: 'text', label: '文本', icon: '¶' },
    { type: 'number', label: '数字', icon: '#' },
    { type: 'select', label: '单选', icon: '◉' },
    { type: 'multi_select', label: '多选', icon: '⊕' },
    { type: 'status', label: '状态', icon: 'lightning' },
    { type: 'date', label: '日期', icon: 'alarm-clock' },
    { type: 'checkbox', label: '复选框', icon: '☑' },
    { type: 'url', label: '链接', icon: 'link' },
    { type: 'email', label: '邮箱', icon: 'envelope' },
  ] as { type: ColumnType; label: string; icon: string }[] : COLUMN_TYPES_EN;
  const selectCols = schema.columns.filter(c => c.type === 'select' || c.type === 'status' || c.type === 'multi_select');
  const dateCols = schema.columns.filter(c => c.type === 'date');

  const setGroupBy = (key: string) => onSchemaChange({ ...schema, groupBy: key });
  const setDateField = (key: string) => onSchemaChange({ ...schema, dateField: key });
  const removeColumn = (key: string) => {
    if (schema.columns.find(c => c.key === key)?.type === 'title') return; // can't remove title
    onSchemaChange({ ...schema, columns: schema.columns.filter(c => c.key !== key) });
  };

  return (
    <div className="absolute right-0 top-8 z-40 rounded-xl shadow-xl p-4"
      style={{ background: 'var(--notion-card-elevated, var(--notion-card, white))', width: 260, border: '1px solid var(--notion-border)', minWidth: 240 }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{isZh ? '字段设置' : 'Schema'}</span>
        <button onClick={onClose} className="p-1 rounded" style={{ color: 'var(--notion-text-muted)' }}>✕</button>
      </div>

      {/* Columns list */}
      <p className="text-[11px] uppercase tracking-wide font-semibold mb-1.5" style={{ color: 'var(--notion-text-muted)' }}>{isZh ? '字段列表' : 'Columns'}</p>
      <div className="space-y-1 mb-3">
        {schema.columns.map(col => (
          <div key={col.key} className="flex items-center justify-between px-2 py-1.5 rounded-lg"
            style={{ background: 'var(--notion-hover)' }}>
            <div className="flex items-center gap-2">
              <HandIcon name={columnTypes.find(ct => ct.type === col.type)?.icon || '¶'} size={12} style={{ color: 'var(--notion-text-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--notion-text)' }}>{col.title}</span>
            </div>
            {col.type !== 'title' && (
              <button onClick={() => removeColumn(col.key)}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ color: 'var(--notion-text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fef2f2'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--notion-text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Group by (for kanban) */}
      {selectCols.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-wide font-semibold mb-1.5 mt-2" style={{ color: 'var(--notion-text-muted)' }}>{isZh ? '看板分组字段' : 'Board Group By'}</p>
          <select value={schema.groupBy || ''} onChange={e => setGroupBy(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg outline-none mb-3"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
            {selectCols.map(c => <option key={c.key} value={c.key}>{c.title}</option>)}
          </select>
        </>
      )}

      {/* Date field (for calendar) */}
      {dateCols.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-wide font-semibold mb-1.5" style={{ color: 'var(--notion-text-muted)' }}>{isZh ? '日历日期字段' : 'Calendar Date Field'}</p>
          <select value={schema.dateField || ''} onChange={e => setDateField(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }}>
            {dateCols.map(c => <option key={c.key} value={c.key}>{c.title}</option>)}
          </select>
        </>
      )}
    </div>
  );
}

// ── Main DatabaseView ─────────────────────────────────────────────────────────

interface DatabaseViewProps {
  initialData?: DatabaseViewData;
  onChange?: (data: DatabaseViewData) => void;
}

export default function DatabaseView({ initialData, onChange }: DatabaseViewProps) {
  const isZh = String(useLocale() || '').toLowerCase().startsWith('zh');
  const viewModes = isZh ? [
    { id: 'table', label: '表格', icon: '⊞' },
    { id: 'kanban', label: '看板', icon: '⋮⋮' },
    { id: 'calendar', label: '日历', icon: 'alarm-clock' },
    { id: 'gallery', label: '画廊', icon: '⊟' },
    { id: 'list', label: '列表', icon: '☰' },
  ] as { id: ViewMode; label: string; icon: string }[] : VIEW_MODES_EN;
  const defaultSchema = buildDefaultSchema(isZh);
  const [schema, setSchema] = useState<DBSchema>(initialData?.schema ?? defaultSchema);
  const [rows, setRows] = useState<DBRow[]>(initialData?.rows ?? []);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showAddCol, setShowAddCol] = useState(false);
  const [showSchema, setShowSchema] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const notifyChange = useCallback((newSchema: DBSchema, newRows: DBRow[]) => {
    onChangeRef.current?.({ schema: newSchema, rows: newRows });
  }, []);

  const handleRowsChange = useCallback((newRows: DBRow[]) => {
    setRows(newRows);
    notifyChange(schema, newRows);
  }, [schema, notifyChange]);

  const handleSchemaChange = useCallback((newSchema: DBSchema) => {
    setSchema(newSchema);
    notifyChange(newSchema, rows);
  }, [rows, notifyChange]);

  const handleAddColumn = useCallback((col: DBColumn) => {
    // Avoid duplicate keys
    const exists = schema.columns.some(c => c.key === col.key);
    const finalKey = exists ? `${col.key}_${Date.now()}` : col.key;
    const newCol = { ...col, key: finalKey };
    const newSchema = { ...schema, columns: [...schema.columns, newCol] };
    // Fill existing rows with empty value for new column
    const newRows = rows.map(r => ({ ...r, [finalKey]: col.type === 'checkbox' ? false : '' }));
    setSchema(newSchema);
    setRows(newRows);
    notifyChange(newSchema, newRows);
    setShowAddCol(false);
  }, [schema, rows, notifyChange]);

  // Derive groupBy and dateField with fallbacks
  const groupBy = schema.groupBy || schema.columns.find(c => c.type === 'select' || c.type === 'status')?.key || schema.columns[0]?.key;
  const dateField = schema.dateField || schema.columns.find(c => c.type === 'date')?.key;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* View mode tabs */}
        <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--notion-active)' }}>
          {viewModes.map(vm => (
            <button
              key={vm.id}
              onClick={() => setViewMode(vm.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all"
              style={{
                background: viewMode === vm.id ? 'white' : 'transparent',
                color: viewMode === vm.id ? '#7c3aed' : 'var(--notion-text-muted)',
                fontWeight: viewMode === vm.id ? 600 : 400,
                boxShadow: viewMode === vm.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <HandIcon name={vm.icon} size={12} />
              {vm.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 relative">
          <button
            onClick={() => setShowAddCol(true)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
            style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {isZh ? '字段' : 'Field'}
          </button>

          <button
            onClick={() => setShowSchema(s => !s)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
            style={{
              border: showSchema ? '1px solid #7c3aed' : '1px solid var(--notion-border)',
              color: showSchema ? '#7c3aed' : 'var(--notion-text-muted)',
              background: showSchema ? '#ede9fe' : 'transparent',
            }}
            onMouseEnter={e => {
              if (!showSchema) { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }
            }}
            onMouseLeave={e => {
              if (!showSchema) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
            </svg>
            {isZh ? '设置' : 'Schema'}
          </button>

          {showSchema && (
            <SchemaPanel
              schema={schema}
              onSchemaChange={handleSchemaChange}
              onClose={() => setShowSchema(false)}
            />
          )}
        </div>
      </div>

      {/* Active view */}
      <div className="min-h-64">
        {viewMode === 'table' && (
          <TableView
            columns={schema.columns}
            rows={rows}
            onRowsChange={handleRowsChange}
            onColumnsChange={cols => handleSchemaChange({ ...schema, columns: cols })}
          />
        )}
        {viewMode === 'kanban' && groupBy && (
          <KanbanView
            columns={schema.columns}
            rows={rows}
            groupBy={groupBy}
            onRowsChange={handleRowsChange}
          />
        )}
        {viewMode === 'kanban' && !groupBy && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span style={{ fontSize: 32 }}>⋮⋮</span>
            <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>
              {isZh ? '请先添加“单选”或“状态”字段以启用看板视图' : 'Add a Select or Status column to use Board view'}
            </p>
          </div>
        )}
        {viewMode === 'calendar' && dateField && (
          <CalendarView
            columns={schema.columns}
            rows={rows}
            dateField={dateField}
            onRowsChange={handleRowsChange}
          />
        )}
        {viewMode === 'calendar' && !dateField && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <HandIcon name="alarm-clock" size={32} />
            <p className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>
              {isZh ? '请先添加“日期”字段以启用日历视图' : 'Add a Date column to use Calendar view'}
            </p>
          </div>
        )}
        {viewMode === 'gallery' && (
          <GalleryView
            columns={schema.columns}
            rows={rows}
            onRowsChange={handleRowsChange}
          />
        )}
        {viewMode === 'list' && (
          <ListView
            columns={schema.columns}
            rows={rows}
            onRowsChange={handleRowsChange}
          />
        )}
      </div>

      {/* Add column modal */}
      {showAddCol && (
        <AddColumnModal
          onAdd={handleAddColumn}
          onClose={() => setShowAddCol(false)}
        />
      )}
    </div>
  );
}
