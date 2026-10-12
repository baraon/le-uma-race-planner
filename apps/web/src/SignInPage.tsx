import { useEffect, useState } from 'react';
import { AppLink, button } from './components/ui';

const loginMessages: Record<string, string> = {
  denied: 'Discord sign-in was cancelled.',
  failed: 'Signing in with Discord didn’t work. Please try again.',
  unavailable: 'Discord sign-in isn’t configured on this server yet.',
};

/** Reads `?login=<reason>` left by a failed sign-in, then tidies it out of the address bar. */
function useLoginError(): string | null {
  const [reason] = useState(() => new URLSearchParams(window.location.search).get('login'));
  useEffect(() => {
    if (!reason) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('login');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [reason]);
  return reason ? (loginMessages[reason] ?? loginMessages.failed!) : null;
}

/** Sends the user back to the page they were on (e.g. an invite link) after Discord. */
function loginHref(): string {
  const here = window.location.pathname + window.location.search;
  return here === '/' ? '/auth/discord' : `/auth/discord?returnTo=${encodeURIComponent(here)}`;
}

export function SignInPage() {
  const error = useLoginError();
  const isInvite = window.location.pathname.startsWith('/invite/');

  return (
    <section className="mx-auto mt-10 flex w-full max-w-md flex-col gap-5 rounded-xl border border-border bg-surface p-8">
      <div>
        <h2 className="text-xl font-semibold">
          {isInvite ? 'Sign in to accept your invite' : 'Sign in'}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Use your Discord account to mark when you can race and see your team&apos;s availability
          in your own timezone.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-unavailable/40 bg-unavailable/10 px-3 py-2 text-sm"
        >
          <span aria-hidden>⚠</span>
          {error}
        </p>
      )}

      <a
        href={loginHref()}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-discord px-4 py-2.5 font-medium text-white hover:bg-discord/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
      >
        <DiscordIcon />
        Sign in with Discord
      </a>

      <p className="text-xs text-text-muted">
        We only ask Discord for your username and avatar. No email, no servers, no messages.
        Discord&apos;s login tokens are never stored.
      </p>
      <p className="text-xs text-text-muted">
        By signing in you agree to the{' '}
        <AppLink to="/terms" className={button.link}>
          Terms of Service
        </AppLink>{' '}
        and{' '}
        <AppLink to="/privacy" className={button.link}>
          Privacy Policy
        </AppLink>
        .
      </p>
    </section>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.29 1.23-1.99a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.1c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
    </svg>
  );
}
