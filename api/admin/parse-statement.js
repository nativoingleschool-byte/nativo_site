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

const assertAdmin = async (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing bearer token.');

  const adminClient = getSupabaseAdmin();
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !user) throw new Error('Session could not be verified.');

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    throw new Error('Only admin users can perform this action.');
  }

  return adminClient;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const supabaseAdmin = await assertAdmin(req);

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return json(res, 400, { error: 'Invalid JSON body.' });
      }
    }

    const { file_content, filename } = body || {};
    if (!file_content || typeof file_content !== 'string') {
      return json(res, 400, { error: 'file_content is required as a string.' });
    }

    const result = await processStatementAndUpsert(supabaseAdmin, file_content, filename);
    return json(res, 200, result);

  } catch (error) {
    console.error('Error in parse-statement:', error);
    return json(res, 500, { error: error.message || 'Internal server error' });
  }
}
