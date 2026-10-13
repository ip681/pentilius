'use client';

import type { SupportCategoryValue, SupportTicketDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ApiError, createSupportTicket, getSupportTickets, markSupportTicketRead, replySupportTicket } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-datetime';
import { notifyNotificationsChanged } from '@/lib/notifications-events';

const CATEGORIES: SupportCategoryValue[] = ['IDEA', 'BUG', 'QUESTION', 'OTHER'];
const MAX_LENGTH = 2000;

/**
 * "Contact the team" in Settings (owner decision, 2026-10-13): a new message
 * (idea / bug / question / other) and the player's own conversations. Staff
 * replies show as "the Pentilius team" — anonymous for now.
 */
export function SupportSection() {
  const t = useTranslations();
  const [tickets, setTickets] = useState<SupportTicketDto[] | null>(null);
  const [category, setCategory] = useState<SupportCategoryValue>('IDEA');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  function load() {
    getSupportTickets()
      .then(setTickets)
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
  }, []);

  function errorText(err: unknown): string {
    const code = err instanceof ApiError ? err.code : null;
    if (code === 'SUPPORT_DAILY_LIMIT') return t('support.errorDailyLimit');
    if (code === 'SUPPORT_OPEN_LIMIT') return t('support.errorOpenLimit');
    if (code === 'SUPPORT_WAIT_FOR_REPLY') return t('support.errorWaitForReply');
    if (code === 'TICKET_CLOSED') return t('support.errorClosed');
    return t('support.errorGeneric');
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      setTickets(await createSupportTicket(category, text));
      setText('');
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  async function handleToggle(ticket: SupportTicketDto) {
    const next = openId === ticket.id ? null : ticket.id;
    setOpenId(next);
    if (next && ticket.unread) {
      await markSupportTicketRead(ticket.id).catch(() => undefined);
      setTickets((list) => list?.map((item) => (item.id === ticket.id ? { ...item, unread: false } : item)) ?? null);
      notifyNotificationsChanged();
    }
  }

  return (
    <section id="support">
      <h2 className="mb-1 text-sm font-semibold">{t('support.title')}</h2>
      <p className="mb-3 text-xs text-textMuted">{t('support.intro')}</p>

      <form onSubmit={handleSend} className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={`rounded-md border px-2.5 py-1 text-[11px] ${category === value ? 'border-accent bg-accentBg text-text' : 'border-wellBorder text-textMuted hover:bg-accentBgHover'}`}
            >
              {t(`support.categories.${value}`)}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          rows={4}
          placeholder={t('support.placeholder')}
          className="w-full resize-y rounded-md border border-wellBorder bg-well px-3 py-2 text-xs outline-none focus:border-accent"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] tabular-nums text-textFaint">
            {text.length}/{MAX_LENGTH}
          </span>
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="rounded-md border border-accent bg-accentBg px-4 py-1.5 text-xs uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t('support.send')}
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {sent && <p className="text-xs text-positive">{t('support.sent')}</p>}
      </form>

      {tickets && tickets.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[11px] uppercase tracking-wide text-textFaint">{t('support.myMessages')}</h3>
          <div className="flex flex-col gap-2">
            {tickets.map((ticket) => (
              <TicketItem
                key={ticket.id}
                ticket={ticket}
                open={openId === ticket.id}
                onToggle={() => handleToggle(ticket)}
                onReplied={setTickets}
                errorText={errorText}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TicketItem({
  ticket,
  open,
  onToggle,
  onReplied,
  errorText,
}: {
  ticket: SupportTicketDto;
  open: boolean;
  onToggle: () => void;
  onReplied: (tickets: SupportTicketDto[]) => void;
  errorText: (err: unknown) => string;
}) {
  const t = useTranslations();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = ticket.messages[0]?.text ?? '';

  async function handleReply(event: React.FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      onReplied(await replySupportTicket(ticket.id, reply));
      setReply('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-md border border-wellBorder bg-well">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
        {ticket.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />}
        <span className="shrink-0 text-textFaint">{t(`support.categories.${ticket.category}`)}</span>
        <span className="min-w-0 flex-1 truncate">{first}</span>
        <span className={`shrink-0 text-[10px] uppercase ${ticket.status === 'ANSWERED' ? 'text-positive' : 'text-textFaint'}`}>{t(`support.status.${ticket.status}`)}</span>
      </button>
      {open && (
        <div className="border-t border-wellBorder px-3 py-2">
          <div className="flex flex-col gap-2">
            {ticket.messages.map((message) => (
              <div key={message.id} className={`rounded-md px-2.5 py-1.5 text-xs ${message.fromStaff ? 'border border-accent/40 bg-accentBg' : 'bg-panel'}`}>
                <div className="mb-0.5 flex justify-between gap-2 text-[10px] text-textFaint">
                  <span className={message.fromStaff ? 'font-semibold text-text' : ''}>{message.fromStaff ? t('support.team') : t('support.you')}</span>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-textMuted">{message.text}</p>
              </div>
            ))}
          </div>
          {ticket.status === 'CLOSED' ? (
            <p className="mt-2 text-[11px] text-textFaint">{t('support.closedNote')}</p>
          ) : (
            <form onSubmit={handleReply} className="mt-2 flex flex-col gap-1.5">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value.slice(0, MAX_LENGTH))}
                rows={2}
                placeholder={t('support.replyPlaceholder')}
                className="w-full resize-y rounded-md border border-wellBorder bg-panel px-3 py-2 text-xs outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="self-end rounded-md border border-accent bg-accentBg px-3 py-1 text-[11px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t('support.reply')}
              </button>
              {error && <p className="text-xs text-danger">{error}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
