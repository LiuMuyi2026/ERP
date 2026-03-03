'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { getApiUrl } from './api';

/** Event types pushed from the backend WebSocket hub. */
export type WsEventType =
  | 'new_message'
  | 'message_status'
  | 'message_deleted'
  | 'connection_update'
  | 'typing'
  | 'pong';

export interface WsEvent {
  type: WsEventType;
  [key: string]: any;
}

type EventHandler = (event: WsEvent) => void;

/**
 * Custom hook for real-time WhatsApp event streaming via WebSocket.
 *
 * Features:
 * - Automatic connection with JWT auth
 * - Auto-reconnect with exponential backoff
 * - Heartbeat ping every 30s
 * - Event callback registration
 */
export function useWhatsAppSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<WsEventType, Set<EventHandler>>>(new Map());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCount = useRef(0);
  const [connected, setConnected] = useState(false);
  const mountedRef = useRef(true);

  const emit = useCallback((event: WsEvent) => {
    const handlers = handlersRef.current.get(event.type);
    if (handlers) {
      handlers.forEach((h) => h(event));
    }
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('nexus_token');
    if (!token) return;

    // Build ws:// or wss:// URL from API URL
    const apiUrl = getApiUrl();
    const wsUrl = apiUrl.replace(/^http/, 'ws') + `/api/ws/whatsapp?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        retryCount.current = 0;
        setConnected(true);

        // Heartbeat every 30s
        heartbeatTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30_000);
      };

      ws.onmessage = (ev) => {
        try {
          const data: WsEvent = JSON.parse(ev.data);
          emit(data);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        cleanup();
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    } catch {
      scheduleReconnect();
    }
  }, [emit]);

  const cleanup = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);
    retryCount.current++;
    reconnectTimer.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, [connect]);

  // Connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      cleanup();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [connect, cleanup]);

  /**
   * Register a handler for a specific event type.
   * Returns an unsubscribe function.
   */
  const on = useCallback((eventType: WsEventType, handler: EventHandler): (() => void) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);
    return () => {
      handlersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  return { on, connected };
}
