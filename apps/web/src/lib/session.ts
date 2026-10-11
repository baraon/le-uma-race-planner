import { detectTimeZone, type Me } from '@lmu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getMe, logout, updateMe } from './api';

const meKey = ['me'] as const;

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: getMe, staleTime: 5 * 60_000 });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: (me) => qc.setQueryData<Me | null>(meKey, me),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => qc.setQueryData<Me | null>(meKey, null),
  });
}

/** On first sign-in the user has no zone yet: save the browser's, once. */
export function useAdoptBrowserTimeZone(me: Me | null | undefined) {
  const { mutate } = useUpdateMe();
  const sent = useRef(false);
  useEffect(() => {
    if (me && me.timezone === null && !sent.current) {
      sent.current = true;
      mutate({ timezone: detectTimeZone() });
    }
  }, [me, mutate]);
}

/** The zone to show times in: the user's choice, else the browser's. */
export function viewerTimeZone(me: Me | null | undefined): string {
  return me?.timezone ?? detectTimeZone();
}
