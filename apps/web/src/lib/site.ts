/**
 * A origem de onde este deploy responde.
 *
 * Só é lida pra URL absoluta que sai da página — imagem de Open Graph, o link
 * canônico, o JSON-LD. Tudo que o browser busca pra si mesmo fica relativo, pra
 * um deploy de preview nunca apontar de volta pra produção.
 *
 * A variável da Vercel é o fallback e não a fonte: ela nomeia o deploy, que em
 * produção é o domínio do projeto mas num preview é um hash que ninguém vai
 * digitar. Domínio próprio é lugar do NEXT_PUBLIC_SITE_URL.
 *
 * Vazio conta como ausente, e é esse o motivo inteiro disto ser escrito com um
 * helper em vez de com `??`. Variável declarada e deixada em branco é o que um
 * .env.example produz na primeira vez que alguém o copia, e o `??` entregaria
 * essa string vazia pro `new URL()` — que quebra o build com "Invalid URL" e não
 * diz nada sobre de onde a string vazia veio.
 */
function set(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const vercel = set(process.env.VERCEL_PROJECT_PRODUCTION_URL);

const configured =
  set(process.env.NEXT_PUBLIC_SITE_URL) ?? (vercel ? `https://${vercel}` : undefined);

export const SITE_URL = (configured ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Nome do produto. Dois esses, igual ao domínio.
 *
 * Parece typo pra quem vê frio. Está escrito num lugar só justamente por
 * isso: não tem o que "corrigir" solto por aí.
 */
export const SITE_NAME = "PERSEUSS";

export const SITE_TAGLINE = "Treino de digitação — português, inglês e código.";

/**
 * O título que o Google mostra em azul, e o mesmo que vai no cartão de link.
 *
 * Escrito com as palavras que alguém digitaria na busca — "treinador de
 * digitação", "código" — porque o resultado precisa parecer a resposta da
 * pergunta que trouxe a pessoa até ele. O separador é `·` e não travessão:
 * o travessão é largo e rouba caractere de um título que o Google já corta
 * perto dos 60.
 */
export const SITE_TITLE = `${SITE_NAME} · Treinador de digitação para texto e código`;
