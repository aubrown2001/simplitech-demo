/**
 * SimpliTech Partners demo — single service.
 *
 * Serves the website (public/) AND the two API routes it calls
 * (/api/sms, /api/whatsapp) from the same URL, so the browser calls are
 * same-origin — no CORS setup needed. Deploy this whole folder as one
 * Render Web Service and you get one link that both shows the page and
 * actually sends messages through Infobip.
 */
require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY; // e.g. "App 93965bba...898f"
const SMS_BASE_URL = process.env.INFOBIP_SMS_URL || 'https://rk8yye.api.infobip.com/sms/3/messages';
const WHATSAPP_BASE_URL = process.env.INFOBIP_WHATSAPP_URL || 'https://rk8yye.api.infobip.com/whatsapp/1/message/text';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || ''; // optional, leave blank to omit
const WHATSAPP_SENDER = process.env.WHATSAPP_SENDER || '447860099299';

function infobipHeaders() {
  return {
    Authorization: INFOBIP_API_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Infobip normally replies with JSON, but any intermediary in front of it
// (proxy, gateway timeout page, etc.) can return plain text/HTML instead.
// Parse defensively so that never crashes the request.
async function safeReadJson(res) {
  const raw = await res.text();
  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    return { data: null, raw };
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(INFOBIP_API_KEY) });
});

app.post('/api/sms', async (req, res) => {
  const { to, text } = req.body || {};
  if (!isNonEmptyString(to) || !isNonEmptyString(text)) {
    return res.status(400).json({ error: 'Both "to" and "text" are required.' });
  }
  if (!INFOBIP_API_KEY) {
    return res.status(500).json({ error: 'Server is missing INFOBIP_API_KEY — set it in the Render dashboard under Environment.' });
  }

  // Some Infobip accounts validate this endpoint against the newer unified
  // "Messages API" shape, which wants the text wrapped in "content" rather
  // than as a bare "text" field. Sending it in every shape Infobip's SMS
  // API has used avoids guessing wrong twice.
  const message = {
    destinations: [{ to: to.replace(/[^\d+]/g, '') }],
    text,
    content: { text, body: { text } },
  };
  if (SMS_SENDER_ID) message.from = SMS_SENDER_ID;

  try {
    const infobipRes = await fetch(SMS_BASE_URL, {
      method: 'POST',
      headers: infobipHeaders(),
      body: JSON.stringify({ messages: [message] }),
    });
    const { data, raw } = await safeReadJson(infobipRes);
    if (!infobipRes.ok || !data) {
      console.error('Infobip rejected the request:', infobipRes.status, raw);
      return res.status(infobipRes.status || 502).json({
        error: data?.requestError?.serviceException?.text || 'Infobip rejected the request.',
        details: data || raw,
      });
    }
    res.json({ ok: true, infobip: data });
  } catch (err) {
    console.error('SMS send failed:', err);
    res.status(502).json({ error: 'Could not reach Infobip.' });
  }
});

app.post('/api/whatsapp', async (req, res) => {
  const { to, text } = req.body || {};
  if (!isNonEmptyString(to) || !isNonEmptyString(text)) {
    return res.status(400).json({ error: 'Both "to" and "text" are required.' });
  }
  if (!INFOBIP_API_KEY) {
    return res.status(500).json({ error: 'Server is missing INFOBIP_API_KEY — set it in the Render dashboard under Environment.' });
  }

  const body = {
    from: WHATSAPP_SENDER,
    to: to.replace(/[^\d+]/g, ''),
    content: { text },
  };

  try {
    const infobipRes = await fetch(WHATSAPP_BASE_URL, {
      method: 'POST',
      headers: infobipHeaders(),
      body: JSON.stringify(body),
    });
    const { data, raw } = await safeReadJson(infobipRes);
    if (!infobipRes.ok || !data) {
      console.error('Infobip rejected the request:', infobipRes.status, raw);
      return res.status(infobipRes.status || 502).json({
        error: data?.requestError?.serviceException?.text || 'Infobip rejected the request.',
        details: data || raw,
      });
    }
    res.json({ ok: true, infobip: data });
  } catch (err) {
    console.error('WhatsApp send failed:', err);
    res.status(502).json({ error: 'Could not reach Infobip.' });
  }
});

app.listen(PORT, () => {
  console.log(`SimpliTech demo listening on port ${PORT}`);
  if (!INFOBIP_API_KEY) {
    console.warn('WARNING: INFOBIP_API_KEY is not set.');
  }
});
