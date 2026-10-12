import {
  detectTimeZone,
  formatSlotLabel,
  timeZoneSchema,
  zoneAbbreviation,
  type Me,
} from '@le-uma/shared';
import { useState } from 'react';
import { TimeZoneSelect } from './components/TimeZoneSelect';
import { useUpdateMe, viewerTimeZone } from './lib/session';
import { Avatar } from './UserMenu';
import { useDocumentTitle } from './lib/title';

export function ProfilePage({ me }: { me: Me }) {
  useDocumentTitle('Profile');
  const saved = viewerTimeZone(me);
  const [zone, setZone] = useState(saved);
  const update = useUpdateMe();
  const browserZone = detectTimeZone();
  const now = new Date();
  const dirty = zone !== me.timezone;
  const valid = timeZoneSchema.safeParse(zone).success;

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-xl border border-border bg-surface p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <Avatar me={me} size={64} />
        <div>
          <h2 className="text-xl font-semibold">{me.displayName ?? me.username}</h2>
          <p className="text-sm text-text-muted">@{me.username}</p>
        </div>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && dirty) update.mutate({ timezone: zone });
        }}
      >
        <label htmlFor="timezone" className="text-sm font-medium">
          Your timezone
        </label>
        <p className="-mt-2 text-xs text-text-muted">
          Race times are shown in this zone. Daylight saving is handled automatically.
        </p>
        <TimeZoneSelect
          id="timezone"
          value={zone}
          onChange={(z) => {
            if (z) setZone(z);
            update.reset();
          }}
        />

        <p className="text-sm text-text-muted">
          It&apos;s {formatSlotLabel(now, zone)} {zoneAbbreviation(now, zone)} there now.
          {zone !== browserZone && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => {
                  setZone(browserZone);
                  update.reset();
                }}
                className="text-accent-strong underline-offset-2 hover:underline"
              >
                Use this device&apos;s zone ({browserZone})
              </button>
            </>
          )}
        </p>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || !valid || update.isPending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
          <span aria-live="polite" className="text-sm">
            {update.isSuccess && !dirty && <span className="text-available">✓ Saved</span>}
            {update.isError && (
              <span className="text-unavailable">⚠ Couldn&apos;t save. Please try again.</span>
            )}
          </span>
        </div>
      </form>
    </section>
  );
}
