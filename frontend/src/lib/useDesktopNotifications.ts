'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useWhatsAppSocket, WsEvent } from './useWhatsAppSocket';

/**
 * Desktop notification hook for WhatsApp messages.
 *
 * - Requests Notification permission on mount
 * - Listens for `new_message` WebSocket events
 * - Shows browser desktop notification for messages NOT in the active chat
 * - Click on notification navigates to the conversation
 */
export function useDesktopNotifications(
  /** The currently open contact ID (messages for this contact won't trigger notifications) */
  activeContactId?: string,
  /** Callback when user clicks a notification — receives the contact_id */
  onClickNotification?: (contactId: string) => void,
) {
  const { on: onWsEvent } = useWhatsAppSocket();
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const activeContactRef = useRef(activeContactId);
  activeContactRef.current = activeContactId;

  // Load user preference from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pref = localStorage.getItem('wa_notifications_enabled');
    setEnabled(pref !== 'false'); // default to enabled
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      setPermission('granted');
      return;
    }
    if (Notification.permission !== 'denied') {
      const result = await Notification.requestPermission();
      setPermission(result);
    }
  }, []);

  // Request permission when enabled
  useEffect(() => {
    if (enabled) requestPermission();
  }, [enabled, requestPermission]);

  const toggle = useCallback((value: boolean) => {
    setEnabled(value);
    localStorage.setItem('wa_notifications_enabled', String(value));
    if (value) requestPermission();
  }, [requestPermission]);

  // Listen for new messages and show notification
  useEffect(() => {
    if (!enabled || permission !== 'granted') return;

    const unsub = onWsEvent('new_message', (ev: WsEvent) => {
      // Don't notify for currently open chat
      if (ev.contact_id === activeContactRef.current) return;
      // Don't notify for outbound messages
      if (ev.direction === 'outbound' || ev.message?.direction === 'outbound') return;
      // Don't notify if page is visible and focused
      if (document.visibilityState === 'visible' && document.hasFocus()) return;

      const title = ev.push_name || 'New WhatsApp message';
      const body = ev.message?.content || 'New message received';

      try {
        const notification = new Notification(title, {
          body: body.length > 100 ? body.slice(0, 100) + '...' : body,
          icon: '/whatsapp-icon.png',
          tag: `wa-msg-${ev.contact_id}`, // Replace previous notification for same contact
          silent: false,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
          if (onClickNotification) onClickNotification(ev.contact_id);
        };

        // Auto-close after 8 seconds
        setTimeout(() => notification.close(), 8000);
      } catch {
        // Notification API not available (e.g., insecure context)
      }
    });

    return unsub;
  }, [enabled, permission, onWsEvent, onClickNotification]);

  return { enabled, toggle, permission };
}
