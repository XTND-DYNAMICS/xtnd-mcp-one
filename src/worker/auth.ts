/**
 * Worker Authentication Utilities
 *
 * API keys are bearer tokens. A key is valid when `apikey:<sha256 of the key>`
 * exists in mcp-one's own namespace (binding API_KEYS), written by
 * scripts/new-api-key.mjs. Nothing else authenticates: there is no
 * environment-variable fallback (xtnd-mcp-one#2).
 *
 * TRANSITION, xtnd-mcp-one#2 step 1: until step 2 removes it, by 20 Nov 2026 at
 * the latest, a key found in xtnd-xmail-api's namespace (binding XMAIL_KEYS) is
 * still accepted, and each such request is logged at warn level with the key's
 * name, never the key or its hash. Step 2 deletes the XMAIL_KEYS binding and the
 * branch below that reads it.
 */

import { WorkerEnv } from '../types.js';

export async function sha256Hex(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type AuthResult =
  | { authenticated: true; source: 'mcp-one' | 'xmail' }
  | { authenticated: false; error: string };

type AuthEnv = Pick<WorkerEnv, 'API_KEYS' | 'XMAIL_KEYS'>;

export async function authenticateRequest(
  request: Request,
  env: AuthEnv,
  log: Pick<Console, 'warn'> = console
): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing or malformed Authorization header. Expected Bearer token.' };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { authenticated: false, error: 'Empty bearer token.' };
  }

  const recordKey = `apikey:${await sha256Hex(token)}`;

  if ((await env.API_KEYS.get(recordKey)) !== null) {
    return { authenticated: true, source: 'mcp-one' };
  }

  // TRANSITION (xtnd-mcp-one#2): removed in step 2, by 20 Nov 2026.
  if (env.XMAIL_KEYS) {
    const record = await env.XMAIL_KEYS.get(recordKey);
    if (record !== null) {
      log.warn(`mcp-one: authenticated with an XMail key "${keyName(record)}"`);
      return { authenticated: true, source: 'xmail' };
    }
  }

  return { authenticated: false, error: 'Invalid API key.' };
}

/** The `name` of a stored key record, for logging. Never the key or its hash. */
export function keyName(record: string): string {
  let name: unknown;
  try {
    name = (JSON.parse(record) as { name?: unknown } | null)?.name;
  } catch {
    return '(unreadable record)';
  }
  if (typeof name !== 'string' || !name.trim()) return '(unnamed)';
  return name.replace(/[\u0000-\u001f\u007f"\\]/g, '?').slice(0, 100);
}
