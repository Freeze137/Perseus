import { z } from 'zod';

/**
 * Ambiente, lido uma vez no boot.
 *
 * A chave de service role passa por cima do row-level security, que é
 * exatamente por que a API a segura e o browser nunca: o browser recebe a chave
 * anon e vive dentro das políticas. Se este arquivo um dia acabar importado de
 * código de cliente, o bug é esse.
 *
 * Sync é opcional. Sem Supabase configurado o app roda igual — o treinador
 * funciona offline e sempre funcionou — então chave faltando degrada o ranking
 * em vez de derrubar o processo.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  /** Origens que podem chamar esta API. Separadas por vírgula. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /**
   * Assina os bilhetes de corrida. Opcional pra trabalho local não precisar de
   * setup; sem ela o processo assina com um segredo que inventa no boot, o que
   * faz um restart invalidar toda corrida que alguém tinha aberta. Configure em
   * qualquer lugar com mais de uma instância ou mais de um deploy por dia.
   */
  RUN_TICKET_SECRET: z.string().min(32).optional(),
  /**
   * Postgres, pro duelo. Opcional como tudo aqui que fala com banco: sem ela o
   * duelo roda de ponta a ponta do mesmo jeito — a sala vive na memória deste
   * processo — e só o histórico sobrevive à sala.
   *
   * É conexão separada do Supabase de propósito, não o pooler do mesmo projeto.
   * Duelo não precisa de conta nem de row-level security, então não precisa de
   * nada do que o cliente de service role serve, e apontar pra um Postgres
   * comum é mudança de uma linha em vez de migração.
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
    syncEnabled: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    matchHistoryEnabled: Boolean(env.DATABASE_URL),
  };
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
