import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Valida na borda e entrega pro resto do app um valor tipado.
 *
 * Todo corpo de requisição e toda query string entram por aqui, então nenhum
 * handler recebe um `any` pra adivinhar — o schema no @perseus/contracts é a
 * única definição do que é uma requisição válida, dos dois lados da rede.
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
