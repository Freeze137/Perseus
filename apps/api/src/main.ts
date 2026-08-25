import { json, type NextFunction, type Request, type Response } from 'express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { corsOrigins, loadEnv } from './config';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // O browser chama isto de uma origem diferente em todo ambiente que temos —
  // :3000 em desenvolvimento, outro host em produção — então a lista permitida
  // é configuração, não constante.
  app.enableCors({ origin: corsOrigins(env), credentials: true });

  // Timeline de teclas é corpo grande por desenho: o servidor exige receber o
  // que aconteceu, não o que foi pontuado, e o que aconteceu é uma entrada por
  // caractere. Os 100 KB padrão deixavam as corridas honestas mais longas a uma
  // correção de distância de um 413 que ninguém diagnosticaria pela mensagem.
  app.use(json({ limit: env.MAX_BODY_SIZE }));

  // Proxy reverso faz buffer de resposta por padrão, o que num stream de
  // eventos significa o duelo chegando todo de uma vez no fim. Este é o header
  // que o nginx e os parentes dele leem pra deixar a resposta em paz; não quer
  // dizer nada em outro lugar, e por isso setar sempre não custa nada.
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path.endsWith('/stream')) {
      response.setHeader('X-Accel-Buffering', 'no');
    }
    next();
  });

  if (env.TRUST_PROXY_HOPS > 0) {
    // Sem isto todo chamador atrás do load balancer divide um endereço só, o
    // que dá um orçamento de rate limit pra internet inteira.
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  // As requisições em voo terminam antes de o processo ir. Um submit cortado
  // no meio da escrita é a única requisição desta API que custa a alguém uma
  // corrida de verdade.
  app.enableShutdownHooks();

  await app.listen(env.PORT);
}
// A promise solta é o ponto: nada vem depois do bootstrap, e uma rejeição não
// tratada aqui tem que derrubar o processo em vez de ser engolida.
void bootstrap();
