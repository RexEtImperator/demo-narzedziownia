import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { VariableSizeList as List, areEqual } from 'react-window';
import api from '../api';
import supabase from '../utils/supabase';
import DOMPurify from 'dompurify';
import { useLanguage } from '../contexts/LanguageContext';
import { XMarkIcon, ChevronDownIcon, PaperAirplaneIcon, FaceSmileIcon, PaperClipIcon, ArrowDownTrayIcon, ArrowUturnLeftIcon, PencilSquareIcon, TrashIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { formatDate } from '../utils/dateUtils';
import { notifyError, notifyWarn } from '../utils/notify.jsx';

function ChatPanel({ conversationId, title, user, onClose }) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const wsRef = useRef(null);
  const listRef = useRef(null);
  const virtRef = useRef(null);
  const containerRef = useRef(null);
  const messagesRef = useRef([]);
  const autoScrollRef = useRef(true);
  const sizeMapRef = useRef(new Map());
  const ogCacheRef = useRef(new Map());
  const typingTimerRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const [appeared, setAppeared] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const [users, setUsers] = useState([]);
  const usersRef = useRef([]);

  useEffect(() => { usersRef.current = users; }, [users]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const list = await api.get('/api/users').catch(() => []);
        setUsers(Array.isArray(list) ? list : []);
      } catch (_) { /* noop */ }
    };
    loadUsers();
  }, []);

  useEffect(() => {
    const onDocClick = (e) => {
      try {
        if (!activeMenuMessageId) return;
        const container = document.querySelector(`[data-msg-menu-id="${activeMenuMessageId}"]`);
        if (container && container.contains(e.target)) return;
        setActiveMenuMessageId(null);
        setMenuPos(null);
      } catch (_) { /* noop */ }
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [activeMenuMessageId]);

  const handleReply = (msg) => {
    setReplyTo(msg);
    setEditingMessageId(null);
    setTimeout(() => {
      try { document.getElementById(`chatPanelInput-${conversationId}`)?.focus(); } catch (_) { /* noop */ }
    }, 50);
  };

  const handleEdit = (msg) => {
    setEditingMessageId(msg.id);
    setMsgText(msg.content || '');
    setReplyTo(null);
    setTimeout(() => {
      try { document.getElementById(`chatPanelInput-${conversationId}`)?.focus(); } catch (_) { /* noop */ }
    }, 50);
  };

  const handleDelete = async (msgId) => {
    if (!window.confirm(t('chat.confirmDelete') || 'Czy na pewno chcesz usunąć tę wiadomość?')) return;
    try {
      await api.delete(`/api/chat/messages/${encodeURIComponent(msgId)}`);
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch (_e) {
      notifyError(t('chat.deleteError') || 'Błąd usuwania wiadomości');
    }
  };

  const cancelReply = () => setReplyTo(null);
  const cancelEdit = () => {
    setEditingMessageId(null);
    setMsgText('');
  };
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [lightboxName, setLightboxName] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const presenceTimerRef = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatTimerRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const [listWidth, setListWidth] = useState(450);
  const [initialOffset] = useState(0);
  useEffect(() => {
    try {
      const el = containerRef.current;
      if (!el) return;
      const update = () => {
        try { const w = Math.floor(el.clientWidth || 450); setListWidth(Math.max(240, w)); } catch (_) { /* noop */ }
      };
      update();
      if (typeof window.ResizeObserver !== 'undefined') {
        const ro = new window.ResizeObserver(() => update());
        ro.observe(el);
        return () => { try { ro.disconnect(); } catch (_) { /* noop */ } };
      }
    } catch (_) { /* noop */ }
  }, []);

  useEffect(() => {
    try {
      if (!autoScrollRef.current) return;
      const len = messagesRef.current.length;
      const idx = Math.max(len - 1, 0);
      if (virtRef.current) {
        virtRef.current.scrollToItem(idx, 'end');
      } else if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    } catch (_) { /* noop */ }
  }, [listWidth]);

  useEffect(() => {
    try {
      if (!autoScrollRef.current) return;
      const len = messages.length;
      const idx = Math.max(len - 1, 0);
      if (virtRef.current) {
        virtRef.current.scrollToItem(idx, 'end');
      } else if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    } catch (_) { /* noop */ }
  }, [messages.length]);

  const validateFiles = (arr) => {
    try {
      const maxSize = 25 * 1024 * 1024;
      const allowed = ['image/', 'application/pdf', 'text/plain', 'application/zip', 'application/x-zip-compressed'];
      const out = [];
      arr.forEach(f => {
        const mt = String(f.type || '');
        const okType = allowed.some(a => mt.startsWith(a)) || /\.(png|jpe?g|gif|webp|svg|pdf|zip|txt)$/i.test(f.name || '');
        const okSize = (Number(f.size || 0) > 0 && Number(f.size || 0) <= maxSize);
        if (!okType) notifyWarn(t, 'chat.fileTypeNotAllowed');
        else if (!okSize) notifyWarn(t, 'chat.fileTooLarge');
        else out.push(f);
      });
      if (out.length === 0 && arr.length > 0) notifyError(t, 'chat.noValidFiles');
      return out;
    } catch (_) { return arr; }
  };

  useEffect(() => { const t = setTimeout(() => setAppeared(true), 0); return () => clearTimeout(t); }, []);
  
  // Supabase Presence Logic
  useEffect(() => {
    const isSupabase = import.meta.env.VITE_DB_SOURCE === 'supabase';
    const userId = user?.dbId || user?.id;
    if (!isSupabase || !conversationId || !userId) return;

    let presenceChannel = null;
    let otherId = null;

    const setup = async () => {
      try {
        let currentId = userId;
        // Resolve UUID to Int if needed to match DB foreign keys
        if (typeof currentId === 'string' && currentId.length > 30) {
            const { data: u } = await supabase.from('users').select('id').eq('auth_user_id', currentId).maybeSingle();
            if (u) currentId = u.id;
        }

        // Find the other participant
        // Fetch all participants first to avoid type errors in .neq() with UUID
        const { data: parts } = await supabase
          .from('chat_participants')
          .select('user_id')
          .eq('conversation_id', conversationId);
        
        if (parts && parts.length > 0) {
           // Find the one that is NOT me
           const other = parts.find(p => String(p.user_id) !== String(currentId));
           if (other) otherId = other.user_id;
        }
      } catch (_) { /* noop */ }

      if (!otherId) return;

      presenceChannel = supabase.channel('presence:global')
        .on('presence', { event: 'sync' }, () => {
           const state = presenceChannel.presenceState();
           let found = false;
           for (const key in state) {
              if (state[key].some(p => String(p.user_id) === String(otherId))) {
                 found = true;
                 break;
              }
           }
           setIsOnline(found);
        })
        .subscribe();
    };

    setup();

    return () => {
      if (presenceChannel) supabase.removeChannel(presenceChannel);
    };
  }, [conversationId, user]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { autoScrollRef.current = autoScroll; }, [autoScroll]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`chat.panel.collapsed.${conversationId}`);
      const val = raw === '1' || String(raw || '').toLowerCase() === 'true';
      setCollapsed(val);
    } catch (_) { /* noop */ }
  }, [conversationId]);
  
  useEffect(() => {
    const onDocMouseDown = (e) => {
      try {
        const target = e.target;
        if (emojiRef.current && target && emojiRef.current.contains(target)) return;
        setEmojiOpen(false);
      } catch (_) { /* noop */ }
    };
    try { document.addEventListener('mousedown', onDocMouseDown, true); } catch (_) { /* noop */ }
    return () => { try { document.removeEventListener('mousedown', onDocMouseDown, true); } catch (_) { /* noop */ } };
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    let mounted = true;
    const load = async () => {
      let rows = [];
      try {
        rows = await api.get(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`);
      } catch (err) {
        const status = Number(err?.status || 0);
        if (status === 403 || status === 404) {
          try { window.dispatchEvent(new CustomEvent('chat:panel:close', { detail: { conversationId } })); } catch (_) { /* noop */ }
          try { notifyWarn(t('chat.unavailable') || 'Konwersacja niedostępna'); } catch (_) { /* noop */ }
          return;
        }
      }
      if (mounted) setMessages(Array.isArray(rows) ? rows : []);
      try {
        // let lastReadRaw = null;
        // try { lastReadRaw = localStorage.getItem(`chat.panel.lastReadTs.${conversationId}`); } catch (_) { /* noop */ }
        // const lastReadTs = lastReadRaw ? Number(lastReadRaw) : 0;
        // const firstUnread = (Array.isArray(rows) ? rows : []).find(m => {
        //   const ts = m?.created_at ? Date.parse(m.created_at) : 0;
        //   return ts > lastReadTs;
        // });
        setTimeout(() => { try { localStorage.setItem(`chat.panel.lastReadTs.${conversationId}`, String(Date.now())); } catch (_) { /* noop */ } }, 500);
    } catch (_) { /* noop */ }
      try {
        await api.post(`/api/chat/conversations/${encodeURIComponent(conversationId)}/read`, {});
        try { window.dispatchEvent(new CustomEvent('chat:refresh')); } catch (_) { /* noop */ }
      } catch (err) {
        const status = Number(err?.status || 0);
        if (status === 403 || status === 404) {
          try { window.dispatchEvent(new CustomEvent('chat:panel:close', { detail: { conversationId } })); } catch (_) { /* noop */ }
        }
      }
    };
    load();
    return () => { mounted = false; };
  }, [conversationId, t]);

  const prevFirstIdRef = useRef(null);
  const prevLastIdRef = useRef(null);
  useEffect(() => {
    try {
      prevFirstIdRef.current = messages[0]?.id ?? null;
      prevLastIdRef.current = messages[messages.length - 1]?.id ?? null;
      if (virtRef.current) {
        virtRef.current.scrollToItem(Math.max(messages.length - 1, 0), 'end');
      } else if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
      setAutoScroll(true);
      autoScrollRef.current = true;
    } catch (_) { /* noop */ }
  }, [messages]);

  const connect = useCallback(async () => {
    try {
      const isSupabase = import.meta.env.VITE_DB_SOURCE === 'supabase';
      if (isSupabase) {
        if (!conversationId) return;
        const channel = supabase.channel(`chat:${conversationId}`)
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'chat_messages', 
            filter: `conversation_id=eq.${conversationId}` 
          }, (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            
            if (eventType === 'INSERT') {
              const sender = usersRef.current.find(u => Number(u.id) === Number(newRecord.sender_id));
              const message = {
                 ...newRecord,
                 sender_name: sender ? (sender.full_name || sender.username) : 'Unknown',
                 sender_username: sender?.username
              };
              
              setMessages(prev => {
                const exists = prev.some(m => m.id === message.id);
                return exists ? prev : [...prev, message];
              });
              
              try {
                const userId = user?.dbId || user?.id;
                const fromSelf = Number(message.sender_id) === Number(userId);
                if (!fromSelf) {
                   window.dispatchEvent(new CustomEvent('chat:incoming', { detail: { conversationId, senderName: message.sender_name, message } }));
                }
              } catch (_) { void 0; }
              
            } else if (eventType === 'UPDATE') {
               setMessages(prev => prev.map(m => m.id === newRecord.id ? { ...m, ...newRecord } : m));
            } else if (eventType === 'DELETE') {
               setMessages(prev => prev.filter(m => m.id !== oldRecord.id));
            }
          })
          .subscribe();
          
        wsRef.current = {
          close: () => supabase.removeChannel(channel),
          isSupabase: true
        };
        return;
      }

      await api.ensureToken();
      const token = api.token;
      if (!token || !user?.id) {
        try { window.dispatchEvent(new CustomEvent('chat:ws:close', { detail: { conversationId, code: 4001, reason: 'No auth token/user', wasClean: true } })); } catch (_) { /* noop */ }
        return;
      }
      const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';
      const locProto = isBrowser && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const base = api.baseURL || '';
      let url = '';
      if (base && (base.startsWith('http://') || base.startsWith('https://'))) {
        try {
          const b = new URL(base);
          const wsProto = b.protocol === 'https:' ? 'wss:' : 'ws:';
          url = `${wsProto}//${b.host}/api/chat/ws?token=${encodeURIComponent(token || '')}`;
        } catch (_) {
          url = `${locProto}//${(isBrowser ? window.location.host : 'localhost:3001')}/api/chat/ws?token=${encodeURIComponent(token || '')}`;
        }
      } else {
        url = `${locProto}//${(isBrowser ? window.location.host : 'localhost:3001')}/api/chat/ws?token=${encodeURIComponent(token || '')}`;
      }
      if (typeof window.WebSocket === 'undefined') return;
      const ws = new window.WebSocket(url);
      wsRef.current = ws;
      reconnectAttemptsRef.current = 0;
      ws.addEventListener('message', (evt) => {
        try {
          const payload = JSON.parse(String(evt.data || ''));
          if (payload && payload.type === 'chat:message' && payload.conversationId === conversationId) {
            const msg = payload.message;
            if (msg?.type === 'update') {
              setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg, type: undefined } : m));
            } else if (msg?.type === 'delete') {
              setMessages(prev => prev.filter(m => m.id !== msg.id));
            } else {
              setMessages(prev => {
                const exists = prev.some(m => m && msg && m.id === msg.id);
                return exists ? prev : [...prev, msg];
              });
              setTimeout(() => {
                try {
                  if (!autoScrollRef.current) return;
                  const len = messagesRef.current.length;
                  const idx = Math.max(len - 1, 0);
                  if (virtRef.current) {
                    virtRef.current.scrollToItem(idx, 'end');
                  } else if (listRef.current) {
                    listRef.current.scrollTop = listRef.current.scrollHeight;
                  }
                } catch (_) { /* noop */ }
              }, 0);
            }
            try {
              const userId = user?.dbId || user?.id;
              if (msg?.type !== 'delete' && msg?.type !== 'update' && Number(payload?.senderId || 0) !== Number(userId || 0)) {
                setIsOnline(true);
                if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current);
                presenceTimerRef.current = setTimeout(() => { setIsOnline(false); presenceTimerRef.current = null; }, 120000);
                try { window.dispatchEvent(new CustomEvent('chat:incoming', { detail: { conversationId, senderName: payload.senderName, message: msg } })); } catch (_) { /* noop */ }
              }
              try { window.dispatchEvent(new CustomEvent('chat:activity', { detail: { conversationId, type: 'message', senderId: payload?.senderId, conversationTitle: payload?.conversationTitle } })); } catch (_) { /* noop */ }
            } catch (_) { /* noop */ }
          }
          if (payload && payload.type === 'chat:typing' && payload.conversationId === conversationId) {
            const userId = user?.dbId || user?.id;
            if (Number(payload.senderId || 0) === Number(userId || 0)) return;
            const name = payload.senderName || '';
            if (!name) return;
            setTypingUsers((prev) => {
              const exists = prev.includes(name);
              const next = exists ? prev : [...prev, name];
              setTimeout(() => setTypingUsers((p) => p.filter(n => n !== name)), 2000);
              return next;
            });
            try {
              setIsOnline(true);
              if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current);
              presenceTimerRef.current = setTimeout(() => { setIsOnline(false); presenceTimerRef.current = null; }, 60000);
              try { window.dispatchEvent(new CustomEvent('chat:activity', { detail: { conversationId, type: 'typing', conversationTitle: title } })); } catch (_) { /* noop */ }
            } catch (_) { /* noop */ }
          }
        } catch (_) { /* noop */ }
      });
      ws.addEventListener('error', () => {
        try { window.dispatchEvent(new CustomEvent('chat:ws:error', { detail: { conversationId } })); } catch (_) { /* noop */ }
      });
      ws.addEventListener('close', (evt) => {
        wsRef.current = null;
        if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
        try { window.dispatchEvent(new CustomEvent('chat:ws:close', { detail: { conversationId, code: evt?.code, reason: evt?.reason, wasClean: !!evt?.wasClean } })); } catch (_) { /* noop */ }
        const attempt = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempt;
        const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
        setTimeout(async () => {
          try {
            const tok = await api.ensureToken();
            if (tok && user?.id) { connect().catch(() => {}); }
          } catch (_) { /* noop */ }
        }, delay);
      });
      if (!heartbeatTimerRef.current) {
        heartbeatTimerRef.current = setInterval(() => {
          try {
            const ok = wsRef.current && wsRef.current.readyState === 1;
            if (!ok) return;
            const payload = JSON.stringify({ type: 'heartbeat', conversationId });
            if (wsRef.current.send) wsRef.current.send(payload);
          } catch (_) { /* noop */ }
        }, 30000);
      }
    } catch (_) { /* noop */ }
  }, [conversationId, title, user]);
  useEffect(() => {
    connect();
    return () => {
      try {
        if (wsRef.current) {
          if (wsRef.current.isSupabase) {
            wsRef.current.close();
          } else if (wsRef.current.readyState === 1) {
            wsRef.current.close();
          }
        }
      } catch (_) { /* noop */ }
      wsRef.current = null;
      if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
    };
  }, [connect]);

  useEffect(() => {
    const onAuthInvalid = () => {
      try {
        if (wsRef.current && wsRef.current.readyState === 1) wsRef.current.close();
      } catch (_) { /* noop */ }
      wsRef.current = null;
      reconnectAttemptsRef.current = 0;
    };
    try {
      window.addEventListener('auth:invalid', onAuthInvalid);
      window.addEventListener('auth:logout', onAuthInvalid);
    } catch (_) { /* noop */ }
    return () => {
      try {
        window.removeEventListener('auth:invalid', onAuthInvalid);
        window.removeEventListener('auth:logout', onAuthInvalid);
      } catch (_) { /* noop */ }
    };
  }, []);

  useEffect(() => {
    try {
      if (!wsRef.current) return;
      if (typingTimerRef.current) return;
      const payload = JSON.stringify({ type: 'typing', conversationId });
      if (wsRef.current.send) wsRef.current.send(payload);
      typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 1000);
    } catch (_) { /* noop */ }
  }, [msgText, conversationId]);

  const sendMessage = async () => {
    let text = String(msgText || '').trim();
    if (!text || !conversationId) return;
    text = DOMPurify.sanitize(text);
    try {
      setSending(true);
      if (editingMessageId) {
        const resp = await api.put(`/api/chat/messages/${encodeURIComponent(editingMessageId)}`, { content: text });
        if (resp && resp.id) {
          setMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, content: text, ...resp } : m));
        }
        setEditingMessageId(null);
        setMsgText('');
      } else {
        const payload = { content: text };
        if (replyTo?.id) payload.reply_to_id = replyTo.id;
        
        const resp = await api.post(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, payload);
        if (resp && resp.id) {
          const msg = resp;
          setMessages(prev => {
            const exists = prev.some(m => m && msg && m.id === msg.id);
            return exists ? prev : [...prev, msg];
          });
        }
        setMsgText('');
        setReplyTo(null);
        setTimeout(() => {
          try {
            if (autoScrollRef.current) {
              const len = messagesRef.current.length;
              if (virtRef.current) {
                virtRef.current.scrollToItem(len, 'end');
              } else if (listRef.current) {
                listRef.current.scrollTop = listRef.current.scrollHeight;
              }
            }
          } catch (_) { /* noop */ }
        }, 0);
      }
    } finally { setSending(false); }
  };

  const formatSeparator = (dateStr) => {
    try {
      const dt = new Date(dateStr);
      return dt.toLocaleString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return dateStr || ''; }
  };

  const onListScroll = useCallback((evt) => {
    try {
      if (evt && typeof evt.scrollOffset === 'number') {
        if (evt.scrollUpdateWasRequested) return;
        const msgs = messagesRef.current;
        const len = msgs.length;
        const atBottom = virtRef.current ? (evt.scrollOffset + (virtRef.current.props.height || 0) + 60) >= (virtRef.current._getItemStyle(len - 1)?.top || 0) : false;
        if (autoScrollRef.current !== atBottom) setAutoScroll(atBottom);
        const nearTop = String(evt.scrollDirection || '').toLowerCase() === 'backward' && (evt.scrollOffset || 0) <= 10;
        if (nearTop) {
          const first = msgs[0];
          const before = first?.id || first?.created_at || null;
          if (before) {
            api.get(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?before=${encodeURIComponent(before)}`).then((older) => {
              const prevFirstId = first?.id;
              const newItems = (Array.isArray(older) ? older : []).filter(m => m.id < prevFirstId);
              if (newItems.length) {
                setMessages(prev => [...newItems, ...prev]);
                setTimeout(() => {
                  try {
                    const count = newItems.length;
                    if (virtRef.current) virtRef.current.scrollToItem(count, 'start');
                  } catch (_) { /* noop */ }
                }, 0);
              }
            }).catch((_err) => {
              const status = Number(_err?.status || 0);
              if (status === 403 || status === 404) {
                try { window.dispatchEvent(new CustomEvent('chat:panel:close', { detail: { conversationId } })); } catch (_) { /* noop */ }
              }
            });
          }
        }
      } else if (listRef.current) {
        const el = listRef.current;
        const atBottom = (el.scrollTop + el.clientHeight + 60) >= el.scrollHeight;
        if (autoScrollRef.current !== atBottom) setAutoScroll(atBottom);
      }
    } catch (_) { /* noop */ }
  }, [conversationId]);

  const getItemSize = useCallback((index) => {
    const m = messagesRef.current[index];
    const id = m?.id;
    if (id && sizeMapRef.current.has(id)) return sizeMapRef.current.get(id);
    return 80;
  }, []);

  const RowInner = ({ index, style }) => {
    const m = messages[index];
    if (!m) return null;
    const dayKey = m.created_at ? new Date(m.created_at).toDateString() : null;
    const prev = messages[index - 1];
    const prevDayKey = prev && prev.created_at ? new Date(prev.created_at).toDateString() : null;
    const showSep = dayKey && dayKey !== prevDayKey;
    const refCb = (el) => {
      try {
        if (!el) return;
        const h = el.offsetHeight;
        if (h && m?.id) {
          const prevH = sizeMapRef.current.get(m.id) || 0;
          if (Math.abs(h - prevH) > 2) {
            sizeMapRef.current.set(m.id, h);
            if (virtRef.current) virtRef.current.resetAfterIndex(index, false);
          }
        }
      } catch (_) { /* noop */ }
    };
    const urlMatch = String(m.content || '').match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : null;
    const imageAtts = (m.attachments || []).filter(a => String(a.mime_type || '').startsWith('image/'));
    const isImageOnly = (!m.content || !String(m.content).trim()) && imageAtts.length > 0 && imageAtts.length === (m.attachments || []).length;
    const onImageLoad = () => {
      try {
        const el = listRef.current ? listRef.current.querySelector(`[data-message-id='${m.id}']`) : null;
        const h = el && el.parentElement ? el.parentElement.offsetHeight : (el ? el.offsetHeight : 0);
        const prevH = sizeMapRef.current.get(m.id) || 0;
        if (h && Math.abs(h - prevH) > 2) {
          sizeMapRef.current.set(m.id, h);
          if (virtRef.current) virtRef.current.resetAfterIndex(index, false);
          if (autoScrollRef.current && index >= messagesRef.current.length - 1) {
            if (virtRef.current) virtRef.current.scrollToItem(messagesRef.current.length, 'end');
            else if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
          }
        }
      } catch (_) { /* noop */ }
    };
    const uId = user?.id ? Number(user.id) : null;
    const sId = m.sender_id ? Number(m.sender_id) : null;
    const isMine = uId && sId && uId === sId;
    return (
      <div style={style}>
        <div ref={refCb} className="px-2 py-1">
          {showSep && (
            <div className="flex justify-center">
              <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[11px] text-slate-800 dark:text-slate-100 shadow-sm">{formatSeparator(m.created_at)}</span>
            </div>
          )}
          <div data-message-id={m.id} className={`max-w-[80%] ${isMine ? 'ml-auto' : 'mr-auto'} flex flex-col ${isMine ? 'items-end text-right' : 'items-start text-left'} gap-1`}>
            <div className="flex items-end gap-2">
              {!isMine && (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-[11px] text-slate-900 select-none flex-shrink-0">
                  {String(m.sender_name || '').split(' ').map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?'}
                </span>
              )}
              <div className={`group relative ${isImageOnly ? '' : 'inline-block px-3 py-2 rounded-lg'} ${isImageOnly ? '' : (isMine ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100')}`}>
                {m.reply_to_id && (
                   <div className={`mb-1 px-2 py-1 rounded text-xs border-l-2 opacity-80 ${isMine ? 'bg-indigo-700 border-indigo-300' : 'bg-slate-200 dark:bg-slate-600 border-slate-400'}`}>
                     <div className="font-bold">{m.reply_to_sender_name || '...'}</div>
                     <div className="truncate">{m.reply_to_content || '...'}</div>
                   </div>
                )}
                {!isImageOnly && <div className="text-sm break-words whitespace-pre-wrap">{m.content}</div>}
                {(m.attachments || []).length > 0 && (
                  <div className={`${isImageOnly ? '' : 'mt-2'} space-y-2`}>
                    {(m.attachments || []).map(a => (
                      <div key={a.id} className={`${isImageOnly ? '' : `inline-block px-3 py-2 rounded-lg ${isMine ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'}`}`}>
                        {String(a.mime_type || '').startsWith('image/') ? (
                          <button type="button" title={a.original_name || a.filename} onClick={() => { setLightboxUrl(a.url); setLightboxName(a.original_name || a.filename || 'image'); }} className="block">
                            <img src={a.url} alt={a.original_name || a.filename} onLoad={onImageLoad} className={`rounded-lg ${isImageOnly ? 'max-w-full h-auto object-contain' : 'max-h-32 max-w-full object-contain'}`} />
                          </button>
                        ) : (
                          <a href={a.url} target="_blank" rel="noreferrer" className={`${isMine ? 'text-white underline' : 'underline text-indigo-700 dark:text-indigo-300'}`}>
                            {a.original_name || a.filename}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {url && (
                  <LinkPreview url={url} />
                )}
                <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="px-2 py-1 rounded bg-black/80 text-white text-[10px] whitespace-nowrap">{formatDate(m.created_at)}</div>
                </div>
                
                <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ${isMine ? 'right-full mr-2' : 'left-full ml-2'}`}>
                  <button type="button" className="p-1.5 rounded-full bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 shadow-sm" title={t('chat.reply') || 'Odpowiedz'} onClick={() => handleReply(m)}>
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                  </button>
                  <button type="button" className="p-1.5 rounded-full bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 shadow-sm" onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenuPos({ x: rect.left, y: rect.bottom });
                    setActiveMenuMessageId(activeMenuMessageId === m.id ? null : m.id);
                  }}>
                    <EllipsisHorizontalIcon className="w-4 h-4" />
                  </button>
                </div>

                {(Array.isArray(m.reactions) && m.reactions.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.reactions.map(r => (
                      <span key={r.emoji} className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[11px]">{r.emoji} {Number(r.count || 0)}</span>
                    ))}
                  </div>
                )}
              </div>
              {isMine && (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-[11px] text-slate-900 select-none flex-shrink-0">
                  {String(m.sender_name || '').split(' ').map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
  const Row = React.memo(RowInner, areEqual);

  // OuterElement moved outside

  const LinkPreview = ({ url }) => {
    const [meta, setMeta] = useState(() => ogCacheRef.current.get(url) || null);
    useEffect(() => {
      if (!meta) {
        api.get(`/api/og?url=${encodeURIComponent(url)}`).then((data) => {
          ogCacheRef.current.set(url, data);
          setMeta(data);
        }).catch(() => {});
      }
    }, [url, meta]);
    if (!meta) return null;
    return (
      <a href={meta.url} target="_blank" rel="noreferrer" className="mt-2 block w-[240px] rounded border border-slate-300 dark:border-slate-600 overflow-hidden">
        {meta.image && (
          <div className="h-[120px] bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
            <img src={meta.image} alt="" className="object-cover w-full h-full" />
          </div>
        )}
        <div className="p-2">
          <div className="text-xs font-semibold truncate">{meta.title || meta.url}</div>
          {meta.description && <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-300 line-clamp-2">{meta.description}</div>}
        </div>
      </a>
    );
  };

  const sendAttachments = async () => {
    if (!conversationId || files.length === 0) return;
    try {
      setUploading(true);
      setUploadProgress(5);
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      if (msgText && msgText.trim()) fd.append('content', msgText.trim());
      const resp = await api.postFormWithProgress(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/attachments`, fd, (p) => {
        try { setUploadProgress(Math.max(5, Math.min(100, p))); } catch (_) { /* noop */ }
      });
      const msg = resp && resp.id ? resp : null;
      if (msg) {
        setMessages(prev => {
          const exists = prev.some(m => m && msg && m.id === msg.id);
          return exists ? prev : [...prev, msg];
        });
        setMsgText('');
        setFiles([]);
      }
    } finally {
      setTimeout(() => { try { setUploading(false); } catch (_) { /* noop */ } }, 300);
    }
  };

  const listNode = useMemo(() => (
    <List
      ref={virtRef}
      outerRef={listRef}
      height={330}
      width={listWidth}
      initialScrollOffset={initialOffset}
      itemCount={(messages || []).length}
      itemSize={getItemSize}
      overscanCount={2}
      onScroll={onListScroll}
      itemKey={(index) => messages[index]?.id || index}
    >
      {Row}
    </List>
  ), [messages, listWidth, getItemSize, initialOffset, onListScroll, Row]);

  return (
    <div className={`w-[450px] max-w-[90vw] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl shadow-black/20 flex flex-col transition-all duration-200 ${appeared ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 truncate">
        <button type="button" onClick={() => { setCollapsed(c => { const next = !c; try { localStorage.setItem(`chat.panel.collapsed.${conversationId}`, next ? '1' : '0'); } catch (_) { /* noop */ } return next; }); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Zwiń/Rozwiń">
          <ChevronDownIcon className={`w-5 h-5 text-gray-700 dark:text-gray-200 transition-transform ${collapsed ? '-rotate-90' : ''}`} aria-hidden="true" />
        </button>
        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {title || 'Czat'}
        </div>
        <span className={`ml-2 inline-block w-2.5 h-2.5 rounded-full border ${isOnline ? 'bg-green-500 border-white dark:border-gray-800' : 'bg-gray-400 border-white dark:border-gray-800'}`} aria-label={isOnline ? 'Online' : 'Offline'} />
      </div>
        <button type="button" onClick={() => { try { localStorage.setItem(`chat.panel.lastReadTs.${conversationId}`, String(Date.now())); } catch (_) { /* noop */ } onClose && onClose(); }} className="p-1 rounded text-white hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Zamknij">
          <XMarkIcon className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      {!collapsed && (
      <>
      <div ref={containerRef} className="overflow-y-auto overflow-x-hidden p-0 max-h-[330px] w-full" aria-live="polite">
        {listNode}
      </div>
      {typingUsers.length > 0 && (
        <div className="px-3 pb-2 text-xs text-gray-600 dark:text-gray-300">{typingUsers.join(', ')} pisze...</div>
      )}
      <div className={`p-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 ${dragOver ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
        onDragOver={(e) => { try { e.preventDefault(); e.stopPropagation(); setDragOver(true); } catch (_) { /* noop */ } }}
        onDragLeave={() => { setDragOver(false); }}
        onDrop={(e) => { try { e.preventDefault(); e.stopPropagation(); setDragOver(false); const arr = Array.from(e.dataTransfer?.files || []); const valid = validateFiles(arr); if (valid.length) setFiles(prev => [...prev, ...valid]); } catch (_) { /* noop */ } }}
      >
        {replyTo && (
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-xs mb-1">
            <span className="font-semibold">{t('chat.replyingTo') || 'Odpowiadasz:'}</span>
            <span className="truncate max-w-[180px] opacity-75">{String(replyTo.content || '').slice(0,50)}</span>
            <button type="button" className="ml-auto px-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600" onClick={cancelReply}>✕</button>
          </div>
        )}
        {editingMessageId && (
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs mb-1 border border-amber-200 dark:border-amber-800">
            <span className="font-semibold">{t('chat.editing') || 'Edytujesz wiadomość'}</span>
            <button type="button" className="ml-auto px-1 rounded hover:bg-amber-100 dark:hover:bg-amber-800" onClick={cancelEdit}>✕</button>
          </div>
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-xs flex items-center gap-2">
                <span className="truncate max-w-[200px]">{f.name}</span>
                <button type="button" className="px-1 rounded bg-slate-200 dark:bg-slate-600" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="relative flex-1">
          <input
            id={`chatPanelInput-${conversationId}`}
            type="text"
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); } }}
            placeholder={t('chat.messagePlaceholder')}
            className="w-full pr-12 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2" ref={emojiRef}>
            <div className="relative group">
              <button type="button" className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white bg-slate-200 dark:bg-slate-600" onClick={() => setEmojiOpen(o => !o)} aria-label={t('chat.emojiInsert') || 'Emoji'}>
                <FaceSmileIcon className="w-6 h-6" aria-hidden="true" />
              </button>
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="px-3 py-1 rounded-full bg-gray-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-[11px] whitespace-nowrap">{t('chat.emojiInsertTooltip') || 'Wstaw ikonę emoji'}</div>
              </div>
              {emojiOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-64 max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2 z-10">
                  <div className="grid grid-cols-8 gap-1">
                    {['😀','😁','😂','🤣','😊','😍','😘','😎','🙂','😉','😇','🤗','🤔','😏','😴','😪','😭','😤','😡','👍','👎','🙏','👏','💪','🎉','💡','🔥','✨','🎁','📎','🧰','🔧','🛠️','📷','📌','❤️','💙','💚','💛','💜','🖤','🤍','🤎'].map(e => (
                      <button key={e} type="button" className="px-1 py-1 text-xl rounded hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => { setMsgText(prev => (prev || '') + e); setEmojiOpen(false); }}>{e}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <input type="file" multiple onChange={(e) => { const arr = Array.from(e.target.files || []); const valid = validateFiles(arr); if (valid.length) setFiles(prev => [...prev, ...valid]); try { e.target.value = ''; } catch (_) { /* noop */ } }} className="hidden" id={`chatPanelFilesInput-${conversationId}`} />
        <div className="relative group">
          <label htmlFor={`chatPanelFilesInput-${conversationId}`} className="py-2 text-white dark:text-slate-100 cursor-pointer">
            <PaperClipIcon className="w-6 h-6" aria-hidden="true" />
          </label>
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="px-3 py-1 rounded-full bg-gray-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-[11px] whitespace-nowrap">{t('chat.attachTooltip') || 'Wstaw załącznik'}</div>
          </div>
        </div>
        {uploading && (
          <div className="w-20 h-2 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-2 bg-indigo-600" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}
        <div className="relative group">
          <button
            type="button"
            onClick={() => { files.length ? sendAttachments() : sendMessage(); }}
            disabled={(!msgText.trim() && files.length === 0) || sending}
            className="py-2 text-white disabled:opacity-50"
            aria-label={t('chat.send') || 'Wyślij'}
          >
            <PaperAirplaneIcon className="w-6 h-6" aria-hidden="true" />
          </button>
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="px-3 py-1 rounded-full bg-gray-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-[11px] whitespace-nowrap">{t('chat.sendTooltip') || 'Wyślij'}</div>
          </div>
        </div>
      </div>
      {lightboxUrl && createPortal(
        (
          <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-md" onClick={() => setLightboxUrl(null)}>
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a href={lightboxUrl} download={lightboxName || ''} className="p-2 rounded-full bg-black/50 text-white" onClick={(e) => e.stopPropagation()} aria-label={t('common.download') || 'Pobierz'}>
                <ArrowDownTrayIcon className="w-6 h-6" aria-hidden="true" />
              </a>
              <button type="button" aria-label={t('common.close') || 'Zamknij'} className="p-2 rounded-full bg-black/50 text-white" onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}>
                <XMarkIcon className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>
            <div className="w-full h-full flex items-center justify-center">
              <img src={lightboxUrl} alt="" className="max-w-[95vw] max-h-[95vh] rounded shadow-2xl" onClick={(e) => e.stopPropagation()} />
            </div>
          </div>
        ),
        document.body
      )}
      {activeMenuMessageId && menuPos && createPortal(
        <div 
          data-msg-menu-id={activeMenuMessageId}
          className="fixed z-[9999] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 w-40 flex flex-col"
          style={{ bottom: window.innerHeight - menuPos.y + 4, left: menuPos.x }}
        >
          <button className="text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-800 dark:text-slate-200" onClick={() => {
              const msg = messages.find(m => m.id === activeMenuMessageId);
              if (msg) handleEdit(msg);
              setActiveMenuMessageId(null);
          }}>
            <PencilSquareIcon className="w-4 h-4" />
            {t('chat.edit') || 'Edytuj'}
          </button>
          <button className="text-left px-3 py-2 text-sm text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2" onClick={() => {
              handleDelete(activeMenuMessageId);
              setActiveMenuMessageId(null);
          }}>
            <TrashIcon className="w-4 h-4" />
            {t('chat.unsend') || 'Cofnij wysłanie'}
          </button>
        </div>,
        document.body
      )}
      </>
      )}
    </div>
  );
}

export default ChatPanel;
