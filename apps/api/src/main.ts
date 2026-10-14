import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // In production the API sits behind Caddy (one hop): read the player's real
  // address from X-Forwarded-For, or every request would look like Caddy's
  // and the failed-login limit would block everyone at once.
  app.set('trust proxy', 1);

  // Needed for local dev, where apps/web (3000) and apps/api (3001) are
  // different origins. In production Caddy routes both under one origin,
  // so this has no effect there, but doesn't hurt to leave enabled —
  // auth is Bearer-token-based (not cookies), so there's no session to leak.
  app.enableCors();

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3001;

  await app.listen(port);
}

bootstrap();
