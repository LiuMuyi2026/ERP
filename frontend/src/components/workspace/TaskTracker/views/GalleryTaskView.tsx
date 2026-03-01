'use client';

import { HandIcon } from '@/components/ui/HandIcon';
import { Task, STATUS_CONFIG, PRIORITY_CONFIG, isOverdue } from '../types';

interface GalleryTaskViewProps {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onAdd: () => void;
}

const PRIORITY_CARD_COLORS: Record<string, string> = {
  urgent: 'linear-gradient(135deg, #EB5757, #ff8a8a)',
  high:   'linear-gradient(135deg, #F2994A, #ffc47a)',
  medium: 'linear-gradient(135deg, #2F80ED, #74b9ff)',
  low:    'linear-gradient(135deg, #9B9A97, #c2c0bc)',
};

export default function GalleryTaskView({ tasks, onEdit, onAdd }: GalleryTaskViewProps) {
  return (
    <div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {tasks.map(task => {
          const overdue = isOverdue(task);
          const statusCfg = STATUS_CONFIG[task.status];
          const doneSub = (task.subtasks ?? []).filter(s => s.completed).length;
          const totalSub = (task.subtasks ?? []).length;
          const cardGrad = task.priority
            ? PRIORITY_CARD_COLORS[task.priority]
            : 'linear-gradient(135deg, #E3E2E0, #C2C0BC)';

          return (
            <div key={task.id}
              className="rounded-xl overflow-hidden cursor-pointer"
              style={{
                border: '1px solid var(--notion-border)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                transition: 'all 0.15s',
                background: 'var(--notion-card, white)',
              }}
              onClick={() => onEdit(task)}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.10)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              {/* Color strip */}
              <div style={{ height: 8, background: cardGrad }} />

              {/* Card body */}
              <div className="p-3">
                {/* Status + priority row */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-medium px-2 py-0.5"
                    style={{ background: statusCfg.bg, color: statusCfg.color }}>
                    <span style={{ fontSize: 8 }}>{statusCfg.icon}</span>
                    {statusCfg.label}
                  </span>
                  {overdue && (
                    <span className="text-[9px] px-1.5 rounded-full"
                      style={{ background: '#FFEAEA', color: '#EB5757' }}>逾期</span>
                  )}
                </div>

                {/* Title */}
                <p className="text-sm font-semibold mb-2 line-clamp-2" style={{
                  color: 'var(--notion-text)',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  opacity: task.status === 'done' ? 0.6 : 1,
                  lineHeight: 1.4,
                }}>
                  {task.title || 'Untitled'}
                </p>

                {/* Meta row */}
                <div className="flex items-center flex-wrap gap-1.5">
                  {task.assignees?.length ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"
                      style={{ background: '#F1F0EE', color: '#5F5E5B' }}>
                      <HandIcon name="person" size={10} /> {task.assignees.slice(0, 2).join(', ')}{task.assignees.length > 2 ? ` +${task.assignees.length - 2}` : ''}
                    </span>
                  ) : null}

                  {task.due_date && (
                    <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: overdue ? '#EB5757' : '#9B9A97' }}>
                      <HandIcon name="alarm-clock" size={10} /> {new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </span>
                  )}

                  {totalSub > 0 && (
                    <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: '#9B9A97' }}>
                      <HandIcon name="checkmark" size={10} /> {doneSub}/{totalSub}
                    </span>
                  )}

                  {(task.attachments?.length ?? 0) > 0 && (
                    <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: '#9B9A97' }}>
                      <HandIcon name="paperclip" size={10} /> {task.attachments!.length}
                    </span>
                  )}
                </div>

                {task.task_type && (
                  <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--notion-active)', color: '#5F5E5B' }}>
                    {task.task_type}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Add card */}
        <button
          onClick={onAdd}
          className="rounded-xl flex flex-col items-center justify-center gap-2 min-h-[120px]"
          style={{
            border: '2px dashed var(--notion-border)',
            color: '#9B9A97',
            background: 'transparent',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#7c3aed';
            e.currentTarget.style.color = '#7c3aed';
            e.currentTarget.style.background = '#faf5ff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--notion-border)';
            e.currentTarget.style.color = '#9B9A97';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="text-xs font-medium">新建任务</span>
        </button>
      </div>

      {tasks.length === 0 && (
        <div className="py-14 text-center text-sm" style={{ color: '#9B9A97' }}>暂无任务，点击卡片创建</div>
      )}
    </div>
  );
}
