import { createClient } from '@supabase/supabase-js';
import { processStatementAndUpsert } from '../../services/bank/statement-service.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  try {
    // 1. Security Verification: Compare query token with INBOUND_WEBHOOK_SECRET
    const token = getQueryParam(req, 'token');
    const secret = process.env.INBOUND_WEBHOOK_SECRET;

    if (!secret || !token || token !== secret) {
      return json(res, 401, { error: 'Unauthorized: Invalid or missing token.' });
    }

    // 2. Attachment Extraction (Postmark Schema)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return json(res, 400, { error: 'Invalid JSON body.' });
      }
    }

    const attachments = Array.isArray(body?.Attachments) ? body.Attachments : [];
    const statementAttachments = attachments.filter(att => {
      const name = String(att?.Name || '').toLowerCase();
      const ct = String(att?.ContentType || '').toLowerCase();
      return name.endsWith('.ofx') || name.endsWith('.csv') || ct.includes('ofx') || ct.includes('csv');
    });

    if (statementAttachments.length === 0) {
      return json(res, 200, { message: 'No statement attachment found' });
    }

    // 3. Process each statement attachment through shared pipeline
    const supabaseAdmin = getSupabaseAdmin();
    let totalProcessed = 0;

    for (const attachment of statementAttachments) {
      if (!attachment?.Content) continue;

      // Decode base64 content
      const fileContent = Buffer.from(attachment.Content, 'base64').toString('utf-8');
      const filename = attachment.Name || 'inbound-statement.ofx';

      const result = await processStatementAndUpsert(supabaseAdmin, fileContent, filename);
      totalProcessed += (result.count || 0);
    }

    // 4. Return Response
    return json(res, 200, {
      success: true,
      processed: totalProcessed
    });

  } catch (error) {
    console.error('Error processing Postmark inbound webhook:', error);
    return json(res, 500, { error: error.message || 'Internal server error' });
  }
}
