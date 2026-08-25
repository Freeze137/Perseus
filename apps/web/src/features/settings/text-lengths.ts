/**
 * Os três tamanhos em que um texto vem, com nome em vez de número.
 *
 * Aqui e não dentro da barra de treino porque o lobby do duelo oferece a mesma
 * escolha, e duas listas seriam duas listas pra manter em dia — "Médio" valendo
 * 180 caracteres numa tela e 200 na outra é o tipo de desvio que ninguém nota
 * até alguém comparar duas corridas que nunca foram
 * comparable.
 *
 * Strings porque é o que um `Select` fala; quem chama converte.
 */
export const TEXT_LENGTHS = [
  { value: "90", label: "Curto" },
  { value: "180", label: "Médio" },
  { value: "360", label: "Longo" },
] as const;
