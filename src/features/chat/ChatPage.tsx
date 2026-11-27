import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Ban,
  Check,
  CheckCheck,
  Copy,
  Eraser,
  FileText,
  ImagePlus,
  MessageSquare,
  MoreVertical,
  Pencil,
  Reply,
  Search,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, storage } from '@/lib/firebase';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { ImagePreviewModal } from '@/components/shared/ImagePreviewModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  Booking,
  ChatMessage,
  ChatReplyRef,
  ChatThread,
  UserProfile,
} from '@/types/schema';

interface ChatPageProps {
  mode: 'admin' | 'user';
}

function formatDayLabel(date: Date, tx: (en: string, id: string) => string): string {
  if (isToday(date)) return tx('Today', 'Hari Ini');
  if (isYesterday(date)) return tx('Yesterday', 'Kemarin');
  return format(date, 'dd MMM yyyy');
}

function formatTimeShort(ts?: Timestamp): string {
  if (!ts?.toDate) return '';
  return format(ts.toDate(), 'HH:mm');
}

export function ChatPage({ mode }: ChatPageProps) {
  const queryClient = useQueryClient();
  const { tx } = useI18n();
  const { userProfile } = useAuth();
  const {
    activeTenant: scopedTenant,
    defaultTenant,
    isAllTenants,
    tenantById,
  } = useTenant();
  // In user mode (Renter Support Chat), always bind to a concrete branch; in admin mode, allow All Branches
  const activeTenant = mode === 'user' ? scopedTenant ?? defaultTenant : scopedTenant;
  const activeTenantId = activeTenant?.id ?? null;
  const isAdminAllTenants = mode === 'admin' && isAllTenants;

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeThreadDoc, setActiveThreadDoc] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Composer state
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [refBookingId, setRefBookingId] = useState<string>('none');
  const [sending, setSending] = useState(false);

  // WhatsApp-style interactive states
  const [replyingTo, setReplyingTo] = useState<ChatReplyRef | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [unsendTarget, setUnsendTarget] = useState<ChatMessage | null>(null);
  const [clearChatConfirmOpen, setClearChatConfirmOpen] = useState(false);
  const [chatImagePreview, setChatImagePreview] = useState<{ url: string; label: string } | null>(
    null
  );

  // Search filters
  const [threadSearch, setThreadSearch] = useState('');
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgSearch, setMsgSearch] = useState('');

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const userScopedChatId =
    mode === 'user' && activeTenantId && userProfile
      ? `${activeTenantId}_${userProfile.uid}`
      : null;

  const resolvedChatId = mode === 'user' ? userScopedChatId : activeChatId;

  // Fetch relevant bookings for booking-card referencing
  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['chat-bookings', mode, isAdminAllTenants ? 'all' : activeTenantId, userProfile?.uid],
    enabled: Boolean(db && (isAdminAllTenants || activeTenantId) && userProfile),
    queryFn: async () => {
      if (!db || (!isAdminAllTenants && !activeTenantId) || !userProfile) return [];
      const q =
        mode === 'admin'
          ? isAdminAllTenants
            ? collection(db, 'bookings')
            : query(collection(db, 'bookings'), where('tenantId', '==', activeTenantId))
          : query(collection(db, 'bookings'), where('userId', '==', userProfile.uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
    },
  });

  const bookingsById = useMemo(() => {
    const map: Record<string, Booking> = {};
    bookings.forEach((b) => {
      map[b.id] = b;
    });
    return map;
  }, [bookings]);

  const { data: memberMap = {} } = useQuery<Record<string, UserProfile>>({
    queryKey: ['chat-members', mode],
    enabled: Boolean(db && mode === 'admin'),
    queryFn: async () => {
      if (!db) return {};
      const snap = await getDocs(collection(db, 'users'));
      const map: Record<string, UserProfile> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[d.id] = {
          uid: d.id,
          email: data.email ?? '',
          displayName: data.displayName ?? 'Renter',
          role: data.role ?? 'user',
          membershipTier: data.membershipTier === 'premium' ? 'premium' : 'basic',
          tenantId: data.tenantId ?? null,
          phone: data.phone ?? '',
          kycStatus: data.kycStatus ?? 'unverified',
          isBlacklisted: Boolean(data.isBlacklisted),
          createdAt: (data.createdAt as Timestamp) ?? Timestamp.now(),
        };
      });
      return map;
    },
  });

  // Reset selected chat thread when branch scope changes
  useEffect(() => {
    setActiveChatId(null);
  }, [activeTenantId, isAdminAllTenants]);

  // Admin: subscribe to all threads for activeTenantId (or all branches for Superadmin)
  useEffect(() => {
    if (mode !== 'admin' || !db || (!isAdminAllTenants && !activeTenantId)) return;

    const q = isAdminAllTenants
      ? collection(db, 'chats')
      : query(collection(db, 'chats'), where('tenantId', '==', activeTenantId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ChatThread)
          .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
        setThreads(list);
      },
      (err) => {
        console.error('Chat threads listener error:', err);
      }
    );

    return () => unsub();
  }, [mode, isAdminAllTenants, activeTenantId]);

  // Subscribe to the active thread metadata (for clearedAtByUser)
  useEffect(() => {
    if (!db || !resolvedChatId) {
      setActiveThreadDoc(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'chats', resolvedChatId),
      (snap) => {
        if (snap.exists()) {
          setActiveThreadDoc({ id: snap.id, ...snap.data() } as ChatThread);
        } else {
          setActiveThreadDoc(null);
        }
      },
      () => {
        setActiveThreadDoc(null);
      }
    );

    return () => unsub();
  }, [resolvedChatId]);

  const activeThreadExists = Boolean(activeThreadDoc && activeThreadDoc.id === resolvedChatId);

  // Subscribe to messages only after parent chat thread exists (avoids rules error on empty threads)
  useEffect(() => {
    if (!db || !resolvedChatId || !activeThreadExists) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'chats', resolvedChatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
        setMessages(list);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      },
      (err) => {
        console.error('Chat messages listener error:', err);
      }
    );

    return () => unsub();
  }, [resolvedChatId, activeThreadExists]);

  // Mark parent chat thread as read as soon as it is opened (clears unread dot & sidebar badge count)
  useEffect(() => {
    if (!db || !resolvedChatId || !userProfile || !activeThreadExists || !activeThreadDoc) return;
    if ((activeThreadDoc.readBy ?? []).includes(userProfile.uid)) return;

    const firestore = db;
    void updateDoc(doc(firestore, 'chats', resolvedChatId), {
      readBy: arrayUnion(userProfile.uid),
    })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] });
      })
      .catch(() => {
        // Silent fallback if thread is initializing
      });
  }, [resolvedChatId, activeThreadExists, activeThreadDoc, userProfile, queryClient]);

  // Mark incoming unread messages as read automatically (WhatsApp blue checkmarks)
  useEffect(() => {
    if (!db || !resolvedChatId || !userProfile) return;
    const firestore = db;
    const unreadIncoming = messages.filter(
      (m) =>
        m.senderId !== userProfile.uid &&
        !m.deletedForEveryone &&
        !(m.readBy ?? []).includes(userProfile.uid)
    );

    if (unreadIncoming.length === 0) return;

    unreadIncoming.forEach((m) => {
      void updateDoc(doc(firestore, 'chats', resolvedChatId, 'messages', m.id), {
        readBy: arrayUnion(userProfile.uid),
      }).catch(() => {
        // Silent fallback if thread is initializing
      });
    });
  }, [messages, resolvedChatId, userProfile]);

  const visibleMessages = useMemo(() => {
    if (!userProfile) return [];
    const clearedTs = activeThreadDoc?.clearedAtByUser?.[userProfile.uid]?.toMillis?.() ?? 0;
    const searchQ = msgSearch.trim().toLowerCase();

    return messages.filter((msg) => {
      // Exclude messages deleted for me
      if ((msg.deletedFor ?? []).includes(userProfile.uid)) return false;
      // Exclude messages older than "Clear Chat for Me" timestamp
      if (clearedTs > 0 && (msg.createdAt?.toMillis?.() ?? 0) <= clearedTs) return false;
      // Search filter inside thread
      if (searchQ) {
        const inText = (msg.text ?? '').toLowerCase().includes(searchQ);
        const refInv = msg.referenceBookingId
          ? (bookingsById[msg.referenceBookingId]?.invoiceNumber ?? '').toLowerCase().includes(searchQ)
          : false;
        if (!inText && !refInv) return false;
      }
      return true;
    });
  }, [messages, userProfile, activeThreadDoc, msgSearch, bookingsById]);

  const filteredThreads = useMemo(() => {
    const q = threadSearch.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const name = memberMap[t.userId]?.displayName?.toLowerCase() ?? '';
      return (
        name.includes(q) ||
        t.userId.toLowerCase().includes(q) ||
        t.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [threads, threadSearch, memberMap]);

  if ((!isAdminAllTenants && (!activeTenantId || !activeTenant)) || !userProfile) {
    return (
      <EmptyState
        icon={MessageSquare}
        title={tx('No active rental branch selected', 'Belum ada cabang aktif')}
        description={tx(
          'Select a rental branch in the topbar to open real-time messaging.',
          'Pilih cabang rental di bagian atas untuk membuka chat real-time.'
        )}
      />
    );
  }

  const handleStartReply = (msg: ChatMessage) => {
    if (msg.deletedForEveryone) return;
    setEditingMsg(null);
    setReplyingTo({
      messageId: msg.id,
      senderRole: msg.senderRole,
      textPreview:
        msg.text?.slice(0, 120) ||
        (msg.referenceBookingId
          ? `Booking ${bookingsById[msg.referenceBookingId]?.invoiceNumber ?? msg.referenceBookingId}`
          : tx('Image attachment', 'Lampiran gambar')),
    });
    inputRef.current?.focus();
  };

  const handleStartEdit = (msg: ChatMessage) => {
    if (msg.senderId !== userProfile.uid || msg.deletedForEveryone) return;
    setReplyingTo(null);
    setEditingMsg(msg);
    setText(msg.text ?? '');
    inputRef.current?.focus();
  };

  const handleCopyText = async (msg: ChatMessage) => {
    if (!msg.text) return;
    try {
      await navigator.clipboard.writeText(msg.text);
      toast.success(tx('Message copied to clipboard.', 'Pesan disalin ke clipboard.'));
    } catch {
      toast.error(tx('Failed to copy text.', 'Gagal menyalin teks.'));
    }
  };

  // Delete for Me
  const handleDeleteForMe = async (msg: ChatMessage) => {
    if (!db || !resolvedChatId) return;
    try {
      await updateDoc(doc(db, 'chats', resolvedChatId, 'messages', msg.id), {
        deletedFor: arrayUnion(userProfile.uid),
      });
      toast.success(tx('Message deleted for you.', 'Pesan dihapus untuk Anda.'));
    } catch (error) {
      console.error('Delete for me error:', error);
      toast.error(tx('Failed to delete message.', 'Gagal menghapus pesan.'));
    }
  };

  // Delete for Everyone / Unsend
  const handleUnsendForEveryone = async () => {
    if (!db || !resolvedChatId || !unsendTarget) return;
    try {
      await updateDoc(doc(db, 'chats', resolvedChatId, 'messages', unsendTarget.id), {
        deletedForEveryone: true,
        deletedAt: Timestamp.now(),
        text: deleteField(),
        imageUrl: deleteField(),
        referenceBookingId: deleteField(),
      });

      const isLatest = messages[messages.length - 1]?.id === unsendTarget.id;
      if (isLatest) {
        await setDoc(
          doc(db, 'chats', resolvedChatId),
          {
            lastMessage: tx('This message was unsent', 'Pesan ini telah dibatalkan pengirimannya'),
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      }

      toast.success(tx('Message unsent for everyone.', 'Pesan dibatalkan untuk semua orang.'));
      setUnsendTarget(null);
    } catch (error) {
      console.error('Unsend error:', error);
      toast.error(tx('Failed to unsend message.', 'Gagal membatalkan kirim pesan.'));
    }
  };

  // Clear Chat for Me
  const handleClearChatForMe = async () => {
    if (!db || !resolvedChatId) return;
    try {
      await setDoc(
        doc(db, 'chats', resolvedChatId),
        {
          clearedAtByUser: {
            [userProfile.uid]: Timestamp.now(),
          },
        },
        { merge: true }
      );
      toast.success(
        tx('Chat history cleared for your view.', 'Riwayat chat dibersihkan untuk tampilan Anda.')
      );
      setClearChatConfirmOpen(false);
    } catch (error) {
      console.error('Clear chat error:', error);
      toast.error(tx('Failed to clear chat.', 'Gagal membersihkan chat.'));
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!db || !resolvedChatId || sending) return;

    // Mode 1: Saving an edited message
    if (editingMsg) {
      const trimmed = text.trim();
      if (!trimmed) {
        toast.error(tx('Message text cannot be empty.', 'Teks pesan tidak boleh kosong.'));
        return;
      }
      setSending(true);
      try {
        await updateDoc(doc(db, 'chats', resolvedChatId, 'messages', editingMsg.id), {
          text: trimmed,
          editedAt: Timestamp.now(),
        });
        if (messages[messages.length - 1]?.id === editingMsg.id) {
          await setDoc(
            doc(db, 'chats', resolvedChatId),
            { lastMessage: trimmed, updatedAt: Timestamp.now() },
            { merge: true }
          );
        }
        setEditingMsg(null);
        setText('');
        toast.success(tx('Message updated.', 'Pesan diperbarui.'));
      } catch (error) {
        console.error('Edit message error:', error);
        toast.error(tx('Failed to edit message.', 'Gagal mengedit pesan.'));
      } finally {
        setSending(false);
      }
      return;
    }

    // Mode 2: Sending a new message
    if (!text.trim() && !imageUrl.trim() && !imageFile && refBookingId === 'none') return;

    setSending(true);
    try {
      let resolvedImageUrl = imageUrl.trim();
      if (imageFile && storage) {
        const fileRef = ref(
          storage,
          `chat_attachments/${resolvedChatId}/${Date.now()}_${imageFile.name}`
        );
        await uploadBytes(fileRef, imageFile);
        resolvedImageUrl = await getDownloadURL(fileRef);
      }

      const targetUserId =
        mode === 'user'
          ? userProfile.uid
          : threads.find((t) => t.id === resolvedChatId)?.userId ??
            resolvedChatId.split('_')[1] ??
            userProfile.uid;

      const summaryText =
        text.trim() ||
        (refBookingId !== 'none'
          ? `Booking ${bookingsById[refBookingId]?.invoiceNumber ?? refBookingId}`
          : tx('Image attachment', 'Lampiran gambar'));

      const resolvedThreadTenantId =
        mode === 'user'
          ? activeTenantId
          : threads.find((t) => t.id === resolvedChatId)?.tenantId ??
            activeTenantId ??
            resolvedChatId.split('_')[0];

      await setDoc(
        doc(db, 'chats', resolvedChatId),
        {
          tenantId: resolvedThreadTenantId,
          userId: targetUserId,
          ...(refBookingId !== 'none' ? { bookingId: refBookingId } : {}),
          lastMessage: summaryText,
          lastSenderId: userProfile.uid,
          readBy: [userProfile.uid],
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      void queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] });

      await addDoc(collection(db, 'chats', resolvedChatId, 'messages'), {
        senderId: userProfile.uid,
        senderRole: mode === 'admin' ? 'admin' : 'user',
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(resolvedImageUrl ? { imageUrl: resolvedImageUrl } : {}),
        ...(refBookingId !== 'none' ? { referenceBookingId: refBookingId } : {}),
        ...(replyingTo ? { replyTo: replyingTo } : {}),
        readBy: [userProfile.uid],
        deletedFor: [],
        createdAt: Timestamp.now(),
      });

      setText('');
      setImageUrl('');
      setImageFile(null);
      setShowImagePanel(false);
      setRefBookingId('none');
      setReplyingTo(null);
    } catch (error) {
      console.error('Send message error:', error);
      toast.error(tx('Failed to send message.', 'Gagal mengirim pesan.'));
    } finally {
      setSending(false);
    }
  };

  const activeParticipantName =
    mode === 'admin'
      ? (() => {
          const t = threads.find((th) => th.id === resolvedChatId);
          if (!t) return tx('Select a conversation', 'Pilih percakapan');
          return memberMap[t.userId]?.displayName ?? `USER // ${t.userId.slice(0, 10)}`;
        })()
      : activeTenant?.name ?? 'CameraRent';

  const activeParticipantTier =
    mode === 'admin'
      ? (() => {
          const t = threads.find((th) => th.id === resolvedChatId);
          return t ? memberMap[t.userId]?.membershipTier : undefined;
        })()
      : undefined;

  return (
    <div className="space-y-4">
      <div className="border-b border-zinc-200 pb-3">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          {mode === 'admin'
            ? `${tx('Client Support Threads', 'Chat Dukungan Klien')}${isAdminAllTenants ? ` — ${tx('All Branches', 'Semua Cabang')}` : activeTenant ? ` — ${activeTenant.name}` : ''}`
            : `${tx('Direct Chat', 'Chat Langsung')} — ${activeTenant?.name ?? 'CameraRent'}`}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          {tx(
            'Real-time messaging with Reply, Edit, Read Receipts, Delete for Me, and Unsend for Everyone.',
            'Pesan real-time dengan Balas, Edit, Centang Dibaca, Hapus untuk Saya, dan Batal Kirim untuk Semua.'
          )}
        </p>
      </div>

      <div className="grid h-[calc(100vh-205px)] min-h-[500px] grid-cols-1 overflow-hidden rounded-md border border-zinc-200 bg-white lg:grid-cols-12">
        {/* Admin Thread List */}
        {mode === 'admin' ? (
          <div className="flex flex-col border-b border-zinc-200 bg-zinc-50/60 lg:col-span-4 lg:border-b-0 lg:border-r">
            <div className="space-y-2 border-b border-zinc-200 p-3">
              <div className="flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <span>{tx('Active Threads', 'Percakapan Aktif')}</span>
                <span>{filteredThreads.length}</span>
              </div>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400"
                  strokeWidth={1.5}
                />
                <Input
                  placeholder={tx('Search renter or message...', 'Cari penyewa atau pesan...')}
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  className="h-7 bg-white pl-8 text-xs"
                />
              </div>
            </div>

            <div className="flex-1 divide-y divide-zinc-100 overflow-y-auto">
              {filteredThreads.length === 0 ? (
                <p className="p-4 text-xs text-zinc-400">
                  {tx('No conversations yet for', 'Belum ada percakapan untuk')}{' '}
                  {isAdminAllTenants
                    ? tx('all branches', 'semua cabang')
                    : activeTenant?.name ?? tx('this branch', 'cabang ini')}
                  .
                </p>
              ) : (
                filteredThreads.map((thread) => {
                  const selected = thread.id === resolvedChatId;
                  const member = memberMap[thread.userId];
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => {
                        setActiveChatId(thread.id);
                        setReplyingTo(null);
                        setEditingMsg(null);
                      }}
                      className={`w-full px-3.5 py-3 text-left transition-colors ${
                        selected ? 'bg-white font-medium' : 'hover:bg-zinc-100/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {thread.lastSenderId &&
                          thread.lastSenderId !== userProfile?.uid &&
                          !(thread.readBy ?? []).includes(userProfile?.uid ?? '') ? (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-900" />
                          ) : null}
                          <span className="truncate text-xs font-medium text-zinc-900">
                            {member?.displayName ?? `USER // ${thread.userId.slice(0, 10)}`}
                          </span>
                          {member?.membershipTier === 'premium' ? (
                            <MembershipBadge tier="premium" />
                          ) : null}
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                          {formatTimeShort(thread.updatedAt)}
                        </span>
                      </div>
                      {isAdminAllTenants && tenantById[thread.tenantId] ? (
                        <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">
                          {tenantById[thread.tenantId].name}
                        </p>
                      ) : null}
                      <p className="mt-1 truncate text-[11px] text-zinc-500">
                        {thread.lastMessage}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {/* Chat Conversation Column */}
        <div
          className={`flex min-h-0 flex-col ${mode === 'admin' ? 'lg:col-span-8' : 'lg:col-span-12'}`}
        >
          {!resolvedChatId ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50/40 p-8 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400">
                <MessageSquare className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <p className="mt-3 text-sm font-medium text-zinc-900">
                {tx('Select a conversation', 'Pilih percakapan')}
              </p>
              <p className="mt-1 max-w-xs text-xs text-zinc-500">
                {tx(
                  'Choose a client thread from the list on the left to read messages and reply.',
                  'Klik salah satu percakapan klien di sebelah kiri untuk membaca pesan dan membalas.'
                )}
              </p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-semibold text-zinc-950">
                    {activeParticipantName}
                  </span>
                  {activeParticipantTier === 'premium' ? <MembershipBadge tier="premium" /> : null}
                  <span className="hidden rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[9px] uppercase text-emerald-700 sm:inline-block">
                    LIVE
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setShowMsgSearch((v) => !v);
                      if (showMsgSearch) setMsgSearch('');
                    }}
                    title={tx('Search messages in conversation', 'Cari pesan dalam percakapan')}
                  >
                    <Search className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={!resolvedChatId}
                      >
                        <MoreVertical className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setClearChatConfirmOpen(true)}
                        className="cursor-pointer text-red-700 focus:bg-red-50 focus:text-red-800"
                      >
                        <Eraser className="h-3.5 w-3.5" strokeWidth={1.5} />
                        <span>{tx('Clear Chat (Delete for Me)', 'Bersihkan Chat (Hapus untuk Saya)')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {mode === 'admin' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setActiveChatId(null);
                        setShowMsgSearch(false);
                        setMsgSearch('');
                        setReplyingTo(null);
                        setEditingMsg(null);
                      }}
                      title={tx('Close conversation', 'Tutup percakapan')}
                    >
                      <X className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                    </Button>
                  ) : null}
                </div>
              </div>

          {/* Search in thread bar */}
          {showMsgSearch ? (
            <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
              <Search className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
              <Input
                autoFocus
                placeholder={tx(
                  'Search keywords or invoice number (INV/...)...',
                  'Cari kata kunci atau nomor invoice (INV/...)...'
                )}
                value={msgSearch}
                onChange={(e) => setMsgSearch(e.target.value)}
                className="h-7 bg-white text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setMsgSearch('');
                  setShowMsgSearch(false);
                }}
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          ) : null}

          {/* Message Stream */}
          <div className="flex-1 space-y-2.5 overflow-y-auto bg-zinc-50/40 p-4">
            {!resolvedChatId ? (
              <p className="py-12 text-center text-xs text-zinc-400">
                {tx(
                  'Select a conversation on the left to open chat.',
                  'Pilih percakapan di sebelah kiri untuk membuka chat.'
                )}
              </p>
            ) : visibleMessages.length === 0 ? (
              <p className="py-12 text-center text-xs text-zinc-400">
                {msgSearch
                  ? tx('No messages match your search.', 'Tidak ada pesan yang cocok dengan pencarian.')
                  : tx(
                      'No messages yet. Start a conversation or attach a booking card below.',
                      'Belum ada pesan. Mulai percakapan atau lampirkan kartu booking di bawah.'
                    )}
              </p>
            ) : (
              visibleMessages.map((msg, index) => {
                const isSelf = msg.senderId === userProfile.uid;
                const prevMsg = visibleMessages[index - 1];
                const curDate = msg.createdAt?.toDate?.() ?? new Date();
                const prevDate = prevMsg?.createdAt?.toDate?.();
                const showDateDivider =
                  !prevDate ||
                  format(curDate, 'yyyy-MM-dd') !== format(prevDate, 'yyyy-MM-dd');

                const refBooking = msg.referenceBookingId
                  ? bookingsById[msg.referenceBookingId]
                  : undefined;

                const isReadByOther =
                  isSelf && (msg.readBy ?? []).some((uid) => uid !== userProfile.uid);

                return (
                  <div key={msg.id} className="space-y-2">
                    {showDateDivider ? (
                      <div className="flex justify-center py-1">
                        <span className="rounded border border-zinc-200 bg-white px-2.5 py-0.5 font-mono text-[10px] text-zinc-500">
                          {formatDayLabel(curDate, tx)}
                        </span>
                      </div>
                    ) : null}

                    <div
                      className={`group flex items-end gap-1.5 ${
                        isSelf ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {/* Left hover actions for own messages */}
                      {isSelf ? (
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {!msg.deletedForEveryone ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-zinc-400 hover:text-zinc-900"
                              onClick={() => handleStartReply(msg)}
                              title={tx('Reply to message', 'Balas pesan')}
                            >
                              <Reply className="h-3 w-3" strokeWidth={1.5} />
                            </Button>
                          ) : null}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-zinc-400 hover:text-zinc-900"
                                title={tx('Message options', 'Opsi pesan')}
                              >
                                <MoreVertical className="h-3 w-3" strokeWidth={1.5} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {!msg.deletedForEveryone ? (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() => handleStartReply(msg)}
                                    className="cursor-pointer"
                                  >
                                    <Reply className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                                    <span>{tx('Reply', 'Balas')}</span>
                                  </DropdownMenuItem>
                                  {msg.text ? (
                                    <DropdownMenuItem
                                      onSelect={() => void handleCopyText(msg)}
                                      className="cursor-pointer"
                                    >
                                      <Copy className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                                      <span>{tx('Copy text', 'Salin teks')}</span>
                                    </DropdownMenuItem>
                                  ) : null}
                                  {msg.text ? (
                                    <DropdownMenuItem
                                      onSelect={() => handleStartEdit(msg)}
                                      className="cursor-pointer"
                                    >
                                      <Pencil className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                                      <span>{tx('Edit message', 'Edit pesan')}</span>
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => setUnsendTarget(msg)}
                                    className="cursor-pointer text-red-700 focus:bg-red-50 focus:text-red-800"
                                  >
                                    <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                    <span>{tx('Unsend (For Everyone)', 'Batal Kirim (Untuk Semua)')}</span>
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              <DropdownMenuItem
                                onSelect={() => void handleDeleteForMe(msg)}
                                className="cursor-pointer text-zinc-700"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                                <span>{tx('Delete for Me', 'Hapus untuk Saya')}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : null}

                      {/* Message Bubble */}
                      <div
                        className={`max-w-[76%] rounded-md border px-3 py-2 text-xs ${
                          msg.deletedForEveryone
                            ? 'border-dashed border-zinc-300 bg-zinc-100/70 text-zinc-500'
                            : isSelf
                              ? 'border-zinc-300 bg-zinc-100 text-zinc-900'
                              : 'border-zinc-200 bg-white text-zinc-900'
                        }`}
                      >
                        {msg.deletedForEveryone ? (
                          <div className="flex items-center gap-1.5 italic text-[11px] text-zinc-500">
                            <Ban className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                            <span>
                              {isSelf
                                ? tx('You unsent this message', 'Anda membatalkan pengiriman pesan ini')
                                : tx('This message was unsent', 'Pesan ini telah dibatalkan pengirimannya')}
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* Quoted Reply Preview */}
                            {msg.replyTo ? (
                              <div
                                className={`rounded border-l-2 px-2 py-1 text-[11px] ${
                                  isSelf
                                    ? 'border-zinc-400 bg-white/80 text-zinc-600'
                                    : 'border-zinc-400 bg-zinc-100 text-zinc-600'
                                }`}
                              >
                                <p className="font-mono text-[9px] uppercase opacity-75">
                                  {msg.replyTo.senderRole === 'admin'
                                    ? 'Admin'
                                    : tx('Renter', 'Penyewa')}
                                </p>
                                <p className="line-clamp-2">{msg.replyTo.textPreview}</p>
                              </div>
                            ) : null}

                            {/* Inline Booking Reference Card */}
                            {refBooking ? (
                              <div
                                className={`rounded border p-2 text-[11px] ${
                                  isSelf
                                    ? 'border-zinc-300/80 bg-white text-zinc-800'
                                    : 'border-zinc-200 bg-zinc-50 text-zinc-800'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono font-semibold">
                                    {refBooking.invoiceNumber}
                                  </span>
                                  <StatusBadge status={refBooking.bookingStatus} />
                                </div>
                                <div className="mt-1 flex items-center justify-between opacity-80">
                                  <span>
                                    {refBooking.items.length} {tx('unit(s)', 'unit')}
                                  </span>
                                  <CurrencyText amount={refBooking.totalAmount} />
                                </div>
                              </div>
                            ) : null}

                            {/* Image Attachment */}
                            {msg.imageUrl ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setChatImagePreview({
                                    url: msg.imageUrl!,
                                    label: `${tx('Attachment', 'Lampiran')} · ${formatDateTime(msg.createdAt)}`,
                                  })
                                }
                                className="block overflow-hidden rounded border border-zinc-300/60"
                              >
                                <img
                                  src={msg.imageUrl}
                                  alt="Chat attachment"
                                  className="max-h-52 object-cover transition-opacity hover:opacity-90"
                                />
                              </button>
                            ) : null}

                            {/* Message Body */}
                            {msg.text ? (
                              <p className="whitespace-pre-wrap break-words leading-relaxed">
                                {msg.text}
                              </p>
                            ) : null}
                          </div>
                        )}

                        {/* Bubble Metadata Footer: Time + Edited + Read Receipt */}
                        <div className="mt-1 flex items-center justify-end gap-1.5 font-mono text-[9.5px] text-zinc-500">
                          {msg.editedAt && !msg.deletedForEveryone ? (
                            <span className="italic">{tx('edited', 'diedit')}</span>
                          ) : null}
                          <span title={formatDateTime(msg.createdAt)}>
                            {formatTimeShort(msg.createdAt)}
                          </span>
                          {isSelf && !msg.deletedForEveryone ? (
                            isReadByOther ? (
                              <CheckCheck
                                className="h-3 w-3 text-blue-600"
                                strokeWidth={1.75}
                                aria-label={tx('Read', 'Dibaca')}
                              />
                            ) : (
                              <Check
                                className="h-3 w-3 text-zinc-500"
                                strokeWidth={1.75}
                                aria-label={tx('Sent', 'Terkirim')}
                              />
                            )
                          ) : null}
                        </div>
                      </div>

                      {/* Right hover actions for incoming messages */}
                      {!isSelf ? (
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {!msg.deletedForEveryone ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-zinc-400 hover:text-zinc-900"
                              onClick={() => handleStartReply(msg)}
                              title={tx('Reply to message', 'Balas pesan')}
                            >
                              <Reply className="h-3 w-3" strokeWidth={1.5} />
                            </Button>
                          ) : null}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-zinc-400 hover:text-zinc-900"
                                title={tx('Message options', 'Opsi pesan')}
                              >
                                <MoreVertical className="h-3 w-3" strokeWidth={1.5} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-44">
                              {!msg.deletedForEveryone ? (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() => handleStartReply(msg)}
                                    className="cursor-pointer"
                                  >
                                    <Reply className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                                    <span>{tx('Reply', 'Balas')}</span>
                                  </DropdownMenuItem>
                                  {msg.text ? (
                                    <DropdownMenuItem
                                      onSelect={() => void handleCopyText(msg)}
                                      className="cursor-pointer"
                                    >
                                      <Copy className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                                      <span>{tx('Copy text', 'Salin teks')}</span>
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                </>
                              ) : null}
                              <DropdownMenuItem
                                onSelect={() => void handleDeleteForMe(msg)}
                                className="cursor-pointer text-zinc-700"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                                <span>{tx('Delete for Me', 'Hapus untuk Saya')}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer Footer */}
          <form
            onSubmit={(e) => void handleSend(e)}
            className="space-y-2 border-t border-zinc-200 bg-white p-3"
          >
            {/* Active Reply Banner */}
            {replyingTo ? (
              <div className="flex items-center justify-between gap-2 rounded border border-zinc-200 border-l-2 border-l-primary bg-zinc-50 px-2.5 py-1.5 text-xs">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase text-primary">
                    {tx('Replying to', 'Membalas')}{' '}
                    {replyingTo.senderRole === 'admin' ? 'Admin' : tx('Renter', 'Penyewa')}
                  </p>
                  <p className="truncate text-[11px] text-zinc-600">{replyingTo.textPreview}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setReplyingTo(null)}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </div>
            ) : null}

            {/* Active Edit Banner */}
            {editingMsg ? (
              <div className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-amber-900">
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span className="font-medium">
                    {tx('Editing sent message', 'Mengedit pesan terkirim')}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    setEditingMsg(null);
                    setText('');
                  }}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </div>
            ) : null}

            {/* Image Attachment Panel */}
            {showImagePanel && !editingMsg ? (
              <div className="grid grid-cols-1 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2.5 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">
                  <Upload className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                  <span className="truncate">
                    {imageFile
                      ? imageFile.name
                      : tx('Upload image from device', 'Upload gambar dari perangkat')}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <Input
                  placeholder={tx(
                    'Or paste image URL (https://...)',
                    'Atau tempel URL gambar (https://...)'
                  )}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="bg-white"
                />
              </div>
            ) : null}

            {/* Input Row */}
            <div className="flex flex-wrap items-end gap-2">
              {!editingMsg ? (
                <>
                  <Button
                    type="button"
                    variant={showImagePanel ? 'secondary' : 'outline'}
                    size="icon"
                    className="h-8 w-8 shrink-0 bg-white"
                    onClick={() => setShowImagePanel((v) => !v)}
                    title={tx('Attach image', 'Lampirkan gambar')}
                  >
                    <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>

                  <Select value={refBookingId} onValueChange={setRefBookingId}>
                    <SelectTrigger className="h-8 w-40 shrink-0 bg-white">
                      <FileText className="mr-1 h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                      <SelectValue placeholder={tx('Booking card...', 'Kartu booking...')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tx('No booking', 'Tanpa booking')}</SelectItem>
                      {bookings.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.invoiceNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : null}

              <textarea
                ref={inputRef}
                rows={1}
                placeholder={
                  editingMsg
                    ? tx('Edit message text...', 'Edit teks pesan...')
                    : tx(
                        'Type a message... (Enter to send, Shift+Enter for new line)',
                        'Ketik pesan... (Enter kirim, Shift+Enter baris baru)'
                      )
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                disabled={!resolvedChatId || sending}
                className="flex min-h-[32px] max-h-28 min-w-[200px] flex-1 resize-none rounded-md border border-input bg-white px-2.5 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />

              <Button type="submit" size="sm" disabled={!resolvedChatId || sending}>
                {editingMsg ? (
                  <>
                    <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {tx('Save', 'Simpan')}
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {tx('Send', 'Kirim')}
                  </>
                )}
              </Button>
            </div>
          </form>
            </>
          )}
        </div>
      </div>

      {/* Confirm Unsend Dialog */}
      <Dialog open={Boolean(unsendTarget)} onOpenChange={(o) => !o && setUnsendTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tx('Unsend Message?', 'Batal Kirim Pesan?')}</DialogTitle>
            <DialogDescription>
              {tx(
                'This message will be retracted for everyone in this conversation and replaced with an unsent notice.',
                'Pesan akan ditarik untuk semua orang dalam percakapan ini dan diganti dengan pemberitahuan pembatalan.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUnsendTarget(null)}>
              {tx('Cancel', 'Batal')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleUnsendForEveryone()}
            >
              <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              {tx('Unsend for Everyone', 'Batal Kirim untuk Semua')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Clear Chat for Me Dialog */}
      <Dialog open={clearChatConfirmOpen} onOpenChange={setClearChatConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tx('Clear Chat for Me?', 'Bersihkan Chat untuk Saya?')}</DialogTitle>
            <DialogDescription>
              {tx(
                'All messages prior to now will be hidden only from your view. The other participant can still see the conversation history.',
                'Semua pesan sebelum saat ini akan disembunyikan hanya dari tampilan Anda. Lawan bicara tetap dapat melihat riwayat percakapan.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setClearChatConfirmOpen(false)}>
              {tx('Cancel', 'Batal')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleClearChatForMe()}
            >
              {tx('Clear for Me', 'Bersihkan untuk Saya')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImagePreviewModal
        open={Boolean(chatImagePreview)}
        onOpenChange={(open) => !open && setChatImagePreview(null)}
        images={chatImagePreview ? [chatImagePreview] : []}
        title={tx('Chat Attachment Preview', 'Pratinjau Lampiran Chat')}
      />
    </div>
  );
}
