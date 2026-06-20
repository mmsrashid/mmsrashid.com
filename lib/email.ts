import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import { simpleParser } from 'mailparser'

const IMAP_CONFIG = {
  host: process.env.ZOHO_IMAP_HOST || 'imappro.zoho.eu',
  port: 993,
  secure: true,
  auth: {
    user: process.env.ZOHO_EMAIL!,
    pass: process.env.ZOHO_APP_PASSWORD!,
  },
  logger: false as const,
}

const SMTP_CONFIG = {
  host: process.env.ZOHO_SMTP_HOST || 'smtppro.zoho.eu',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_EMAIL!,
    pass: process.env.ZOHO_APP_PASSWORD!,
  },
}

export interface EmailMessage {
  uid: number
  messageId: string
  from: string
  fromName: string
  to: string
  subject: string
  date: string
  preview: string
  seen: boolean
  hasAttachment: boolean
}

export interface EmailDetail extends EmailMessage {
  html: string | null
  text: string | null
  replyTo: string
  inReplyTo: string | null
  references: string | null
}

export async function listMessages(folder = 'INBOX', limit = 50): Promise<EmailMessage[]> {
  const client = new ImapFlow(IMAP_CONFIG)
  await client.connect()

  const messages: EmailMessage[] = []

  try {
    await client.mailboxOpen(folder)
    const lock = await client.getMailboxLock(folder)

    try {
      // Fetch latest messages descending
      const status = await client.status(folder, { messages: true })
      const total = status.messages || 0
      if (total === 0) return []

      const start = Math.max(1, total - limit + 1)
      const range = `${start}:*`

      for await (const msg of client.fetch(range, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        bodyParts: ['1'],
      })) {
        const from = msg.envelope.from?.[0]
        const fromStr = from
          ? `${from.name || ''} <${from.mailbox}@${from.host}>`
          : 'Unknown'
        const fromName = from?.name || `${from?.mailbox}@${from?.host}` || 'Unknown'

        // Get plain text preview from body part 1
        let preview = ''
        try {
          const part = msg.bodyParts?.get('1')
          if (part) {
            preview = Buffer.from(part as Buffer).toString('utf-8').slice(0, 200).replace(/\s+/g, ' ').trim()
          }
        } catch {}

        const hasAttachment = msg.bodyStructure?.childNodes?.some(
          (n: { type: string }) => n.type === 'attachment'
        ) || false

        messages.push({
          uid: msg.uid,
          messageId: msg.envelope.messageId || String(msg.uid),
          from: fromStr,
          fromName,
          to: msg.envelope.to?.[0]
            ? `${msg.envelope.to[0].mailbox}@${msg.envelope.to[0].host}`
            : '',
          subject: msg.envelope.subject || '(no subject)',
          date: msg.envelope.date?.toISOString() || new Date().toISOString(),
          preview,
          seen: msg.flags.has('\\Seen'),
          hasAttachment,
        })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }

  return messages.reverse()
}

export async function getMessage(uid: number, folder = 'INBOX'): Promise<EmailDetail | null> {
  const client = new ImapFlow(IMAP_CONFIG)
  await client.connect()

  try {
    await client.mailboxOpen(folder)
    const lock = await client.getMailboxLock(folder)

    try {
      const msg = await client.fetchOne(String(uid), {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
      }, { uid: true })

      if (!msg) return null

      // Mark as read
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })

      const parsed = await simpleParser(msg.source as Buffer)

      const from = msg.envelope.from?.[0]
      const fromStr = from
        ? `${from.name || ''} <${from.mailbox}@${from.host}>`
        : 'Unknown'
      const fromName = from?.name || `${from?.mailbox}@${from?.host}` || 'Unknown'

      return {
        uid: msg.uid,
        messageId: msg.envelope.messageId || String(msg.uid),
        from: fromStr,
        fromName,
        to: msg.envelope.to?.[0]
          ? `${msg.envelope.to[0].mailbox}@${msg.envelope.to[0].host}`
          : '',
        subject: msg.envelope.subject || '(no subject)',
        date: msg.envelope.date?.toISOString() || new Date().toISOString(),
        preview: (parsed.text || '').slice(0, 200),
        seen: true,
        hasAttachment: (parsed.attachments || []).length > 0,
        html: parsed.html || null,
        text: parsed.text || null,
        replyTo: fromStr,
        inReplyTo: msg.envelope.inReplyTo || null,
        references: parsed.references
          ? Array.isArray(parsed.references) ? parsed.references.join(' ') : parsed.references
          : null,
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
}

export async function archiveMessage(uid: number): Promise<void> {
  const client = new ImapFlow(IMAP_CONFIG)
  await client.connect()
  try {
    await client.mailboxOpen('INBOX')
    const lock = await client.getMailboxLock('INBOX')
    try {
      await client.messageMove(String(uid), 'Archive', { uid: true })
    } catch {
      // If Archive doesn't exist, just flag as archived
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
}

export async function deleteMessage(uid: number): Promise<void> {
  const client = new ImapFlow(IMAP_CONFIG)
  await client.connect()
  try {
    await client.mailboxOpen('INBOX')
    const lock = await client.getMailboxLock('INBOX')
    try {
      await client.messageMove(String(uid), 'Trash', { uid: true })
    } catch {
      await client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true })
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
}

export async function sendEmail(opts: {
  to: string
  subject: string
  text: string
  html?: string
  inReplyTo?: string
  references?: string
}): Promise<void> {
  const transporter = nodemailer.createTransport(SMTP_CONFIG)
  await transporter.sendMail({
    from: `Mohammed Rashid <${process.env.ZOHO_EMAIL}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html || opts.text.replace(/\n/g, '<br>'),
    ...(opts.inReplyTo ? { inReplyTo: opts.inReplyTo } : {}),
    ...(opts.references ? { references: opts.references } : {}),
  })
}
