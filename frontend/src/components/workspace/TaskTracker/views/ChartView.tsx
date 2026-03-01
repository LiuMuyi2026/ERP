'use client';

import { Task, STATUS_CONFIG, PRIORITY_CONFIG, TaskStatus, TaskPriority } from '../types';

interface ChartViewProps {
  tasks: Task[];
}

export default function ChartView({ tasks }: ChartViewProps) {
  const total = tasks.length;

  // Status distribution
  const statuses: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
  const statusCounts = statuses.map(s => ({
    key: s,
    label: STATUS_CONFIG[s].label,
    color: STATUS_CONFIG[s].color,
    bg: STATUS_CONFIG[s].bg,
    count: tasks.filter(t => t.status === s).length,
  }));
  const maxStatusCount = Math.max(...statusCounts.map(s => s.count), 1);

  // Priority distribution
  const priorities: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
  const priorityCounts = priorities.map(p => ({
    key: p,
    label: PRIORITY_CONFIG[p].label,
    color: PRIORITY_CONFIG[p].color,
    bg: PRIORITY_CONFIG[p].bg,
    count: tasks.filter(t => t.priority === p).length,
  }));
  const maxPriCount = Math.max(...priorityCounts.map(p => p.count), 1);

  // Overdue stats
  const overdueCount = tasks.filter(t => t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date()).length;
  const onTrackCount = total - overdueCount;

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Status bar chart */}
      <div className="rounded-xl p-5" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>按状态分布</h3>
          <span className="text-xs" style={{ color: '#9B9A97' }}>共 {total} 个任务</span>
        </div>
        <div className="flex items-end gap-3 h-40">
          {statusCounts.map(s => {
            const pct = total > 0 ? (s.count / maxStatusCount) * 100 : 0;
            return (
              <div key={s.key} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-xs font-bold" style={{ color: s.color }}>{s.count}</span>
                <div className="w-full rounded-t-lg transition-all" style={{
                  height: `${Math.max(pct * 1.3, s.count > 0 ? 4 : 0)}px`,
                  background: s.color,
                  opacity: 0.85,
                  minHeight: s.count > 0 ? 4 : 0,
                }} />
                <span className="text-[10px] text-center" style={{ color: '#9B9A97' }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Priority horizontal bar chart */}
      <div className="rounded-xl p-5" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>按优先级分布</h3>
          <span className="text-xs" style={{ color: '#9B9A97' }}>共 {total} 个任务</span>
        </div>
        <div className="space-y-3">
          {priorityCounts.map(p => {
            const pct = total > 0 ? (p.count / maxPriCount) * 100 : 0;
            return (
              <div key={p.key} className="flex items-center gap-3">
                <span className="text-xs w-8 text-right font-medium" style={{ color: p.color }}>{p.label}</span>
                <div className="flex-1 h-5 rounded-lg overflow-hidden" style={{ background: '#F1F1EF' }}>
                  <div className="h-full rounded-lg transition-all flex items-center px-2" style={{
                    width: `${Math.max(pct, p.count > 0 ? 8 : 0)}%`,
                    background: p.color,
                    opacity: 0.8,
                  }}>
                    {p.count > 0 && (
                      <span className="text-[9px] text-white font-bold">{p.count}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs w-4 text-right" style={{ color: '#9B9A97' }}>{p.count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Completion ring */}
      <div className="rounded-xl p-5 flex items-center gap-5" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <div className="relative flex-shrink-0" style={{ width: 90, height: 90 }}>
          <svg viewBox="0 0 36 36" style={{ width: 90, height: 90, transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E3E2E0" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#0F9D58" strokeWidth="3"
              strokeDasharray={`${total > 0 ? (statusCounts.find(s => s.key === 'done')!.count / total) * 100 : 0} 100`}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-bold" style={{ color: '#0F9D58' }}>
              {total > 0 ? Math.round((statusCounts.find(s => s.key === 'done')!.count / total) * 100) : 0}%
            </span>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--notion-text)' }}>完成率</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full" style={{ background: '#0F9D58' }} />
              <span style={{ color: '#9B9A97' }}>已完成 {statusCounts.find(s => s.key === 'done')!.count} 个</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full" style={{ background: '#2F80ED' }} />
              <span style={{ color: '#9B9A97' }}>进行中 {statusCounts.find(s => s.key === 'in_progress')!.count} 个</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full" style={{ background: '#F1F1EF' }} />
              <span style={{ color: '#9B9A97' }}>未开始 {statusCounts.find(s => s.key === 'todo')!.count} 个</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overdue summary */}
      <div className="rounded-xl p-5" style={{ border: '1px solid var(--notion-border)', background: 'var(--notion-card, white)' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--notion-text)' }}>逾期状态</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4 text-center" style={{ background: '#E6F4EA' }}>
            <div className="text-2xl font-bold" style={{ color: '#0F9D58' }}>{onTrackCount}</div>
            <div className="text-xs mt-1" style={{ color: '#0F9D58' }}>按时进行</div>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ background: overdueCount > 0 ? '#FFEAEA' : '#F1F1EF' }}>
            <div className="text-2xl font-bold" style={{ color: overdueCount > 0 ? '#EB5757' : '#9B9A97' }}>{overdueCount}</div>
            <div className="text-xs mt-1" style={{ color: overdueCount > 0 ? '#EB5757' : '#9B9A97' }}>已逾期</div>
          </div>
        </div>
        {total === 0 && (
          <p className="text-xs text-center mt-4" style={{ color: '#9B9A97' }}>暂无任务数据</p>
        )}
      </div>
    </div>
  );
}
