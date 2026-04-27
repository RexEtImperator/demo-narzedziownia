import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { useLanguage } from '../contexts/LanguageContext';
import api from '../api';
import supabase from '../utils/supabase';
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon, EllipsisVerticalIcon, UserIcon, PaperAirplaneIcon, FaceSmileIcon, PaperClipIcon, ArrowDownTrayIcon, ArrowUturnLeftIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { notifyError, notifyWarn } from '../utils/notify.jsx';
import { formatDate, formatTimeAgo } from '../utils/dateUtils';

function ChatModal({ isOpen, onClose, user, onOpenConversation, initialConversationId = null, chatFeatureEnabled = false }) {
  const { t } = useLanguage();
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedConv, setSelectedConv] = useState(initialConversationId);
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [composing, setComposing] = useState(false);
  const [composeQuery, setComposeQuery] = useState('');
  const [starting, setStarting] = useState(false);
  const [startSelectedIds, setStartSelectedIds] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState(null);
  
  const usersRef = useRef(users);
  useEffect(() => { usersRef.current = users; }, [users]);

  useEffect(() => {
    const onDocClick = (e) => {
      try {
        if (!activeMenuMessageId) return;
        const container = document.querySelector(`[data-msg-menu-id="${activeMenuMessageId}"]`);
        if (container && container.contains(e.target)) return;
        setActiveMenuMessageId(null);
      } catch (_) { /* noop */ }
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [activeMenuMessageId]);

  const handleReply = (msg) => {
    setReplyingTo(msg);
    setEditingMessageId(null);
    setMsgText(''); // Clear text for reply? Usually keep draft if any? User didn't specify. Standard is keep draft or clear. I'll clear or keep? 
    // Actually, reply usually just attaches context. I should keep current text if user started typing.
    // But if I switched from edit, I should clear.
    // Let's NOT clear text on reply, just focus.
    setTimeout(() => document.getElementById('chatMessageInput')?.focus(), 50);
  };

  const handleEdit = (msg) => {
    setEditingMessageId(msg.id);
    setMsgText(msg.content || '');
    setReplyingTo(null);
    setTimeout(() => document.getElementById('chatMessageInput')?.focus(), 50);
  };

  const handleDelete = async (msgId) => {
    if (!window.confirm(t('chat.confirmDelete') || 'Czy na pewno chcesz usunąć tę wiadomość?')) return;
    try {
      await api.delete(`/api/chat/messages/${encodeURIComponent(msgId)}`);
    } catch (_e) {
      notifyError(t('chat.deleteError') || 'Błąd usuwania wiadomości');
    }
  };

  const cancelReply = () => setReplyingTo(null);
  const cancelEdit = () => {
    setEditingMessageId(null);
    setMsgText('');
  };

  const wsRef = useRef(null);
  const listRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatTimerRef = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [lightboxName, setLightboxName] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const isMuted = (id) => {
    try { const raw = localStorage.getItem(`chat.muted.${id}`); return raw === '1' || String(raw || '').toLowerCase() === 'true'; } catch (_) { return false; }
  };
  const muteConversation = (id) => {
    try {
      const next = !isMuted(id);
      localStorage.setItem(`chat.muted.${id}`, next ? '1' : '0');
      setConversations(prev => prev.map(c => c.id === id ? { ...c, muted: next } : c));
    } catch (_) { /* noop */ }
  };
  const isArchived = (id) => {
    try { const raw = localStorage.getItem(`chat.archived.${id}`); return raw === '1' || String(raw || '').toLowerCase() === 'true'; } catch (_) { return false; }
  };
  const archiveConversation = (id) => {
    try {
      const next = !isArchived(id);
      localStorage.setItem(`chat.archived.${id}`, next ? '1' : '0');
      setConversations(prev => prev.map(c => c.id === id ? { ...c, archived: next } : c));
    } catch (_) { /* noop */ }
  };
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

  const featureChatEnabled = !!chatFeatureEnabled;

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        setLoadingConversations(true);
        const list = await api.get('/api/chat/conversations').catch(() => []);
        setConversations(Array.isArray(list) ? list : []);
      } finally {
        setLoadingConversations(false);
      }
    };
    load();
  }, [isOpen]);

  const [hoverConvId, setHoverConvId] = useState(null);
  const [menuConvId, setMenuConvId] = useState(null);
  useEffect(() => {
    const onDocClick = (e) => {
      try {
        if (menuConvId == null) return;
        const container = document.querySelector(`[data-menu-conv-id="${menuConvId}"]`);
        const trigger = document.querySelector(`[data-menu-trigger-id="${menuConvId}"]`);
        const target = e.target;
        if ((container && container.contains(target)) || (trigger && trigger.contains(target))) return;
        setMenuConvId(null);
      } catch (_) { /* noop */ }
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => { document.removeEventListener('mousedown', onDocClick, true); };
  }, [menuConvId]);
  const refreshConversations = async () => {
    const list = await api.get('/api/chat/conversations').catch(() => []);
    setConversations(Array.isArray(list) ? list : []);
  };
  const markUnread = async (id) => {
    try {
      setConversations(prev => prev.map(c => c.id === id ? { ...c, unread_count: (Number(c.unread_count || 0) || 0) + 1 } : c));
      try { window.dispatchEvent(new CustomEvent('chat:refresh', { detail: { source: 'markUnread', conversationId: id, skipFetch: true } })); } catch (_) { /* noop */ }
      
      await api.post(`/api/chat/conversations/${encodeURIComponent(id)}/unread`, {});
      await refreshConversations();
      try { window.dispatchEvent(new CustomEvent('chat:refresh', { detail: { source: 'markUnread', conversationId: id } })); } catch (_) { /* noop */ }
    } catch (_) { /* noop */ }
  };
  const blockConversation = async (id) => {
    try { await api.post(`/api/chat/conversations/${encodeURIComponent(id)}/block`, {}); await refreshConversations(); } catch (_) { /* noop */ }
  };
  
  useEffect(() => {
    const onRefresh = (evt) => {
      if (evt?.detail?.skipFetch) return;
      refreshConversations();
    };
    try { window.addEventListener('chat:refresh', onRefresh); } catch (_) { /* noop */ }
    return () => { try { window.removeEventListener('chat:refresh', onRefresh); } catch (_) { /* noop */ } };
  }, []);
  const deleteConversation = async (id) => {
    try {
      try { console.log('chat:delete click', id); } catch (_) { /* noop */ }
      let resp = null;
      try {
        resp = await api.delete(`/api/chat/conversations/${encodeURIComponent(id)}`);
      } catch (_e1) {
        try { resp = await api.request(`/api/chat/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (_) { /* noop */ }
      }
      try { console.log('chat:delete resp', resp); } catch (_) { /* noop */ }
      if (selectedConv === id) { setSelectedConv(null); setMessages([]); }
      try { localStorage.removeItem(`chat.archived.${id}`); } catch (_) { /* noop */ }
      try { localStorage.removeItem(`chat.muted.${id}`); } catch (_) { /* noop */ }
      setConversations(prev => prev.filter(c => c.id !== id));
      try { window.dispatchEvent(new CustomEvent('chat:panel:close', { detail: { conversationId: id } })); } catch (_) { /* noop */ }
      try { window.dispatchEvent(new CustomEvent('chat:refresh', { detail: { source: 'delete' } })); } catch (_) { /* noop */ }
      try { window.dispatchEvent(new CustomEvent('chat:delete:result', { detail: { id, removedForUser: !!resp?.removedForUser, remainingParticipants: Number(resp?.remainingParticipants ?? -1) } })); } catch (_) { /* noop */ }
      try { notifyWarn(t('chat.deleted') || 'Konwersacja usunięta'); } catch (_) { /* noop */ }
      const ok = !!(resp && (resp.removedForUser || resp.removed));
      if (!ok) {
        try {
          localStorage.setItem(`chat.archived.${id}`, '1');
          setConversations(prev => prev.filter(c => !isArchived(c.id)));
        } catch (_) { /* noop */ }
      }
      await refreshConversations();
    } catch (err) {
      try { notifyError(err?.message || 'Nie udało się usunąć konwersacji'); } catch (_) { /* noop */ }
      try {
        localStorage.setItem(`chat.archived.${id}`, '1');
        setConversations(prev => prev.filter(c => !isArchived(c.id)));
      } catch (_) { /* noop */ }
    }
  };
  useEffect(() => {
    if (!isOpen || !selectedConv) { setMessages([]); return; }
    let mounted = true;
    const load = async () => {
      const rows = await api.get(`/api/chat/conversations/${encodeURIComponent(selectedConv)}/messages`).catch(() => []);
      if (mounted) setMessages(Array.isArray(rows) ? rows : []);
      try { await api.post(`/api/chat/conversations/${encodeURIComponent(selectedConv)}/read`, {}); try { window.dispatchEvent(new CustomEvent('chat:refresh')); } catch (e) { void e; } } catch (e) { void e; }
    };
    load();
    return () => { mounted = false; };
  }, [isOpen, selectedConv]);

  useEffect(() => {
    const onKey = (e) => {
      try {
        if (!isOpen) return;
        if (e.key === 'Escape') { e.preventDefault(); if (lightboxUrl) setLightboxUrl(null); else onClose && onClose(); }
      } catch (_) { /* noop */ }
    };
    try { document.addEventListener('keydown', onKey, true); } catch (_) { /* noop */ }
    return () => { try { document.removeEventListener('keydown', onKey, true); } catch (_) { /* noop */ } };
  }, [isOpen, lightboxUrl, onClose]);

  useEffect(() => {
    try {
      if (!isOpen || !selectedConv) return;
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } catch (_) { /* noop */ }
  }, [messages, isOpen, selectedConv]);

  useEffect(() => {
    const connect = async () => {
      try {
        if (!featureChatEnabled || !isOpen) return;

        // Check Supabase mode
        const isSupabase = import.meta.env.VITE_DB_SOURCE === 'supabase';

        if (isSupabase) {
          if (!selectedConv) return;
          const channel = supabase.channel(`chat:${selectedConv}`)
            .on('postgres_changes', { 
              event: '*', 
              schema: 'public', 
              table: 'chat_messages', 
              filter: `conversation_id=eq.${selectedConv}` 
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
                  const fromSelf = Number(message.sender_id) === Number(user?.id);
                  if (!fromSelf) {
                     window.dispatchEvent(new CustomEvent('chat:incoming', { detail: { conversationId: selectedConv, senderName: message.sender_name, message } }));
                     
                     const muted = isMuted(selectedConv);
                     if (!muted && typeof window !== 'undefined' && window.Notification?.permission === 'granted') {
                       const title = String(message.sender_name || 'Nowa wiadomość');
                       const body = String(message.content || '').slice(0, 120);
                       const n = new window.Notification(title, { body });
                       setTimeout(() => n.close(), 4000);
                     }
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
        if (!token || !user?.id) { return; }
        const hasWin = typeof window !== 'undefined' && !!window.location;
        const locProto = hasWin && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const base = api.baseURL || '';
        let url = '';
        if (base && (base.startsWith('http://') || base.startsWith('https://'))) {
          try {
            const b = new URL(base);
            const wsProto = b.protocol === 'https:' ? 'wss:' : 'ws:';
            url = `${wsProto}//${b.host}/api/chat/ws?token=${encodeURIComponent(token || '')}`;
          } catch (_) {
            url = `${locProto}//${(hasWin ? window.location.host : 'localhost:3001')}/api/chat/ws?token=${encodeURIComponent(token || '')}`;
          }
        } else {
          url = `${locProto}//${(hasWin ? window.location.host : 'localhost:3001')}/api/chat/ws?token=${encodeURIComponent(token || '')}`;
        }
        const ws = new window.WebSocket(url);
        wsRef.current = ws;
        reconnectAttemptsRef.current = 0;
        ws.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            if (payload && payload.type === 'chat:message') {
              const { conversationId, message, senderName } = payload;
              if (conversationId === selectedConv) {
                if (message?.type === 'update') {
                  setMessages(prev => prev.map(m => m.id === message.id ? { ...m, ...message, type: undefined } : m));
                } else if (message?.type === 'delete') {
                  setMessages(prev => prev.filter(m => m.id !== message.id));
                } else {
                  setMessages(prev => {
                    const exists = prev.some(m => m && message && m.id === message.id);
                    return exists ? prev : [...prev, message];
                  });
                }
              }
              try {
                const fromSelf = Number(message?.sender_id || 0) === Number(user?.id || 0);
                if (!fromSelf && message?.type !== 'delete' && message?.type !== 'update') {
                  const msgTime = message?.created_at ? new Date(message.created_at).getTime() : 0;
                  const isRecent = (Date.now() - msgTime) < 60000;
                  if (isRecent) {
                    window.dispatchEvent(new CustomEvent('chat:incoming', { detail: { conversationId, senderName, message } }));
                  }
                }
              } catch (_) { /* noop */ }
              try {
                const muted = isMuted(conversationId);
                const fromSelf = Number(message?.sender_id || 0) === Number(user?.id || 0);
                if (!muted && !fromSelf && message?.type !== 'delete' && message?.type !== 'update' && typeof window !== 'undefined' && typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted') {
                  const title = String(senderName || 'Nowa wiadomość');
                  const body = String(message?.content || '').slice(0, 120) || '...';
                  const n = new window.Notification(title, { body });
                  try { window.setTimeout(() => { try { n.close(); } catch (e) { void e; } }, 4000); } catch (e) { void e; }
                }
              } catch (e) { void e; }
            }
          } catch (e) { void e; }
        };
        ws.addEventListener('error', () => {
          try { window.dispatchEvent(new CustomEvent('chat:ws:error', { detail: { conversationId: selectedConv } })); } catch (_) { /* noop */ }
        });
        ws.addEventListener('close', (evt) => {
          wsRef.current = null;
          if (heartbeatTimerRef.current) { try { clearInterval(heartbeatTimerRef.current); } catch (_) { /* noop */ } heartbeatTimerRef.current = null; }
          try { window.dispatchEvent(new CustomEvent('chat:ws:close', { detail: { conversationId: selectedConv, code: evt?.code, reason: evt?.reason, wasClean: !!evt?.wasClean } })); } catch (_) { /* noop */ }
          const attempt = Number(reconnectAttemptsRef.current || 0) + 1;
          reconnectAttemptsRef.current = attempt;
          const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
          try { window.setTimeout(() => { try { connect(); } catch (_) { /* noop */ } }, delay); } catch (_) { /* noop */ }
        });
        if (!heartbeatTimerRef.current) {
          heartbeatTimerRef.current = window.setInterval(() => {
            try {
              const ok = wsRef.current && wsRef.current.readyState === 1;
              if (!ok) return;
              const payload = JSON.stringify({ type: 'heartbeat', conversationId: selectedConv });
              wsRef.current.send(payload);
            } catch (_) { /* noop */ }
          }, 30000);
        }
      } catch (e) { void e; }
    };
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
      } catch (e) { void e; }
      wsRef.current = null;
      if (heartbeatTimerRef.current) { try { clearInterval(heartbeatTimerRef.current); } catch (_) { /* noop */ } heartbeatTimerRef.current = null; }
    };
  }, [isOpen, featureChatEnabled, selectedConv, user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const loadUsers = async () => {
      const list = await api.get('/api/users').catch(() => []);
      setUsers(Array.isArray(list) ? list : []);
    };
    const loadEmployees = async () => {
      const list = await api.get('/api/employees').catch(() => []);
      setEmployees(Array.isArray(list) ? list : []);
    };
    loadUsers();
    loadEmployees();
  }, [isOpen]);

  const recipientOptions = useMemo(() => {
    const byEmployeeId = new Map();
    (Array.isArray(users) ? users : []).forEach(u => {
      if (u?.employee_id) byEmployeeId.set(Number(u.employee_id), u);
    });
    const items = (Array.isArray(employees) ? employees : []).map(e => {
      const u = byEmployeeId.get(Number(e.id)) || (Array.isArray(users) ? users.find(x => String(x.username || '') === String(e.login || '')) : null);
      const uid = u?.id ? Number(u.id) : null;
      const name = `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.login || u?.full_name || u?.username || '';
      return uid ? { userId: uid, employeeId: Number(e.id), name } : null;
    }).filter(Boolean);
    return items.filter(it => it.userId !== user?.id);
  }, [users, employees, user]);

  const composeSuggestions = useMemo(() => {
    const q = String(composeQuery || '').trim().toLowerCase();
    const base = (recipientOptions || []).filter(opt => !startSelectedIds.includes(opt.userId));
    if (!q) return base.slice(0, 50);
    return base.filter(opt => String(opt.name || '').toLowerCase().includes(q)).slice(0, 50);
  }, [composeQuery, recipientOptions, startSelectedIds]);
  const filteredConversations = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    const base = (conversations || []).filter(c => !isArchived(c.id));
    if (!q) return base;
    return base.filter(c => String(c.title || '').toLowerCase().includes(q));
  }, [query, conversations]);

  

  const sendMessage = async () => {
    const text = String(msgText || '').trim();
    if (!text || !selectedConv) return;
    try {
      setSending(true);
      if (editingMessageId) {
        await api.put(`/api/chat/messages/${encodeURIComponent(editingMessageId)}`, { content: text });
        setMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, content: text } : m));
        setEditingMessageId(null);
        setMsgText('');
      } else {
        const payload = { content: text };
        if (replyingTo) payload.reply_to_id = replyingTo.id;
        const resp = await api.post(`/api/chat/conversations/${encodeURIComponent(selectedConv)}/messages`, payload);
        const msg = resp && resp.id ? resp : { 
          id: Math.random(), 
          sender_id: user?.id, 
          sender_name: user?.full_name || user?.username, 
          content: text, 
          created_at: new Date().toISOString(),
          reply_to_id: replyingTo?.id || null,
          reply_to_content: replyingTo?.content || null,
          reply_to_sender_name: replyingTo?.sender_name || null
        };
        setMessages(prev => {
          const exists = prev.some(m => m && msg && m.id === msg.id);
          return exists ? prev : [...prev, msg];
        });
        setMsgText('');
        setReplyingTo(null);
        window.setTimeout(() => {
          try { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; } catch (e) { void e; }
        }, 0);
      }
    } finally { setSending(false); }
  };

  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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
  const sendAttachments = async () => {
    if (!selectedConv || !files.length) return;
    try {
      setSending(true);
      setUploading(true);
      setUploadProgress(5);
      const fd = new window.FormData();
      files.forEach(f => fd.append('files', f));
      if (msgText && msgText.trim()) fd.append('content', msgText.trim());
      const resp = await api.postFormWithProgress(`/api/chat/conversations/${encodeURIComponent(selectedConv)}/messages/attachments`, fd, (p) => {
        try { setUploadProgress(Math.max(5, Math.min(100, p))); } catch (e) { void e; }
      });
      const msg = resp && resp.id ? resp : null;
      if (msg) setMessages(prev => {
        const exists = prev.some(m => m && msg && m.id === msg.id);
        return exists ? prev : [...prev, msg];
      });
      setMsgText('');
      setFiles([]);
      window.setTimeout(() => { try { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; } catch (e) { void e; } }, 0);
    } finally {
      setSending(false);
      window.setTimeout(() => { try { setUploading(false); } catch (e) { void e; } }, 300);
    }
  };

  const typingTimerRef = useRef(null);
  useEffect(() => {
    if (!wsRef.current || !selectedConv || !isOpen) return;
    try {
      if (typingTimerRef.current) return;
      const payload = JSON.stringify({ type: 'typing', conversationId: selectedConv });
      if (wsRef.current.send) {
        wsRef.current.send(payload);
      }
      typingTimerRef.current = window.setTimeout(() => { typingTimerRef.current = null; }, 1000);
    } catch (_) { /* noop */ }
  }, [msgText, selectedConv, isOpen]);

  const [typingUsers, setTypingUsers] = useState([]);
  useEffect(() => {
    if (!wsRef.current) return;
    const handler = (evt) => {
      try {
        const payload = JSON.parse(String(evt.data || ''));
        if (payload && payload.type === 'chat:typing' && payload.conversationId === selectedConv) {
          if (Number(payload.senderId || 0) === Number(user?.id || 0)) return;
          const name = payload.senderName || '';
          if (!name) return;
          setTypingUsers((prev) => {
            const exists = prev.includes(name);
            const next = exists ? prev : [...prev, name];
            window.setTimeout(() => setTypingUsers((p) => p.filter(n => n !== name)), 2000);
            return next;
          });
        }
      } catch (_) { /* noop */ }
    };
    if (wsRef.current.addEventListener) {
      wsRef.current.addEventListener('message', handler);
    }
    return () => { try { wsRef.current && wsRef.current.removeEventListener && wsRef.current.removeEventListener('message', handler); } catch (e) { void e; } };
  }, [selectedConv, user?.id]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl grid grid-cols-1 md:grid-cols-3 overflow-hidden">
        <div className="p-4 border-r border-gray-200 dark:border-gray-700 md:col-span-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-500" aria-hidden="true" />
            <input
              type="text"
              placeholder={t('chat.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              id="chatSearchInput"
              name="chatSearch"
              autoComplete="on"
              className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => { setSelectedConv(null); setMsgText(''); setFiles([]); setComposing(true); setComposeQuery(''); }}
              className="inline-flex items-center px-3 py-2 rounded-md bg-indigo-600 text-white"
              aria-label={t('chat.startConversation')}
            >
              <PlusIcon className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
            ) : (filteredConversations || []).length === 0 ? (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400">{t('chat.noConversations')}</div>
            ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {composing && (
                  <li key="compose">
                    <div
                      onClick={() => { try { const el = document.getElementById('composeToInput'); if (el) el.focus(); } catch (e) { void e; } }}
                      className="w-full text-left px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-slate-900">
                            <UserIcon className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">Nowa wiadomość</div>
                        </div>
                        <button type="button" className="p-1 rounded hover:bg-slate-100 dark:text-white dark:hover:bg-slate-700" aria-label="Zamknij" onClick={(e) => { e.stopPropagation(); setComposing(false); setComposeQuery(''); }}>
                          <XMarkIcon className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                )}
                {filteredConversations.map((c) => {
                  const title = String(c.title || `#${c.id}`);
                  const firstName = title.split(',')[0].trim();
                  const initials = firstName.split(' ').map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '#';
                  const lastTs = c.last_message_at ? new Date(c.last_message_at) : null;
                  const when = lastTs ? formatTimeAgo(lastTs) : '';
                  const isMine = Number(c.last_sender_id || 0) === Number(user?.id || 0);
                  return (
                  <li key={c.id} onMouseEnter={() => setHoverConvId(c.id)} onMouseLeave={() => { if (hoverConvId === c.id) setHoverConvId(null); }}>
                    <div
                      onClick={() => setSelectedConv(c.id)}
                      onDoubleClick={() => { onOpenConversation && onOpenConversation({ id: c.id, title, dock: true }); onClose && onClose(); }}
                      className={`w-full text-left px-3 py-2 cursor-pointer ${selectedConv === c.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-300 text-[11px] text-slate-900 select-none flex-shrink-0" title={firstName} aria-label={firstName}>{initials}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">
                              {isMine ? `${t('chat.me') || 'Ty'}: ` : ''}{c.last_message_preview || ''}{when ? ` · ${when}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {Number(c.unread_count || 0) > 0 && (
                            <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-red-600 text-white text-xs" aria-label={`nieprzeczytane: ${c.unread_count}`}>{c.unread_count}</span>
                          )}
                          <button type="button" data-menu-trigger-id={c.id} onClick={(e) => { e.stopPropagation(); setMenuConvId(menuConvId === c.id ? null : c.id); }} className={`p-1 rounded ${hoverConvId === c.id ? 'opacity-100' : 'opacity-0'} dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700`} aria-label="Opcje">
                            <EllipsisVerticalIcon className="w-6 h-6" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {menuConvId === c.id && (
                      <div className="relative" data-menu-conv-id={c.id}>
                        <div className="absolute right-2 mt-1 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow">
                          <button type="button" className="block w-full text-left px-3 py-2 text-sm dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700" onClick={(e) => { e.stopPropagation(); markUnread(c.id); setMenuConvId(null); }}>{t('chat.markUnread') || 'Oznacz jako nieprzeczytane'}</button>
                          <div className="border-t border-slate-200 dark:border-slate-700" />
                          <button type="button" className="block w-full text-left px-3 py-2 text-sm dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700" onClick={(e) => { e.stopPropagation(); blockConversation(c.id); setMenuConvId(null); }}>{t('chat.block') || 'Zablokuj'}</button>
                          <div className="border-t border-slate-200 dark:border-slate-700" />
                          <button type="button" className="block w-full text-left px-3 py-2 text-sm dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700" onClick={(e) => { e.stopPropagation(); muteConversation && muteConversation(c.id); setMenuConvId(null); }}>{t('chat.mute') || 'Wycisz'}</button>
                          <div className="border-t border-slate-200 dark:border-slate-700" />
                          <button type="button" className="block w-full text-left px-3 py-2 text-sm dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700" onClick={(e) => { e.stopPropagation(); archiveConversation && archiveConversation(c.id); setMenuConvId(null); }}>{t('chat.archive') || 'Archiwizuj'}</button>
                          <div className="border-t border-slate-200 dark:border-slate-700" />
                          <button type="button" className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-red-600" onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); setMenuConvId(null); }}>{t('chat.delete') || 'Usuń czat'}</button>
                        </div>
                      </div>
                    )}
                  </li>
                )})}
                  </ul>
            )}
          </div>
        </div>
        <div className="md:col-span-2 flex flex-col min-h-0">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="text-md font-semibold text-gray-900 dark:text-white">{t('chat.title')}</div>
            <button type="button" onClick={onClose} className="p-2 rounded hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700" aria-label={t('common.close')}>
              <XMarkIcon className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          {composing ? (
            <div className="p-4">
              <div className="mb-3">
                <div className="text-xs text-slate-700 dark:text-slate-300 mb-1">Do:</div>
                <div className="flex items-start gap-2">
                  <div className="relative flex-1">
                    <div className="flex flex-wrap gap-2 p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 min-h-[42px]">
                      {startSelectedIds.map(uid => {
                        const u = recipientOptions.find(o => o.userId === uid);
                        return (
                          <span key={uid} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                            {u?.name || 'User'}
                            <button
                              type="button"
                              onClick={() => setStartSelectedIds(prev => prev.filter(id => id !== uid))}
                              className="ml-1 text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-white"
                            >
                              <XMarkIcon className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                      <input
                        id="composeToInput"
                        type="text"
                        value={composeQuery}
                        onChange={(e) => setComposeQuery(e.target.value)}
                        placeholder={startSelectedIds.length > 0 ? "" : "Wpisz nazwisko lub login"}
                        className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-0 text-sm"
                        autoFocus
                      />
                    </div>
                    {composeQuery.trim().length >= 0 && (
                      <div className="absolute left-0 right-0 top-full mt-2 max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow z-20">
                        <div className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300">Twoje kontakty</div>
                        {(composeSuggestions || []).map(opt => {
                          const initials = String(opt.name || '').split(' ').map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?';
                          return (
                            <button
                              type="button"
                              key={opt.userId}
                              className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                              onClick={() => {
                                setStartSelectedIds(prev => [...prev, opt.userId]);
                                setComposeQuery('');
                                document.getElementById('composeToInput')?.focus();
                              }}
                            >
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-[11px] text-slate-900">{initials}</span>
                              <span className="text-sm text-slate-900 dark:text-slate-100">{opt.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {startSelectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (startSelectedIds.length === 0 || starting) return;
                        setStarting(true);
                        try {
                          const resp = await api.post('/api/chat/conversations', { recipient_ids: startSelectedIds }).catch(() => null);
                          const convId = resp?.id || resp?.conversation_id;
                          if (convId) {
                            setSelectedConv(convId);
                            setComposing(false);
                            setComposeQuery('');
                            setStartSelectedIds([]);
                            const list = await api.get('/api/chat/conversations').catch(() => []);
                            setConversations(Array.isArray(list) ? list : []);
                            onOpenConversation && onOpenConversation(convId);
                          }
                        } finally {
                          setStarting(false);
                        }
                      }}
                      disabled={starting}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md shadow-sm disabled:opacity-50 whitespace-nowrap h-[42px]"
                    >
                      {starting ? 'Tworzenie...' : (startSelectedIds.length > 1 ? 'Stwórz czat grupowy' : 'Rozpocznij czat')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : selectedConv ? (
            <>
              <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {(() => {
                  let lastDayKey = null;
                  return (messages || []).map((m) => {
                    if (!m) return null;
                    const dayKey = m.created_at ? new Date(m.created_at).toDateString() : null;
                    const showSep = dayKey && dayKey !== lastDayKey;
                    lastDayKey = dayKey;
                    const uId = user?.id ? Number(user.id) : null;
                    const sId = m.sender_id ? Number(m.sender_id) : null;
                    const isMine = uId && sId && uId === sId;
                    return (
                      <React.Fragment key={m.id || Math.random()}>
                        {showSep && (
                          <div className="flex justify-center">
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[11px] text-slate-800 dark:text-slate-100">
                              {new Date(m.created_at).toLocaleString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                        <div className={`max-w-[80%] ${isMine ? 'ml-auto' : 'mr-auto'} flex flex-col ${isMine ? 'items-end text-right' : 'items-start text-left'} gap-1 group relative`}>
                          <div className="flex items-end gap-2 relative">
                            {!isMine && (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-[11px] text-slate-900 select-none flex-shrink-0"
                                title={m.sender_name || ''} aria-label={m.sender_name || ''}>
                                {String(m.sender_name || '').split(' ').map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?'}
                              </span>
                            )}
                            
                            <div className={`absolute top-0 ${isMine ? 'right-full mr-2' : 'left-full ml-2'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white/50 dark:bg-black/20 rounded p-1`}>
                                <button type="button" onClick={() => handleReply(m)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-300" title={t('chat.reply') || 'Odpowiedz'}>
                                    <ArrowUturnLeftIcon className="w-4 h-4" />
                                </button>
                                {isMine && (
                                    <div className="relative">
                                        <button type="button" onClick={(e) => { e.stopPropagation(); setActiveMenuMessageId(activeMenuMessageId === m.id ? null : m.id); }} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-300" title={t('chat.more') || 'Więcej'}>
                                            <EllipsisVerticalIcon className="w-4 h-4" />
                                        </button>
                                        {activeMenuMessageId === m.id && (
                                            <div data-msg-menu-id={m.id} className="absolute bottom-full mb-1 z-[9999] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg flex flex-col min-w-[130px] overflow-hidden">
                                                <button type="button" onClick={() => { handleEdit(m); setActiveMenuMessageId(null); }} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-left w-full">
                                                    <PencilSquareIcon className="w-4 h-4" /> {t('chat.edit') || 'Edytuj'}
                                                </button>
                                                <button type="button" onClick={() => { handleDelete(m.id); setActiveMenuMessageId(null); }} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-red-600 text-left w-full">
                                                    <TrashIcon className="w-4 h-4" /> {t('chat.unsend') || 'Cofnij wysłanie'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {(() => {
                              const imageAtts = (m.attachments || []).filter(a => String(a.mime_type || '').startsWith('image/'));
                              const isImageOnly = (!m.content || !String(m.content).trim()) && imageAtts.length > 0 && imageAtts.length === (m.attachments || []).length;
                              return (
                                <div className={`relative ${isImageOnly ? '' : 'inline-block px-3 py-2 rounded-lg'} ${isImageOnly ? '' : (isMine ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100')}`}>
                                  {m.reply_to_id && (
                                      <div className={`mb-1 text-xs border-l-2 pl-2 opacity-80 ${isMine ? 'border-indigo-400 text-indigo-100' : 'border-slate-400 text-slate-600 dark:text-slate-400'}`}>
                                          <div className="font-semibold">{m.reply_to_sender_name || '...'}</div>
                                          <div className="truncate max-w-[200px]">{m.reply_to_content || '...'}</div>
                                      </div>
                                  )}
                                  {!isImageOnly && <div className="text-sm whitespace-pre-wrap">{m.content}</div>}
                                  {(m.attachments || []).length > 0 && (
                                    <div className={`${isImageOnly ? '' : 'mt-2'} space-y-2`}>
                                      {(m.attachments || []).map(a => (
                                        <div key={a.id} className={`${isImageOnly ? '' : `inline-block px-3 py-2 rounded-lg ${isMine ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'}`}`}>
                                          {String(a.mime_type || '').startsWith('image/') ? (
                                            <button type="button" title={a.original_name || a.filename} onClick={() => { setLightboxUrl(a.url); setLightboxName(a.original_name || a.filename || 'image'); }} className="block">
                                              <img src={a.url} alt={a.original_name || a.filename} onLoad={() => { try { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; } catch (_) { /* noop */ } }} className={`rounded-lg ${isImageOnly ? 'w-full max-w-full h-auto object-contain' : 'max-h-32 max-w-full object-contain'}`} />
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
                                  <div className={`pointer-events-none absolute bottom-full ${isMine ? 'right-0' : 'left-0'} mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-10`}>
                                    <div className="px-3 py-1 rounded-full bg-gray-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-[11px] whitespace-nowrap">{formatDate(m.created_at)}</div>
                                  </div>
                                </div>
                              );
                            })()}
                            {isMine && (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-[11px] text-slate-900 select-none flex-shrink-0"
                                title={m.sender_name || ''} aria-label={m.sender_name || ''}>
                                {String(m.sender_name || '').split(' ').map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?'}
                              </span>
                            )}
                          </div>
                          {(isMine && Array.isArray(m.read_by) && (m.read_by.filter(r => Number(r?.user_id || 0) !== Number(user?.id || 0))).length > 0) && (() => {
                            let tip = 'Wyświetlono';
                            try {
                              const others = (m.read_by || []).filter(r => Number(r?.user_id || 0) !== Number(user?.id || 0));
                              const latestTs = others.reduce((max, r) => {
                                const ts = r?.read_at ? Date.parse(r.read_at) : 0;
                                return ts > max ? ts : max;
                              }, 0);
                              if (latestTs) {
                                tip = `${t('chat.readAt') || 'Wyświetlono'} ${formatDate(new Date(latestTs))}`;
                              }
                            } catch (_) { /* noop */ }
                            return <div className="text-[10px] opacity-70 dark:text-white self-end" title={tip} aria-label={tip}>Przeczytano</div>;
                          })()}
                          </div>
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
              {typingUsers.length > 0 && (
                <div className="px-4 pb-2 text-xs text-gray-600 dark:text-gray-300">{typingUsers.join(', ')} {t('common.typing') || 'pisze...'}</div>
              )}
              {replyingTo && (
                <div className="px-4 pb-2">
                  <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                          {t('chat.replyingTo') || 'Odpowiadasz na'}: {replyingTo.sender_name}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
                          {replyingTo.content || (replyingTo.attachments?.length ? '(Załącznik)' : '...')}
                      </div>
                    </div>
                    <button onClick={cancelReply} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              {editingMessageId && (
                <div className="px-4 pb-2">
                  <div className="flex items-center justify-between px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-500 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">
                          {t('chat.editing') || 'Edytujesz wiadomość'}
                      </div>
                    </div>
                    <button onClick={cancelEdit} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={msgText}
                    onChange={(e) => { setMsgText(e.target.value); setMentionOpen(true); }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose && onClose(); } else if (e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey)) { e.preventDefault(); files.length ? sendAttachments() : sendMessage(); } }}
                    placeholder={t('chat.messagePlaceholder')}
                    id="chatMessageInput"
                    name="chatMessage"
                    autoComplete="on"
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
                <input type="file" multiple onChange={(e) => { const arr = Array.from(e.target.files || []); const valid = validateFiles(arr); setFiles(valid); }} className="hidden" id="chatFilesInput" />
                <div className="relative group">
                  <label htmlFor="chatFilesInput" className="py-2 text-slate-800 dark:text-slate-100 cursor-pointer">
                    <PaperClipIcon className="w-6 h-6" aria-hidden="true" />
                  </label>
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="px-3 py-1 rounded-full bg-gray-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-[11px] whitespace-nowrap">{t('chat.attachTooltip') || 'Wstaw załącznik'}</div>
                  </div>
                </div>
                {mentionOpen && (() => {
                  try {
                    const text = String(msgText || '');
                    const match = text.match(/@([\p{L} .'-]{2,})$/u);
                    const q = match ? match[1].toLowerCase() : '';
                    const base = Array.isArray(recipientOptions) ? recipientOptions : [];
                    const items = q ? base.filter(opt => String(opt.name || '').toLowerCase().includes(q)).slice(0, 8) : [];
                    return items.length > 0 ? (
                      <div className="absolute bottom-full left-0 mb-2 w-64 max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2 z-10">
                        <div className="flex flex-col">
                          {items.map(opt => (
                            <button key={opt.userId} type="button" className="text-left px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => { try { const txt = String(msgText || ''); const idx = txt.lastIndexOf('@'); if (idx >= 0) { const prefix = txt.slice(0, idx); const suffix = txt.slice(idx); const after = suffix.replace(/@([\p{L} .'-]{2,})$/u, `@${opt.name} `); setMsgText(prefix + after); } else { setMsgText((prev) => `${prev || ''}@${opt.name} `); } setMentionOpen(false); } catch (__e) { setMentionOpen(false); } }}>
                              {opt.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  } catch { return null; }
                })()}
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
                {lightboxUrl && createPortal((
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
                ), document.body)}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">{t('chat.defaultPrompt')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

ChatModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  user: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    username: PropTypes.string,
    full_name: PropTypes.string,
  }).isRequired,
  onOpenConversation: PropTypes.func,
  initialConversationId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  chatFeatureEnabled: PropTypes.bool,
};

export default ChatModal;
