// Transactional email via Resend. Never claims success it didn't get:
// sendEmail() reports `sent: true` only after Resend accepts the message.
// Email is best-effort here — a failed alert never fails a saved booking.
import { Resend } from "resend";

export type EmailMessage = { to: string; subject: string; text: string };

let resendClient: Resend | null = null;
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  const from = process.env.EMAIL_FROM;
  if (!resend || !from) {
    const reason = "No email provider configured (RESEND_API_KEY / EMAIL_FROM missing)";
    if (process.env.NODE_ENV === "production") console.error(`[email] ${reason} — "${message.subject}" NOT sent.`);
    else console.log(`[email] (dev) would send to ${message.to}: "${message.subject}"`);
    return { sent: false, error: reason };
  }
  try {
    const result = await resend.emails.send({ from, to: message.to, subject: message.subject, text: message.text });
    if (result.error) return { sent: false, error: result.error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: String(e) };
  }
}

// Staff alert for a new foot-check booking. Deliberately carries NO
// self-check / health details — staff open the booking in /admin instead.
export function bookingStaffNotificationEmail(params: {
  to: string;
  code: string;
  storeName: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  returning: boolean;
  adminUrl: string;
}): EmailMessage {
  return {
    to: params.to,
    subject: `New foot-check booking ${params.code} — ${params.storeName} ${params.date} ${params.time}`,
    text:
      `${params.returning ? "Returning customer (already wearing Arch Built-in)" : "New customer"}\n\n` +
      `${params.name} · ${params.phone}\n${params.storeName}, ${params.date} at ${params.time}\n\n` +
      `Confirm with the customer by their chosen contact method, then open the booking:\n${params.adminUrl}`
  };
}
