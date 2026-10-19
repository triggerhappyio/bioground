// Is the new-booking staff email alert wired up? Checked server-side so the
// admin can warn staff when bookings are saving but nobody is being emailed.
export const EMAIL_ALERT_VARS = ["RESEND_API_KEY", "EMAIL_FROM", "BOOKING_NOTIFY_EMAIL"] as const;

export function emailAlertStatus(env: Record<string, string | undefined> = process.env): {
  active: boolean;
  missing: string[];
} {
  const missing = EMAIL_ALERT_VARS.filter((k) => !(env[k] || "").trim());
  return { active: missing.length === 0, missing };
}
