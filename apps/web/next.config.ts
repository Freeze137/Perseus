import type { NextConfig } from "next";

/**
 * A origem de uma URL de ambiente, ou null quando não há URL nenhuma.
 *
 * A CSP precisa de origem — esquema, host e porta — e o ambiente guarda URL
 * completa. Converter aqui em vez de concatenar à mão evita o caso em que uma
 * barra sobrando no fim vira uma diretiva que o browser ignora em silêncio, que
 * é o pior jeito de uma política falhar: ela continua lá, só não vale mais nada.
 */
function origin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/**
 * Para onde o browser pode abrir conexão a partir desta página.
 *
 * Um endereço: a API. É tudo que este site alcança — o duelo, o histórico e o
 * fluxo de eventos saem todos dela, e não há mais nada de fora no caminho.
 *
 * Sai do ambiente e não escrito aqui porque é a mesma variável que o app já usa
 * pra achar a API. Um host repetido à mão viraria mentira no primeiro deploy
 * que o trocasse, e a forma dessa mentira seria o duelo parando em produção e
 * continuando a funcionar local.
 */
const reachable = [origin(process.env.NEXT_PUBLIC_API_URL)].filter(
  (value): value is string => value !== null,
);

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy.
 *
 * O site não busca nada de fora: as fontes são hospedadas no build pelo
 * next/font, o three.js é um chunk do próprio bundle, o campo de estrelas é
 * canvas 2D e não existe imagem, iframe ou script de terceiro em lugar nenhum.
 * Isso é o que torna `default-src 'self'` uma descrição do app em vez de uma
 * aposta — e o que faz esta política valer a pena: se um dia entrar script que
 * não é nosso, ele não tem para onde mandar o que ler.
 *
 * `'unsafe-inline'` em script fica porque o App Router entrega o payload de
 * hidratação em <script> inline. A alternativa é nonce por requisição, que
 * obriga middleware e torna dinâmica toda página que hoje é estática — preço
 * alto num app cujo conteúdo de usuário é um nome de ranking renderizado como
 * texto pelo React, já escapado.
 *
 * As folgas de desenvolvimento estão marcadas: o `next dev` avalia código pra
 * fazer refresh e mantém um websocket pro HMR, e nenhum dos dois existe no
 * bundle que vai pro ar.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Estilo inline é o que o next/font emite e o que todo `style={}` de React
  // vira. Sem isto a página pinta sem fonte e sem metade do layout.
  "style-src 'self' 'unsafe-inline'",
  // `data:` é o placeholder borrado que o next/image embute no HTML.
  "img-src 'self' data:",
  "font-src 'self'",
  ["connect-src 'self'", ...reachable, isDev ? "ws:" : ""]
    .filter(Boolean)
    .join(" "),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Ninguém embute o PERSEUSS num iframe. Um treinador de digitação dentro de
  // uma moldura de outra pessoa é um teclado que outra pessoa está lendo.
  "frame-ancestors 'none'",
  // Em desenvolvimento a API é http://localhost, e promover aquilo a https
  // quebraria a única coisa que isto protegeria.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // O `next dev` imprime uma URL de rede ao lado da local, e no Windows essa
  // URL é o endereço vEthernet do WSL/Hyper-V. Abrir ela sem listar a origem
  // aqui faz o Next responder 403 em todo /_next/*: a página pinta, nenhum chunk
  // carrega, e nada nela responde. Só em desenvolvimento.
  allowedDevOrigins: ["172.30.32.1", "192.168.*.*", "10.*.*.*"],

  /**
   * Os cabeçalhos que toda resposta carrega.
   *
   * Nada aqui muda um pixel da página. São instruções pro browser sobre o que
   * ele tem permissão de fazer com ela — e o motivo de existirem é que o padrão
   * de cada uma dessas perguntas é "pode".
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            // Dois anos, e o browser passa a recusar http neste domínio antes
            // mesmo de sair de casa — o redirecionamento do Fly e da Vercel só
            // conserta a primeira requisição depois que ela já foi em claro.
            // Sem `preload`: entrar na lista dos browsers é fácil e sair leva
            // meses, e isso é decisão de domínio, não de commit.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            // Impede o browser de adivinhar o tipo de um arquivo pelo conteúdo.
            // O palpite errado clássico é tratar dado como script.
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Diz o mesmo que `frame-ancestors`, pro browser que ainda não lê a
            // CSP. Custa uma linha e cobre o resto da cauda.
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // Site de fora recebe só a origem, nunca o caminho. O caminho de um
            // duelo é o código da sala.
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // Um treinador de digitação não pede câmera, microfone nem posição.
            // Escrito aqui, nada que rode nesta página consegue pedir.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            // Aba aberta a partir daqui não recebe referência de volta pra esta.
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
