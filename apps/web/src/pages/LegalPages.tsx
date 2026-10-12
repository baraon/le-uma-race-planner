/**
 * Terms of Service and Privacy Policy. Plain language for a small, free, non-commercial tool.
 * Keep these true: if the app starts storing or sharing something new, update them first.
 */
import type { ReactNode } from 'react';
import { AppLink, button, Card } from '../components/ui';

const EFFECTIVE = '12 October 2026';
const CONTACT = (
  <>
    message <strong>Baraon</strong> on Discord (username <code>baraon</code>)
  </>
);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-text-muted [&_strong]:text-text">
        {children}
      </div>
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-5 list-disc space-y-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function TermsPage() {
  return (
    <Card title="Terms of Service">
      <div className="flex flex-col gap-6">
        <p className="text-sm text-text-muted">Effective {EFFECTIVE}</p>

        <Section title="What this is">
          <p>
            Le Uma Race Planner (&ldquo;the service&rdquo;, at leumaplanner.com) is a free hobby
            project run by one person, Baraon (&ldquo;I&rdquo;, &ldquo;me&rdquo;), for a group of
            friends who race endurance events together in sim racing. It lets drivers mark when they
            can race and see each other&apos;s availability in their own timezone.
          </p>
          <p>
            By signing in, you agree to these terms and to the{' '}
            <AppLink to="/privacy" className={button.link}>
              Privacy Policy
            </AppLink>
            . If you don&apos;t agree, please don&apos;t use the service.
          </p>
        </Section>

        <Section title="Free and non-commercial">
          <List
            items={[
              'The service is free. There are no paid plans, ads, or sponsorships, and it will not be monetized.',
              'Your information is never sold, rented or used for advertising.',
              'Please use it for planning races with your team, not for commercial purposes.',
            ]}
          />
        </Section>

        <Section title="Your account">
          <List
            items={[
              'You sign in with Discord. You need a Discord account and must meet Discord’s minimum age where you live.',
              'You’re responsible for what happens under your account, so keep your Discord account secure.',
              'Group owners and the admins they appoint can manage their group: invite or remove members, create teams and events, and (if allowed) edit members’ availability.',
            ]}
          />
        </Section>

        <Section title="Be decent">
          <p>Don&apos;t use the service to:</p>
          <List
            items={[
              'harass anyone, or post anything illegal or hateful (for example in group, team or event names);',
              'try to break, overload or get around the security of the service, or access groups you weren’t invited to;',
              'scrape it, automate sign-ups, or impersonate someone else.',
            ]}
          />
          <p>I may remove content or accounts that break these rules.</p>
        </Section>

        <Section title="No guarantees">
          <List
            items={[
              'The service is provided “as is”, without warranties of any kind. It may have bugs, be down, or lose data. Keep your own notes for anything important.',
              'I may change, pause or shut down the service at any time. I’ll try to give notice in the community’s Discord when I can.',
              'To the extent the law allows, I’m not liable for any loss or damage from using (or not being able to use) the service, such as a missed stint.',
            ]}
          />
        </Section>

        <Section title="Not affiliated">
          <p>
            This is an unofficial fan project. It is not affiliated with or endorsed by the
            Automobile Club de l&apos;Ouest (ACO), the 24 Hours of Le Mans, any racing game or its
            publisher, or Discord. Their names and trademarks belong to their owners.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If these terms change, the effective date above will change too, and continuing to use
            the service means you accept the new version. Questions? {CONTACT}.
          </p>
        </Section>
      </div>
    </Card>
  );
}

