import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Attempt to load local environment files if running locally in Node
try {
  dotenv.config();
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env.production.local' });
} catch {
  // Ignore in environments where filesystem is restricted
}

const isClean = (v) => Boolean(v && typeof v === 'string' && v.trim() && v.trim() !== '[SENSITIVE]');

export function getSupabaseConfig() {
  const urlCandidates = [
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    // Production Supabase URL fallback
    'https://olgfgsbrnrpbatjgdjfj.supabase.co'
  ];

  const serviceKeyCandidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
  ];

  const anonKeyCandidates = [
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ];

  const url = urlCandidates.find(isClean)?.trim() || '';
  const serviceRoleKey = serviceKeyCandidates.find(isClean)?.trim() || '';
  const anonKey = anonKeyCandidates.find(isClean)?.trim() || '';

  return { url, serviceRoleKey, anonKey };
}

let cachedAdmin = null;

/**
 * Returns a Supabase client.
 * 1. Uses serviceRoleKey if available (full admin bypass).
 * 2. If serviceRoleKey is missing, falls back to using the user's bearer token + anonKey.
 *    Since admin users satisfy is_admin() in Supabase RLS, this allows full administrative access.
 */
export function getSupabaseAdmin(reqOrToken) {
  const { url, serviceRoleKey, anonKey } = getSupabaseConfig();

  // 1. If serviceRoleKey is configured, return the privileged service client
  if (url && serviceRoleKey) {
    if (cachedAdmin && cachedAdmin.__url === url && cachedAdmin.__key === serviceRoleKey) {
      return cachedAdmin;
    }

    const client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    client.__url = url;
    client.__key = serviceRoleKey;
    cachedAdmin = client;

    return client;
  }

  // 2. Extract Bearer token if request or token was passed
  const token = typeof reqOrToken === 'string'
    ? reqOrToken.replace(/^Bearer\s+/i, '').trim()
    : (reqOrToken?.headers?.authorization || reqOrToken?.headers?.Authorization || '')
        .replace(/^Bearer\s+/i, '')
        .trim();

  // 3. Fallback: Authenticate with anonKey + admin's Bearer token
  if (url && (anonKey || serviceRoleKey) && token) {
    const key = anonKey || serviceRoleKey;
    return createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }

  // 4. Fallback: if only anonKey is available (for read operations permitted by RLS)
  if (url && anonKey) {
    return createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  if (!url) {
    throw new Error('Supabase URL is missing on the server. Please check VITE_SUPABASE_URL or SUPABASE_URL.');
  }

  throw new Error('Supabase server environment variables are missing: SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.');
}

export function getSupabaseAnonClient() {
  const { url, anonKey, serviceRoleKey } = getSupabaseConfig();
  const key = anonKey || serviceRoleKey;

  if (!url || !key) {
    throw new Error('Supabase environment variables are missing on the server: VITE_SUPABASE_ANON_KEY.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}
