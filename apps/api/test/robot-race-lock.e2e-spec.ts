import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Robot race-locked equipment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let playerId: string;
  const email = `rl-${Date.now()}@example.com`;
  const username = `rl_${Date.now()}`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, username, password, race: 'LUXARI' });
    accessToken = registerRes.body.accessToken;
    playerId = registerRes.body.player.id;
  });

  afterAll(async () => {
    await prisma.itemInstance.deleteMany({ where: { playerId } });
    await prisma.player.delete({ where: { id: playerId } });
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  it('rejects equipping a Coreforged item stamped for a different race', async () => {
    const definition = await prisma.itemDefinition.findUniqueOrThrow({ where: { key: 'coreforged_head_scanner' } });
    const mismatched = await prisma.itemInstance.create({ data: { playerId, itemDefinitionId: definition.id, race: 'NEXAR' } });

    const res = await request(app.getHttpServer()).post(`/api/v1/robot/equip/${mismatched.id}`).set(auth()).expect(400);
    expect(res.body.message).toBe('RACE_MISMATCH');
  });

  it('allows equipping a Coreforged item stamped for the player\'s own race', async () => {
    const definition = await prisma.itemDefinition.findUniqueOrThrow({ where: { key: 'coreforged_left_arm_blaster' } });
    const matching = await prisma.itemInstance.create({ data: { playerId, itemDefinitionId: definition.id, race: 'LUXARI' } });

    const res = await request(app.getHttpServer()).post(`/api/v1/robot/equip/${matching.id}`).set(auth()).expect(201);
    const slot = res.body.find((s: { slot: string }) => s.slot === 'LEFT_ARM');
    expect(slot.item.itemInstanceId).toBe(matching.id);
  });

  it('allows equipping a non-race-locked item regardless of race', async () => {
    const definition = await prisma.itemDefinition.findUniqueOrThrow({ where: { key: 'pioneer_right_arm_guard' } });
    const universal = await prisma.itemInstance.create({ data: { playerId, itemDefinitionId: definition.id } });

    const res = await request(app.getHttpServer()).post(`/api/v1/robot/equip/${universal.id}`).set(auth()).expect(201);
    const slot = res.body.find((s: { slot: string }) => s.slot === 'RIGHT_ARM');
    expect(slot.item.itemInstanceId).toBe(universal.id);
  });
});
