import type { Me } from '@le-uma/shared';
import { linkClick, navigate } from './lib/router';
import { useLogout } from './lib/session';

export function Avatar({ me, size = 32 }: { me: Me; size?: number }) {
  return (
    <img
      src={me.avatarUrl}
      alt=""
      width={size}
      height={size}
      className="rounded-full bg-surface-raised"
      referrerPolicy="no-referrer"
    />
  );
}

export function UserMenu({ me }: { me: Me }) {
  const logout = useLogout();

  return (
    <div className="flex items-center gap-3">
      <a
        href="/profile"
        onClick={linkClick}
        className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-3 pl-1 text-sm hover:bg-surface-raised"
        title="Profile and timezone"
      >
        <Avatar me={me} size={28} />
        <span className="font-medium">{me.displayName ?? me.username}</span>
      </a>
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
        disabled={logout.isPending}
        className="text-sm text-text-muted hover:text-text disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
