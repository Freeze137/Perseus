import { z } from 'zod';

/**
 * Ambiente, lido uma vez no boot.
 *
 * Tudo que fala com o mundo é opcional aqui, e é uma decisão e não um descuido:
 * sem banco e sem segredo de assinatura o processo sobe, serve `/health` e
 * pontua corrida do mesmo jeito. O treinador funciona offline e sempre
 * funcionou, então credencial faltando degrada o ranking em vez de derrubar o
 * processo.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  /** Origens que podem chamar esta API. Separadas por vírgula. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /**
   * Assina os bilhetes de corrida, os tokens de duelo e os passaportes.
   *
   * Opcional pra trabalho local não precisar de setup, mas com uma consequência
   * que mudou de tamanho: sem ela o processo assina com um segredo que inventa
   * no boot, e um passaporte assinado assim é revogado pelo próximo deploy, em
   * silêncio, pra todo mundo. Por isso a identidade se declara indisponível
   * quando ela falta, em vez de funcionar até a próxima vez que o código subir.
   */
  RUN_TICKET_SECRET: z.string().min(32).optional(),
  /**
   * Postgres: o duelo, o ranking e a identidade, todos. Opcional: sem ela o
   * duelo roda de ponta a ponta do mesmo jeito — a sala vive na memória deste
   * processo — e o que falta é tudo que sobrevive à sala.
   *
   * Uma conexão só, e comum. Nada aqui precisa de row-level security, porque
   * nada além desta API fala com este banco: a cerca é não haver segunda porta,
   * e não uma política escrita pra uma chave pública que não existe.
   */
  DATABASE_URL: z.string().min(12).optional(),
  /**
   * Se negocia TLS com esse banco. Desligado por padrão porque o formato comum
   * é Postgres no mesmo host da API, pelo loopback, onde TLS é cerimônia.
   * Ligue pra qualquer coisa que o tráfego saia da máquina pra alcançar.
   */
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * Quantos proxies estão na frente disto. O rate limit conta chamador por
   * endereço, e atrás de um load balancer todo endereço é o do balancer, a não
   * ser que o Express seja avisado de quantos saltos olhar pra trás.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  /**
   * Teto do corpo. Uma corrida de código de 2 000 caracteres dá uns 90 KB de
   * timeline, e o padrão do Express é 100 KB — perto o bastante pra as corridas
   * honestas mais longas ficarem a uma correção de um 413 que ninguém entenderia.
   */
  MAX_BODY_SIZE: z.string().default('512kb'),
});

export type Env = z.infer<typeof EnvSchema> & {
  /** Se corrida terminada é guardada, classificada e lembrada. */
  syncEnabled: boolean;
  /** Se duelo terminado é anotado em vez de só jogado. */
  matchHistoryEnabled: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Falhar no boot é melhor que falhar na primeira requisição que precisa do valor.
    throw new Error(`invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  return {
    ...env,
    syncEnabled: Boolean(env.DATABASE_URL && env.RUN_TICKET_SECRET),
    matchHistoryEnabled: Boolean(env.DATABASE_URL),
  };
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
