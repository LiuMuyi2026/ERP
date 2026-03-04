'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { LangCode } from '@/lib/locale';
import { HandIcon } from '@/components/ui/HandIcon';
import { api, getApiUrl, getAuthHeaders } from '@/lib/api';
import toast from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────────────
export type RecordingState = 'idle' | 'recording' | 'paused' | 'done';
type TabId = 'notes' | 'transcript' | 'summary';
type SummaryTemplateId = 'general' | 'meeting' | 'sales' | 'interview' | 'brainstorm';

export interface VoiceMemoHandle {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  getState: () => RecordingState;
}

interface VoiceMemoViewProps {
  pageId: string;
  initialTranscript: string;
  initialNotes?: string;
  initialAudioUrl?: string;
  initialSummaryData?: SummaryData | null;
  initialCheckedItems?: number[];
  initialSummaryTemplate?: SummaryTemplateId;
  onTranscriptChange?: (transcript: string) => void;
  onContentChange?: (content: Record<string, any>) => void;
  onReady?: (handle: VoiceMemoHandle) => void;
  onStateChange?: (state: RecordingState, elapsed: number) => void;
}

interface SummaryData {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
}

interface PageTemplateButton {
  id: string;
  label: string;
  template_id: string;
  apply_mode: 'append' | 'replace';
  position: number;
}

// ── Language map ──────────────────────────────────────────────────────────────
const LANG_TO_SPEECH: Record<LangCode, string> = {
  en: 'en-US', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW',
  ja: 'ja-JP', it: 'it-IT', es: 'es-ES', pt: 'pt-BR',
};

const LANG_TO_TRANSCRIBE: Record<LangCode, string> = {
  en: 'en', 'zh-CN': 'zh', 'zh-TW': 'zh',
  ja: 'ja', it: 'it', es: 'es', pt: 'pt',
};

const SUMMARY_TEMPLATE_PROMPTS: Record<SummaryTemplateId, string> = {
  general: 'General memo template: concise summary, key points, clear action items with owner if known.',
  meeting: 'Meeting template: include attendees (if inferred), decisions, open issues, next steps and owners.',
  sales: 'Sales call template: include customer pains, objections, budget/timeline signals, follow-up actions.',
  interview: 'Interview template: include candidate profile highlights, strengths, risks, recommendation.',
  brainstorm: 'Brainstorm template: cluster ideas, feasibility notes, top 3 priorities, immediate experiments.',
};

const SUMMARY_TEMPLATE_TO_BUILTIN_ID: Record<SummaryTemplateId, string> = {
  general: 'tpl-voice-notes',
  meeting: 'tpl-voice-meeting',
  sales: 'tpl-voice-sales-call',
  interview: 'tpl-voice-interview',
  brainstorm: 'tpl-voice-brainstorm',
};

const VOICE_TEMPLATE_ID_TO_SUMMARY: Record<string, SummaryTemplateId> = {
  'tpl-voice-notes': 'general',
  'tpl-voice-meeting': 'meeting',
  'tpl-voice-sales-call': 'sales',
  'tpl-voice-interview': 'interview',
  'tpl-voice-brainstorm': 'brainstorm',
};

const TEMPLATE_NOTE_SCAFFOLD: Record<SummaryTemplateId, string> = {
  general: [
    '## Context',
    '-',
    '',
    '## Notes',
    '-',
    '',
    '## Action Follow-ups',
    '- [ ]',
  ].join('\n'),
  meeting: [
    '## Attendees',
    '-',
    '',
    '## Agenda',
    '-',
    '',
    '## Decisions',
    '-',
    '',
    '## Open Issues',
    '-',
    '',
    '## Next Steps',
    '- [ ]',
  ].join('\n'),
  sales: [
    '## Customer Profile',
    '-',
    '',
    '## Pain Points',
    '-',
    '',
    '## Objections',
    '-',
    '',
    '## Budget & Timeline Signals',
    '-',
    '',
    '## Follow-up Actions',
    '- [ ]',
  ].join('\n'),
  interview: [
    '## Candidate Snapshot',
    '-',
    '',
    '## Strengths',
    '-',
    '',
    '## Risks',
    '-',
    '',
    '## Recommendation',
    '-',
    '',
    '## Follow-up Questions',
    '- [ ]',
  ].join('\n'),
  brainstorm: [
    '## Idea Pool',
    '-',
    '',
    '## Feasibility Notes',
    '-',
    '',
    '## Top Priorities',
    '-',
    '',
    '## Next Experiments',
    '- [ ]',
  ].join('\n'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function parseSummaryPayload(raw: string): SummaryData {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        keyPoints: Array.isArray(parsed.keyPoints)
          ? parsed.keyPoints.filter((v: unknown): v is string => typeof v === 'string')
          : [],
        actionItems: Array.isArray(parsed.actionItems)
          ? parsed.actionItems.filter((v: unknown): v is string => typeof v === 'string')
          : [],
      };
    } catch {}
  }

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const keyPoints: string[] = [];
  const actionItems: string[] = [];
  const summaryLines: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-*]\s+/, '');
    const lower = cleaned.toLowerCase();
    if (lower.startsWith('action:') || lower.startsWith('next:') || lower.startsWith('[ ]') || lower.startsWith('todo')) {
      actionItems.push(cleaned.replace(/^(action:|next:|todo:)\s*/i, ''));
    } else if (line.startsWith('-') || line.startsWith('*')) {
      keyPoints.push(cleaned);
    } else {
      summaryLines.push(cleaned);
    }
  }
  return {
    summary: summaryLines.join(' ').trim() || raw.trim(),
    keyPoints,
    actionItems,
  };
}

