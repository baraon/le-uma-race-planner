/**
 * Typed view of the database for Drizzle queries. The SQL files in ../../migrations are the
 * source of truth for structure (constraints, triggers); keep this file in step with them.
 */
import {
  boolean,
  customType,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Postgres tstzrange, half-open "[start,end)". Read/written as its text form. */
const tstzrange = customType<{ data: string }>({ dataType: () => 'tstzrange' });

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const groupRole = pgEnum('group_role', ['owner', 'admin', 'member']);
export const availabilityStatus = pgEnum('availability_status', [
  'available',
  'maybe',
  'unavailable',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  discordId: text('discord_id').notNull().unique(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  avatarHash: text('avatar_hash'),
  /** IANA name; null until the user (or their browser, on first login) picks one. */
  timezone: text('timezone'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  /** SHA-256 of the session token; the raw token only ever lives in the cookie. */
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: instant('expires_at').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: groupRole('role').notNull().default('member'),
    canManageMembers: boolean('can_manage_members').notNull().default(false),
    canManageTeams: boolean('can_manage_teams').notNull().default(false),
    canManageEvents: boolean('can_manage_events').notNull().default(false),
    canManageAvailability: boolean('can_manage_availability').notNull().default(false),
    joinedAt: instant('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

export const groupInvites = pgTable('group_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: instant('expires_at'),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').notNull().default(0),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: instant('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  track: text('track'),
  carClass: text('car_class'),
  startsAt: instant('starts_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  slotMinutes: integer('slot_minutes').notNull().default(15),
  trackTimezone: text('track_timezone'),
  /** Drivers needed available at once; null = at least one. */
  minDrivers: smallint('min_drivers'),
  fuelUnit: text('fuel_unit', { enum: ['percent', 'litres'] })
    .notNull()
    .default('percent'),
  fuelCapacity: doublePrecision('fuel_capacity').notNull().default(100),
  refuelSeconds: doublePrecision('refuel_seconds').notNull().default(60),
  pitLaneLossSeconds: doublePrecision('pit_lane_loss_seconds').notNull().default(30),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const availability = pgTable('availability', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  period: tstzrange('period').notNull(),
  status: availabilityStatus('status').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});
