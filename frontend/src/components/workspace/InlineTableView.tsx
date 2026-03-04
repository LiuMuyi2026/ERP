'use client';

import { useState, useRef, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { HandIcon } from '@/components/ui/HandIcon';

export interface TableColumn {
  key: string;
  title: string;
  type?: 'text' | 'status' | 'date' | 'select';
}

export interface TableRow {
  [key: string]: string;
}

interface InlineTableViewProps {
  columns: TableColumn[];
  rows: TableRow[];
  onRowsChange: (rows: TableRow[]) => void;
}

// Notion-style status colors
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'todo': { bg: '#f1f1ef', color: '#777' },
  'to do': { bg: '#f1f1ef', color: '#777' },
  '未开始': { bg: '#f1f1ef', color: '#777' },
  '待办': { bg: '#f1f1ef', color: '#777' },
  'in progress': { bg: '#e8f3ff', color: '#2383e2' },
  '进行中': { bg: '#e8f3ff', color: '#2383e2' },
  'done': { bg: '#e8f9ee', color: '#1c7f4c' },
  '已完成': { bg: '#e8f9ee', color: '#1c7f4c' },
  '完成': { bg: '#e8f9ee', color: '#1c7f4c' },
  'blocked': { bg: '#ffeeed', color: '#e03e3e' },
  '阻塞': { bg: '#ffeeed', color: '#e03e3e' },
  'open': { bg: '#f1f1ef', color: '#777' },
  'fixed': { bg: '#e8f9ee', color: '#1c7f4c' },
  'closed': { bg: '#f1f1ef', color: '#777' },
  'planned': { bg: '#f8f3ff', color: '#9065b0' },
  '计划中': { bg: '#f8f3ff', color: '#9065b0' },
  'high': { bg: '#ffeeed', color: '#e03e3e' },
  '高': { bg: '#ffeeed', color: '#e03e3e' },
  'medium': { bg: '#fbf3db', color: '#b65e1a' },
  '中': { bg: '#fbf3db', color: '#b65e1a' },
  'low': { bg: '#eefaf3', color: '#1c7f4c' },
  '低': { bg: '#eefaf3', color: '#1c7f4c' },
  'critical': { bg: '#ffeeed', color: '#e03e3e' },
  '紧急': { bg: '#ffeeed', color: '#e03e3e' },
  'research': { bg: '#e8f3ff', color: '#2383e2' },
  '调研': { bg: '#e8f3ff', color: '#2383e2' },
  'review': { bg: '#fbf3db', color: '#b65e1a' },
  '审核中': { bg: '#fbf3db', color: '#b65e1a' },
  'approved': { bg: '#e8f9ee', color: '#1c7f4c' },
  '已批准': { bg: '#e8f9ee', color: '#1c7f4c' },
  'draft': { bg: '#f1f1ef', color: '#777' },
  '草稿': { bg: '#f1f1ef', color: '#777' },
};

function StatusCell({ value }: { value: string }) {
  const lower = (value || '').toLowerCase();
  const colors = STATUS_COLORS[lower] || { bg: '#f1f1ef', color: '#555' };
  if (!value) return <span style={{ color: 'var(--notion-text-muted)', fontSize: 13 }}>—</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: colors.bg, color: colors.color, lineHeight: 1.5 }}
    >
      {value}
    </span>
  );
}

