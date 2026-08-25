/**
 * O mesmo cartão de novo, com o nome que o Twitter/X procura.
 *
 * O Next só mapeia o arquivo de Open Graph pra `og:image`; uma rota que quer
 * `twitter:image` tem que existir como arquivo próprio. Reexportado em vez de
 * duplicado pra haver um desenho e um lugar pra mudá-lo.
 */
export { default, alt, size, contentType } from "./opengraph-image";
