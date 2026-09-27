// SMS delivery. Real SMS only when Twilio is configured in .env.local:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (a Twilio phone number)
// Without them, messages are recorded as "simulated" and delivered in-app only.

export function smsProvider() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
  return TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM ? 'twilio' : null;
}

/**
 * The real phone number for a student. Demo students have placeholder numbers (+91 90000 0000x); real numbers
 * come from the DEMO_PHONES environment variable (kept out of the code), e.g.
 *   DEMO_PHONES=hitesh:+91XXXXXXXXXX,ananya:+91XXXXXXXXXX
 */
export function phoneFor(student) {
  const map = Object.fromEntries(
    String(process.env.DEMO_PHONES || '')
      .split(',')
      .map((pair) => pair.split(':').map((s) => s.trim()))
      .filter(([id, num]) => id && num),
  );
  return map[student.id] || student.phone;
}

/** The seed's fake numbers must never be sent to Twilio. */
export function isPlaceholder(phone) {
  return /^91900000000\d$/.test(String(phone).replace(/\D/g, ''));
}

/** Indian 10-digit numbers get +91; anything else must already be in +countrycode form. */
export function e164(phone) {
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export async function sendSms(to, body) {
  if (smsProvider() !== 'twilio') return { status: 'simulated' };
  if (isPlaceholder(to)) return { status: 'skipped', error: 'Demo placeholder number (add a real one in DEMO_PHONES)' };
  to = e164(to);
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to.replace(/\s+/g, ''), From: from, Body: body }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { status: 'sent', id: json.sid } : { status: 'failed', error: json.message || `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

/** "+919876543210" → "+91 ••••••3210" (enough to recognise, without exposing the number). */
export function maskPhone(phone) {
  const n = e164(phone);
  const m = /^(\+91|\+\d{1,3})(\d+)(\d{4})$/.exec(n);
  return m ? `${m[1]} ${'•'.repeat(m[2].length)}${m[3]}` : n;
}

// ---------------------------------------------------------------- delivery status + WhatsApp

function twilioAuth() {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token } = process.env;
  return { sid, header: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` };
}

/**
 * "sent" only means Twilio accepted the message. This asks Twilio what happened next:
 * queued / sent / delivered / undelivered / failed, plus the error code when the carrier refused it.
 */
export async function checkMessage(messageSid) {
  if (!messageSid || smsProvider() !== 'twilio') return null;
  const { sid, header } = twilioAuth();
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${messageSid}.json`, {
      headers: { Authorization: header },
      signal: AbortSignal.timeout(10_000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return { status: j.status, errorCode: j.error_code || null, error: j.error_message || null };
  } catch {
    return null;
  }
}

/**
 * WhatsApp through Twilio (optional). Set TWILIO_WHATSAPP_FROM, e.g. the free sandbox number
 * whatsapp:+14155238886 (the recipient first sends the sandbox "join <code>" message to that number once).
 * WhatsApp is far more reliable than international SMS for Indian numbers.
 */
export function whatsappProvider() {
  return smsProvider() === 'twilio' && process.env.TWILIO_WHATSAPP_FROM ? 'twilio-whatsapp' : null;
}

export async function sendWhatsApp(to, body) {
  if (!whatsappProvider()) return { status: 'off' };
  if (isPlaceholder(to)) return { status: 'skipped', error: 'Demo placeholder number (add a real one in DEMO_PHONES)' };
  const { sid, header } = twilioAuth();
  const from = process.env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:') ? process.env.TWILIO_WHATSAPP_FROM : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: header, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: `whatsapp:${e164(to)}`, From: from, Body: body }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { status: 'sent', id: json.sid } : { status: 'failed', error: json.message || `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

/** Plain-language reason for Twilio delivery error codes (shown on the Notify page). */
export function deliveryHint(code) {
  const hints = {
    30003: 'The phone was unreachable (switched off or no signal). Try again later.',
    30004: 'The number blocked the message.',
    30005: 'Unknown number. Check DEMO_PHONES.',
    30006: 'The carrier cannot receive SMS on this number (landline or unsupported).',
    30007: 'Filtered by the Indian carrier: SMS from international numbers without Indian DLT registration are often blocked. Use WhatsApp (TWILIO_WHATSAPP_FROM) for the demo.',
    30008: 'The carrier reported an unknown error. Indian carriers often drop international SMS; WhatsApp is more reliable.',
    30034: 'The sender number is not registered for this route.',
    21408: 'SMS to India is not enabled: Twilio console → Messaging → Settings → Geo permissions → India.',
    21608: 'Trial account: verify this number in Twilio → Phone Numbers → Verified Caller IDs.',
    63015: 'WhatsApp sandbox: the phone must first send "join <your-sandbox-code>" to +1 415 523 8886 on WhatsApp.',
    63016: 'WhatsApp: outside the 24-hour window. Send any message to the sandbox number from the phone, then retry.',
  };
  return hints[Number(code)] || '';
}