// ── Waveform ──────────────────────────────────────────────────────────────────
function Waveform({ active }: { active: boolean }) {
  const bars = [3, 6, 10, 14, 10, 8, 14, 6, 10, 13, 5, 9, 14, 7, 11, 4, 8, 13, 6, 10];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 28 }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 99,
          height: active ? h : 3,
          background: active ? '#ef4444' : '#D1D5DB',
          transition: 'height 0.1s ease',
          animation: active ? `vm-bar ${0.4 + (i % 5) * 0.08}s ease-in-out infinite alternate` : 'none',
          transformOrigin: 'center',
          flexShrink: 0,
        }} />
      ))}
      <style>{`
        @keyframes vm-bar { from { transform: scaleY(0.3); } to { transform: scaleY(1.4); } }
        @keyframes vm-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes vm-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.25)} }
      `}</style>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VoiceMemoView({
  pageId,
  initialTranscript,
  initialNotes,
  initialAudioUrl,
  initialSummaryData,
  initialCheckedItems,
  initialSummaryTemplate,
  onTranscriptChange,
  onContentChange,
  onReady,
  onStateChange,
}: VoiceMemoViewProps) {
  const lang = useLocale();
  const t = useTranslations('workspace');
  const uiText = {
    saveToNotes: t('vmSaveToNotes'),
    exportMd: t('vmExportMd'),
    createTaskPage: t('vmCreateTaskPage'),
    creating: t('vmCreating'),
    noActionItems: t('vmNoActionItems'),
    cannotResolveWorkspace: t('vmCannotResolveWorkspace'),
    taskPageCreated: t('vmTaskPageCreated'),
    createTaskFailed: t('vmCreateTaskFailed'),
    exportScopeSummary: t('vmExportScopeSummary'),
    exportScopeFull: t('vmExportScopeFull'),
    asSubpage: t('vmAsSubpage'),
    applyTemplate: t('vmApplyTemplate'),
    usingCheckedItems: t('vmUsingCheckedItems'),
    quickTemplates: t('vmQuickTemplates'),
    insertTemplate: t('vmInsertTemplate'),
    replaceTemplate: t('vmReplaceTemplate'),
    savedTemplateButtons: t('vmSavedTemplateButtons'),
    addCurrentAsButton: t('vmAddCurrentAsButton'),
    runningTemplate: t('vmRunningTemplate'),
    manageTemplateError: t('vmManageTemplateError'),
    renameTemplateButton: t('vmRenameTemplateButton'),
    dragToReorder: t('vmDragToReorder'),
    moveLeft: t('vmMoveLeft'),
    moveRight: t('vmMoveRight'),
    setDefault: t('vmSetDefault'),
    defaultTemplate: t('vmDefaultTemplate'),
    deleteTemplateButton: t('vmDeleteTemplateButton'),
    cancel: t('cancel'),
    save: t('save'),
  };
  const templateOptions: Array<{ id: SummaryTemplateId; label: string }> = [
    { id: 'general', label: t('vmTemplateOptionGeneral') },
    { id: 'meeting', label: t('vmTemplateOptionMeeting') },
    { id: 'sales', label: t('vmTemplateOptionSales') },
    { id: 'interview', label: t('vmTemplateOptionInterview') },
    { id: 'brainstorm', label: t('vmTemplateOptionBrainstorm') },
  ];

  // ── Core state ────────────────────────────────────────────────────────────
  const [recState, setRecState]         = useState<RecordingState>('idle');
  const [elapsed, setElapsed]           = useState(0);
  const [transcript, setTranscript]     = useState(initialTranscript || '');
  const [interimText, setInterimText]   = useState('');
  const [notes, setNotes]               = useState(initialNotes || '');
  const [error, setError]               = useState('');
  const [activeTab, setActiveTab]       = useState<TabId>(initialTranscript ? 'transcript' : 'notes');

  // AI summary
  const [summaryData, setSummaryData]       = useState<SummaryData | null>(initialSummaryData || null);
  const [summaryStreaming, setSummaryStreaming] = useState(false);
  const [summaryRaw, setSummaryRaw]         = useState('');
  const summaryRawRef                       = useRef('');
  const [summaryDone, setSummaryDone]       = useState(!!initialSummaryData);
  const [creatingTaskPage, setCreatingTaskPage] = useState(false);
  const [exportScope, setExportScope] = useState<'summary' | 'full'>('full');
  const [createAsSubpage, setCreateAsSubpage] = useState(true);
  const [sourcePageTitle, setSourcePageTitle] = useState(t('vmVoiceMemoTitle'));
  const [sourceWorkspaceId, setSourceWorkspaceId] = useState<string | null>(null);
  const [templateButtons, setTemplateButtons] = useState<PageTemplateButton[]>([]);
  const [runningTemplateButtonId, setRunningTemplateButtonId] = useState<string | null>(null);
  const [addingTemplateButton, setAddingTemplateButton] = useState(false);
  const [reorderingTemplateButtonId, setReorderingTemplateButtonId] = useState<string | null>(null);
  const [draggingTemplateButtonId, setDraggingTemplateButtonId] = useState<string | null>(null);
  const [renameTemplateButton, setRenameTemplateButton] = useState<PageTemplateButton | null>(null);
  const [renameTemplateButtonValue, setRenameTemplateButtonValue] = useState('');

  // Checked action items
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set(initialCheckedItems || []));
  const [summaryTemplate, setSummaryTemplate] = useState<SummaryTemplateId>(initialSummaryTemplate || 'general');

  // MediaRecorder & audio
  const mediaRecorderRef     = useRef<MediaRecorder | null>(null);
  const audioChunksRef       = useRef<Blob[]>([]);
  const mediaStreamRef       = useRef<MediaStream | null>(null);
  const [audioUrl, setAudioUrl]           = useState<string | null>(initialAudioUrl || null);
  const [savedAudioUrl, setSavedAudioUrl] = useState<string | null>(initialAudioUrl || null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Refs
  const recognitionRef        = useRef<any>(null);
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef         = useRef(initialTranscript || '');
  const notesRef              = useRef(initialNotes || '');
  const recStateRef           = useRef<RecordingState>('idle');
  const scrollRef             = useRef<HTMLDivElement>(null);
  const notesSaveTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodicSaveTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const summaryDataRef        = useRef<SummaryData | null>(initialSummaryData || null);
  const checkedItemsRef       = useRef<Set<number>>(new Set(initialCheckedItems || []));
  const summaryTemplateRef    = useRef<SummaryTemplateId>(initialSummaryTemplate || 'general');

  // Keep refs in sync
  useEffect(() => { recStateRef.current = recState; }, [recState]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { summaryDataRef.current = summaryData; }, [summaryData]);
  useEffect(() => { checkedItemsRef.current = checkedItems; }, [checkedItems]);
  useEffect(() => { summaryTemplateRef.current = summaryTemplate; }, [summaryTemplate]);

  useEffect(() => {
    if (initialSummaryData) {
      setSummaryData(initialSummaryData);
      setSummaryDone(true);
    }
    if (initialCheckedItems && initialCheckedItems.length > 0) {
      setCheckedItems(new Set(initialCheckedItems));
    }
  }, [initialSummaryData, initialCheckedItems]);

  useEffect(() => {
    api.get(`/api/workspace/pages/${pageId}`)
      .then((p: any) => {
        setSourcePageTitle(p?.title || 'Voice Memo');
        setSourceWorkspaceId(p?.workspace_id || null);
      })
      .catch(() => {});
  }, [pageId]);

  useEffect(() => {
    if (onContentChange) return; // embedded view stores content in parent, avoid page-level template button side effects
    api.get(`/api/workspace/pages/${pageId}/template-buttons`)
      .then((rows: any[]) => {
        const voiceRows = (Array.isArray(rows) ? rows : []).filter(r => String(r?.template_id || '').startsWith('tpl-voice-'));
        setTemplateButtons(voiceRows);
      })
      .catch(() => setTemplateButtons([]));
  }, [pageId, onContentChange]);

  // Notify parent
  useEffect(() => { onStateChange?.(recState, elapsed); }, [recState, elapsed, onStateChange]);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, interimText]);

  // ── Persistence helpers ───────────────────────────────────────────────────
  const savedAudioUrlRef = useRef<string | null>(initialAudioUrl || null);
  const saveContent = useCallback(async (
    t: string,
    n: string,
    audioUrlOverride?: string,
    summaryOverride?: SummaryData | null,
    checkedOverride?: Set<number>,
    templateOverride?: SummaryTemplateId,
  ) => {
    try {
      const content: Record<string, any> = { _type: 'voice_memo', transcript: t, notes: n };
      const url = audioUrlOverride ?? savedAudioUrlRef.current;
      if (url) content.audio_url = url;
      const summary = summaryOverride ?? summaryDataRef.current;
      if (summary && (summary.summary || summary.keyPoints.length || summary.actionItems.length)) {
        content.summary_data = summary;
      }
      const checked = checkedOverride ?? checkedItemsRef.current;
      if (checked.size > 0) {
        content.checked_items = Array.from(checked.values()).sort((a, b) => a - b);
      }
      content.summary_template = templateOverride ?? summaryTemplateRef.current;
      if (onContentChange) {
        onContentChange(content);
      } else {
        await api.patch(`/api/workspace/pages/${pageId}`, { content });
      }
      onTranscriptChange?.(t);
    } catch {}
  }, [pageId, onTranscriptChange, onContentChange]);

  // Notes: debounced auto-save on every keystroke
  const handleNotesChange = useCallback((val: string) => {
    setNotes(val);
    notesRef.current = val;
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    notesSaveTimerRef.current = setTimeout(() => {
      saveContent(transcriptRef.current, val);
    }, 800);
  }, [saveContent]);

  // Cleanup
  useEffect(() => () => {
    if (recognitionRef.current) try { recognitionRef.current.abort(); } catch {}
    if (timerRef.current) clearInterval(timerRef.current);
    if (periodicSaveTimerRef.current) clearInterval(periodicSaveTimerRef.current);
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
    }
  }, []);

  // ── SpeechRecognition ─────────────────────────────────────────────────────
  const createRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError(t('vmSpeechNotSupported'));
      return null;
    }
    const r = new SR();
    r.continuous      = true;
    r.interimResults  = true;
    r.lang            = LANG_TO_SPEECH[lang as LangCode] || 'zh-CN';

    r.onresult = (e: any) => {
      // IMPORTANT: Start from e.resultIndex to avoid re-processing old results
      let newFinal = '';
      let interim  = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) newFinal += res[0].transcript;
        else             interim  += res[0].transcript;
      }
      if (newFinal) {
        const updated = transcriptRef.current + newFinal;
        transcriptRef.current = updated;
        setTranscript(updated);
      }
      setInterimText(interim);
    };

    r.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError(t('vmMicDenied'));
        stopRecordingInternal();
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[VoiceMemo] SR error:', e.error);
      }
    };

    // Auto-restart if still recording (handles browser's ~60s hard stop)
    r.onend = () => {
      if (recStateRef.current === 'recording') {
        try { r.start(); } catch {}
      }
    };

    return r;
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Internal stop (without triggering summary — used by error handler)
  const stopRecordingInternal = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setInterimText('');
    setRecState('done');
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('vmBrowserNotSupported'));
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        mediaStreamRef.current = stream;

        // ── MediaRecorder: parallel audio recording ──
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;

        // ── Web Speech API: real-time preview (best-effort) ──
        const r = createRecognition();
        if (r) {
          recognitionRef.current = r;
          try { r.start(); } catch {}
        }

        // Reset transcript for a new session (only if we were idle/done)
        if (recStateRef.current !== 'paused') {
          setTranscript('');
          transcriptRef.current = '';
          setElapsed(0);
          setSummaryData(null);
          summaryDataRef.current = null;
          setSummaryDone(false);
          setSummaryRaw('');
          summaryRawRef.current = '';
          setCheckedItems(new Set());
          checkedItemsRef.current = new Set();
          setAudioUrl(null);
          setSavedAudioUrl(null);
          savedAudioUrlRef.current = null;
          setIsTranscribing(false);
        }
        setRecState('recording');
        setActiveTab('transcript');
        timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
        // Periodic transcript auto-save every 30s while recording
        if (periodicSaveTimerRef.current) clearInterval(periodicSaveTimerRef.current);
        periodicSaveTimerRef.current = setInterval(() => {
          saveContent(transcriptRef.current, notesRef.current);
        }, 30000);
      })
      .catch(() => setError(t('vmMicDenied')));
  }, [createRecognition, saveContent, t]);

  const pauseRecording = useCallback(() => {
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.pause(); } catch {}
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (periodicSaveTimerRef.current) { clearInterval(periodicSaveTimerRef.current); periodicSaveTimerRef.current = null; }
    setInterimText('');
    setRecState('paused');
    // Save current state on pause
    saveContent(transcriptRef.current, notesRef.current);
  }, [saveContent]);

  const resumeRecording = useCallback(() => {
    setError('');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      try { mediaRecorderRef.current.resume(); } catch {}
    }
    const r = createRecognition();
    if (r) {
      recognitionRef.current = r;
      try { r.start(); } catch {}
    }
    setRecState('recording');
    timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    // Restart periodic save
    if (periodicSaveTimerRef.current) clearInterval(periodicSaveTimerRef.current);
    periodicSaveTimerRef.current = setInterval(() => {
      saveContent(transcriptRef.current, notesRef.current);
    }, 30000);
  }, [createRecognition, saveContent]);

  const stopRecording = useCallback(() => {
    // Stop Web Speech API
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (periodicSaveTimerRef.current) { clearInterval(periodicSaveTimerRef.current); periodicSaveTimerRef.current = null; }
    setInterimText('');
    setRecState('done');

    const webSpeechTranscript = transcriptRef.current;
    const currentNotes = notesRef.current;

    // Stop MediaRecorder and collect audio
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = async () => {
        // Stop all tracks
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }

        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const localUrl = URL.createObjectURL(audioBlob);
        setAudioUrl(localUrl);

        const ext = mimeType.includes('mp4') ? '.mp4' : '.webm';
        const file = new File([audioBlob], `recording${ext}`, { type: mimeType });

        // Upload for Gemini transcription
        setIsTranscribing(true);
        try {
          const result = await api.upload('/api/workspace/voice/transcribe', file, {
            extraFields: { language: LANG_TO_TRANSCRIBE[lang as LangCode] || 'en' },
          });
          if (result.transcript) {
            transcriptRef.current = result.transcript;
            setTranscript(result.transcript);
          }
        } catch (err) {
          console.warn('[VoiceMemo] Gemini transcription failed, keeping Web Speech result:', err);
        }
        setIsTranscribing(false);

        // Save final transcript + notes
        saveContent(transcriptRef.current, currentNotes, undefined, summaryDataRef.current, checkedItemsRef.current);
        // Auto-generate summary
        generateSummary(transcriptRef.current, currentNotes);
        setActiveTab('summary');

        // Permanently save audio file (async, non-blocking)
        api.upload('/api/workspace/voice/upload-audio', file).then(res => {
          if (res?.url) {
            setSavedAudioUrl(res.url);
            savedAudioUrlRef.current = res.url;
            saveContent(transcriptRef.current, notesRef.current, res.url, summaryDataRef.current, checkedItemsRef.current);
          }
        }).catch(() => {});
      };
      recorder.stop();
    } else {
      // No MediaRecorder — fallback to just Web Speech result
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
      saveContent(webSpeechTranscript, currentNotes, undefined, summaryDataRef.current, checkedItemsRef.current);
      generateSummary(webSpeechTranscript, currentNotes);
      setActiveTab('summary');
    }
  }, [lang, saveContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose handle to parent
  useEffect(() => {
    if (!onReady) return;
    onReady({
      start: startRecording,
      pause: pauseRecording,
      resume: resumeRecording,
      stop: stopRecording,
      getState: () => recStateRef.current,
    });
  }, [onReady, startRecording, pauseRecording, resumeRecording, stopRecording]);

  // ── AI Summary ────────────────────────────────────────────────────────────
  async function generateSummary(text: string, notesText: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setSummaryData({ summary: t('vmNoTranscript'), keyPoints: [], actionItems: [] });
      setSummaryDone(true);
      return;
    }

    setSummaryStreaming(true);
    setSummaryRaw('');
    summaryRawRef.current = '';
    setSummaryData(null);
    setSummaryDone(false);

    const prompt = `${t('vmSummaryPromptIntro', { hasNotes: notesText ? 'true' : 'false' })}

${notesText ? `[${t('vmSummaryPromptNotes')}]\n${notesText}\n\n` : ''}[${t('vmSummaryPromptTranscript')}]
${trimmed}

[Template]
${SUMMARY_TEMPLATE_PROMPTS[summaryTemplate]}

${t('vmSummaryPromptFormat')}
{
  "summary": "${t('vmSummaryPromptSummaryHint')}",
  "keyPoints": ["${t('vmSummaryPromptKeyPointsHint')}"],
  "actionItems": ["${t('vmSummaryPromptActionItemsHint')}"]
}`;

    try {
      const apiUrl = getApiUrl();
      const resp = await fetch(`${apiUrl}/api/automation/mention`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ page_id: pageId, page_content: trimmed, mention_text: prompt }),
      });
      if (!resp.body) throw new Error('No response body');

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const p = JSON.parse(line.slice(5).trim());
            if (p.chunk) {
              summaryRawRef.current += p.chunk;
              setSummaryRaw(summaryRawRef.current);
            }
          } catch {}
        }
      }

      const raw = summaryRawRef.current;
      const nextSummary = parseSummaryPayload(raw);
      setSummaryData(nextSummary);
      summaryDataRef.current = nextSummary;
      saveContent(transcriptRef.current, notesRef.current, undefined, nextSummary, checkedItemsRef.current, summaryTemplate);
    } catch (err: any) {
      const nextSummary = { summary: t('vmSummaryFailed', { msg: err?.message ?? 'Unknown error' }), keyPoints: [], actionItems: [] };
      setSummaryData(nextSummary);
      summaryDataRef.current = nextSummary;
      saveContent(transcriptRef.current, notesRef.current, undefined, nextSummary, checkedItemsRef.current, summaryTemplate);
    } finally {
      setSummaryStreaming(false);
      setSummaryDone(true);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const wordCount    = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const isRecording  = recState === 'recording';
  const isPaused     = recState === 'paused';
  const isActive     = isRecording || isPaused;
  const isDone       = recState === 'done';

  const tabs: { id: TabId; label: string; count?: number; dot?: boolean }[] = [
    { id: 'notes',      label: t('vmTabNotes') },
    { id: 'transcript', label: t('vmTabTranscript'), count: wordCount || undefined, dot: isRecording },
    { id: 'summary',    label: t('vmTabAiSummary'), count: summaryDone && summaryData
        ? (summaryData.keyPoints.length + summaryData.actionItems.length) || undefined
        : undefined
    },
  ];

  function resetAll() {
    setRecState('idle');
    setElapsed(0);
    setTranscript('');
    transcriptRef.current = '';
    setInterimText('');
    setSummaryData(null);
    summaryDataRef.current = null;
    setSummaryDone(false);
    setSummaryRaw('');
    summaryRawRef.current = '';
    setCheckedItems(new Set());
    checkedItemsRef.current = new Set();
    setAudioUrl(null);
    setSavedAudioUrl(null);
    savedAudioUrlRef.current = null;
    setIsTranscribing(false);
    setActiveTab('notes');
    saveContent('', notesRef.current);
  }

  function persistCheckedItems(next: Set<number>) {
    checkedItemsRef.current = next;
    setCheckedItems(next);
    saveContent(transcriptRef.current, notesRef.current, undefined, summaryDataRef.current, next, summaryTemplateRef.current);
  }

  function appendSummaryToNotes() {
    if (!summaryDataRef.current) return;
    const s = summaryDataRef.current;
    const lines: string[] = [];
    if (s.summary) lines.push(`## AI Summary\n${s.summary}`);
    if (s.keyPoints.length > 0) lines.push(`## Key Points\n${s.keyPoints.map(p => `- ${p}`).join('\n')}`);
    if (s.actionItems.length > 0) lines.push(`## Action Items\n${s.actionItems.map(a => `- [ ] ${a}`).join('\n')}`);
    const merged = [notesRef.current.trim(), lines.join('\n\n')].filter(Boolean).join('\n\n');
    setNotes(merged);
    notesRef.current = merged;
    setActiveTab('notes');
    saveContent(transcriptRef.current, merged, undefined, summaryDataRef.current, checkedItemsRef.current, summaryTemplateRef.current);
  }

  function hydrateFromVoiceMemoContent(content: Record<string, any>) {
    const nextTranscript = String(content?.transcript || '');
    const nextNotes = String(content?.notes || '');
    const nextTemplate = (content?.summary_template || 'general') as SummaryTemplateId;
    const nextSummary = (content?.summary_data && typeof content.summary_data === 'object')
      ? content.summary_data as SummaryData
      : null;
    const nextChecked = Array.isArray(content?.checked_items)
      ? new Set<number>(content.checked_items.filter((v: unknown) => Number.isInteger(v)).map((v: number) => Number(v)))
      : new Set<number>();

    setTranscript(nextTranscript);
    transcriptRef.current = nextTranscript;
    setNotes(nextNotes);
    notesRef.current = nextNotes;
    setSummaryTemplate(nextTemplate);
    summaryTemplateRef.current = nextTemplate;
    setSummaryData(nextSummary);
    summaryDataRef.current = nextSummary;
    setSummaryDone(!!nextSummary);
    setCheckedItems(nextChecked);
    checkedItemsRef.current = nextChecked;
    setActiveTab('notes');
    onTranscriptChange?.(nextTranscript);
  }

  function updateSummaryTemplate(next: SummaryTemplateId) {
    setSummaryTemplate(next);
    summaryTemplateRef.current = next;
    saveContent(transcriptRef.current, notesRef.current, undefined, summaryDataRef.current, checkedItemsRef.current, next);
  }

  function applyTemplateScaffold(mode: 'append' | 'replace' = 'append', templateId?: SummaryTemplateId) {
    const activeTemplate = templateId || summaryTemplateRef.current;
    const scaffold = TEMPLATE_NOTE_SCAFFOLD[activeTemplate];
    const merged = mode === 'replace'
      ? scaffold
      : [notesRef.current.trim(), scaffold].filter(Boolean).join('\n\n');
    setNotes(merged);
    notesRef.current = merged;
    setActiveTab('notes');
    saveContent(transcriptRef.current, merged, undefined, summaryDataRef.current, checkedItemsRef.current, activeTemplate);
  }

  function buildSummaryMarkdown(scope: 'summary' | 'full' = exportScope) {
    const s = summaryDataRef.current;
    if (!s) return '';
    const parts: string[] = [];
    parts.push(`# Voice Memo Summary`);
    parts.push(``);
    parts.push(`- Duration: ${fmtTime(elapsed)}`);
    parts.push(`- Template: ${summaryTemplateRef.current}`);
    parts.push(``);
    if (s.summary) {
      parts.push(`## Summary`);
      parts.push(s.summary);
      parts.push(``);
    }
    if (s.keyPoints.length > 0) {
      parts.push(`## Key Points`);
      parts.push(...s.keyPoints.map(p => `- ${p}`));
      parts.push(``);
    }
    if (s.actionItems.length > 0) {
      parts.push(`## Action Items`);
      parts.push(...s.actionItems.map((a, i) => `- [${checkedItemsRef.current.has(i) ? 'x' : ' '}] ${a}`));
      parts.push(``);
    }
    if (scope === 'full' && notesRef.current.trim()) {
      parts.push(`## Notes`);
      parts.push(notesRef.current.trim());
      parts.push(``);
    }
    if (scope === 'full' && transcriptRef.current.trim()) {
      parts.push(`## Transcript`);
      parts.push(transcriptRef.current.trim());
    }
    return parts.join('\n').trim();
  }

  function exportSummaryMarkdown() {
    const md = buildSummaryMarkdown(exportScope);
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeBase = (sourcePageTitle || 'voice-memo')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'voice-memo';
    const day = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${safeBase}-${day}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function createTaskTrackerPageFromSummary() {
    const summary = summaryDataRef.current;
    const items = summary?.actionItems || [];
    if (!items.length) {
      toast.error(uiText.noActionItems);
      return;
    }
    const checkedIndexes = Array.from(checkedItemsRef.current.values())
      .filter(i => i >= 0 && i < items.length)
      .sort((a, b) => a - b);
    const selectedItems = checkedIndexes.length > 0 ? checkedIndexes.map(i => items[i]) : items;
    setCreatingTaskPage(true);
    try {
      const workspaceId = sourceWorkspaceId;
      if (!workspaceId) throw new Error(uiText.cannotResolveWorkspace);
      const nowIso = new Date().toISOString();
      const tasks = selectedItems.map((item, idx) => ({
        id: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${idx}`),
        title: item,
        status: 'todo',
        priority: 'medium',
        assignees: [],
        due_date: null,
        subtasks: [],
        attachments: [],
        task_type: null,
        description: null,
        created_at: nowIso,
        updated_at: nowIso,
      }));
      const created = await api.post('/api/workspace/pages', {
        workspace_id: workspaceId,
        parent_page_id: createAsSubpage ? pageId : null,
        title: `${sourcePageTitle || t('vmVoiceMemoTitle')} - ${t('vmActionItemsPageSuffix')}`,
        icon: '✅',
        content: {
          _type: 'task_tracker',
          _tasks: tasks,
          _notes: summary?.summary || '',
        },
      });
      const tenant = window.location.pathname.split('/')[1];
      if (tenant && created?.id) {
        window.location.href = `/${tenant}/workspace/${created.id}`;
        return;
      }
      toast.success(uiText.taskPageCreated);
    } catch (err: any) {
      toast.error(err?.message || uiText.createTaskFailed);
    } finally {
      setCreatingTaskPage(false);
    }
  }

  async function createVoiceTemplateButtonFromCurrent() {
    if (onContentChange) return;
    const tplId = SUMMARY_TEMPLATE_TO_BUILTIN_ID[summaryTemplateRef.current];
    const activeLabel = templateOptions.find(o => o.id === summaryTemplateRef.current)?.label || summaryTemplateRef.current;
    setAddingTemplateButton(true);
    try {
      const created = await api.post(`/api/workspace/pages/${pageId}/template-buttons`, {
        label: activeLabel,
        template_id: tplId,
        apply_mode: 'replace', // append mode does not support structured voice_memo pages
      });
      setTemplateButtons(prev => [...prev, created as PageTemplateButton]);
    } catch (err: any) {
      toast.error(err?.message || uiText.manageTemplateError);
    } finally {
      setAddingTemplateButton(false);
    }
  }

  async function runVoiceTemplateButton(button: PageTemplateButton) {
    if (onContentChange) return;
    setRunningTemplateButtonId(button.id);
    try {
      await api.post(`/api/workspace/pages/${pageId}/template-buttons/${button.id}/run`, { lang: String(lang || 'en') });
      const p = await api.get(`/api/workspace/pages/${pageId}`);
      const content = p?.content;
      if (content && typeof content === 'object' && content._type === 'voice_memo') {
        hydrateFromVoiceMemoContent(content);
      }
    } catch (err: any) {
      toast.error(err?.message || uiText.manageTemplateError);
    } finally {
      setRunningTemplateButtonId(null);
    }
  }

  async function renameVoiceTemplateButton(button: PageTemplateButton) {
    if (onContentChange) return;
    setRenameTemplateButton(button);
    setRenameTemplateButtonValue(button.label);
  }

  async function submitRenameVoiceTemplateButton() {
    if (onContentChange || !renameTemplateButton) return;
    const trimmed = renameTemplateButtonValue.trim();
    if (!trimmed || trimmed === renameTemplateButton.label) {
      setRenameTemplateButton(null);
      return;
    }
    try {
      const updated = await api.patch(`/api/workspace/pages/${pageId}/template-buttons/${renameTemplateButton.id}`, { label: trimmed });
      setTemplateButtons(prev => prev.map(b => b.id === renameTemplateButton.id ? { ...b, label: (updated?.label || trimmed) } : b));
      setRenameTemplateButton(null);
    } catch (err: any) {
      toast.error(err?.message || uiText.manageTemplateError);
    }
  }

  async function deleteVoiceTemplateButton(buttonId: string) {
    if (onContentChange) return;
    try {
      await api.delete(`/api/workspace/pages/${pageId}/template-buttons/${buttonId}`);
      setTemplateButtons(prev => prev.filter(b => b.id !== buttonId));
    } catch (err: any) {
      toast.error(err?.message || uiText.manageTemplateError);
    }
  }

  async function reorderVoiceTemplateButton(buttonId: string, direction: 'left' | 'right') {
    if (onContentChange) return;
    const current = [...templateButtons];
    const idx = current.findIndex(b => b.id === buttonId);
    if (idx < 0) return;
    const target = direction === 'left' ? idx - 1 : idx + 1;
    if (target < 0 || target >= current.length) return;
    const swapped = [...current];
    [swapped[idx], swapped[target]] = [swapped[target], swapped[idx]];
    const normalized = swapped.map((b, i) => ({ ...b, position: i }));
    setTemplateButtons(normalized);
    setReorderingTemplateButtonId(buttonId);
    try {
      await api.patch(`/api/workspace/pages/${pageId}/template-buttons/reorder`, {
        ordered_ids: normalized.map(b => b.id),
      });
    } catch (err: any) {
      setTemplateButtons(current);
      toast.error(err?.message || uiText.manageTemplateError);
    } finally {
      setReorderingTemplateButtonId(null);
    }
  }

  async function persistTemplateButtonOrder(next: PageTemplateButton[]) {
    const current = [...templateButtons];
    const normalized = next.map((b, i) => ({ ...b, position: i }));
    setTemplateButtons(normalized);
    setReorderingTemplateButtonId('drag');
    try {
      await api.patch(`/api/workspace/pages/${pageId}/template-buttons/reorder`, {
        ordered_ids: normalized.map(b => b.id),
      });
    } catch (err: any) {
      setTemplateButtons(current);
      toast.error(err?.message || uiText.manageTemplateError);
    } finally {
      setReorderingTemplateButtonId(null);
    }
  }

  async function handleTemplateButtonDrop(targetId: string) {
    const draggedId = draggingTemplateButtonId;
    setDraggingTemplateButtonId(null);
    if (!draggedId || draggedId === targetId) return;
    const current = [...templateButtons];
    const from = current.findIndex(b => b.id === draggedId);
    const to = current.findIndex(b => b.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...current];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    await persistTemplateButtonOrder(reordered);
  }

  function setDefaultTemplateFromButton(button: PageTemplateButton) {
    const mapped = VOICE_TEMPLATE_ID_TO_SUMMARY[String(button.template_id || '')];
    if (!mapped) return;
    updateSummaryTemplate(mapped);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,
      background: 'var(--notion-bg)',
    }}>

      {/* ── Persistent recording controls bar (visible from ALL tabs) ── */}
      {isActive && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 20px',
          background: isRecording
            ? 'linear-gradient(to right, rgba(239,68,68,0.07), rgba(239,68,68,0.02))'
            : 'linear-gradient(to right, rgba(245,158,11,0.07), rgba(245,158,11,0.02))',
          borderBottom: '1px solid var(--notion-border)',
          flexShrink: 0,
        }}>
          {/* Pulsing dot + timer */}
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isRecording ? '#ef4444' : '#f59e0b',
            animation: isRecording ? 'vm-pulse 1.2s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
            color: isRecording ? '#dc2626' : '#b45309',
            minWidth: 52,
          }}>
            {fmtTime(elapsed)}
          </span>
          <Waveform active={isRecording} />
          <div style={{ flex: 1 }} />
          {isRecording ? (
            <>
              <Btn onClick={pauseRecording} variant="outline" size="sm">
                <PauseIcon size={11} /> {t('vmPause')}
              </Btn>
              <Btn onClick={stopRecording} variant="dark" size="sm">
                <StopIcon size={10} /> {t('vmStopAndSummarize')}
              </Btn>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: '#b45309', marginRight: 4 }}>{t('vmPausedLabel')}</span>
              <Btn onClick={resumeRecording} variant="red" size="sm">
                <PlayIcon size={11} /> {t('vmResumeRecording')}
              </Btn>
              <Btn onClick={stopRecording} variant="dark" size="sm">
                <StopIcon size={10} /> {t('vmStopAndSummarize')}
              </Btn>
            </>
          )}
        </div>
      )}

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        padding: '0 8px',
        borderBottom: '1px solid var(--notion-border)',
        background: 'var(--notion-card, white)',
        flexShrink: 0,
        gap: 2,
      }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '11px 10px 10px',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--notion-text)' : 'var(--notion-text-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${active ? '#7c3aed' : 'transparent'}`,
              marginBottom: -1,
              whiteSpace: 'nowrap',
              transition: 'color 0.12s',
            }}>
              {tab.label}
              {tab.dot && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#ef4444', flexShrink: 0,
                  animation: 'vm-pulse 1.4s ease-in-out infinite',
                }} />
              )}
              {!tab.dot && tab.count !== undefined && tab.count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 5px', borderRadius: 99,
                  background: active ? '#7c3aed' : 'var(--notion-hover)',
                  color: active ? 'white' : 'var(--notion-text-muted)',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Error bar ───────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          margin: '8px 20px 0', padding: '8px 14px', borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)',
          color: '#dc2626', fontSize: 12,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ cursor: 'pointer', opacity: 0.6, display: 'inline-flex', alignItems: 'center' }}>
            <HandIcon name="cross-mark" size={11} />
          </button>
        </div>
      )}

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

        {/* ── NOTES TAB ── */}
        {activeTab === 'notes' && (
          <div style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            {/* Recording active hint */}
            {isActive && (
              <div style={{
                margin: '12px 24px 0', padding: '8px 14px', borderRadius: 8, flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0,
                  animation: 'vm-pulse 1.2s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 12, color: '#dc2626' }}>
                  {t('vmRecordingHint')}
                </span>
                <button
                  onClick={() => setActiveTab('transcript')}
                  style={{
                    marginLeft: 'auto', fontSize: 11, color: '#dc2626', fontWeight: 600,
                    background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  {t('vmViewTranscript')}
                </button>
              </div>
            )}
            <div style={{ padding: '16px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginBottom: 10, flexShrink: 0 }}>
                {isActive ? t('vmNotesHintActive') : t('vmNotesHintIdle')}
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                marginBottom: 12, paddingBottom: 10, borderBottom: '1px dashed var(--notion-border)',
              }}>
                <span style={{ fontSize: 11, color: 'var(--notion-text-muted)', fontWeight: 600 }}>
                  {uiText.quickTemplates}
                </span>
                {templateOptions.map(opt => {
                  const active = summaryTemplate === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => updateSummaryTemplate(opt.id)}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 999,
                        border: active ? '1px solid rgba(124,58,237,0.4)' : '1px solid var(--notion-border)',
                        background: active ? 'rgba(124,58,237,0.08)' : 'var(--notion-card, white)',
                        color: active ? '#7c3aed' : 'var(--notion-text-muted)',
                        fontSize: 11,
                        fontWeight: active ? 600 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <Btn onClick={() => applyTemplateScaffold('append')} variant="outline" size="xs">
                  {uiText.insertTemplate}
                </Btn>
                <Btn onClick={() => applyTemplateScaffold('replace')} variant="outline" size="xs">
                  {uiText.replaceTemplate}
                </Btn>
                {!onContentChange && (
                  <Btn onClick={createVoiceTemplateButtonFromCurrent} variant="outline" size="xs" disabled={addingTemplateButton}>
                    {addingTemplateButton ? uiText.creating : uiText.addCurrentAsButton}
                  </Btn>
                )}
              </div>
              {!onContentChange && templateButtons.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  marginBottom: 10,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--notion-text-muted)', fontWeight: 600 }}>
                    {uiText.savedTemplateButtons}
                  </span>
                  {templateButtons.map(btn => (
                    <div key={btn.id} style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--notion-border)', borderRadius: 999, overflow: 'hidden' }}>
                      <button
                        draggable
                        onDragStart={() => setDraggingTemplateButtonId(btn.id)}
                        onDragEnd={() => setDraggingTemplateButtonId(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={async (e) => {
                          e.preventDefault();
                          await handleTemplateButtonDrop(btn.id);
                        }}
                        style={{
                          border: 'none',
                          borderRight: '1px solid var(--notion-border)',
                          padding: '4px 6px',
                          fontSize: 10,
                          cursor: 'grab',
                          background: draggingTemplateButtonId === btn.id ? 'var(--notion-hover)' : 'var(--notion-card, white)',
                          color: 'var(--notion-text-muted)',
                        }}
                        title={uiText.dragToReorder}
                      >
                        ⋮⋮
                      </button>
                      <button
                        onClick={() => runVoiceTemplateButton(btn)}
                        disabled={runningTemplateButtonId === btn.id}
                        style={{
                          border: 'none',
                          padding: '4px 10px',
                          fontSize: 11,
                          cursor: runningTemplateButtonId === btn.id ? 'not-allowed' : 'pointer',
                          background: 'var(--notion-card, white)',
                          color: 'var(--notion-text)',
                          opacity: runningTemplateButtonId === btn.id ? 0.6 : 1,
                        }}
                      >
                        {runningTemplateButtonId === btn.id ? uiText.runningTemplate : btn.label}
                      </button>
                      <button
                        onClick={() => setDefaultTemplateFromButton(btn)}
                        style={{
                          border: 'none',
                          borderLeft: '1px solid var(--notion-border)',
                          padding: '4px 7px',
                          fontSize: 10,
                          cursor: 'pointer',
                          background: 'var(--notion-card, white)',
                          color: VOICE_TEMPLATE_ID_TO_SUMMARY[btn.template_id] === summaryTemplate ? '#7c3aed' : 'var(--notion-text-muted)',
                          fontWeight: VOICE_TEMPLATE_ID_TO_SUMMARY[btn.template_id] === summaryTemplate ? 700 : 500,
                        }}
                        title={uiText.setDefault}
                      >
                        {VOICE_TEMPLATE_ID_TO_SUMMARY[btn.template_id] === summaryTemplate ? uiText.defaultTemplate : 'D'}
                      </button>
                      <button
                        onClick={() => reorderVoiceTemplateButton(btn.id, 'left')}
                        disabled={reorderingTemplateButtonId === btn.id}
                        style={{
                          border: 'none',
                          borderLeft: '1px solid var(--notion-border)',
                          padding: '4px 7px',
                          fontSize: 11,
                          cursor: reorderingTemplateButtonId === btn.id ? 'not-allowed' : 'pointer',
                          background: 'var(--notion-card, white)',
                          color: 'var(--notion-text-muted)',
                          opacity: reorderingTemplateButtonId === btn.id ? 0.6 : 1,
                        }}
                        title={uiText.moveLeft}
                      >
                        ←
                      </button>
                      <button
                        onClick={() => reorderVoiceTemplateButton(btn.id, 'right')}
                        disabled={reorderingTemplateButtonId === btn.id}
                        style={{
                          border: 'none',
                          borderLeft: '1px solid var(--notion-border)',
                          padding: '4px 7px',
                          fontSize: 11,
                          cursor: reorderingTemplateButtonId === btn.id ? 'not-allowed' : 'pointer',
                          background: 'var(--notion-card, white)',
                          color: 'var(--notion-text-muted)',
                          opacity: reorderingTemplateButtonId === btn.id ? 0.6 : 1,
                        }}
                        title={uiText.moveRight}
                      >
                        →
                      </button>
                      <button
                        onClick={() => renameVoiceTemplateButton(btn)}
                        style={{
                          border: 'none',
                          borderLeft: '1px solid var(--notion-border)',
                          padding: '4px 7px',
                          fontSize: 11,
                          cursor: 'pointer',
                          background: 'var(--notion-card, white)',
                          color: 'var(--notion-text-muted)',
                        }}
                        title={uiText.renameTemplateButton}
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteVoiceTemplateButton(btn.id)}
                        style={{
                          border: 'none',
                          borderLeft: '1px solid var(--notion-border)',
                          padding: '4px 7px',
                          fontSize: 11,
                          cursor: 'pointer',
                          background: 'var(--notion-card, white)',
                          color: '#b91c1c',
                        }}
                        title={uiText.deleteTemplateButton}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                value={notes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder={t('vmNotesPlaceholder')}
                style={{
                  flex: 1, minHeight: 200, resize: 'none',
                  border: 'none', outline: 'none',
                  background: 'transparent',
                  fontSize: 14, lineHeight: 1.8,
                  color: 'var(--notion-text)',
                  fontFamily: 'inherit',
                }}
              />
              {/* Start recording CTA if not started yet */}
              {recState === 'idle' && (
                <div style={{ paddingTop: 20, borderTop: '1px solid var(--notion-border)', marginTop: 8, flexShrink: 0 }}>
                  <button
                    onClick={startRecording}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '10px 22px', borderRadius: 10,
                      background: '#ef4444', color: 'white',
                      fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(239,68,68,0.35)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#dc2626'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(239,68,68,0.45)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ef4444'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 10px rgba(239,68,68,0.35)'; }}
                  >
                    <MicIcon size={14} />
                    {t('vmStartRecording')}
                  </button>
                  <p style={{ marginTop: 8, fontSize: 11, color: 'var(--notion-text-muted)' }}>
                    {t('vmStartRecordingHint')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TRANSCRIPT TAB ── */}
        {activeTab === 'transcript' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Idle — welcome state */}
            {recState === 'idle' && !transcript && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 32px', textAlign: 'center' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'rgba(239,68,68,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 20,
                }}>
                  <MicIcon size={32} color="#ef4444" />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--notion-text)', marginBottom: 8 }}>
                  {t('vmWelcomeTitle')}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--notion-text-muted)', marginBottom: 28, maxWidth: 320, lineHeight: 1.6 }}>
                  {t('vmWelcomeDesc')}
                </p>
                <button
                  onClick={startRecording}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '12px 28px', borderRadius: 12,
                    background: '#ef4444', color: 'white',
                    fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#dc2626'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(239,68,68,0.5)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ef4444'; (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(239,68,68,0.4)'; }}
                >
                  <MicIcon size={15} />
                  {t('vmStartRecording')}
                </button>
                <p style={{ marginTop: 16, fontSize: 11, color: 'var(--notion-text-muted)' }}>
                  {t('vmMultiLangHint')}
                </p>
              </div>
            )}

            {/* Transcript content */}
            {(transcript || interimText || isTranscribing) && (
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
                {/* Transcribing indicator */}
                {isTranscribing && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                    background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)',
                  }}>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <circle style={{ opacity: 0.2 }} cx="12" cy="12" r="10" stroke="#7c3aed" strokeWidth="4"/>
                      <path style={{ opacity: 0.8 }} fill="#7c3aed" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    <span style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600 }}>
                      {t('vmTranscribingHint')}
                    </span>
                  </div>
                )}

                <p style={{
                  fontSize: 15, lineHeight: 1.9,
                  color: 'var(--notion-text)',
                  whiteSpace: 'pre-wrap', margin: 0,
                  wordBreak: 'break-word',
                }}>
                  {transcript}
                  {interimText && (
                    <span style={{ color: 'var(--notion-text-muted)' }}>{interimText}</span>
                  )}
                  {isRecording && (
                    <span style={{
                      display: 'inline-block', width: 2, height: 16,
                      background: '#ef4444', marginLeft: 2, verticalAlign: 'text-bottom',
                      animation: 'vm-blink 1s step-end infinite',
                    }} />
                  )}
                </p>

                {/* Audio player */}
                {audioUrl && !isRecording && !isPaused && (
                  <div style={{
                    marginTop: 20, padding: '10px 14px', borderRadius: 10,
                    background: 'var(--notion-hover, #f5f5f5)',
                    border: '1px solid var(--notion-border)',
                  }}>
                    <audio src={audioUrl} controls style={{ width: '100%', height: 36 }} />
                  </div>
                )}

                {isDone && !isTranscribing && transcript && (
                  <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--notion-border)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Btn onClick={() => navigator.clipboard.writeText(transcript).catch(() => {})} variant="outline" size="sm">
                      {t('vmCopyAll')}
                    </Btn>
                    <Btn onClick={resetAll} variant="outline" size="sm">
                      {t('vmNewRecording')}
                    </Btn>
                    <span style={{ fontSize: 11, color: 'var(--notion-text-muted)', display: 'flex', alignItems: 'center' }}>
                      {t('vmWordCount', { words: wordCount, chars: transcript.length })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Done but no transcript */}
            {isDone && !transcript && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--notion-text-muted)', marginBottom: 16 }}>{t('vmNoVoiceContent')}</p>
                <Btn onClick={resetAll} variant="outline" size="sm">{t('vmReRecord')}</Btn>
              </div>
            )}
          </div>
        )}

        {/* ── SUMMARY TAB ── */}
        {activeTab === 'summary' && (
          <div style={{ padding: '24px 32px', maxWidth: 720 }}>

            {/* Not started yet */}
            {!summaryStreaming && !summaryDone && recState === 'idle' && !transcript && (
              <div style={{ paddingTop: 48, textAlign: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'rgba(124,58,237,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}>
                  <SparkleIcon size={24} color="#7c3aed" />
                </div>
                <p style={{ fontSize: 14, color: 'var(--notion-text-muted)', lineHeight: 1.6 }}>
                  {t('vmAfterRecording')}
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '12px auto', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { icon: 'document-pen', text: t('vmOverallSummary') },
                    { icon: 'lightbulb', text: t('vmKeyPointsItem') },
                    { icon: 'checkmark', text: t('vmActionItemsList') },
                  ].map(item => (
                    <li key={item.icon} style={{ fontSize: 13, color: 'var(--notion-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <HandIcon name={item.icon} size={14} />
                      {item.text}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={startRecording}
                  style={{
                    marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 20px', borderRadius: 8,
                    background: '#ef4444', color: 'white',
                    fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                  }}
                >
                  <MicIcon size={13} /> {t('vmStartRecording')}
                </button>
              </div>
            )}

            {/* Streaming */}
            {summaryStreaming && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <AiBadge />
                  <span style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600 }}>{t('vmAiGenerating')}</span>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 4 }}>
                    <circle style={{ opacity: 0.2 }} cx="12" cy="12" r="10" stroke="#7c3aed" strokeWidth="4"/>
                    <path style={{ opacity: 0.8 }} fill="#7c3aed" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
                <div style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(124,58,237,0.04)',
                  border: '1px solid rgba(124,58,237,0.12)',
                  fontSize: 13, lineHeight: 1.8, color: 'var(--notion-text)',
                  whiteSpace: 'pre-wrap', minHeight: 80,
                }}>
                  {summaryRaw || <span style={{ color: 'var(--notion-text-muted)' }}>{t('vmProcessing')}</span>}
                  <span style={{
                    display: 'inline-block', width: 2, height: 14,
                    background: '#7c3aed', marginLeft: 2, verticalAlign: 'middle',
                    animation: 'vm-blink 1s step-end infinite',
                  }} />
                </div>
              </div>
            )}

            {/* Done — structured summary */}
            {summaryDone && summaryData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AiBadge />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--notion-text)' }}>{t('vmAiSummaryLabel')}</span>
                    {fmtTime(elapsed) !== '00:00' && (
                      <span style={{ fontSize: 11, color: 'var(--notion-text-muted)', padding: '1px 7px', borderRadius: 99, background: 'var(--notion-hover)' }}>
                        {t('vmDuration', { time: fmtTime(elapsed) })}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={summaryTemplate}
                      onChange={(e) => {
                        updateSummaryTemplate(e.target.value as SummaryTemplateId);
                      }}
                      style={{
                        border: '1px solid var(--notion-border)', borderRadius: 8, padding: '5px 8px',
                        fontSize: 12, color: 'var(--notion-text)', background: 'var(--notion-card, white)',
                      }}
                      title={t('vmSummaryTemplateLabel')}
                    >
                      {templateOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                    <Btn onClick={() => generateSummary(transcript, notes)} variant="purple-outline" size="xs">
                      {t('vmRegenerate')}
                    </Btn>
                    <Btn onClick={appendSummaryToNotes} variant="outline" size="xs">
                      {uiText.saveToNotes}
                    </Btn>
                    <Btn onClick={() => applyTemplateScaffold('append')} variant="outline" size="xs">
                      {uiText.applyTemplate}
                    </Btn>
                    <select
                      value={exportScope}
                      onChange={(e) => setExportScope(e.target.value as 'summary' | 'full')}
                      style={{
                        border: '1px solid var(--notion-border)', borderRadius: 8, padding: '5px 8px',
                        fontSize: 12, color: 'var(--notion-text)', background: 'var(--notion-card, white)',
                      }}
                      title={t('vmExportScopeLabel')}
                    >
                      <option value="summary">{uiText.exportScopeSummary}</option>
                      <option value="full">{uiText.exportScopeFull}</option>
                    </select>
                    <Btn onClick={exportSummaryMarkdown} variant="outline" size="xs">
                      {uiText.exportMd}
                    </Btn>
                    <Btn onClick={createTaskTrackerPageFromSummary} variant="outline" size="xs">
                      {creatingTaskPage ? uiText.creating : uiText.createTaskPage}
                    </Btn>
                    <span style={{ fontSize: 11, color: 'var(--notion-text-muted)' }}>
                      {uiText.usingCheckedItems}
                    </span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--notion-text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={createAsSubpage}
                        onChange={e => setCreateAsSubpage(e.target.checked)}
                        style={{ width: 13, height: 13, accentColor: '#7c3aed', cursor: 'pointer' }}
                      />
                      {uiText.asSubpage}
                    </label>
                    <Btn onClick={resetAll} variant="outline" size="xs">
                      {t('vmNewRecording')}
                    </Btn>
                  </div>
                </div>

                {/* Summary */}
                {summaryData.summary && (
                  <SummaryCard color="purple" title={t('vmSummaryCardTitle')}>
                    <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--notion-text)', margin: 0 }}>
                      {summaryData.summary}
                    </p>
                  </SummaryCard>
                )}

                {/* Key points */}
                {summaryData.keyPoints.length > 0 && (
                  <SummaryCard color="green" icon="lightbulb" title={t('vmKeyPointsCardTitle')}>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {summaryData.keyPoints.map((pt, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, lineHeight: 1.7, color: 'var(--notion-text)' }}>
                          <span style={{ color: '#059669', flexShrink: 0, marginTop: 3, fontWeight: 700 }}>•</span>
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </SummaryCard>
                )}

                {/* Action items */}
                {summaryData.actionItems.length > 0 && (
                  <SummaryCard color="amber" icon="checkmark" title={t('vmActionItemsCardTitle')}>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {summaryData.actionItems.map((item, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={checkedItems.has(i)}
                            onChange={() => {
                              const n = new Set(checkedItemsRef.current);
                              n.has(i) ? n.delete(i) : n.add(i);
                              persistCheckedItems(n);
                            }}
                            style={{ marginTop: 3, flexShrink: 0, accentColor: '#7c3aed', cursor: 'pointer', width: 14, height: 14 }}
                          />
                          <span style={{
                            fontSize: 13, lineHeight: 1.7, color: 'var(--notion-text)',
                            textDecoration: checkedItems.has(i) ? 'line-through' : 'none',
                            opacity: checkedItems.has(i) ? 0.5 : 1,
                          }}>
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </SummaryCard>
                )}

                {/* Copy button */}
                <div style={{ paddingTop: 4 }}>
                  <Btn
                    onClick={() => {
                      const parts = [
                        summaryData.summary && `${t('vmCopySummaryHeader')}\n${summaryData.summary}`,
                        summaryData.keyPoints.length > 0 && `${t('vmCopyKeyPointsHeader')}\n${summaryData.keyPoints.map(p => `• ${p}`).join('\n')}`,
                        summaryData.actionItems.length > 0 && `${t('vmCopyActionItemsHeader')}\n${summaryData.actionItems.map(a => `- ${a}`).join('\n')}`,
                      ].filter(Boolean).join('\n\n');
                      navigator.clipboard.writeText(parts).catch(() => {});
                    }}
                    variant="outline"
                    size="sm"
                  >
                    {t('vmCopySummary')}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {renameTemplateButton && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setRenameTemplateButton(null); }}
        >
          <div
            style={{
              width: 360,
              borderRadius: 14,
              padding: 18,
              background: 'var(--notion-card, white)',
              border: '1px solid var(--notion-border)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.32)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--notion-text)' }}>
              {uiText.renameTemplateButton}
            </h3>
            <input
              autoFocus
              value={renameTemplateButtonValue}
              onChange={(e) => setRenameTemplateButtonValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRenameVoiceTemplateButton();
                if (e.key === 'Escape') setRenameTemplateButton(null);
              }}
              style={{
                marginTop: 12,
                width: '100%',
                border: '1px solid var(--notion-border)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                color: 'var(--notion-text)',
                background: 'var(--notion-bg)',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setRenameTemplateButton(null)}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  padding: '8px 10px',
                  border: '1px solid var(--notion-border)',
                  background: 'transparent',
                  color: 'var(--notion-text-muted)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {uiText.cancel}
              </button>
              <button
                onClick={submitRenameVoiceTemplateButton}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  padding: '8px 10px',
                  border: 'none',
                  background: '#7c3aed',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {uiText.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const COLORS = {
  purple: { bg: 'rgba(124,58,237,0.04)', border: 'rgba(124,58,237,0.14)', label: '#7c3aed' },
  green:  { bg: 'rgba(16,185,129,0.04)', border: 'rgba(16,185,129,0.18)', label: '#059669' },
  amber:  { bg: 'rgba(245,158,11,0.04)', border: 'rgba(245,158,11,0.22)', label: '#b45309' },
};

function SummaryCard({ color, icon, title, children }: {
  color: keyof typeof COLORS; icon?: string; title: string; children: React.ReactNode;
}) {
  const c = COLORS[color];
  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: c.bg, border: `1px solid ${c.border}` }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: c.label, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon && <HandIcon name={icon} size={13} />}
        {title}
      </p>
      {children}
    </div>
  );
}

function AiBadge() {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 6,
      background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize: 8, fontWeight: 800, flexShrink: 0,
    }}>AI</div>
  );
}

interface BtnProps {
  onClick: () => void;
  children: React.ReactNode;
  variant: 'red' | 'dark' | 'outline' | 'purple-outline' | 'purple';
  size: 'xs' | 'sm' | 'md';
  disabled?: boolean;
}

function Btn({ onClick, children, variant, size, disabled }: BtnProps) {
  const pad = size === 'xs' ? '3px 10px' : size === 'sm' ? '6px 13px' : '8px 18px';
  const fs  = size === 'xs' ? 11 : 12;
  const styles: Record<string, React.CSSProperties> = {
    red:            { background: '#ef4444', color: 'white', border: 'none' },
    dark:           { background: '#1e293b', color: 'white', border: 'none' },
    outline:        { background: 'transparent', color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' },
    'purple-outline': { background: 'transparent', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.3)' },
    purple:         { background: '#7c3aed', color: 'white', border: 'none' },
  };
  const s = styles[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: pad, borderRadius: 8,
        fontSize: fs, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.12s',
        ...s,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.opacity = '0.82'; }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >
      {children}
    </button>
  );
}

// ── Mini SVG icons ─────────────────────────────────────────────────────────────
function MicIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  );
}

function PauseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>
  );
}

function StopIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  );
}

function PlayIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  );
}

function SparkleIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  );
}
