'use client';

import { Task, STATUS_CONFIG } from '../types';

interface ActivityViewProps {
  tasks: Task[];
  onEdit: (t: Task) => void;
}

export default function ActivityView({ tasks, onEdit }: ActivityViewProps) {
  const sorted = [...tasks].sort((a, b) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  function formatRelTime(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return '刚刚';
      if (mins < 60) return `${mins} 分钟前`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs} 小时前`;
      const days = Math.floor(hrs / 24);
      if (days < 7) return `${days} 天前`;
      return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  function formatAbsTime(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  if (tasks.length === 0) {
    return (
      <div className="py-20 text-center text-sm" style={{ color: '#9B9A97' }}>暂无任务动态</div>
    );
  }

  return (
    <div className="max-w-xl space-y-0">
      <p className="text-xs mb-4 font-medium" style={{ color: '#9B9A97' }}>
        按最后更新时间排序，共 {tasks.length} 个任务
      </p>
      {sorted.map((task, idx) => {
        const cfg = STATUS_CONFIG[task.status];
        const assignee = task.assignees?.[0];

        return (
          <div key={task.id} className="flex gap-3 relative">
            {/* Timeline line */}
            {idx < sorted.length - 1 && (
              <div className="absolute left-[19px] top-8 bottom-0 w-px" style={{ background: 'var(--notion-border)' }} />
            )}

            {/* Avatar/icon */}
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold z-10"
              style={{ background: cfg.bg, color: cfg.color, border: '2px solid white' }}>
              {assignee
                ? assignee.slice(0, 1).toUpperCase()
                : <span style={{ fontSize: 12 }}>{cfg.icon}</span>
              }
            </div>

            {/* Content */}
            <div className="flex-1 pb-5 cursor-pointer"
              onClick={() => onEdit(task)}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>
                    {task.title || 'Untitled'}
                  </span>
                  {assignee && (
                    <span className="text-xs ml-1.5" style={{ color: '#9B9A97' }}>
                      · {assignee}
                    </span>
                  )}
                </div>
                <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: '#9B9A97' }} title={formatAbsTime(task.updated_at)}>
                  {formatRelTime(task.updated_at)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-flex items-center gap-1 rounded-full text-[9px] font-medium px-1.5 py-0.5"
                  style={{ background: cfg.bg, color: cfg.color }}>
                  <span style={{ fontSize: 8 }}>{cfg.icon}</span>
                  {cfg.label}
                </span>
                {task.priority && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'var(--notion-active)', color: '#9B9A97' }}>
                    {task.priority}
                  </span>
                )}
                {task.due_date && (
                  <span className="text-[9px]" style={{ color: '#9B9A97' }}>
                    📅 {new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>

              {task.description && (
                <p className="text-xs mt-1 line-clamp-2" style={{ color: '#9B9A97' }}>
                  {task.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
