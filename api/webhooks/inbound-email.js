import { createClient } from '@supabase/supabase-js';
import { processStatementAndUpsert } from '../../services/bank/statement-service.js';

const getQueryParam = (req, key) => {
  if (req.query && req.query[key]) return req.query[key];
  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      return url.searchParams.get(key);
    } catch {
      // ignore
    }
  }
  return null;
};

const sendResponse = (res, status, body) => {
  if (typeof res.status === 'function') {
    return res.status(status).json(body);
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Supabase URL is missing from environment variables (SUPABASE_URL or VITE_SUPABASE_URL).');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('Supabase Service Role Key is missing from environment variables (SUPABASE_SERVICE_ROLE_KEY).');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendResponse(res, 405, { error: 'Method not allowed.' });
  }

  try {
    // 1. Security Verification: Compare query token with INBOUND_WEBHOOK_SECRET
    const token = getQueryParam(req, 'token');
    const secret = process.env.INBOUND_WEBHOOK_SECRET;

    if (secret) {
      if (!token || token.trim() !== secret.trim()) {
        return sendResponse(res, 401, { error: 'Unauthorized: Invalid or missing token.' });
      }
    } else {
      console.warn('[Inbound Webhook Warning]: INBOUND_WEBHOOK_SECRET is not configured on server. Rejecting request.');
      return sendResponse(res, 500, { error: 'Webhook authentication is not configured.' });
    }

    // 2. Parse request body if needed
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error('[Inbound Webhook Error]: Malformed JSON body in request', e);
        return sendResponse(res, 400, { error: 'Malformed JSON payload.' });
      }
    } else if (!body) {
      try {
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        const raw = Buffer.concat(buffers).toString('utf-8');
        if (raw) {
          body = JSON.parse(raw);
        }
      } catch (e) {
        console.error('[Inbound Webhook Error]: Failed to read stream body', e);
      }
    }

    // 3. Payload & Attachment Field Normalization (Postmark Schema)
    const attachments = body?.Attachments || body?.attachments || req.body?.Attachments || req.body?.attachments || [];

    if (!Array.isArray(attachments) || attachments.length === 0) {
      return sendResponse(res, 200, { message: "No statement attachment found in email" });
    }

    // Check filename (.ofx or .csv)
    const statement = attachments.find(att => {
      const name = (att?.Name || att?.name || '').toLowerCase();
      const ct = (att?.ContentType || att?.contentType || '').toLowerCase();
      return name.endsWith('.ofx') || name.endsWith('.csv') || ct.includes('ofx') || ct.includes('csv');
    });

    if (!statement) {
      return sendResponse(res, 200, { message: "No statement attachment found in email" });
    }

    const base64Content = statement.Content || statement.content;
    if (!base64Content) {
      return sendResponse(res, 200, { message: "No statement attachment found in email" });
    }

    // 4. Base64 Decoding & Processing
    const filename = statement.Name || statement.name || 'extrato.ofx';
    const fileContent = Buffer.from(base64Content, 'base64').toString('utf-8');

    // 5. Database Client & Permissions: Ensure Supabase Admin/Service Role client is used
    const supabaseAdmin = getSupabaseAdmin();
    const result = await processStatementAndUpsert(supabaseAdmin, fileContent, filename);

    return sendResponse(res, 200, {
      success: true,
      processed: result.count || 0,
      message: `Successfully processed ${result.count || 0} transactions from ${filename}`
    });

  } catch (err) {
    console.error('[Inbound Webhook Error]:', err);
    return sendResponse(res, 500, { error: err.message });
  }
}
