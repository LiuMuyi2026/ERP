'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiUrl } from './api';

export type InternalWsEventType = 'internal_message' | 'message_read' | 'pong';

export interface InternalWsEvent {
  type: InternalWsEventType;
  [key: string]: any;
}

type EventHandler = (event: InternalWsEvent) => void;

export function useInternalMessagesSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<InternalWsEventType, Set<EventHandler>>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const retryRef = useRef(0);
  const mountedRef = useRef(true);
  const [connected, setConnected] = useState(false);

  const emit = useCallback((event: InternalWsEvent) => {
    const handlers = handlersRef.current.get(event.type);
    if (!handlers) return;
    handlers.forEach((h) => h(event));
  }, []);

  const cleanupHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
    retryRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('nexus_token');
    if (!token) return;

    const wsUrl = getApiUrl().replace(/^http/, 'ws') + `/api/ws/messages?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        retryRef.current = 0;
        setConnected(true);
        heartbeatTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 30_000);
      };

      ws.onmessage = (ev) => {
        try {
          emit(JSON.parse(ev.data));
        } catch {
          // ignore malformed payload
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        cleanupHeartbeat();
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose handles reconnect
      };
    } catch {
      scheduleReconnect();
    }
  }, [cleanupHeartbeat, emit, scheduleReconnect]);

  useEffect(() => {
    mountedRef.current = true;
    connectRef.current = connect;
    connect();
    return () => {
      mountedRef.current = false;
      cleanupHeartbeat();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect, cleanupHeartbeat]);

  const on = useCallback((eventType: InternalWsEventType, handler: EventHandler): (() => void) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);
    return () => {
      handlersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  return { connected, on };
}
