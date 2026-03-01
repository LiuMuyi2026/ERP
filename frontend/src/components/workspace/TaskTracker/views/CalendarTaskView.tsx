'use client';

import { useState } from 'react';
import { Task, STATUS_CONFIG, PRIORITY_CONFIG, TaskStatus, genId, isOverdue } from '../types';

interface CalendarTaskViewProps {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onAdd: (defaultStatus?: TaskStatus, defaultDate?: string) => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarTaskView({ tasks, onEdit, onAdd }: CalendarTaskViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);
  const todayStr = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  // Group tasks by date
  const tasksByDate: Record<string, Task[]> = {};
  tasks.forEach(task => {
    if (!task.due_date) return;
    try {
      const d = new Date(task.due_date);
      const key = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (!tasksByDate[key]) tasksByDate[key] = [];
      tasksByDate[key].push(task);
    } catch {}
  });

  // Build calendar cells
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: formatDateKey(year, month, d) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null });

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  }

  const selectedTasks = selectedDay ? (tasksByDate[selectedDay] ?? []) : [];

  return (
    <div className="flex gap-4">
      {/* Calendar grid */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
            {year}年 {MONTHS[month]}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--notion-text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="text-xs px-2 py-1 rounded-lg transition-colors ml-1"
            style={{ color: '#7c3aed', background: '#ede9fe' }}
            onMouseEnter={e => e.currentTarget.style.background = '#ddd6fe'}
            onMouseLeave={e => e.currentTarget.style.background = '#ede9fe'}>
            今天
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold py-1.5"
              style={{ color: '#9B9A97' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 border-l border-t" style={{ borderColor: 'var(--notion-border)' }}>
          {cells.map((cell, idx) => {
            if (!cell.day || !cell.dateStr) {
              return (
                <div key={`empty-${idx}`} className="border-r border-b" style={{
                  borderColor: 'var(--notion-border)',
                  background: '#FAFAF9',
                  minHeight: 80,
                }} />
              );
            }
            const isToday = cell.dateStr === todayStr;
            const isSelected = cell.dateStr === selectedDay;
            const dayTasks = tasksByDate[cell.dateStr] ?? [];

            return (
              <div key={cell.dateStr}
                className="border-r border-b p-1.5 cursor-pointer"
                style={{
                  borderColor: 'var(--notion-border)',
                  minHeight: 80,
                  background: isSelected ? '#f5f3ff' : 'white',
                  transition: 'background 0.1s',
                }}
                onClick={() => setSelectedDay(isSelected ? null : cell.dateStr)}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FAFAF9'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'white'; }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium flex items-center justify-center w-6 h-6 rounded-full"
                    style={{
                      background: isToday ? '#7c3aed' : 'transparent',
                      color: isToday ? 'white' : isSelected ? '#7c3aed' : 'var(--notion-text)',
                      fontWeight: isToday ? 700 : 400,
                    }}>
                    {cell.day}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="text-[9px] font-bold px-1 rounded-full"
                      style={{ background: '#ede9fe', color: '#7c3aed' }}>
                      {dayTasks.length}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 2).map(task => {
                    const overdue = isOverdue(task);
                    const statusColor = STATUS_CONFIG[task.status].color;
                    return (
                      <div key={task.id}
                        className="text-[9px] px-1.5 py-0.5 rounded truncate"
                        style={{
                          background: overdue ? '#FFEAEA' : STATUS_CONFIG[task.status].bg,
                          color: overdue ? '#EB5757' : statusColor,
                        }}
                        onClick={e => { e.stopPropagation(); onEdit(task); }}
                      >
                        {task.title || 'Untitled'}
                      </div>
                    );
                  })}
                  {dayTasks.length > 2 && (
                    <div className="text-[9px] pl-1" style={{ color: '#9B9A97' }}>
                      +{dayTasks.length - 2} 更多
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side panel */}
      <div className="flex-shrink-0 rounded-xl overflow-hidden" style={{
        width: 220,
        border: '1px solid var(--notion-border)',
        background: 'var(--notion-card, white)',
        alignSelf: 'flex-start',
      }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--notion-border)', background: '#FAFAF9' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--notion-text)' }}>
            {selectedDay
              ? new Date(selectedDay + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
              : '选择日期查看任务'}
          </p>
          {selectedDay && (
            <button
              onClick={() => onAdd('todo', selectedDay ?? undefined)}
              className="flex items-center gap-1 mt-2 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors w-full"
              style={{ color: '#7c3aed', background: '#ede9fe' }}
              onMouseEnter={e => e.currentTarget.style.background = '#ddd6fe'}
              onMouseLeave={e => e.currentTarget.style.background = '#ede9fe'}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              新建任务（此日期）
            </button>
          )}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
          {selectedDay && selectedTasks.length === 0 && (
            <div className="py-8 text-center text-xs" style={{ color: '#9B9A97' }}>当天暂无任务</div>
          )}
          {!selectedDay && (
            <div className="py-8 text-center text-xs" style={{ color: '#9B9A97' }}>点击日期查看任务</div>
          )}
          {selectedTasks.map(task => {
            const overdue = isOverdue(task);
            const cfg = STATUS_CONFIG[task.status];
            return (
              <div key={task.id}
                className="flex items-start gap-2 px-3 py-2.5 cursor-pointer"
                style={{ borderBottom: '1px solid var(--notion-border)' }}
                onClick={() => onEdit(task)}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFAF9'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span className="text-[9px] mt-0.5 flex-shrink-0" style={{ color: cfg.color }}>{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate" style={{
                    color: 'var(--notion-text)',
                    textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  }}>
                    {task.title || 'Untitled'}
                  </p>
                  {overdue && (
                    <span className="text-[9px]" style={{ color: '#EB5757' }}>逾期</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
