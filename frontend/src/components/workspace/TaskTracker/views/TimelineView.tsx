'use client';

import { Task, STATUS_CONFIG, PRIORITY_CONFIG, isOverdue } from '../types';

interface TimelineViewProps {
  tasks: Task[];
  onEdit: (t: Task) => void;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export default function TimelineView({ tasks, onEdit }: TimelineViewProps) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const todayDay = today.getDate();

  const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  const scheduled = tasks.filter(t => t.due_date);
  const unscheduled = tasks.filter(t => !t.due_date);

  function getDayOfMonth(dateStr: string): number | null {
    try {
      const d = new Date(dateStr);
      if (d.getFullYear() === year && d.getMonth() === month) return d.getDate();
    } catch {}
    return null;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Month header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
          {year}年 {MONTH_NAMES[month]}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#7c3aed' }}>
          当月时间轴
        </span>
      </div>

      <div style={{ minWidth: 900 }}>
        {/* Day header row */}
        <div className="flex" style={{ borderBottom: '1px solid var(--notion-border)', marginBottom: 4 }}>
          {/* Task name column */}
          <div className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5"
            style={{ width: 200, color: '#9B9A97' }}>任务名称</div>
          {/* Day columns */}
          {days.map(d => (
            <div key={d}
              className="flex-shrink-0 text-[10px] text-center py-1.5"
              style={{
                width: 32,
                color: d === todayDay ? '#7c3aed' : '#9B9A97',
                fontWeight: d === todayDay ? 700 : 400,
                background: d === todayDay ? '#f5f3ff' : 'transparent',
                borderRadius: 4,
              }}>
              {d}
            </div>
          ))}
        </div>

        {/* Scheduled tasks */}
        {scheduled.map(task => {
          const day = task.due_date ? getDayOfMonth(task.due_date) : null;
          const overdue = isOverdue(task);
          const cfg = STATUS_CONFIG[task.status];
          const priorityColor = task.priority ? PRIORITY_CONFIG[task.priority].color : '#9B9A97';

          return (
            <div key={task.id} className="flex items-center"
              style={{ borderBottom: '1px solid var(--notion-border)', minHeight: 36 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Task name */}
              <div
                className="flex-shrink-0 flex items-center gap-2 px-3 py-2 cursor-pointer"
                style={{ width: 200 }}
                onClick={() => onEdit(task)}
              >
                <span className="text-[9px]" style={{ color: cfg.color }}>{cfg.icon}</span>
                <span className="text-xs truncate" style={{
                  color: 'var(--notion-text)',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  opacity: task.status === 'done' ? 0.6 : 1,
                }}>
                  {task.title || 'Untitled'}
                </span>
              </div>

              {/* Day cells */}
              {days.map(d => (
                <div key={d} className="flex-shrink-0 flex items-center justify-center"
                  style={{ width: 32, height: 36, background: d === todayDay ? '#f5f3ff' : 'transparent' }}>
                  {day === d && (
                    <div
                      className="w-3.5 h-3.5 rounded-full cursor-pointer"
                      style={{
                        background: overdue ? '#EB5757' : priorityColor,
                        boxShadow: `0 0 0 2px white, 0 0 0 3px ${overdue ? '#EB5757' : priorityColor}40`,
                      }}
                      onClick={() => onEdit(task)}
                      title={task.title}
                    />
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {/* Unscheduled section */}
        {unscheduled.length > 0 && (
          <>
            <div className="px-3 py-2 mt-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: '#9B9A97', background: '#FAFAF9', borderTop: '1px solid var(--notion-border)' }}>
              未排期 ({unscheduled.length})
            </div>
            {unscheduled.map(task => {
              const cfg = STATUS_CONFIG[task.status];
              return (
                <div key={task.id} className="flex items-center cursor-pointer"
                  style={{ borderBottom: '1px solid var(--notion-border)', minHeight: 36 }}
                  onClick={() => onEdit(task)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF9'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2" style={{ width: 200 }}>
                    <span className="text-[9px]" style={{ color: cfg.color }}>{cfg.icon}</span>
                    <span className="text-xs truncate" style={{ color: '#9B9A97' }}>
                      {task.title || 'Untitled'}
                    </span>
                  </div>
                  <div className="flex items-center px-3">
                    <span className="text-[10px]" style={{ color: '#9B9A97' }}>— 无截止日期</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tasks.length === 0 && (
          <div className="py-14 text-center text-sm" style={{ color: '#9B9A97' }}>暂无任务</div>
        )}
      </div>
    </div>
  );
}
