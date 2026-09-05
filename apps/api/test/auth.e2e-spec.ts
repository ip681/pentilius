import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.player.deleteMany({ where: { email } });
    await app.close();
  });

  it('registers a new player', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(201)
      .expect((res) => {
        expect(res.body.player.email).toBe(email);
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeDefined();
      });
  });

  it('rejects a duplicate registration', () => {
    return request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password }).expect(409);
  });

  it('logs in with correct credentials', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
      });
  });

  it('rejects login with wrong password', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });
});
