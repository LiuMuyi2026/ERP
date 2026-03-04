'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';
import { api } from '@/lib/api';
import InlineTableView, { TableColumn, TableRow } from './InlineTableView';
import DatabaseView from './views/DatabaseView';
import { DatabaseViewData } from './views/types';
// TaskTracker: static import — PageViews is itself lazy-loaded (ssr:false), so no SSR issue
import TaskTracker from './TaskTracker/TaskTracker';
import VoiceMemoView from './VoiceMemoView';

// BlockEditor must be loaded client-side only
const BlockEditor = dynamic(() => import('@/components/editor/BlockEditor'), { ssr: false });

export interface PageView {
  id: string;
  type: 'document' | 'table' | 'database' | 'task_tracker' | 'voice_memo';
  title: string;
  icon: string;
  data?: any;            // document: block array or {text: "..."}; task_tracker: {_tasks:[...]}
  columns?: TableColumn[];
  rows?: TableRow[];
  dbData?: DatabaseViewData; // database type: full schema + rows
}

interface PageViewsProps {
  pageId: string;
  initialViews: PageView[];
}

export default function PageViews({ pageId, initialViews }: PageViewsProps) {
  const isZh = String(useLocale() || '').toLowerCase().startsWith('zh');
  const [views, setViews] = useState<PageView[]>(initialViews);
  const [activeId, setActiveId] = useState<string>(initialViews[0]?.id ?? '');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!views.some(v => v.id === activeId)) {
      setActiveId(views[0]?.id ?? '');
    }
  }, [views, activeId]);

  const scheduleSave = useCallback((updatedViews: PageView[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.patch(`/api/workspace/pages/${pageId}`, {
          content: { _views: updatedViews },
        });
      } catch (err) {
        console.error('PageViews auto-save failed:', err);
      }
    }, 800);
  }, [pageId]);

  const handleDocumentChange = useCallback((viewId: string, blocks: any[]) => {
    setViews(prev => {
      const updated = prev.map(v => v.id === viewId ? { ...v, data: blocks } : v);
      scheduleSave(updated);
      return updated;
    });
  }, [scheduleSave]);

  const handleRowsChange = useCallback((viewId: string, rows: TableRow[]) => {
    setViews(prev => {
      const updated = prev.map(v => v.id === viewId ? { ...v, rows } : v);
      scheduleSave(updated);
      return updated;
    });
  }, [scheduleSave]);

  const handleTasksChange = useCallback((viewId: string, tasks: any[]) => {
    setViews(prev => {
      const updated = prev.map(v => v.id === viewId ? { ...v, data: { _tasks: tasks } } : v);
      scheduleSave(updated);
      return updated;
    });
  }, [scheduleSave]);

  const handleDatabaseChange = useCallback((viewId: string, dbData: DatabaseViewData) => {
    setViews(prev => {
      const updated = prev.map(v => v.id === viewId ? { ...v, dbData } : v);
      scheduleSave(updated);
      return updated;
    });
  }, [scheduleSave]);

  const handleTranscriptChange = useCallback((viewId: string, transcript: string) => {
    setViews(prev => {
      const updated = prev.map(v => v.id === viewId ? { ...v, data: { ...(v.data || {}), _type: 'voice_memo', transcript } } : v);
      scheduleSave(updated);
      return updated;
    });
  }, [scheduleSave]);

  const handleVoiceMemoChange = useCallback((viewId: string, content: Record<string, any>) => {
    setViews(prev => {
      const updated = prev.map(v => v.id === viewId ? { ...v, data: content } : v);
      scheduleSave(updated);
      return updated;
    });
  }, [scheduleSave]);

  const activeView = views.find(v => v.id === activeId);

  return (
    <div className="flex flex-col" style={{ minHeight: 400 }}>
      {views.length === 0 && (
        <div
          className="rounded-xl p-8 text-center"
          style={{ border: '1px dashed var(--notion-border)', color: 'var(--notion-text-muted)' }}
        >
          {isZh ? '当前页面还没有视图内容' : 'This page has no view content yet'}
        </div>
      )}

      {/* Tab bar */}
      {views.length > 0 && (
        <div
          className="flex gap-0.5 rounded-md p-0.5 flex-shrink-0 mb-4"
          style={{
            background: 'var(--notion-active)',
            width: 'fit-content',
          }}
        >
          {views.map(view => (
            <button
              key={view.id}
              onClick={() => setActiveId(view.id)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-all"
              style={{
                background: activeId === view.id ? 'white' : 'transparent',
                color: activeId === view.id ? 'var(--notion-text)' : 'var(--notion-text-muted)',
                fontWeight: activeId === view.id ? 500 : 400,
                boxShadow: activeId === view.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (activeId !== view.id) e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
              }}
              onMouseLeave={e => {
                if (activeId !== view.id) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: 14 }}>{view.icon}</span>
              {view.title}
            </button>
          ))}
        </div>
      )}

      {/* Active view content */}
      {activeView && (
        <div className="flex-1">
          {activeView.type === 'document' ? (
            <BlockEditor
              pageId={`${pageId}__${activeView.id}`}
              initialContent={activeView.data}
              onContentChange={blocks => handleDocumentChange(activeView.id, blocks)}
            />
          ) : activeView.type === 'task_tracker' ? (
            <TaskTracker
              pageId={`${pageId}__${activeView.id}`}
              initialTasks={activeView.data?._tasks ?? []}
              onTasksChange={tasks => handleTasksChange(activeView.id, tasks)}
            />
          ) : activeView.type === 'voice_memo' ? (
            <VoiceMemoView
              pageId={pageId}
              initialTranscript={activeView.data?.transcript ?? ''}
              initialNotes={activeView.data?.notes ?? ''}
              initialAudioUrl={activeView.data?.audio_url ?? ''}
              initialSummaryData={activeView.data?.summary_data ?? null}
              initialCheckedItems={Array.isArray(activeView.data?.checked_items) ? activeView.data.checked_items : []}
              initialSummaryTemplate={activeView.data?.summary_template ?? 'general'}
              onTranscriptChange={transcript => handleTranscriptChange(activeView.id, transcript)}
              onContentChange={content => handleVoiceMemoChange(activeView.id, content)}
            />
          ) : activeView.type === 'database' ? (
            <DatabaseView
              initialData={activeView.dbData}
              onChange={dbData => handleDatabaseChange(activeView.id, dbData)}
            />
          ) : (
            <InlineTableView
              columns={activeView.columns ?? []}
              rows={activeView.rows ?? []}
              onRowsChange={rows => handleRowsChange(activeView.id, rows)}
            />
          )}
        </div>
      )}
    </div>
  );
}
