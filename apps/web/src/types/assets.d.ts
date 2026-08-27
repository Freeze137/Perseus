/**
 * O que um `import` de imagem significa para o tsc.
 *
 * Isto normalmente chega pelo `next-env.d.ts`, que o Next gera. Só que aquele
 * arquivo é ignorado pelo git e, pior, importa `./.next/types/routes.d.ts` —
 * então nem commitá-lo resolveria: num runner limpo o `.next` não existe.
 *
 * O CI roda `tsc --noEmit` antes de qualquer comando do Next, e sem esta linha
 * ele para em `Cannot find module '@/assets/perseus-mark.png'`. Na Vercel passa
 * porque lá o `next build` regenera tudo antes. Aqui a declaração é
 * versionada, e o typecheck deixa de depender de um build ter acontecido.
 */
/// <reference types="next/image-types/global" />
