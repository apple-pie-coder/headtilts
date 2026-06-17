import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';
import {
  AppNotification,
  fetchNotifications,
  fetchUnreadCount,
  markNotificationsRead,
  markNotificationsUnread,
  markAllNotificationsRead,
} from '../services/notifications';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
// Socket.IO connects to the server origin, not the /api path.
const SOCKET_ORIGIN = API_URL.replace(/\/api\/?$/, '');

interface NotificationContextValue {
  items: AppNotification[];
  unreadCount: number;
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  markRead: (id: number) => void;
  markUnread: (id: number) => void;
  markManyRead: (ids: number[]) => void;
  markManyUnread: (ids: number[]) => void;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Keep a live ref to items so callbacks can inspect current state without
  // re-subscribing (avoids stale-closure double counting).
  const itemsRef = useRef<AppNotification[]>(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!isAuthenticated) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setItems([]);
      setUnreadCount(0);
      setNextCursor(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([fetchNotifications(undefined, 20), fetchUnreadCount()])
      .then(([page, count]) => {
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setUnreadCount(count);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));

    // Live push. Socket is authenticated at the handshake with the current
    // access token; on reconnect it re-reads the latest token. An expired
    // token is rejected, which matches the app's session-expiry behavior.
    const token = localStorage.getItem('accessToken') || '';
    const socket = io(SOCKET_ORIGIN, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('notification', (n: AppNotification) => {
      setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
      if (!n.readAt) setUnreadCount((c) => c + 1);
    });

    return () => {
      cancelled = true;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated]);

  const loadMore = useCallback(() => {
    setNextCursor((cursor) => {
      if (cursor == null) return cursor;
      setLoading(true);
      fetchNotifications(cursor, 20)
        .then((page) => {
          setItems((prev) => [...prev, ...page.items]);
          setNextCursor(page.nextCursor);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return cursor;
    });
  }, []);

  // Apply a read/unread change locally (so the UI updates instantly), then
  // sync to the server. The unread counter only moves for items that actually
  // change state, so re-marking an already-read item as read is a no-op.
  const setReadState = useCallback((ids: number[], read: boolean) => {
    const idSet = new Set(ids);
    let delta = 0;
    for (const n of itemsRef.current) {
      if (!idSet.has(n.id)) continue;
      const wasUnread = !n.readAt;
      if (read && wasUnread) delta -= 1;
      if (!read && !wasUnread) delta += 1;
    }
    setItems((prev) =>
      prev.map((n) => (idSet.has(n.id) ? { ...n, readAt: read ? (n.readAt ?? new Date().toISOString()) : null } : n)),
    );
    if (delta !== 0) setUnreadCount((c) => Math.max(0, c + delta));
    (read ? markNotificationsRead(ids) : markNotificationsUnread(ids)).catch(() => {});
  }, []);

  const markRead = useCallback((id: number) => setReadState([id], true), [setReadState]);
  const markUnread = useCallback((id: number) => setReadState([id], false), [setReadState]);
  const markManyRead = useCallback((ids: number[]) => setReadState(ids, true), [setReadState]);
  const markManyUnread = useCallback((ids: number[]) => setReadState(ids, false), [setReadState]);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    markAllNotificationsRead().catch(() => {});
  }, []);

  return (
    <NotificationContext.Provider
      value={{ items, unreadCount, loading, hasMore: nextCursor != null, loadMore, markRead, markUnread, markManyRead, markManyUnread, markAllRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
