import { describe, expect, it } from 'vitest';
import { HistoryQuerySchema, LeaderboardQuerySchema } from './index';

/**
 * Query string não tem números.
 *
 * O ranking é pedido com `limit` em toda abertura da gaveta, e `?limit=20`
 * chega como a string "20". Enquanto o schema exigia `z.int()`, a requisição
 * inteira era recusada com 400 e a tela dizia que não deu pra ler o ranking —
 * a frase que existe pro banco fora do ar. Estes casos são o que impede a
 * conversão de sair de novo sem ninguém notar.
 */
describe('LeaderboardQuerySchema', () => {
  it('aceita os números como eles chegam numa query string', () => {
    const parsed = LeaderboardQuerySchema.parse({
      kind: 'quote',
      language: 'pt-BR',
      limit: '20',
      windowDays: '7',
    });

    expect(parsed.limit).toBe(20);
    expect(parsed.windowDays).toBe(7);
  });

  it('continua aceitando número de verdade, que é o que o cliente manda', () => {
    expect(LeaderboardQuerySchema.parse({ limit: 20 }).limit).toBe(20);
  });

  it('usa os padrões quando a query não diz nada', () => {
    const parsed = LeaderboardQuerySchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.windowDays).toBeNull();
  });

  it('recusa o que não é número, e o que passa do teto', () => {
    expect(() => LeaderboardQuerySchema.parse({ limit: 'vinte' })).toThrow();
    expect(() => LeaderboardQuerySchema.parse({ limit: '500' })).toThrow();
    expect(() => LeaderboardQuerySchema.parse({ windowDays: '0' })).toThrow();
  });
});

describe('HistoryQuerySchema', () => {
  it('converte o limite do histórico pelo mesmo caminho', () => {
    expect(HistoryQuerySchema.parse({ limit: '10' }).limit).toBe(10);
    expect(HistoryQuerySchema.parse({}).limit).toBe(20);
  });
});
