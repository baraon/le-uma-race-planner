/** Small helpers shared by the JSON routes: validation and consistent error replies. */
import type { FastifyReply } from 'fastify';
import { z, type ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what);
export const forbidden = () => new HttpError(403, 'You don’t have permission to do that');
export const conflict = (message: string) => new HttpError(409, message);

/** Parses a request body or throws a 400 with the validation issues. */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, 'Invalid request', parsed.error.issues);
  return parsed.data;
}

const uuid = z.string().uuid();

/** Route params that should be UUIDs; anything else is simply "not found". */
export function idParam(params: unknown, key: string): string {
  const value = (params as Record<string, unknown>)[key];
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

/** The Postgres error code behind a (possibly Drizzle-wrapped) database error. */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = typeof e?.code === 'string' ? e.code : e?.cause?.code;
  return typeof code === 'string' ? code : undefined;
}

export function sendHttpError(err: HttpError, reply: FastifyReply) {
  return reply
    .code(err.statusCode)
    .send({ error: err.message, ...(err.issues !== undefined && { issues: err.issues }) });
}
