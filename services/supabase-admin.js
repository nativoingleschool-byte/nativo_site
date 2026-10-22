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

const KNOWN_PROJECT_REF = 'olgfgsbrnrpbatjgdjfj';
const KNOWN_URL = 'https://olgfgsbrnrpbatjgdjfj.supabase.co';
const KNOWN_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sZ2Znc2JybnJwYmF0amdkamZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTQ5MTMsImV4cCI6MjA5NzQzMDkxM30.RA3TG_HjReuKQqLAEWBDH36esRb1vI6sXTkX8x5bj6c';

function parseJwtPayload(str) {
  if (!str || typeof str !== 'string') return null;
  const clean = str.trim().replace(/^["']|["']$/g, '');
  if (!clean.startsWith('eyJ') || clean.length < 50) return null;
  const parts = clean.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function isSupabaseServiceKey(str) {
  const payload = parseJwtPayload(str);
  return Boolean(
    payload &&
    payload.iss === 'supabase' &&
    payload.ref === KNOWN_PROJECT_REF &&
    payload.role === 'service_role'
  );
}

export function isSupabaseAnonKey(str) {
  const payload = parseJwtPayload(str);
  return Boolean(
    payload &&
    payload.iss === 'supabase' &&
    payload.ref === KNOWN_PROJECT_REF &&
    payload.role === 'anon'
  );
}

export function getSupabaseConfig() {
  const isCleanUrl = (u) => Boolean(
    u && typeof u === 'string' && u.includes(KNOWN_PROJECT_REF) && u.startsWith('http')
  );

  const urlCandidates = [
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    KNOWN_URL,
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
    KNOWN_ANON_KEY,
  ];

  const url = (urlCandidates.find(isCleanUrl) || KNOWN_URL).trim();
  const serviceRoleKey = (serviceKeyCandidates.find(isSupabaseServiceKey) || '').trim();
  const anonKey = (anonKeyCandidates.find(isSupabaseAnonKey) || KNOWN_ANON_KEY).trim();

  return { url, serviceRoleKey, anonKey };
}

let cachedAdmin = null;

/**
 * Returns a Supabase client.
 * 1. Uses serviceRoleKey if it is a verified, valid service_role key for this project.
 * 2. Otherwise falls back to the verified project anonKey + user's Bearer token.
 *    Since admin users satisfy is_admin() in Supabase RLS, this allows full administrative access.
 */
export function getSupabaseAdmin(reqOrToken) {
  const { url, serviceRoleKey, anonKey } = getSupabaseConfig();

  // 1. If a verified, valid serviceRoleKey for this project is present, use it
  if (serviceRoleKey) {
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

  // 3. Fallback: Authenticate with the verified project anonKey + admin's Bearer token
  if (token) {
    return createClient(url, anonKey, {
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

  // 4. Fallback client using verified project anonKey
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseAnonClient() {
  const { url, anonKey } = getSupabaseConfig();

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
    },
  });
}
