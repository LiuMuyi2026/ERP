'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getApiUrl, getAuthHeaders } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useTranslations, useLocale } from 'next-intl';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import type { VoiceMemoHandle } from '@/components/workspace/VoiceMemoView';
import { HandIcon } from '@/components/ui/HandIcon';
import { IconOrEmoji } from '@/components/ui/IconOrEmoji';
import { PAGE_ICON_LIST, COVER_ICON_LIST } from '@/lib/icon-map';

// ssr: false — BlockNote uses browser-only APIs
const BlockEditor = dynamic(() => import('@/components/editor/BlockEditor'), { ssr: false });
const PageViews = dynamic(() => import('@/components/workspace/PageViews'), { ssr: false });
const TaskTracker = dynamic(() => import('@/components/workspace/TaskTracker/TaskTracker'), { ssr: false });
const TemplateGallery = dynamic(() => import('@/components/workspace/TemplateGallery'), { ssr: false });
const VoiceMemoView = dynamic(() => import('@/components/workspace/VoiceMemoView'), { ssr: false });
const NotionAIPanel = dynamic(() => import('@/components/editor/NotionAIPanel'), { ssr: false });
const SharePanel = dynamic(() => import('@/components/workspace/SharePanel'), { ssr: false });

// ── Constants ────────────────────────────────────────────────────────────────

