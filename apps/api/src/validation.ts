import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Parses at the edge and hands the rest of the app a typed value.
 *
 * Every request body and query string enters through here, so no handler ever
 * receives an `any` it has to guess about — the schema in @perseus/contracts is
 * the only definition of what a valid request is, on both sides of the wire.
 */
export function parse<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException(z.prettifyError(result.error));
  }
  return result.data;
}
