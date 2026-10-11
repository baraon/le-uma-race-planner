/**
 * The only two Discord calls we make: exchange the OAuth2 code, then read the user once.
 * Scope is `identify` and nothing else. Discord's tokens are used here and then dropped; they
 * are never stored or logged.
 */
import { z } from 'zod';

const DISCORD_API = 'https://discord.com/api/v10';
export const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
export const DISCORD_SCOPE = 'identify';

export interface DiscordCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

/** What the auth routes need from Discord. Tests fake `fetchUser`; nothing in tests hits the network. */
export interface DiscordClient {
  /** Where to send the browser to approve the `identify` scope. */
  authorizeUrl(state: string): string;
  /** Exchanges the code for a user, discarding Discord's tokens before returning. */
  fetchUser(code: string): Promise<DiscordUser>;
}

const tokenResponse = z.object({ access_token: z.string().min(1) });
const userResponse = z.object({
  id: z.string().regex(/^\d+$/),
  username: z.string().min(1),
  global_name: z.string().nullish(),
  avatar: z.string().nullish(),
});

export function createDiscordClient(creds: DiscordCredentials): DiscordClient {
  return {
    authorizeUrl(state) {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: creds.clientId,
        scope: DISCORD_SCOPE,
        redirect_uri: creds.redirectUri,
        state,
      });
      return `${DISCORD_AUTHORIZE_URL}?${params}`;
    },

    async fetchUser(code) {
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: creds.redirectUri,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenRes.ok) throw new Error(`Discord token exchange failed: HTTP ${tokenRes.status}`);
      const { access_token } = tokenResponse.parse(await tokenRes.json());

      const userRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!userRes.ok) throw new Error(`Discord /users/@me failed: HTTP ${userRes.status}`);
      const u = userResponse.parse(await userRes.json());
      return {
        id: u.id,
        username: u.username,
        globalName: u.global_name ?? null,
        avatar: u.avatar ?? null,
      };
    },
  };
}

/** CDN URL for a user's avatar, or Discord's default avatar when they have none. */
export function avatarUrl(discordId: string, avatarHash: string | null): string {
  if (avatarHash) {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=128`;
  }
  const index = Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