const COVER_GRADIENTS = [
  { label: 'Ocean', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: 'Sunset', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { label: 'Sky', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { label: 'Forest', value: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { label: 'Fire', value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { label: 'Lavender', value: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
  { label: 'Peach', value: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
  { label: 'Night', value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
  { label: 'Gold', value: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
  { label: 'Mint', value: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)' },
  { label: 'Rose', value: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)' },
  { label: 'Emerald', value: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
];

const COVER_ICONS_LOCAL = COVER_ICON_LIST;

const PAGE_ICONS_LOCAL = PAGE_ICON_LIST;

const TEMPLATE_CATEGORIES = ['Meeting', 'Planning', 'Product', 'Engineering', 'Business', 'Marketing', 'Personal', 'Custom'];

interface PageTemplateButton {
  id: string;
  label: string;
  template_id: string;
  apply_mode: 'append' | 'replace';
  position: number;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PageView() {
  const { pageId } = useParams<{ tenant: string; pageId: string }>();
  const router = useRouter();
  const lang = useLocale();
  const tAutomation = useTranslations('automation');
  const tCommon = useTranslations('common');
  const tWorkspace = useTranslations('workspace');
  const isZh = String(lang || '').toLowerCase().startsWith('zh');
  const [page, setPage] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);

  // Pickers
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Template
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateCategory, setTemplateCategory] = useState('Custom');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  // AI panel (right side)
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showAiBar, setShowAiBar] = useState(false);

  // BlockEditor insertAtCursor handle (set via onReady callback)
  const blockEditorInsert = useRef<((text: string) => void) | null>(null);

  // VoiceMemo controls
  const voiceControl = useRef<VoiceMemoHandle | null>(null);
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'paused' | 'done'>('idle');
  const [voiceElapsed, setVoiceElapsed] = useState(0);

  // Gallery
  const [showGallery, setShowGallery] = useState(false);
  const [galleryMode, setGalleryMode] = useState<'apply' | 'add_button'>('apply');
  const [templateButtons, setTemplateButtons] = useState<PageTemplateButton[]>([]);
  const [runningTemplateButtonId, setRunningTemplateButtonId] = useState<string | null>(null);
  const [renameTemplateButton, setRenameTemplateButton] = useState<PageTemplateButton | null>(null);
  const [renameTemplateButtonValue, setRenameTemplateButtonValue] = useState('');

  // Share
  const [showShare, setShowShare] = useState(false);

  // @AI floating dialog
  const [showMentionDialog, setShowMentionDialog] = useState(false);
  const [mentionInput, setMentionInput] = useState('');
  const [mentionResult, setMentionResult] = useState('');
  const [mentionStreaming, setMentionStreaming] = useState(false);
  const mentionResultRef = useRef('');

  const autoOpenedRef = useRef(false);

  // ── Toolbar recorder (available on all page types) ──

  const [recorderState, setRecorderState] = useState<'idle'|'recording'|'paused'|'done'>('idle');
  const [recElapsed, setRecElapsed] = useState(0);
  const [recTranscript, setRecTranscript] = useState('');
  const [recInterim, setRecInterim] = useState('');
  const tbMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const tbStreamRef = useRef<MediaStream | null>(null);
  const tbRecognitionRef = useRef<any>(null);
  const tbTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tbChunksRef = useRef<Blob[]>([]);
  const tbTranscriptRef = useRef('');
  const tbPeriodicSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tbAudioBlobRef = useRef<Blob | null>(null);
  const recorderStateRef = useRef(recorderState);

  // WhisperLiveKit WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const lastTranscriptRef = useRef('');  // dedup
  const usingWhisperRef = useRef(false);

  // Keep recorderState ref in sync (for closures)
  useEffect(() => { recorderStateRef.current = recorderState; }, [recorderState]);

  // Title save debounce
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get(`/api/workspace/pages/${pageId}`)
      .then(p => {
        setPage(p);
        setTitle(p.title || '');
        setTemplateSaved(!!p.is_template);
        if (p.template_category) setTemplateCategory(p.template_category);
      })
      .catch((err: any) => { setLoadError(err.message || (isZh ? '页面加载失败' : 'Failed to load page')); })
      .finally(() => setLoading(false));
  }, [pageId, isZh]);

  useEffect(() => {
    api.get(`/api/workspace/pages/${pageId}/template-buttons`)
      .then((rows) => setTemplateButtons(Array.isArray(rows) ? rows : []))
      .catch(() => setTemplateButtons([]));
  }, [pageId]);

  // Debounced title save
  const handleTitleChange = useCallback((val: string) => {
    setTitle(val);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.patch(`/api/workspace/pages/${pageId}`, { title: val });
        setPage((p: any) => ({ ...p, title: val }));
      } catch {}
      finally { setSaving(false); }
    }, 600);
  }, [pageId]);

  async function updateCoverEmoji(value: string | null) {
    setShowCoverPicker(false);
    setPage((p: any) => ({ ...p, cover_emoji: value }));
    try { await api.patch(`/api/workspace/pages/${pageId}`, { cover_emoji: value }); } catch {}
  }

  async function updateIcon(emoji: string | null) {
    setShowIconPicker(false);
    setPage((p: any) => ({ ...p, icon: emoji }));
    try { await api.patch(`/api/workspace/pages/${pageId}`, { icon: emoji }); } catch {}
  }

  async function handleSaveAsTemplate() {
    setSavingTemplate(true);
    try {
      await api.post(`/api/workspace/pages/${pageId}/save-as-template`, {
        category: templateCategory,
        description: templateDesc,
        title: templateTitle || undefined,
        mode: 'clone',
      });
      setTemplateSaved(true);
      setShowTemplateSave(false);
    } catch {}
    finally { setSavingTemplate(false); }
  }

  async function handleAiExecute() {
    if (!aiInput.trim()) return;
    setIsAiProcessing(true);
    try {
      const res = await api.post(`/api/workspace/pages/${pageId}/ai-action`, {
        action: 'generate',
        prompt: aiInput,
        page_content: Array.isArray(page.content) ? page.content : undefined,
      });
      const resultText = res.result || '';
      // Append AI content to editor as a paragraph block placeholder
      const newBlock = { type: 'paragraph', content: [{ type: 'text', text: resultText }] };
      const currentContent = Array.isArray(page.content) ? page.content : [];
      const newContent = [...currentContent, newBlock];
      await api.patch(`/api/workspace/pages/${pageId}`, { content: newContent });
      setPage((p: any) => ({ ...p, content: newContent }));
      setAiInput('');
      setShowAiBar(false);
    } catch (err: any) {
      toast.error(err.message || (isZh ? 'AI 请求失败' : 'AI request failed'));
    } finally {
      setIsAiProcessing(false);
    }
  }

  async function handleMentionSubmit() {
    if (!mentionInput.trim() || mentionStreaming) return;
    setMentionStreaming(true);
    setMentionResult('');
    mentionResultRef.current = '';
    try {
      const extractText = (node: any): string => {
        if (!node) return '';
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) return node.map(extractText).join(' ');
        if (node.type === 'text') return node.text || '';
        const children = node.content || node.children || [];
        return Array.isArray(children) ? children.map(extractText).join(' ') : '';
      };
      const pageText = extractText(page?.content);

      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/automation/mention`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ page_id: pageId, page_content: pageText, mention_text: mentionInput }),
      });
      if (!response.body) { setMentionResult(tAutomation('noResponse')); return; }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.chunk) {
              mentionResultRef.current += payload.chunk;
              setMentionResult(mentionResultRef.current);
            }
          } catch {}
        }
      }
      // ── Auto-insert at cursor when streaming finishes ──────────────────────
      const finalText = mentionResultRef.current.trim();
      if (finalText) {
        if (blockEditorInsert.current) {
          // BlockEditor is active: insert at cursor position
          blockEditorInsert.current(finalText);
        } else {
          // Fallback for TaskTracker / Voice Memo: append as page block
          const newBlock = { type: 'paragraph', content: [{ type: 'text', text: finalText }] };
          const currentContent = Array.isArray(page?.content) ? page.content : [];
          const updated = [...currentContent, newBlock];
          try {
            await api.patch(`/api/workspace/pages/${pageId}`, { content: updated });
            setPage((p: any) => ({ ...p, content: updated }));
          } catch {}
        }
        // Close dialog after a brief moment so user sees the final result
        setTimeout(() => {
          setShowMentionDialog(false);
          setMentionResult('');
          setMentionInput('');
          mentionResultRef.current = '';
        }, 800);
      }
    } catch (e: any) {
      setMentionResult(tAutomation('runError') + (e.message || tAutomation('executionError')));
    } finally {
      setMentionStreaming(false);
    }
  }

  function openMentionDialog() {
    setShowMentionDialog(true);
    setMentionResult('');
    setMentionInput('');
    mentionResultRef.current = '';
  }

  // ── Toolbar recorder functions ──────────────────────────────────────────────
  const LANG_TO_SPEECH: Record<string, string> = {
    en: 'en-US', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW',
    ja: 'ja-JP', it: 'it-IT', es: 'es-ES', pt: 'pt-BR',
  };

  function fmtRecTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function makeSpeechOnResult() {
    return (e: any) => {
      let newFinal = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) newFinal += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      console.log('[Speech]', { newFinal, interim, hasInsert: !!blockEditorInsert.current });
      if (newFinal) {
        tbTranscriptRef.current += newFinal;
        setRecTranscript(tbTranscriptRef.current);
        // Insert directly into editor
        if (blockEditorInsert.current) {
          blockEditorInsert.current(newFinal);
        }
      }
      setRecInterim(interim);
    };
  }

  function startWhisperWS(stream: MediaStream) {
    const token = getToken();
    if (!token) { console.warn('[Whisper] No token'); return false; }

    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
    const ws = new WebSocket(`${apiUrl}/api/ws/transcribe?token=${token}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    lastTranscriptRef.current = '';

    let connected = false;

    ws.onopen = () => {
      connected = true;
      console.log('[Whisper] WS connected');
      // Set up AudioContext to capture PCM int16 at 16kHz
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      const scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptNodeRef.current = scriptNode;

      scriptNode.onaudioprocess = (e) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        wsRef.current.send(int16.buffer);
      };

      source.connect(scriptNode);
      scriptNode.connect(audioCtx.destination);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const text = data.text || '';
        if (!text) return;

        // WhisperLiveKit sends cumulative text — compute delta
        if (data.type === 'final' || data.is_final) {
          const newText = text.startsWith(lastTranscriptRef.current)
            ? text.slice(lastTranscriptRef.current.length)
            : text;
          if (newText) {
            tbTranscriptRef.current += newText;
            setRecTranscript(tbTranscriptRef.current);
            if (blockEditorInsert.current) blockEditorInsert.current(newText);
          }
          lastTranscriptRef.current = text;
          setRecInterim('');
        } else {
          // interim
          const interim = text.startsWith(lastTranscriptRef.current)
            ? text.slice(lastTranscriptRef.current.length)
            : text;
          setRecInterim(interim);
        }
      } catch {}
    };

    ws.onerror = (ev) => {
      console.error('[Whisper] WS error', ev);
      if (!connected) {
        // Connection failed — fall back to Web Speech API
        cleanupWhisper();
        usingWhisperRef.current = false;
        startSpeechApiFallback(stream);
      }
    };

    ws.onclose = () => {
      console.log('[Whisper] WS closed');
    };

    return true;
  }

  function startSpeechApiFallback(stream: MediaStream) {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    console.log('[Rec] Falling back to SpeechRecognition, available:', !!SR);
    if (SR) {
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = LANG_TO_SPEECH[lang] || 'zh-CN';
      r.onresult = makeSpeechOnResult();
      r.onend = () => {
        if (recorderStateRef.current === 'recording') try { r.start(); } catch {}
      };
      r.onerror = (ev: any) => { console.error('[Rec] speech error:', ev.error, ev); };
      try { r.start(); } catch (e) { console.error('[Rec] speech start failed:', e); }
      tbRecognitionRef.current = r;
    }
  }

  function cleanupWhisper() {
    if (scriptNodeRef.current) { try { scriptNodeRef.current.disconnect(); } catch {} scriptNodeRef.current = null; }
    if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch {} sourceNodeRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
  }

  async function startToolbarRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tbStreamRef.current = stream;

      // MediaRecorder (for saving audio file)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      tbChunksRef.current = [];
      tbAudioBlobRef.current = null;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) tbChunksRef.current.push(e.data); };
      recorder.start(1000);
      tbMediaRecorderRef.current = recorder;

      // Try WhisperLiveKit WebSocket first, fallback to Web Speech API
      usingWhisperRef.current = true;
      const wsOk = startWhisperWS(stream);
      if (!wsOk) {
        usingWhisperRef.current = false;
        startSpeechApiFallback(stream);
      }

      // Timer
      setRecElapsed(0);
      setRecTranscript('');
      setRecInterim('');
      tbTranscriptRef.current = '';
      setRecorderState('recording');

      tbTimerRef.current = setInterval(() => setRecElapsed(p => p + 1), 1000);

      // Periodic auto-save every 15 seconds
      tbPeriodicSaveRef.current = setInterval(() => {
        const text = tbTranscriptRef.current;
        if (text) {
          try { localStorage.setItem(`rec_transcript_${pageId}`, text); } catch {}
        }
      }, 15000);
    } catch (err) {
      console.error('Mic error:', err);
      toast.error(isZh ? `无法访问麦克风: ${err instanceof Error ? err.message : String(err)}` : `Microphone access failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function pauseToolbarRec() {
    // Set ref synchronously BEFORE abort — prevents onend from restarting speech
    recorderStateRef.current = 'paused';
    // Whisper: disconnect ScriptProcessor to stop sending audio
    if (usingWhisperRef.current && scriptNodeRef.current) {
      try { scriptNodeRef.current.disconnect(); } catch {}
    }
    if (tbRecognitionRef.current) try { tbRecognitionRef.current.stop(); } catch {}
    tbRecognitionRef.current = null;
    if (tbMediaRecorderRef.current?.state === 'recording') try { tbMediaRecorderRef.current.pause(); } catch {}
    if (tbTimerRef.current) { clearInterval(tbTimerRef.current); tbTimerRef.current = null; }
    setRecInterim('');
    setRecorderState('paused');
  }

  function resumeToolbarRec() {
    if (tbMediaRecorderRef.current?.state === 'paused') try { tbMediaRecorderRef.current.resume(); } catch {}
    // Whisper: reconnect ScriptProcessor
    if (usingWhisperRef.current && scriptNodeRef.current && sourceNodeRef.current && audioCtxRef.current) {
      try {
        sourceNodeRef.current.connect(scriptNodeRef.current);
        scriptNodeRef.current.connect(audioCtxRef.current.destination);
      } catch {}
    } else {
      // Web Speech API fallback
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const r = new SR();
        r.continuous = true; r.interimResults = true;
        r.lang = LANG_TO_SPEECH[lang] || 'zh-CN';
        r.onresult = makeSpeechOnResult();
        r.onend = () => { if (recorderStateRef.current === 'recording') try { r.start(); } catch {} };
        r.onerror = () => {};
        try { r.start(); } catch {}
        tbRecognitionRef.current = r;
      }
    }
    setRecorderState('recording');
    tbTimerRef.current = setInterval(() => setRecElapsed(p => p + 1), 1000);
  }

  function stopToolbarRec() {
    // Set ref synchronously BEFORE abort — prevents onend from restarting speech
    recorderStateRef.current = 'done';
    // Clean up Whisper WebSocket + AudioContext
    cleanupWhisper();
    usingWhisperRef.current = false;
    if (tbRecognitionRef.current) try { tbRecognitionRef.current.abort(); } catch {};
    tbRecognitionRef.current = null;
    if (tbTimerRef.current) { clearInterval(tbTimerRef.current); tbTimerRef.current = null; }
    if (tbPeriodicSaveRef.current) { clearInterval(tbPeriodicSaveRef.current); tbPeriodicSaveRef.current = null; }
    setRecInterim('');
    try { localStorage.removeItem(`rec_transcript_${pageId}`); } catch {}

    const recorder = tbMediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        if (tbStreamRef.current) { tbStreamRef.current.getTracks().forEach(t => t.stop()); tbStreamRef.current = null; }
        const mimeType = recorder.mimeType || 'audio/webm';
        tbAudioBlobRef.current = new Blob(tbChunksRef.current, { type: mimeType });
        setRecorderState('done');
      };
      recorder.stop();
    } else {
      if (tbStreamRef.current) { tbStreamRef.current.getTracks().forEach(t => t.stop()); tbStreamRef.current = null; }
      setRecorderState('done');
    }
  }

  function cancelToolbarRec() {
    // Set ref synchronously BEFORE abort — prevents onend from restarting speech
    recorderStateRef.current = 'idle';
    cleanupWhisper();
    usingWhisperRef.current = false;
    if (tbRecognitionRef.current) try { tbRecognitionRef.current.abort(); } catch {};
    tbRecognitionRef.current = null;
    if (tbTimerRef.current) { clearInterval(tbTimerRef.current); tbTimerRef.current = null; }
    if (tbPeriodicSaveRef.current) { clearInterval(tbPeriodicSaveRef.current); tbPeriodicSaveRef.current = null; }
    if (tbMediaRecorderRef.current && tbMediaRecorderRef.current.state !== 'inactive') try { tbMediaRecorderRef.current.stop(); } catch {};
    if (tbStreamRef.current) { tbStreamRef.current.getTracks().forEach(t => t.stop()); tbStreamRef.current = null; }
    setRecorderState('idle');

    setRecTranscript('');
    setRecInterim('');
    tbTranscriptRef.current = '';
    tbAudioBlobRef.current = null;
    setRecElapsed(0);
    try { localStorage.removeItem(`rec_transcript_${pageId}`); } catch {}
  }

  function closeRecorder() {
    
    setRecorderState('idle');
    setRecTranscript('');
    setRecInterim('');
    tbTranscriptRef.current = '';
    tbAudioBlobRef.current = null;
    setRecElapsed(0);
  }

  // Cleanup toolbar recorder on unmount
  useEffect(() => () => {
    cleanupWhisper();
    if (tbRecognitionRef.current) try { tbRecognitionRef.current.abort(); } catch {}
    if (tbTimerRef.current) clearInterval(tbTimerRef.current);
    if (tbPeriodicSaveRef.current) clearInterval(tbPeriodicSaveRef.current);
    if (tbMediaRecorderRef.current && tbMediaRecorderRef.current.state !== 'inactive') try { tbMediaRecorderRef.current.stop(); } catch {}
    if (tbStreamRef.current) tbStreamRef.current.getTracks().forEach(t => t.stop());
  }, []);

  async function replaceWithTemplate(templateId: string) {
    setShowGallery(false);
    try {
      await api.post(`/api/workspace/pages/${pageId}/apply-template`, { template_id: templateId, lang, mode: 'replace' });
      const p = await api.get(`/api/workspace/pages/${pageId}`);
      setPage(p);
      setTitle(p.title || '');
    } catch (err: any) { toast.error(err.message || (isZh ? '应用模板失败' : 'Failed to apply template')); }
  }

  async function appendTemplateToPage(templateId: string) {
    setShowGallery(false);
    try {
      await api.post(`/api/workspace/pages/${pageId}/apply-template`, { template_id: templateId, lang, mode: 'append' });
      const p = await api.get(`/api/workspace/pages/${pageId}`);
      setPage(p);
      setTitle(p.title || '');
    } catch (err: any) { toast.error(err.message || (isZh ? '插入模板失败' : 'Failed to append template')); }
  }

  async function createTemplateButton(templateId: string, templateTitle: string) {
    setShowGallery(false);
    try {
      const created = await api.post(`/api/workspace/pages/${pageId}/template-buttons`, {
        label: templateTitle,
        template_id: templateId,
        apply_mode: 'append',
      });
      setTemplateButtons(prev => [...prev, created as PageTemplateButton]);
      toast.success(isZh ? '模板按钮已创建' : 'Template button created');
    } catch (err: any) {
      toast.error(err.message || (isZh ? '创建模板按钮失败' : 'Failed to create template button'));
    }
  }

  async function runTemplateButton(button: PageTemplateButton) {
    setRunningTemplateButtonId(button.id);
    try {
      await api.post(`/api/workspace/pages/${pageId}/template-buttons/${button.id}/run`, { lang });
      const p = await api.get(`/api/workspace/pages/${pageId}`);
      setPage(p);
      setTitle(p.title || '');
    } catch (err: any) {
      toast.error(err.message || (isZh ? '运行模板按钮失败' : 'Failed to run template button'));
    } finally {
      setRunningTemplateButtonId(null);
    }
  }

  async function deleteTemplateButton(buttonId: string) {
    try {
      await api.delete(`/api/workspace/pages/${pageId}/template-buttons/${buttonId}`);
      setTemplateButtons(prev => prev.filter(b => b.id !== buttonId));
      toast.success(isZh ? '模板按钮已删除' : 'Template button deleted');
    } catch (err: any) {
      toast.error(err.message || (isZh ? '删除模板按钮失败' : 'Failed to delete template button'));
    }
  }

  function openRenameTemplateButton(button: PageTemplateButton) {
    setRenameTemplateButton(button);
    setRenameTemplateButtonValue(button.label);
  }

  async function submitRenameTemplateButton() {
    if (!renameTemplateButton) return;
    const trimmed = renameTemplateButtonValue.trim();
    if (!trimmed || trimmed === renameTemplateButton.label) {
      setRenameTemplateButton(null);
      return;
    }
    try {
      const updated = await api.patch(`/api/workspace/pages/${pageId}/template-buttons/${renameTemplateButton.id}`, {
        label: trimmed,
      });
      setTemplateButtons(prev => prev.map(b => b.id === renameTemplateButton.id ? { ...b, label: (updated?.label || trimmed) } : b));
      toast.success(isZh ? '模板按钮已重命名' : 'Template button renamed');
    } catch (err: any) {
      toast.error(err.message || (isZh ? '重命名模板按钮失败' : 'Failed to rename template button'));
    } finally {
      setRenameTemplateButton(null);
    }
  }

  async function toggleTemplateButtonMode(button: PageTemplateButton) {
    const nextMode: 'append' | 'replace' = button.apply_mode === 'append' ? 'replace' : 'append';
    try {
      const updated = await api.patch(`/api/workspace/pages/${pageId}/template-buttons/${button.id}`, {
        apply_mode: nextMode,
      });
      setTemplateButtons(prev => prev.map(b => b.id === button.id ? { ...b, apply_mode: (updated?.apply_mode || nextMode) } : b));
    } catch (err: any) {
      toast.error(err.message || (isZh ? '更新模板按钮模式失败' : 'Failed to update template button mode'));
    }
  }

  async function reorderTemplateButton(buttonId: string, direction: 'left' | 'right') {
    const current = [...templateButtons];
    const idx = current.findIndex(b => b.id === buttonId);
    if (idx < 0) return;
    const target = direction === 'left' ? idx - 1 : idx + 1;
    if (target < 0 || target >= current.length) return;
    const swapped = [...current];
    [swapped[idx], swapped[target]] = [swapped[target], swapped[idx]];
    const normalized = swapped.map((b, i) => ({ ...b, position: i }));
    setTemplateButtons(normalized);
    try {
      await api.patch(`/api/workspace/pages/${pageId}/template-buttons/reorder`, {
        ordered_ids: normalized.map(b => b.id),
      });
    } catch (err: any) {
      setTemplateButtons(current);
      toast.error(err.message || (isZh ? '模板按钮排序失败' : 'Failed to reorder template buttons'));
    }
  }

  async function handleGallerySelect(templateId: string, templateTitle: string) {
    if (galleryMode === 'add_button') {
      await createTemplateButton(templateId, templateTitle);
      return;
    }
    await replaceWithTemplate(templateId);
  }

  async function handleGalleryAppend(templateId: string, templateTitle: string) {
    if (galleryMode !== 'apply') return;
    await appendTemplateToPage(templateId);
  }

  const handleInsertAIContent = useCallback(async (text: string) => {
    // Append as new content after current blocks
    const newBlock = { type: 'paragraph', content: [{ type: 'text', text }] };
    const currentContent = Array.isArray(page?.content) ? page.content : [];
    const updated = [...currentContent, newBlock];
    try {
      await api.patch(`/api/workspace/pages/${pageId}`, { content: updated });
      setPage((p: any) => ({ ...p, content: updated }));
    } catch {}
  }, [page, pageId]);

  const isEmpty = (!page?.content ||
    (Array.isArray(page.content) && page.content.length === 0) ||
    (Array.isArray(page.content) && page.content.length === 1 && !page.content[0]?.content && !page.content[0]?.children?.length)) &&
    page?.content?._type !== 'voice_memo';

  // Auto-open template gallery on first load of an empty page
  useEffect(() => {
    if (!loading && page && isEmpty && !page.content?._views && page.content?._type !== 'task_tracker' && page.content?._type !== 'voice_memo' && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setGalleryMode('apply');
      setShowGallery(true);
    }
  }, [loading, page, isEmpty]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white font-bold text-sm animate-pulse">AI</div>
          <span className="text-sm" style={{ color: 'var(--notion-text-muted)' }}>{tCommon('loading')}</span>
        </div>
      </div>
    );
  }
  if (loadError || !page) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm" style={{ color: '#e55' }}>{loadError || tWorkspace('pageNotFound')}</p>
          <button onClick={() => router.back()}
            className="px-4 py-2 rounded-md text-sm font-medium border"
            style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
            {isZh ? '返回工作区' : 'Back to Workspace'}
          </button>
        </div>
      </div>
    );
  }

  const hasViews = Array.isArray(page.content?._views) && page.content._views.length > 0;
  const isTaskTracker = page.content?._type === 'task_tracker';
  const isVoiceMemo = page.content?._type === 'voice_memo';

  const formatVoiceTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--notion-bg)' }}>
      {/* ── Main editor area ── */}
      <div className={`flex flex-col flex-1 min-w-0 transition-all duration-300 ${showAiPanel ? 'mr-0' : ''}`}>

        {/* ── Top toolbar ── */}
        <div
          className="flex items-center justify-between px-4 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--notion-border)', background: 'var(--notion-bg)' }}
        >
          {/* Left: back + breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors flex-shrink-0"
              style={{ color: 'var(--notion-text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {tWorkspace('workspaceLabel')}
            </button>
            <span style={{ color: 'var(--notion-border)', fontSize: 14 }}>/</span>
            <span className="text-xs truncate max-w-[200px]" style={{ color: 'var(--notion-text-muted)' }}>
              {page.icon && <span className="mr-1"><IconOrEmoji value={page.icon} size={14} /></span>}
              {title || tWorkspace('untitled')}
            </span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {saving && <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('saving')}</span>}

            {/* ── Voice Memo status indicator (read-only in toolbar) ─── */}
            {isVoiceMemo && voiceState === 'recording' && (
              <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md font-mono"
                style={{ background: 'rgba(220,38,38,0.07)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.18)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                {formatVoiceTime(voiceElapsed)}
              </span>
            )}
            {isVoiceMemo && voiceState === 'paused' && (
              <span className="text-xs px-2 py-1 rounded-md"
                style={{ color: '#b45309', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                ⏸ 已暂停
              </span>
            )}

            {/* Share button */}
            <button
              onClick={() => setShowShare(v => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-all"
              style={{
                background: showShare ? '#ede9fe' : 'transparent',
                color: showShare ? '#7c3aed' : 'var(--notion-text-muted)',
                border: showShare ? '1px solid #d8b4fe' : '1px solid transparent',
              }}
              onMouseEnter={e => { if (!showShare) { e.currentTarget.style.background = '#ede9fe'; e.currentTarget.style.color = '#7c3aed'; } }}
              onMouseLeave={e => { if (!showShare) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; } }}
              title={tWorkspace('share')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              {tWorkspace('share')}
            </button>

            {/* AI button */}
            <button
              onClick={() => setShowAiPanel(v => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-medium transition-all"
              style={{
                background: showAiPanel ? '#ede9fe' : 'transparent',
                color: showAiPanel ? '#7c3aed' : 'var(--notion-text-muted)',
                border: showAiPanel ? '1px solid #d8b4fe' : '1px solid transparent',
              }}
              onMouseEnter={e => { if (!showAiPanel) { e.currentTarget.style.background = '#ede9fe'; e.currentTarget.style.color = '#7c3aed'; } }}
              onMouseLeave={e => { if (!showAiPanel) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; } }}
              title={tWorkspace('notionAI')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
              {tWorkspace('askAI')}
            </button>

            {/* @AI Mention button */}
            <button
              onClick={openMentionDialog}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-medium transition-all"
              style={{
                background: showMentionDialog ? '#fef3c7' : 'transparent',
                color: showMentionDialog ? '#b45309' : 'var(--notion-text-muted)',
                border: showMentionDialog ? '1px solid #fde68a' : '1px solid transparent',
              }}
              onMouseEnter={e => { if (!showMentionDialog) { e.currentTarget.style.background = '#fef3c7'; e.currentTarget.style.color = '#b45309'; } }}
              onMouseLeave={e => { if (!showMentionDialog) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; } }}
              title={isZh ? '@AI — 插入 AI 内容到当前光标位置' : '@AI - Insert AI content at cursor'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
              </svg>
              @AI
            </button>

            {/* Export */}
            <button
              onClick={async () => {
                try {
                  const apiUrl = getApiUrl();
                  const res = await fetch(`${apiUrl}/api/workspace/pages/${pageId}/export?format=md`, {
                    headers: getAuthHeaders(),
                  });
                  if (!res.ok) throw new Error(isZh ? '导出失败' : 'Export failed');
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${title || tWorkspace('untitled')}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch { toast.error(isZh ? '导出失败' : 'Export failed'); }
              }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
              style={{ color: 'var(--notion-text-muted)', border: '1px solid transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
              title={isZh ? '导出 Markdown' : 'Export Markdown'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {isZh ? '导出' : 'Export'}
            </button>

            {/* Template save */}
            {templateSaved ? (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-md" style={{ background: '#e8f4fd', color: '#1d6fa8' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                {isZh ? '模板' : 'Template'}
              </span>
            ) : (
              <button
                onClick={() => { setTemplateTitle(title); setTemplateDesc(''); setShowTemplateSave(true); }}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
                style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                {tWorkspace('saveAsTemplate')}
              </button>
            )}
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-auto">

          {/* Cover */}
          {page.cover_emoji && (
            <div
              className="relative flex items-end justify-center group"
              style={{ height: 200, background: page.cover_emoji.startsWith('linear-gradient') ? page.cover_emoji : 'linear-gradient(135deg, #e8f4fd 0%, #f0e8ff 50%, #fef3e8 100%)' }}
              onMouseEnter={() => setHeaderHovered(true)}
              onMouseLeave={() => setHeaderHovered(false)}
            >
              {/* If it's an icon/emoji, show it centered */}
              {!page.cover_emoji.startsWith('linear-gradient') && (
                <span style={{ lineHeight: 1, paddingBottom: 16, filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.15))' }}>
                  <IconOrEmoji value={page.cover_emoji} size={96} />
                </span>
              )}
              {headerHovered && (
                <div className="absolute top-3 right-4 flex gap-1.5">
                  <button
                    onClick={() => setShowCoverPicker(true)}
                    className="px-2.5 py-1 rounded text-xs transition-colors"
                    style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}
                  >
                    {tWorkspace('chooseCover')}
                  </button>
                  <button
                    onClick={() => updateCoverEmoji(null)}
                    className="px-2.5 py-1 rounded text-xs transition-colors"
                    style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                  >
                    {tWorkspace('removeCover')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Header area */}
          <div
            className="mx-auto"
            style={{ maxWidth: 860, padding: '0 80px' }}
            onMouseEnter={() => setHeaderHovered(true)}
            onMouseLeave={() => setHeaderHovered(false)}
          >
            {/* Quick add buttons */}
            <div className="flex gap-1 pt-5 mb-1 transition-opacity" style={{ opacity: headerHovered ? 1 : 0 }}>
              {!page.cover_emoji && (
                <button onClick={() => setShowCoverPicker(true)} className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors" style={{ color: 'var(--notion-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                  {tWorkspace('addCover')}
                </button>
              )}
              {!page.icon && (
                <button onClick={() => setShowIconPicker(true)} className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors" style={{ color: 'var(--notion-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                  {tWorkspace('addIcon')}
                </button>
              )}
            </div>

            {/* Icon */}
            {page.icon && (
              <div className={page.cover_emoji ? 'pt-4' : 'pt-6'}>
                <button onClick={() => setShowIconPicker(true)} className="leading-none hover:bg-gray-100 rounded-lg p-1 transition-colors" title={isZh ? '更换图标' : 'Change icon'}>
                  <IconOrEmoji value={page.icon} size={48} />
                </button>
              </div>
            )}

            {/* ── Recording controls (above title) ── */}
            {!isVoiceMemo && (
              <div className="flex items-center gap-2 mt-2 mb-1" style={{ minHeight: 32 }}>
                {recorderState === 'idle' && (
                  <button
                    onClick={startToolbarRec}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
                    </svg>
                    {isZh ? '开始录制' : 'Start recording'}
                  </button>
                )}
                {recorderState === 'recording' && (
                  <>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: '#dc2626', animation: 'pulse 1.2s ease-in-out infinite' }} />
                    <span className="font-mono text-xs font-bold" style={{ color: '#dc2626' }}>{fmtRecTime(recElapsed)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
                      {[3,6,10,14,10,8,14,6,10,13,5,9,14,7,11].map((h, i) => (
                        <div key={i} style={{ width: 2, borderRadius: 99, height: h * 0.5, background: '#ef4444', animation: `vm-bar ${0.4 + (i % 5) * 0.08}s ease-in-out infinite alternate` }} />
                      ))}
                      <style>{`@keyframes vm-bar { from { transform: scaleY(0.3); } to { transform: scaleY(1.4); } }`}</style>
                    </div>
                    {recInterim && <span className="text-xs truncate" style={{ color: 'var(--notion-text-muted)', maxWidth: 200 }}>{recInterim}</span>}
                    <div style={{ flex: 1 }} />
                    <button onClick={pauseToolbarRec} className="text-xs px-2 py-1 rounded" style={{ color: '#b45309', background: 'rgba(245,158,11,0.1)' }}>{isZh ? '⏸ 暂停' : '⏸ Pause'}</button>
                    <button onClick={stopToolbarRec} className="text-xs px-2.5 py-1 rounded font-medium text-white" style={{ background: '#dc2626' }}>{isZh ? '■ 停止' : '■ Stop'}</button>
                  </>
                )}
                {recorderState === 'paused' && (
                  <>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: '#f59e0b' }} />
                    <span className="font-mono text-xs font-bold" style={{ color: '#b45309' }}>{fmtRecTime(recElapsed)}</span>
                    <span className="text-xs" style={{ color: '#b45309' }}>{isZh ? '已暂停' : 'Paused'}</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={resumeToolbarRec} className="text-xs px-2.5 py-1 rounded font-medium text-white" style={{ background: '#dc2626' }}>{isZh ? '▶ 继续' : '▶ Resume'}</button>
                    <button onClick={stopToolbarRec} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}>{isZh ? '停止' : 'Stop'}</button>
                  </>
                )}
                {recorderState === 'done' && (
                  <>
                    <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{isZh ? '录制完成' : 'Recording complete'} · {fmtRecTime(recElapsed)}</span>
                    {tbAudioBlobRef.current && (
                      <button
                        onClick={() => { const url = URL.createObjectURL(tbAudioBlobRef.current!); const a = new Audio(url); a.play(); a.onended = () => URL.revokeObjectURL(url); }}
                        className="text-xs p-1 rounded" style={{ color: 'var(--notion-text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        title={isZh ? '播放录音' : 'Play recording'}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                        </svg>
                      </button>
                    )}
                    <div style={{ flex: 1 }} />
                    <button onClick={closeRecorder} className="text-xs px-2.5 py-1 rounded" style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >{isZh ? '关闭' : 'Close'}</button>
                  </>
                )}
              </div>
            )}

            {/* Title */}
            <div className={page.icon ? 'mt-3' : (page.cover_emoji ? 'mt-6' : 'mt-12')}>
              <input
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                placeholder={tWorkspace('untitled')}
                className="w-full border-none outline-none bg-transparent font-bold leading-tight"
                style={{ fontSize: '2.5rem', color: 'var(--notion-text)', letterSpacing: '-0.02em' }}
              />
            </div>

            {/* Template badge */}
            {page.is_template && (
              <div className="flex items-center gap-1.5 mt-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#e8f4fd', color: '#1d6fa8' }}>{isZh ? '模板' : 'Template'}</span>
                {page.template_category && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--notion-active)', color: 'var(--notion-text-muted)' }}>{page.template_category}</span>
                )}
              </div>
            )}

            {/* Empty state — open gallery or write with AI */}
            {isEmpty && !hasViews && !isTaskTracker && !isVoiceMemo && (
              <div className="flex items-center gap-2 mt-5 mb-2">
                <button onClick={() => { setGalleryMode('apply'); setShowGallery(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                >
                  <HandIcon name="package" size={14} style={{ display: 'inline', marginRight: 4 }} /> {tWorkspace('browseTemplates')}
                </button>
                <button
                  onClick={() => { setAiInput(isZh ? '请为本页生成一个完整的大纲...' : 'Write a comprehensive outline for this page...'); setShowAiBar(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: '#ede9fe', color: '#7c3aed' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ddd6fe'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#ede9fe'; }}
                >
                  <HandIcon name="sparkle-star" size={14} style={{ display: 'inline', marginRight: 4 }} /> {tWorkspace('writeWithAI')}
                </button>
                <button
                  onClick={async () => {
                    const content = { _type: 'voice_memo', transcript: '' };
                    try {
                      await api.patch(`/api/workspace/pages/${pageId}`, { content });
                      setPage((p: any) => ({ ...p, content }));
                    } catch {}
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: '#fef2f2', color: '#dc2626' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; }}
                >
                  <HandIcon name="megaphone" size={14} style={{ display: 'inline', marginRight: 4 }} /> {tWorkspace('voiceMemo')}
                </button>
              </div>
            )}

            {/* Template buttons (Notion-style quick insert) */}
            {!hasViews && !isTaskTracker && !isVoiceMemo && (
              <div className="flex flex-wrap items-center gap-2 mt-3 mb-1">
                {templateButtons.map(btn => (
                  <div key={btn.id} className="inline-flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
                    <button
                      onClick={() => runTemplateButton(btn)}
                      disabled={runningTemplateButtonId === btn.id}
                      className="px-2.5 py-1.5 text-xs font-medium transition-colors"
                      style={{ color: 'var(--notion-text)', background: 'var(--notion-card-elevated, var(--notion-card, white))', opacity: runningTemplateButtonId === btn.id ? 0.6 : 1 }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--notion-card-elevated, var(--notion-card, white))'; }}
                    >
                      {runningTemplateButtonId === btn.id ? (isZh ? '运行中...' : 'Running...') : btn.label}
                    </button>
                    <button
                      onClick={() => toggleTemplateButtonMode(btn)}
                      className="px-1.5 py-1.5 text-[10px] font-semibold transition-colors"
                      style={{ color: btn.apply_mode === 'replace' ? '#7c3aed' : '#0f766e', borderLeft: '1px solid var(--notion-border)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      title={btn.apply_mode === 'replace'
                        ? (isZh ? '切换为追加模式' : 'Switch to append mode')
                        : (isZh ? '切换为替换模式' : 'Switch to replace mode')}
                    >
                      {btn.apply_mode === 'replace' ? 'R' : 'A'}
                    </button>
                    <button
                      onClick={() => openRenameTemplateButton(btn)}
                      className="px-1.5 py-1.5 text-xs transition-colors"
                      style={{ color: 'var(--notion-text-muted)', borderLeft: '1px solid var(--notion-border)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                      title={isZh ? '重命名' : 'Rename'}
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => reorderTemplateButton(btn.id, 'left')}
                      className="px-1.5 py-1.5 text-xs transition-colors"
                      style={{ color: 'var(--notion-text-muted)', borderLeft: '1px solid var(--notion-border)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                      title={isZh ? '左移' : 'Move left'}
                    >
                      ←
                    </button>
                    <button
                      onClick={() => reorderTemplateButton(btn.id, 'right')}
                      className="px-1.5 py-1.5 text-xs transition-colors"
                      style={{ color: 'var(--notion-text-muted)', borderLeft: '1px solid var(--notion-border)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                      title={isZh ? '右移' : 'Move right'}
                    >
                      →
                    </button>
                    <button
                      onClick={() => deleteTemplateButton(btn.id)}
                      className="px-2 py-1.5 text-xs transition-colors"
                      style={{ color: 'var(--notion-text-muted)', borderLeft: '1px solid var(--notion-border)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                      title={isZh ? '删除模板按钮' : 'Delete template button'}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => { setGalleryMode('add_button'); setShowGallery(true); }}
                  className="px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                  style={{ border: '1px dashed var(--notion-border)', color: 'var(--notion-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                >
                  {isZh ? '+ 模板按钮' : '+ Template Button'}
                </button>
              </div>
            )}
          </div>

          {/* Editor area */}
          <div
            className="mx-auto relative group"
            style={{ maxWidth: 860, padding: (hasViews || isTaskTracker || isVoiceMemo) ? '8px 0 80px' : '8px 80px 80px' }}
          >
            {/* AI trigger button (floating left of editor) */}
            {!showAiBar && !hasViews && !isTaskTracker && !isVoiceMemo && (
              <button
                onClick={() => setShowAiBar(true)}
                className="absolute -left-2 top-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all shadow-sm"
                style={{ background: '#ede9fe', color: '#7c3aed', border: '1px solid #d8b4fe' }}
                title={tWorkspace('askAI')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                  <path d="M5 3v4"/><path d="M3 5h4"/><path d="M21 17v4"/><path d="M19 19h4"/>
                </svg>
              </button>
            )}

            {/* Inline AI Command Bar */}
            {showAiBar && (
              <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl shadow-xl"
                  style={{
                    background: 'var(--notion-card, white)',
                    border: '2px solid #7c3aed',
                    boxShadow: '0 8px 32px rgba(124, 58, 237, 0.15), 0 2px 8px rgba(0,0,0,0.1)',
                  }}
                >
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold flex-shrink-0" style={{ fontSize: 9 }}>AI</div>
                  <input
                    autoFocus
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAiExecute();
                      if (e.key === 'Escape') { setShowAiBar(false); setAiInput(''); }
                    }}
                    placeholder={tWorkspace('aiBarPlaceholder')}
                    className="flex-1 text-sm outline-none bg-transparent"
                    style={{ color: 'var(--notion-text)' }}
                  />
                  {/* Quick prompts */}
                  <div className="hidden sm:flex items-center gap-1 mr-2">
                    {(isZh
                      ? [
                          { full: '请总结这页内容', short: '总结页面' },
                          { full: '请写一个内容大纲', short: '生成大纲' },
                          { full: '请提取可执行行动项', short: '提取行动项' },
                        ]
                      : [
                          { full: 'Summarize this page', short: 'Summarize' },
                          { full: 'Write an outline', short: 'Outline' },
                          { full: 'Generate action items', short: 'Action items' },
                        ]).map((p) => (
                      <button key={p.full} onClick={() => setAiInput(p.full)} className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                        {p.short}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setShowAiBar(false); setAiInput(''); }} className="px-2 py-1 text-xs font-medium" style={{ color: 'var(--notion-text-muted)' }}>Esc</button>
                    <button
                      onClick={handleAiExecute}
                      disabled={isAiProcessing || !aiInput.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity disabled:opacity-40 shadow-sm"
                      style={{ background: '#7c3aed' }}
                    >
                      {isAiProcessing ? '…' : tWorkspace('generate')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Clear content button — visible when page has content (not special types) */}
            {!isEmpty && !hasViews && !isTaskTracker && !isVoiceMemo && (
              <div className="flex items-center mb-2">
                <button
                  onClick={async () => {
                    if (!confirm(isZh ? '确定要清除所有内容吗？此操作不可撤销。' : 'Clear all content? This action cannot be undone.')) return;
                    try {
                      await api.patch(`/api/workspace/pages/${pageId}`, { content: [] });
                      setPage((p: any) => ({ ...p, content: [] }));
                      setGalleryMode('apply');
                      setShowGallery(true);
                    } catch {}
                  }}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                  </svg>
                  {isZh ? '清除内容' : 'Clear content'}
                </button>
                <button
                  onClick={() => { setGalleryMode('apply'); setShowGallery(true); }}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ml-2"
                  style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; e.currentTarget.style.color = 'var(--notion-text)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-muted)'; }}
                >
                  <HandIcon name="package" size={12} /> {isZh ? '模板库' : 'Template Gallery'}
                </button>
              </div>
            )}

            {/* Page content */}
            {isVoiceMemo ? (
              <VoiceMemoView
                pageId={pageId}
                initialTranscript={page.content.transcript ?? ''}
                initialNotes={page.content.notes ?? ''}
                initialAudioUrl={page.content.audio_url ?? ''}
                initialSummaryData={page.content.summary_data ?? null}
                initialCheckedItems={Array.isArray(page.content.checked_items) ? page.content.checked_items : []}
                initialSummaryTemplate={page.content.summary_template ?? 'general'}
                onTranscriptChange={(transcript) => {
                  setPage((p: any) => ({ ...p, content: { ...p.content, transcript } }));
                }}
                onReady={handle => { voiceControl.current = handle; }}
                onStateChange={(s, e) => { setVoiceState(s); setVoiceElapsed(e); }}
              />
            ) : isTaskTracker ? (
              <TaskTracker pageId={pageId} initialTasks={page.content._tasks ?? []} />
            ) : hasViews ? (
              <PageViews pageId={pageId} initialViews={page.content._views} />
            ) : (
              <BlockEditor
                pageId={pageId}
                initialContent={Array.isArray(page.content) ? page.content : undefined}
                onReady={handle => { blockEditorInsert.current = handle.insertAtCursor; }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Share Panel ── */}
      {showShare && (
        <SharePanel
          pageId={pageId}
          pageTitle={title || tWorkspace('untitled')}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* ── Notion AI Panel (slide-in right) ── */}
      {showAiPanel && (
        <NotionAIPanel
          pageId={pageId}
          pageTitle={title || tWorkspace('untitled')}
          pageContent={page.content}
          open={showAiPanel}
          onClose={() => setShowAiPanel(false)}
          onInsertContent={handleInsertAIContent}
        />
      )}

      {/* ── Template Gallery ── */}
      <TemplateGallery
        open={showGallery}
        onClose={() => setShowGallery(false)}
        onSelect={handleGallerySelect}
        onAppend={galleryMode === 'apply' ? handleGalleryAppend : undefined}
        useTemplateLabel={galleryMode === 'add_button' ? (isZh ? '创建模板按钮' : 'Create Template Button') : (isZh ? '替换当前页面' : 'Replace Current Page')}
        appendTemplateLabel={isZh ? '插入到当前页面' : 'Insert into Current Page'}
      />

      {/* ── Cover picker modal ── */}
      {showCoverPicker && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCoverPicker(false); }}
        >
          <div className="rounded-2xl shadow-2xl overflow-hidden" style={{ width: 480, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{tWorkspace('chooseCover')}</h3>
              <button onClick={() => setShowCoverPicker(false)} style={{ color: 'var(--notion-text-muted)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('gradients')}</p>
                <div className="grid grid-cols-4 gap-2">
                  {COVER_GRADIENTS.map(g => (
                    <button key={g.value} onClick={() => updateCoverEmoji(g.value)}
                      className="h-14 rounded-lg transition-transform hover:scale-105 hover:shadow-md"
                      style={{ background: g.value }}
                      title={g.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('emojiCovers')}</p>
                <div className="grid grid-cols-10 gap-1">
                  {COVER_ICONS_LOCAL.map(iconName => (
                    <button key={iconName} onClick={() => updateCoverEmoji(iconName)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
                    >
                      <HandIcon name={iconName} size={22} />
                    </button>
                  ))}
                </div>
              </div>
              {page.cover_emoji && (
                <button onClick={() => updateCoverEmoji(null)} className="w-full py-2 text-xs rounded-lg transition-colors" style={{ color: '#dc2626', border: '1px solid #fecaca' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {tWorkspace('removeCover')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Icon picker modal ── */}
      {showIconPicker && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowIconPicker(false); }}
        >
          <div className="rounded-2xl shadow-2xl p-5" style={{ width: 380, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>{tWorkspace('chooseIcon')}</h3>
              <button onClick={() => setShowIconPicker(false)} style={{ color: 'var(--notion-text-muted)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="grid grid-cols-8 gap-1.5 mb-4">
              {PAGE_ICONS_LOCAL.map(iconName => (
                <button key={iconName} onClick={() => updateIcon(iconName)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
                >
                  <HandIcon name={iconName} size={24} />
                </button>
              ))}
            </div>
            {page.icon && (
              <button onClick={() => updateIcon(null)} className="w-full text-xs py-2 rounded-lg text-center transition-colors"
                style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {tWorkspace('removeIcon')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Save as Template modal ── */}
      {showTemplateSave && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowTemplateSave(false); }}
        >
          <div className="rounded-2xl shadow-2xl p-6" style={{ width: 420, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#ede9fe' }}><HandIcon name="package" size={22} /></div>
              <div>
                <h3 className="text-base font-semibold" style={{ color: 'var(--notion-text)' }}>{tWorkspace('saveAsTemplate')}</h3>
                <p className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{tWorkspace('makeTemplateDesc')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--notion-text)' }}>{tWorkspace('titleLabel')}</label>
                <input
                  value={templateTitle}
                  onChange={e => setTemplateTitle(e.target.value)}
                  placeholder={title || tWorkspace('templateLabel')}
                  className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--notion-text)' }}>{tWorkspace('descLabel')}</label>
                <textarea
                  value={templateDesc}
                  onChange={e => setTemplateDesc(e.target.value)}
                  placeholder={tWorkspace('descPlaceholder')}
                  rows={2}
                  className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
                  style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--notion-text)' }}>{tWorkspace('categoryLabel')}</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setTemplateCategory(cat)}
                      className="px-2 py-1.5 rounded-lg text-xs text-center transition-colors font-medium"
                      style={{
                        background: templateCategory === cat ? '#7c3aed' : 'var(--notion-sidebar)',
                        color: templateCategory === cat ? 'white' : 'var(--notion-text)',
                        border: `1px solid ${templateCategory === cat ? '#7c3aed' : 'var(--notion-border)'}`,
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowTemplateSave(false)} className="flex-1 py-2 text-sm rounded-lg transition-colors" style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {tWorkspace('cancel')}
              </button>
              <button onClick={handleSaveAsTemplate} disabled={savingTemplate} className="flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity disabled:opacity-60 shadow-md"
                style={{ background: '#7c3aed' }}
              >
                {savingTemplate ? tWorkspace('savingText') : tWorkspace('saveTemplate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename Template Button modal ── */}
      {renameTemplateButton && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setRenameTemplateButton(null); }}
        >
          <div className="rounded-xl p-5 shadow-2xl" style={{ width: 360, background: 'var(--notion-card, white)', border: '1px solid var(--notion-border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--notion-text)' }}>
              {isZh ? '重命名模板按钮' : 'Rename Template Button'}
            </h3>
            <input
              autoFocus
              value={renameTemplateButtonValue}
              onChange={(e) => setRenameTemplateButtonValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRenameTemplateButton();
                if (e.key === 'Escape') setRenameTemplateButton(null);
              }}
              className="w-full text-sm px-3 py-2 rounded-lg outline-none"
              style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text)', background: 'var(--notion-bg)' }}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setRenameTemplateButton(null)}
                className="flex-1 py-2 text-sm rounded-lg"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-muted)' }}
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={submitRenameTemplateButton}
                className="flex-1 py-2 text-sm rounded-lg text-white font-medium"
                style={{ background: '#7c3aed' }}
              >
                {isZh ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── @AI Floating Dialog ─────────────────────────────────────────────── */}
      {showMentionDialog && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target === e.currentTarget && !mentionStreaming) { setShowMentionDialog(false); setMentionResult(''); setMentionInput(''); } }}
        >
          <div
            className="animate-fade-in flex flex-col"
            style={{
              width: 560,
              maxWidth: 'calc(100vw - 40px)',
              background: 'var(--notion-card-elevated, #1e293b)',
              border: '2px solid #f59e0b',
              borderRadius: 16,
              boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(245,158,11,0.3)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(245,158,11,0.25)' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0,
              }}>@</div>
              <span className="text-sm font-semibold flex-1" style={{ color: 'var(--notion-text)' }}>
                {isZh ? 'AI 助手 — 输出将自动插入到光标位置' : 'AI Assistant - Output will be inserted at cursor'}
              </span>
              {!mentionStreaming && (
                <button
                  onClick={() => { setShowMentionDialog(false); setMentionResult(''); setMentionInput(''); }}
                  style={{ color: 'var(--notion-text-muted)', padding: 4, borderRadius: 6 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Input row */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: mentionResult ? '1px solid rgba(245,158,11,0.20)' : 'none' }}>
              <input
                autoFocus
                value={mentionInput}
                onChange={e => setMentionInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleMentionSubmit(); }
                  if (e.key === 'Escape' && !mentionStreaming) { setShowMentionDialog(false); setMentionResult(''); setMentionInput(''); }
                }}
                placeholder={isZh ? '输入指令，例如：帮我写一段产品介绍...' : 'Type a prompt, e.g. write a short product introduction...'}
                disabled={mentionStreaming}
                className="flex-1 text-sm outline-none bg-transparent"
                style={{ color: 'var(--notion-text)' }}
              />
              <button
                onClick={handleMentionSubmit}
                disabled={mentionStreaming || !mentionInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40 transition-opacity"
                style={{ background: mentionStreaming ? '#92400e' : '#f59e0b', flexShrink: 0 }}
              >
                {mentionStreaming ? (
                  <>
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {isZh ? '生成中' : 'Generating'}
                  </>
                ) : (isZh ? '发送' : 'Send')}
              </button>
            </div>

            {/* Quick prompts */}
            {!mentionResult && !mentionStreaming && (
              <div className="flex flex-wrap gap-1.5 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                {['总结这个页面', '帮我写一段介绍', '列出行动项', '续写内容', '改进这段文字'].map(p => (
                  <button
                    key={p}
                    onClick={() => setMentionInput(p)}
                    className="text-xs px-2.5 py-1 rounded-full transition-colors"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.25)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.15)'; }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Streaming result */}
            {(mentionResult || mentionStreaming) && (
              <div
                style={{
                  padding: '16px',
                  fontSize: 14,
                  lineHeight: 1.75,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 340,
                  overflowY: 'auto',
                  color: 'var(--notion-text)',
                  background: 'rgba(245,158,11,0.06)',
                }}
              >
                {mentionResult || (mentionStreaming ? <span style={{ color: 'var(--notion-text-muted)' }}>AI 正在思考…</span> : null)}
                {mentionStreaming && (
                  <span style={{ display: 'inline-block', width: 2, height: 16, background: '#f59e0b', marginLeft: 2, verticalAlign: 'middle', animation: 'pulse 1s step-end infinite' }} />
                )}
              </div>
            )}

            {/* Footer: status */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid rgba(245,158,11,0.15)' }}>
              <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                {mentionStreaming
                  ? <><HandIcon name="refresh-arrows" size={12} style={{ display: 'inline', marginRight: 4 }} />生成完成后将自动插入到光标位置</>
                  : mentionResult
                  ? <><HandIcon name="checkmark" size={12} style={{ display: 'inline', marginRight: 4 }} />已插入到光标位置，窗口即将关闭</>
                  : <><HandIcon name="lightbulb" size={12} style={{ display: 'inline', marginRight: 4 }} />按 Enter 发送 · Esc 关闭</>}
              </span>
              {mentionResult && !mentionStreaming && (
                <button
                  onClick={() => { setShowMentionDialog(false); setMentionResult(''); setMentionInput(''); }}
                  className="text-xs px-3 py-1 rounded-lg transition-colors"
                  style={{ color: 'var(--notion-text-muted)', border: '1px solid var(--notion-border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
