'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { getApiUrl } from './api';

export type WsEventType =
  | 'new_message'
  | 'message_status'
  | 'message_deleted'
  | 'connection_update'
  | 'typing'
  | 'contact_updated'
  | 'pong';

export interface WsEvent {
  type: WsEventType;
  [key: string]: any;
}

type EventHandler = (event: WsEvent) => void;
type ConnectedListener = (connected: boolean) => void;

const handlers = new Map<WsEventType, Set<EventHandler>>();
const connectedListeners = new Set<ConnectedListener>();

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let retryCount = 0;
let consumerCount = 0;
let running = false;
let connected = false;

function emit(event: WsEvent) {
  const hs = handlers.get(event.type);
  if (!hs) return;
  hs.forEach((h) => h(event));
}

function setConnectedState(next: boolean) {
  connected = next;
  connectedListeners.forEach((listener) => listener(next));
}

function cleanupTimers() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!running) return;
  const delay = Math.min(1000 * 2 ** retryCount, 30_000);
  retryCount += 1;
  reconnectTimer = setTimeout(() => {
    if (running) connect();
  }, delay);
}

function connect() {
  if (!running) return;
  if (typeof window === 'undefined') return;
  const token = localStorage.getItem('nexus_token');
  if (!token) {
    scheduleReconnect();
    return;
  }

  const wsUrl = getApiUrl().replace(/^http/, 'ws') + `/api/ws/whatsapp?token=${encodeURIComponent(token)}`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      retryCount = 0;
      setConnectedState(true);
      heartbeatTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
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
      setConnectedState(false);
      cleanupTimers();
      scheduleReconnect();
    };

    ws.onerror = () => {
      // rely on onclose for retry
    };
  } catch {
    scheduleReconnect();
  }
}

function startSharedConnection() {
  if (running) return;
  running = true;
  connect();
}

function stopSharedConnection() {
  running = false;
  retryCount = 0;
  cleanupTimers();
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  setConnectedState(false);
}

export function useWhatsAppSocket() {
  const [isConnected, setIsConnected] = useState(connected);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const listener: ConnectedListener = (value) => {
      if (mountedRef.current) setIsConnected(value);
    };
    connectedListeners.add(listener);

    consumerCount += 1;
    if (consumerCount === 1) startSharedConnection();
    else setIsConnected(connected);

    return () => {
      mountedRef.current = false;
      connectedListeners.delete(listener);
      consumerCount = Math.max(0, consumerCount - 1);
      if (consumerCount === 0) stopSharedConnection();
    };
  }, []);

  const on = useCallback((eventType: WsEventType, handler: EventHandler): (() => void) => {
    if (!handlers.has(eventType)) handlers.set(eventType, new Set());
    handlers.get(eventType)!.add(handler);
    return () => {
      handlers.get(eventType)?.delete(handler);
    };
  }, []);

  return { on, connected: isConnected };
}
