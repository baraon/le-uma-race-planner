import { healthResponseSchema, type HealthResponse } from '@lmu/shared';

/** Fetch JSON from our own API (same origin), sending the session cookie. */
export async function apiGet<T>(path: string, parse: (data: unknown) => T): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok && data === null) throw new Error(`${res.status} ${res.statusText}`);
  return parse(data);
}

export const getHealth = (): Promise<HealthResponse> =>
  apiGet('/api/health', (d) => healthResponseSchema.parse(d));
