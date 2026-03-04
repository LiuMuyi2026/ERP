'use client';

import { useState, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { DBColumn, DBRow, getOptionColor, generateRowId } from './types';

interface CalendarViewProps {
  columns: DBColumn[];
  rows: DBRow[];
  dateField: string; // key of date column
  onRowsChange: (rows: DBRow[]) => void;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function CalendarView({ columns, rows, dateField, onRowsChange }: CalendarViewProps) {
  const locale = useLocale();
  const isZh = String(locale || '').toLowerCase().startsWith('zh');
  const WEEKDAYS = isZh ? ['日', '一', '二', '三', '四', '五', '六'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = isZh ? ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const untitled = isZh ? '未命名' : 'Untitled';
  const moreLabel = isZh ? '还有' : '+';
  const moreSuffix = isZh ? '条' : 'more';
  const emptyDayLabel = isZh ? '当天暂无事件' : 'No events on this day';
  const inputPlaceholder = isZh ? '输入事件标题...' : 'New event title...';
  const addEventLabel = isZh ? '+ 添加事件' : '+ Add event';
  const hintLabel = isZh ? '点击某一天可查看或新增事件' : 'Click a day to see events or add new ones';

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [newEventTitle, setNewEventTitle] = useState('');

  const titleCol = columns.find(c => c.type === 'title') || columns[0];
  const statusCol = columns.find(c => c.type === 'select' || c.type === 'status');

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);

  // Group rows by date
  const rowsByDate: Record<string, DBRow[]> = {};
  rows.forEach(row => {
    const dateVal = row[dateField];
    if (!dateVal) return;
    try {
      const d = new Date(dateVal);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!rowsByDate[key]) rowsByDate[key] = [];
      rowsByDate[key].push(row);
    } catch {}
  });

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const addEvent = useCallback(() => {
    if (!newEventTitle.trim() || !selectedDay) return;
    const newRow: DBRow = { _id: generateRowId() };
    columns.forEach(c => { newRow[c.key] = c.type === 'checkbox' ? false : ''; });
    newRow[titleCol.key] = newEventTitle.trim();
    newRow[dateField] = selectedDay;
    onRowsChange([...rows, newRow]);
    setNewEventTitle('');
  }, [newEventTitle, selectedDay, columns, titleCol, dateField, rows, onRowsChange]);

  const deleteRow = useCallback((rowId: string) => {
    onRowsChange(rows.filter(r => r._id !== rowId));
  }, [rows, onRowsChange]);

  // Build calendar cells
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null });

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="flex gap-4">
      {/* Calendar */}
      <div className="flex-1">
        {/* Nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
            {MONTHS[month]} {year}
          </h3>
          <button onClick={nextMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-px mb-1">
          {WEEKDAYS.map(w => (
            <div key={w} className="text-center text-[11px] font-semibold uppercase tracking-wide py-1"
              style={{ color: 'var(--notion-text-muted)' }}>
              {w}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px" style={{ background: 'var(--notion-border)', border: '1px solid var(--notion-border)', borderRadius: 8, overflow: 'hidden' }}>
          {cells.map((cell, i) => {
            const events = cell.dateStr ? (rowsByDate[cell.dateStr] || []) : [];
            const isToday = cell.dateStr === todayStr;
            const isSelected = cell.dateStr === selectedDay;

            return (
              <div key={i}
                onClick={() => cell.dateStr && setSelectedDay(cell.dateStr)}
                style={{
                  background: isSelected ? '#faf9ff' : 'white',
                  minHeight: 80, padding: 6, cursor: cell.day ? 'pointer' : 'default',
                  opacity: cell.day ? 1 : 0.3,
                }}
              >
                {cell.day && (
                  <>
                    <div className="flex items-center justify-center w-6 h-6 rounded-full mb-1"
                      style={{
                        background: isToday ? '#7c3aed' : 'transparent',
                        color: isToday ? 'white' : 'var(--notion-text)',
                        fontSize: 12, fontWeight: isToday ? 700 : 400,
                      }}>
                      {cell.day}
                    </div>
                    <div className="space-y-0.5">
                      {events.slice(0, 3).map(row => {
                        const statusVal = statusCol ? row[statusCol.key] : null;
                        const colors = statusVal ? getOptionColor(String(statusVal)) : { bg: '#ede9fe', text: '#7c3aed' };
                        return (
                          <div key={row._id} className="text-[10px] px-1.5 py-0.5 rounded truncate"
                            style={{ background: colors.bg, color: colors.text }}>
                            {row[titleCol.key] || untitled}
                          </div>
                        );
                      })}
                      {events.length > 3 && (
                        <div className="text-[10px] px-1 text-gray-400">{isZh ? `${moreLabel} ${events.length - 3} ${moreSuffix}` : `${moreLabel}${events.length - 3} ${moreSuffix}`}</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel: selected day events */}
      <div className="flex-shrink-0" style={{ width: 220 }}>
        {selectedDay ? (
          <div>
            <h4 className="text-sm font-semibold mb-3 pb-2" style={{ color: 'var(--notion-text)', borderBottom: '1px solid var(--notion-border)' }}>
              📅 {new Date(selectedDay + 'T00:00:00').toLocaleDateString(isZh ? 'zh-CN' : 'en-US', isZh ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })}
            </h4>

            {/* Events on this day */}
            <div className="space-y-2 mb-3">
              {(rowsByDate[selectedDay] || []).map(row => (
                <div key={row._id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg"
                  style={{ background: 'var(--notion-hover)', border: '1px solid var(--notion-border)' }}>
                  <span className="text-xs truncate" style={{ color: 'var(--notion-text)' }}>{row[titleCol.key] || untitled}</span>
                  <button onClick={() => deleteRow(row._id!)} className="flex-shrink-0 p-0.5 rounded" style={{ color: 'var(--notion-text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--notion-text-muted)'; }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
              {!(rowsByDate[selectedDay]?.length) && (
                <p className="text-xs italic" style={{ color: 'var(--notion-text-muted)' }}>{emptyDayLabel}</p>
              )}
            </div>

            {/* Add event */}
            <div className="rounded-lg overflow-hidden" style={{ border: '1.5px solid #7c3aed' }}>
              <input value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addEvent(); if (e.key === 'Escape') setNewEventTitle(''); }}
                placeholder={inputPlaceholder}
                className="w-full text-xs px-2.5 py-2 outline-none"
                style={{ color: 'var(--notion-text)', background: '#faf9ff' }} />
              <button onClick={addEvent} disabled={!newEventTitle.trim()}
                className="w-full text-xs py-1.5 text-white font-medium disabled:opacity-40"
                style={{ background: '#7c3aed' }}>
                {addEventLabel}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <span style={{ fontSize: 28 }}>📅</span>
              <p className="text-xs text-center" style={{ color: 'var(--notion-text-muted)' }}>
              {hintLabel}
              </p>
          </div>
        )}
      </div>
    </div>
  );
}
