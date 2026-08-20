import { json, type NextFunction, type Request, type Response } from 'express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { corsOrigins, loadEnv } from './config';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The browser calls this from a different origin in every environment we
  // have — :3000 in development, a different host in production — so the
  // allowed list is configuration rather than a constant.
  app.enableCors({ origin: corsOrigins(env), credentials: true });

  // A keystroke timeline is a big body by design: the server insists on being
  // sent what happened rather than what it scored, and what happened is one
  // entry per character. The default 100 KB left the longest honest runs a
  // correction away from a 413 nobody could have diagnosed from the message.
  app.use(json({ limit: env.MAX_BODY_SIZE }));

  // Reverse proxies buffer responses by default, which for an event stream
  // means the duel arrives in one lump at the end. This is the header nginx and
  // most of its relatives read to leave a response alone; it is meaningless
  // everywhere else, which is why it costs nothing to set unconditionally.
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path.endsWith('/stream')) {
      response.setHeader('X-Accel-Buffering', 'no');
    }
    next();
  });

  if (env.TRUST_PROXY_HOPS > 0) {
    // Without this every caller behind the load balancer shares one address,
    // which means one rate-limit budget for the entire internet.
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  // In-flight requests finish before the process goes. A submit cut off
  // mid-write is the one request in this API that costs somebody a real run.
  app.enableShutdownHooks();

  await app.listen(env.PORT);
}
// The floating promise is the point: nothing follows bootstrap, and an
// unhandled rejection here should crash the process rather than be swallowed.
void bootstrap();
