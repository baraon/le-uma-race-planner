/**
 * Request/response schemas shared by the web app (form validation) and the API (request
 * validation), so the two can't disagree.
 */
import { z } from 'zod';
import { AVAILABILITY_STATUSES, blocksOverlap } from './slots';
import { isValidTimeZone } from './timezones';

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

export type SaveAvailability = z.infer<typeof saveAvailabilitySchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
