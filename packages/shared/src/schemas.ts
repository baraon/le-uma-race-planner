/**
 * Request/response schemas shared by the web app (form validation) and the API (request
 * validation), so the two can't disagree.
 */
import { z } from 'zod';
import { AVAILABILITY_STATUSES, blocksOverlap } from './slots';
import { isValidTimeZone } from './timezones';
import { FUEL_UNITS, STRATEGY_DEFAULTS } from './tracks';

export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: 'Unknown IANA time zone' });

export const availabilityStatusSchema = z.enum(AVAILABILITY_STATUSES);

export const slotBlockSchema = z
  .object({
    startSlot: z.number().int().min(0),
    endSlot: z.number().int().min(1),
    status: availabilityStatusSchema,
  })
  .refine((b) => b.endSlot > b.startSlot, { message: 'endSlot must be after startSlot' });

/** A driver saves their whole row for an event at once; it replaces what was there. */
export const saveAvailabilitySchema = z
  .object({ blocks: z.array(slotBlockSchema).max(1000) })
  .refine((v) => !blocksOverlap(v.blocks), { message: 'Blocks must not overlap' });

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.enum(['ok', 'down']),
  version: z.string(),
});

/** The signed-in user, as returned by `GET /api/me`. */
export const meSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().url(),
  /** IANA zone, or null if the user hasn't chosen one yet. */
  timezone: z.string().nullable(),
});

export const updateMeSchema = z.object({ timezone: timeZoneSchema }).strict();

// --- Groups, teams, events (Phase 2) ---

const uuid = z.string().uuid();
const name = (max: number) => z.string().trim().min(1).max(max);
/** Optional free text: empty or missing becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const PERMISSIONS = [
  'manageMembers',
  'manageTeams',
  'manageEvents',
  'manageAvailability',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const permissionsSchema = z.object({
  manageMembers: z.boolean(),
  manageTeams: z.boolean(),
  manageEvents: z.boolean(),
  manageAvailability: z.boolean(),
});

export const groupRoleSchema = z.enum(['owner', 'admin', 'member']);

export const userSummarySchema = meSchema;

export const groupSummarySchema = z.object({
  id: uuid,
  name: z.string(),
  /** The viewer's role and effective permissions (the owner has all of them). */
  role: groupRoleSchema,
  permissions: permissionsSchema,
  memberCount: z.number().int(),
});

export const memberSchema = z.object({
  user: userSummarySchema,
  role: groupRoleSchema,
  /** Stored flags; the owner's are all false because the owner implicitly has everything. */
  permissions: permissionsSchema,
  joinedAt: z.string().datetime(),
});

export const teamSchema = z.object({
  id: uuid,
  name: z.string(),
  memberIds: z.array(uuid),
});

export const groupDetailSchema = groupSummarySchema.extend({
  ownerId: uuid,
  members: z.array(memberSchema),
  teams: z.array(teamSchema),
});

export const createGroupSchema = z.object({ name: name(80) }).strict();
export const createTeamSchema = z.object({ name: name(80) }).strict();
export const updateMemberSchema = permissionsSchema.strict();

export const createInviteSchema = z
  .object({
    /** null = never expires. */
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .nullable(),
    /** null = unlimited. */
    maxUses: z.number().int().min(1).max(1000).nullable(),
  })
  .strict();

export const inviteSchema = z.object({
  id: uuid,
  expiresAt: z.string().datetime().nullable(),
  maxUses: z.number().int().nullable(),
  useCount: z.number().int(),
  createdAt: z.string().datetime(),
});

/** Returned once, at creation: the token is never stored, only its hash. */
export const createdInviteSchema = inviteSchema.extend({ token: z.string() });

export const invitePreviewSchema = z.object({
  groupId: uuid,
  groupName: z.string(),
  memberCount: z.number().int(),
  alreadyMember: z.boolean(),
});

export const eventInputSchema = z
  .object({
    name: name(120),
    /** Green flag as a UTC instant, e.g. "2026-11-14T18:00:00Z". */
    startsAt: z.string().datetime(),
    durationMinutes: z.number().int().min(15).max(2880),
    track: optionalText(80),
    carClass: optionalText(40),
    trackTimezone: timeZoneSchema.nullish().transform((v) => v ?? null),
    /** Drivers needed available at once; null = at least one. */
    minDrivers: z
      .number()
      .int()
      .min(1)
      .max(20)
      .nullish()
      .transform((v) => v ?? null),
    // Strategy settings (all editable; omitted values take the starting defaults).
    fuelUnit: z.enum(FUEL_UNITS).default(STRATEGY_DEFAULTS.fuelUnit),
    fuelCapacity: z.number().positive().max(1000).default(STRATEGY_DEFAULTS.fuelCapacity),
    refuelSeconds: z.number().min(0).max(600).default(STRATEGY_DEFAULTS.refuelSeconds),
    pitLaneLossSeconds: z.number().min(0).max(300).default(STRATEGY_DEFAULTS.pitLaneLossSeconds),
  })
  .strict();

export const eventSchema = z.object({
  id: uuid,
  teamId: uuid,
  teamName: z.string(),
  groupId: uuid,
  groupName: z.string(),
  name: z.string(),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int(),
  track: z.string().nullable(),
  carClass: z.string().nullable(),
  trackTimezone: z.string().nullable(),
  minDrivers: z.number().int().nullable(),
  fuelUnit: z.enum(FUEL_UNITS),
  fuelCapacity: z.number(),
  refuelSeconds: z.number(),
  pitLaneLossSeconds: z.number(),
});

/** One driver's saved availability for an event, as slot blocks counted from the green flag. */
export const availabilityRowSchema = z.object({
  userId: uuid,
  blocks: z.array(slotBlockSchema),
  updatedAt: z.string().datetime().nullable(),
  /** Who saved it last (an admin may edit someone else's row). */
  updatedBy: uuid.nullable(),
});

/** A driver's pace for the event's track, class and fuel unit (from their reusable profile). */
export const paceRowSchema = z.object({
  userId: uuid,
  lapMs: z.number().int(),
  consumptionPerLap: z.number(),
  updatedAt: z.string().datetime(),
  updatedBy: uuid.nullable(),
});

export const savePaceSchema = z
  .object({
    lapMs: z.number().int().min(10_000).max(1_800_000),
    consumptionPerLap: z.number().positive().max(1000),
  })
  .strict();

export type SaveAvailability = z.infer<typeof saveAvailabilitySchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type Me = z.infer<typeof meSchema>;
export type UpdateMe = z.infer<typeof updateMeSchema>;
export type Permissions = z.infer<typeof permissionsSchema>;
export type GroupRole = z.infer<typeof groupRoleSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type GroupSummary = z.infer<typeof groupSummarySchema>;
export type Member = z.infer<typeof memberSchema>;
export type Team = z.infer<typeof teamSchema>;
export type GroupDetail = z.infer<typeof groupDetailSchema>;
export type CreateInvite = z.infer<typeof createInviteSchema>;
export type Invite = z.infer<typeof inviteSchema>;
export type CreatedInvite = z.infer<typeof createdInviteSchema>;
export type InvitePreview = z.infer<typeof invitePreviewSchema>;
export type EventInput = z.input<typeof eventInputSchema>;
export type RaceEvent = z.infer<typeof eventSchema>;
export type AvailabilityRow = z.infer<typeof availabilityRowSchema>;
export type PaceRow = z.infer<typeof paceRowSchema>;
export type SavePace = z.infer<typeof savePaceSchema>;
