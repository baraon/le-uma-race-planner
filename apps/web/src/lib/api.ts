import {
  createdInviteSchema,
  eventSchema,
  groupDetailSchema,
  groupSummarySchema,
  healthResponseSchema,
  invitePreviewSchema,
  inviteSchema,
  meSchema,
  type CreateInvite,
  type EventInput,
  type HealthResponse,
  type Me,
  type Permissions,
  type UpdateMe,
} from '@lmu/shared';
import { z } from 'zod';

/** A non-2xx reply from our API, carrying the server's message for display. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls our own API (same origin, session cookie) and parses the JSON reply. */
async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  parse: (data: unknown) => T,
  body?: unknown,
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
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new ApiError(res.status, typeof message === 'string' ? message : res.statusText);
  }
  return parse(data);
}

const ignore = () => undefined;
const parseWith =
  <S extends z.ZodTypeAny>(schema: S) =>
  (d: unknown): z.output<S> =>
    schema.parse(d);

export const getHealth = (): Promise<HealthResponse> =>
  request('GET', '/api/health', parseWith(healthResponseSchema)).catch((err: unknown) => {
    // A 503 still has a body worth showing ("db": "down").
    if (err instanceof ApiError) return { status: 'ok', db: 'down', version: '?' } as const;
    throw err;
  });

/** The signed-in user, or null when signed out. */
export const getMe = (): Promise<Me | null> =>
  request('GET', '/api/me', parseWith(meSchema)).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  });

export const updateMe = (patch: UpdateMe) =>
  request('PATCH', '/api/me', parseWith(meSchema), patch);
export const logout = () => request('POST', '/auth/logout', ignore);

// Groups
export const getGroups = () =>
  request('GET', '/api/groups', parseWith(z.array(groupSummarySchema)));
export const getGroup = (id: string) =>
  request('GET', `/api/groups/${id}`, parseWith(groupDetailSchema));
export const createGroup = (name: string) =>
  request('POST', '/api/groups', parseWith(groupDetailSchema), { name });
export const deleteGroup = (id: string) => request('DELETE', `/api/groups/${id}`, ignore);
export const leaveGroup = (id: string) => request('POST', `/api/groups/${id}/leave`, ignore);
export const setPermissions = (groupId: string, userId: string, permissions: Permissions) =>
  request(
    'PUT',
    `/api/groups/${groupId}/members/${userId}/permissions`,
    parseWith(groupDetailSchema),
    permissions,
  );
export const removeMember = (groupId: string, userId: string) =>
  request('DELETE', `/api/groups/${groupId}/members/${userId}`, ignore);

// Invites
export const getInvites = (groupId: string) =>
  request('GET', `/api/groups/${groupId}/invites`, parseWith(z.array(inviteSchema)));
export const createInvite = (groupId: string, input: CreateInvite) =>
  request('POST', `/api/groups/${groupId}/invites`, parseWith(createdInviteSchema), input);
export const revokeInvite = (groupId: string, inviteId: string) =>
  request('DELETE', `/api/groups/${groupId}/invites/${inviteId}`, ignore);
export const getInvitePreview = (token: string) =>
  request('GET', `/api/invites/${encodeURIComponent(token)}`, parseWith(invitePreviewSchema));
export const acceptInvite = (token: string) =>
  request(
    'POST',
    `/api/invites/${encodeURIComponent(token)}/accept`,
    parseWith(z.object({ groupId: z.string() })),
  );

// Teams
export const createTeam = (groupId: string, name: string) =>
  request('POST', `/api/groups/${groupId}/teams`, parseWith(groupDetailSchema), { name });
export const renameTeam = (teamId: string, name: string) =>
  request('PATCH', `/api/teams/${teamId}`, parseWith(groupDetailSchema), { name });
export const deleteTeam = (teamId: string) => request('DELETE', `/api/teams/${teamId}`, ignore);
export const joinTeam = (teamId: string) =>
  request('POST', `/api/teams/${teamId}/join`, parseWith(groupDetailSchema));
export const leaveTeam = (teamId: string) =>
  request('POST', `/api/teams/${teamId}/leave`, parseWith(groupDetailSchema));

// Events
export const getUpcomingEvents = () =>
  request('GET', '/api/events/upcoming', parseWith(z.array(eventSchema)));
export const getGroupEvents = (groupId: string) =>
  request('GET', `/api/groups/${groupId}/events`, parseWith(z.array(eventSchema)));
export const getEvent = (id: string) => request('GET', `/api/events/${id}`, parseWith(eventSchema));
export const createEvent = (teamId: string, input: EventInput) =>
  request('POST', `/api/teams/${teamId}/events`, parseWith(eventSchema), input);
export const updateEvent = (id: string, input: EventInput) =>
  request('PUT', `/api/events/${id}`, parseWith(eventSchema), input);
export const deleteEvent = (id: string) => request('DELETE', `/api/events/${id}`, ignore);