export default function InlineTableView({ columns, rows, onRowsChange }: InlineTableViewProps) {
  const isZh = String(useLocale() || '').toLowerCase().startsWith('zh');
  const text = {
    emptyCell: isZh ? '空' : 'Empty',
    noEntries: isZh ? '暂无数据，点击' : 'No entries yet, click',
    addRowHint: isZh ? '+ 新建行' : '+ New row',
    toAdd: isZh ? '新增一行' : 'to add one',
    deleteRow: isZh ? '删除行' : 'Delete row',
    newRow: isZh ? '新建行' : 'New row',
    row: isZh ? '行' : 'row',
    rows: isZh ? '行' : 'rows',
  };
  const [editing, setEditing] = useState<{ rowIdx: number; colKey: string } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const buildEmptyRow = useCallback((): TableRow => {
    const row: TableRow = {};
    columns.forEach(col => { row[col.key] = ''; });
    return row;
  }, [columns]);

  const isStatusCol = (col: TableColumn) =>
    col.type === 'status' || /status|priority|severity/i.test(col.key + col.title);

  const focusCell = useCallback((rowIdx: number, colKey: string) => {
    setEditing({ rowIdx, colKey });
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
  }, []);

  const startEdit = useCallback((rowIdx: number, colKey: string) => {
    focusCell(rowIdx, colKey);
  }, [focusCell]);

  const commitEdit = useCallback((rowIdx: number, colKey: string, value: string) => {
    const updated = rows.map((row, i) => i === rowIdx ? { ...row, [colKey]: value } : row);
    onRowsChange(updated);
    setEditing(null);
  }, [rows, onRowsChange]);

  const commitAndMove = useCallback((
    rowIdx: number,
    colIdx: number,
    value: string,
    direction: 'forward' | 'backward',
  ) => {
    if (!columns[colIdx]) return;
    let updatedRows = rows.map((row, i) =>
      i === rowIdx ? { ...row, [columns[colIdx].key]: value } : row,
    );

    let nextRow = rowIdx;
    let nextCol = direction === 'forward' ? colIdx + 1 : colIdx - 1;
    if (nextCol >= columns.length) {
      nextCol = 0;
      nextRow += 1;
    } else if (nextCol < 0) {
      nextCol = columns.length - 1;
      nextRow -= 1;
    }

    if (nextRow >= updatedRows.length) {
      updatedRows = [...updatedRows, buildEmptyRow()];
    }

    onRowsChange(updatedRows);
    if (nextRow >= 0 && columns[nextCol]) {
      focusCell(nextRow, columns[nextCol].key);
    } else {
      setEditing(null);
    }
  }, [rows, columns, buildEmptyRow, onRowsChange, focusCell]);

  const addRow = useCallback(() => {
    onRowsChange([...rows, buildEmptyRow()]);
  }, [rows, buildEmptyRow, onRowsChange]);

  const deleteRow = useCallback((rowIdx: number) => {
    onRowsChange(rows.filter((_, i) => i !== rowIdx));
  }, [rows, onRowsChange]);

  return (
    <div style={{ width: '100%' }}>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--notion-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'auto' }}>
          {/* Header */}
          <thead>
            <tr style={{ background: '#f7f7f5' }}>
              {columns.map((col, ci) => (
                <th
                  key={col.key}
                  style={{
                    padding: '9px 14px',
                    textAlign: 'left',
                    fontWeight: 500,
                    fontSize: 11,
                    color: 'var(--notion-text-muted)',
                    borderBottom: '1px solid var(--notion-border)',
                    borderRight: ci < columns.length - 1 ? '1px solid var(--notion-border)' : 'none',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    userSelect: 'none',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {isStatusCol(col) && <span style={{ fontSize: 10 }}>⚪</span>}
                    {col.title}
                  </div>
                </th>
              ))}
              <th style={{ width: 40, borderBottom: '1px solid var(--notion-border)', background: '#f7f7f5' }} />
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--notion-text-muted)', fontSize: 13 }}>
                  <div className="flex flex-col items-center gap-2">
                    <HandIcon name="clipboard" size={24} />
                    <span>{text.noEntries} <strong>{text.addRowHint}</strong> {text.toAdd}</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  onMouseEnter={() => setHoveredRow(rowIdx)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{ background: hoveredRow === rowIdx ? '#fafaf9' : 'white', transition: 'background 0.1s' }}
                >
                  {columns.map((col, ci) => {
                    const isEditing = editing?.rowIdx === rowIdx && editing?.colKey === col.key;
                    const isStatus = isStatusCol(col);
                    return (
                      <td
                        key={col.key}
                        onClick={() => startEdit(rowIdx, col.key)}
                        style={{
                          padding: 0,
                          borderBottom: '1px solid var(--notion-border)',
                          borderRight: ci < columns.length - 1 ? '1px solid var(--notion-border)' : 'none',
                          cursor: 'text',
                          verticalAlign: 'middle',
                        }}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            defaultValue={row[col.key] || ''}
                            autoFocus
                            onBlur={e => commitEdit(rowIdx, col.key, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitAndMove(rowIdx, ci, (e.target as HTMLInputElement).value, 'forward');
                              }
                              if (e.key === 'Tab') {
                                e.preventDefault();
                                commitAndMove(rowIdx, ci, (e.target as HTMLInputElement).value, e.shiftKey ? 'backward' : 'forward');
                              }
                              if (e.key === 'Escape') setEditing(null);
                            }}
                            style={{
                              width: '100%', padding: '8px 14px', border: 'none',
                              outline: '2px solid #7c3aed', outlineOffset: -2,
                              background: '#faf9ff', fontSize: 14,
                              color: 'var(--notion-text)', boxSizing: 'border-box',
                              fontFamily: 'inherit',
                            }}
                          />
                        ) : (
                          <div style={{ padding: '8px 14px', minHeight: 36, display: 'flex', alignItems: 'center' }}>
                            {isStatus && row[col.key] ? (
                              <StatusCell value={row[col.key]} />
                            ) : (
                              <span style={{
                                color: row[col.key] ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                                fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                fontStyle: row[col.key] ? 'normal' : 'italic', opacity: row[col.key] ? 1 : 0.4,
                              }}>
                                {row[col.key] || text.emptyCell}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Delete button */}
                  <td style={{ borderBottom: '1px solid var(--notion-border)', textAlign: 'center', width: 40, verticalAlign: 'middle' }}>
                    <button
                      onClick={() => deleteRow(rowIdx)}
                      style={{
                        opacity: hoveredRow === rowIdx ? 1 : 0, transition: 'opacity 0.15s',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: '4px', borderRadius: 4, color: 'var(--notion-text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                      }}
                      title={text.deleteRow}
                      onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fef2f2'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--notion-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: row count + add row */}
      <div className="flex items-center justify-between mt-1 px-1">
        <button
          onClick={addRow}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm"
          style={{ color: 'var(--notion-text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--notion-text)'; e.currentTarget.style.background = 'var(--notion-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--notion-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {text.newRow}
        </button>
        {rows.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
            {rows.length} {rows.length === 1 ? text.row : text.rows}
          </span>
        )}
      </div>
    </div>
  );
}