export function PrivacyPage() {
  return (
    <Card title="Privacy Policy">
      <div className="flex flex-col gap-6">
        <p className="text-sm text-text-muted">Effective {EFFECTIVE}</p>

        <Section title="The short version">
          <List
            items={[
              <>
                I keep only what the planner needs: your{' '}
                <strong>Discord ID, username, display name and avatar</strong>, your{' '}
                <strong>timezone</strong>, and the groups, teams, events and availability you
                create.
              </>,
              <>
                Your <strong>Discord login tokens are never stored</strong>. They&apos;re used once
                at sign-in to read your basic profile, then thrown away.
              </>,
              <>
                No ads, no analytics, no tracking, and <strong>nothing is sold or shared</strong>{' '}
                with anyone for profit.
              </>,
            ]}
          />
        </Section>

        <Section title="Signing in with Discord">
          <p>
            When you sign in, Discord asks you to allow the <strong>identify</strong> permission
            only. That gives the service your Discord user ID, username, display name and avatar. It
            does <strong>not</strong> give access to your email, your servers, your friends or your
            messages, and the service can&apos;t post anything as you.
          </p>
          <p>
            Discord hands the service a temporary access token to read that profile. It&apos;s used
            for that single request on the server and then discarded: it is never saved to the
            database, written to logs, or sent to your browser.
          </p>
        </Section>

        <Section title="What is stored">
          <List
            items={[
              <>
                <strong>Profile:</strong> Discord user ID, username, display name, avatar reference,
                and the timezone you choose (or your browser&apos;s, on first sign-in).
              </>,
              <>
                <strong>Planning data:</strong> groups you create or join, your role and
                permissions, teams you join, events, and the availability you (or a group admin)
                mark.
              </>,
              <>
                <strong>Sessions:</strong> when you sign in, your browser gets a random session
                cookie. The database stores only a one-way hash of it, plus an expiry date (30 days
                after your last visit). Signing out deletes it.
              </>,
              <>
                <strong>Invite links:</strong> only a one-way hash of each link is stored, with its
                expiry and use count.
              </>,
            ]}
          />
        </Section>

        <Section title="Who can see it">
          <List
            items={[
              'Members of a group you’re in can see your Discord name, avatar and timezone, the group’s teams and events, and the availability of drivers on those teams.',
              'Group owners and admins can manage the group, and admins with permission can edit availability.',
              'People outside your groups can’t see any of this.',
              'I (the operator) can access the database to run and fix the service, and look only when needed.',
            ]}
          />
        </Section>

        <Section title="Cookies">
          <p>The service uses two cookies, both strictly necessary, and nothing else:</p>
          <List
            items={[
              <>
                <code>le_uma_session</code>: keeps you signed in. Secure, http-only (scripts
                can&apos;t read it), expires after 30 days without use.
              </>,
              <>
                <code>le_uma_oauth_state</code>: protects the Discord sign-in against forgery. Lasts
                10 minutes.
              </>,
            ]}
          />
          <p>There are no analytics, advertising or third-party tracking cookies or scripts.</p>
        </Section>

        <Section title="Logs and IP addresses">
          <p>
            The web server keeps no access logs. The application&apos;s request logs record only the
            time, request method and page path: no IP addresses and no account details. The web
            server&apos;s occasional error messages (for example a failed secure connection) can
            include an IP address. All logs stay on the server and are rotated automatically.
          </p>
          <p>
            To prevent abuse, requests are rate-limited by IP address. That count is kept in memory
            only and forgotten within a minute.
          </p>
        </Section>

        <Section title="Where it's hosted, and other services involved">
          <List
            items={[
              <>
                <strong>DigitalOcean</strong> hosts the server and database in London, United
                Kingdom.
              </>,
              <>
                <strong>Discord</strong> handles sign-in, and avatars load from Discord&apos;s image
                servers, so Discord can see those requests. Discord&apos;s own privacy policy
                applies to your Discord account.
              </>,
              <>
                <strong>Let&apos;s Encrypt</strong> provides the HTTPS certificate. It receives no
                information about you.
              </>,
            ]}
          />
        </Section>

        <Section title="Keeping it and deleting it">
          <List
            items={[
              'Your data is kept while you use the service.',
              'You can leave groups and teams yourself at any time. Leaving a group also removes you from its teams.',
              <>
                To see what&apos;s stored about you, or to have your account and everything
                connected to it deleted, {CONTACT}. I&apos;ll handle requests within 30 days.
              </>,
              'If the service shuts down, the database will be deleted.',
            ]}
          />
        </Section>

        <Section title="Security">
          <p>
            Everything travels over HTTPS. The database isn&apos;t reachable from the internet,
            secrets live only on the server, and session and invite tokens are stored only as
            hashes. No system is perfectly secure, but I&apos;ll tell affected users if something
            goes wrong.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If this policy changes, the effective date above will change too. Questions or requests?{' '}
            {CONTACT}.
          </p>
        </Section>
      </div>
    </Card>
  );
}

/** Small footer with the legal links, shown on every page. */
export function LegalFooter() {
  return (
    <footer className="mt-auto flex flex-wrap gap-4 text-xs text-text-muted">
      <AppLink to="/terms" className="hover:text-text">
        Terms of Service
      </AppLink>
      <AppLink to="/privacy" className="hover:text-text">
        Privacy Policy
      </AppLink>
      <span>A free, non-commercial fan project.</span>
    </footer>
  );
}
