import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
