"use strict";

/**
 * Nada é exposto à página, de propósito.
 *
 * Este arquivo já carregou uma ponte: a presença do Discord, que precisava de
 * um socket local que uma aba não abre. O Discord saiu do projeto e a ponte foi
 * junto.
 *
 * O preload continua existindo porque `contextIsolation` precisa de um, e
 * porque é aqui que qualquer coisa futura teria de passar — em vez de a página
 * remota ganhar acesso direto ao Node.
 */
