import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { button, Card, ErrorText, Muted } from '../components/ui';
import { acceptInvite, getInvitePreview } from '../lib/api';
import { keys } from '../lib/queries';
import { navigate } from '../lib/router';
import { useDocumentTitle } from '../lib/title';

export function InvitePage({ token }: { token: string }) {
  useDocumentTitle('Group invite');
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => getInvitePreview(token),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: async ({ groupId }) => {
      await qc.invalidateQueries({ queryKey: keys.groups });
      await qc.invalidateQueries({ queryKey: keys.upcoming });
      navigate(`/groups/${groupId}`, { replace: true });
    },
  });

  // Already a member: no need to ask.
  const alreadyIn = preview.data?.alreadyMember ? preview.data.groupId : null;
  useEffect(() => {
    if (alreadyIn) navigate(`/groups/${alreadyIn}`, { replace: true });
  }, [alreadyIn]);

  return (
    <div className="mx-auto w-full max-w-md">
      <Card title="Group invite">
        {preview.isPending ? (
          <Muted>Checking your invite…</Muted>
        ) : preview.error ? (
          <ErrorText error={preview.error} />
        ) : (
          <div className="flex flex-col gap-4">
            <p>
              You&apos;ve been invited to join <strong>{preview.data.groupName}</strong> (
              {preview.data.memberCount} {preview.data.memberCount === 1 ? 'member' : 'members'}).
            </p>
            <p className="text-sm text-text-muted">
              Members can see each other&apos;s Discord name, avatar and timezone, and the
              group&apos;s events.
            </p>
            <button
              type="button"
              className={button.primary}
              disabled={accept.isPending}
              onClick={() => accept.mutate()}
            >
              Join {preview.data.groupName}
            </button>
            <ErrorText error={accept.error} />
          </div>
        )}
      </Card>
    </div>
  );
}
