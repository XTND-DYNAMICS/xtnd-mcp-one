/**
 * Worker Authentication Utilities
 */

import { WorkerEnv } from '../types.js';

export async function sha256Hex(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function authenticateRequest(
  request: Request,
  env: WorkerEnv
): Promise<{ authenticated: boolean; error?: string }> {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing or malformed Authorization header. Expected Bearer token.' };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { authenticated: false, error: 'Empty bearer token.' };
  }

  const tokenHash = await sha256Hex(token);

  // 1. Check KV store for apikey:<hash>
  if (env.KV) {
    const record = await env.KV.get(`apikey:${tokenHash}`);
    if (record !== null) {
      return { authenticated: true };
    }
  }

  // 2. Check API_KEYS_SHA256 env variable fallback
  if (env.API_KEYS_SHA256) {
    const allowedHashes = env.API_KEYS_SHA256.split(',').map((h) => h.trim().toLowerCase());
    if (allowedHashes.includes(tokenHash.toLowerCase())) {
      return { authenticated: true };
    }
  }

  return { authenticated: false, error: 'Invalid API key.' };
}
