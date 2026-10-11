import {
  healthResponseSchema,
  meSchema,
  type HealthResponse,
  type Me,
  type UpdateMe,
} from '@lmu/shared';

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

/** Send a JSON body (or nothing) to our API; throws on any non-2xx response. */
export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  parse: (data: unknown) => T,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return parse(res.status === 204 ? null : await res.json());
}

export const getHealth = (): Promise<HealthResponse> =>
  apiGet('/api/health', (d) => healthResponseSchema.parse(d));

/** The signed-in user, or null when signed out. */
export async function getMe(): Promise<Me | null> {
  const res = await fetch('/api/me', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return meSchema.parse(await res.json());
}

export const updateMe = (patch: UpdateMe): Promise<Me> =>
  apiSend('PATCH', '/api/me', patch, (d) => meSchema.parse(d));

export const logout = (): Promise<void> => apiSend('POST', '/auth/logout', undefined, () => {});
