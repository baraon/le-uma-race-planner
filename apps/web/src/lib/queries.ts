/** TanStack Query hooks for groups, teams, invites and events. */
import type { GroupDetail } from '@le-uma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

export const keys = {
  groups: ['groups'] as const,
  group: (id: string) => ['group', id] as const,
  groupEvents: (id: string) => ['group', id, 'events'] as const,
  invites: (id: string) => ['group', id, 'invites'] as const,
  upcoming: ['events', 'upcoming'] as const,
  event: (id: string) => ['event', id] as const,
  availability: (eventId: string) => ['event', eventId, 'availability'] as const,
  pace: (eventId: string) => ['event', eventId, 'pace'] as const,
};

export const useGroups = () => useQuery({ queryKey: keys.groups, queryFn: api.getGroups });
export const useGroup = (id: string | undefined) =>
  useQuery({ queryKey: keys.group(id ?? ''), queryFn: () => api.getGroup(id!), enabled: !!id });
export const useGroupEvents = (id: string) =>
  useQuery({ queryKey: keys.groupEvents(id), queryFn: () => api.getGroupEvents(id) });
export const useUpcomingEvents = () =>
  useQuery({ queryKey: keys.upcoming, queryFn: api.getUpcomingEvents });
export const useEvent = (id: string) =>
  useQuery({ queryKey: keys.event(id), queryFn: () => api.getEvent(id) });
export const useAvailability = (eventId: string) =>
  useQuery({ queryKey: keys.availability(eventId), queryFn: () => api.getAvailability(eventId) });
export const usePace = (eventId: string) =>
  useQuery({ queryKey: keys.pace(eventId), queryFn: () => api.getPace(eventId) });
export const useInvites = (groupId: string, enabled: boolean) =>
  useQuery({ queryKey: keys.invites(groupId), queryFn: () => api.getInvites(groupId), enabled });

/**
 * A mutation on a group whose reply is the fresh group detail (or nothing): stores the detail,
 * and refreshes lists that might show the change.
 */
export function useGroupMutation<V>(groupId: string, fn: (vars: V) => Promise<GroupDetail | void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (detail) => {
      if (detail) qc.setQueryData(keys.group(groupId), detail);
      else await qc.invalidateQueries({ queryKey: keys.group(groupId) });
      await qc.invalidateQueries({ queryKey: keys.groups });
      await qc.invalidateQueries({ queryKey: keys.upcoming });
    },
  });
}

/** After creating, editing or deleting an event: refresh every list that shows events. */
export function useInvalidateEvents() {
  const qc = useQueryClient();
  return async (groupId: string, eventId?: string) => {
    await qc.invalidateQueries({ queryKey: keys.upcoming });
    await qc.invalidateQueries({ queryKey: keys.groupEvents(groupId) });
    if (eventId) await qc.invalidateQueries({ queryKey: keys.event(eventId) });
  };
}
