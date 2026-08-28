/**
 * Testy klíčové logiky: práce s časem, SPZ, překryvy rezervací,
 * týdenní tokeny a trestné body.
 *
 * Spuštění:  npm test
 */
import assert from 'node:assert/strict';
import test, { before, beforeEach, after } from 'node:test';

import { prisma } from '@/lib/prisma';
import { createReservation, getSpotWeek, mergeSlots } from '@/lib/reservations';
import { getQuota } from '@/lib/tokens';
import { formatPlate, normalizePlate } from '@/lib/plates';
import {
  absoluteMinute,
  addDays,
  diffDays,
  isoWeekday,
  startOfWeek,
  todayString,
  weekKey,
} from '@/lib/time';

/** Nejbližší pondělí v budoucnu – testy tak nikdy nespadnou na „minulý čas“. */
function nextMonday(): string {
  const today = todayString();
  const monday = startOfWeek(today);
  return addDays(monday, 7);
}

const MONDAY = nextMonday();

async function resetDb() {
  await prisma.reservation.deleteMany();
  await prisma.penaltyReport.deleteMany();
  await prisma.tokenAdjustment.deleteMany();
  await prisma.plate.deleteMany();
  await prisma.user.deleteMany();
  await prisma.parkingSpot.deleteMany();
  await prisma.settings.deleteMany();
}

async function seed() {
  await prisma.settings.create({ data: { id: 1 } });
  const spot1 = await prisma.parkingSpot.create({
    data: { code: '1', section: 'RIGHT', position: 1 },
  });
  const spot2 = await prisma.parkingSpot.create({
    data: { code: '2', section: 'RIGHT', position: 2 },
  });
  const teacher = await prisma.user.create({
    data: {
      email: 'ucitel@gjk.cz',
      name: 'Jan Novák',
      passwordHash: 'scrypt$x$y',
      plates: { create: { plate: '1AB2345', display: '1AB 2345' } },
    },
  });
  const other = await prisma.user.create({
    data: {
      email: 'druhy@gjk.cz',
      name: 'Eva Dvořáková',
      passwordHash: 'scrypt$x$y',
      plates: { create: { plate: '2CD6789', display: '2CD 6789' } },
    },
  });
  return { spot1, spot2, teacher, other };
}

let ctx: Awaited<ReturnType<typeof seed>>;

before(async () => {
  await resetDb();
});

beforeEach(async () => {
  await resetDb();
  ctx = await seed();
});

after(async () => {
  await resetDb();
  await prisma.$disconnect();
});

/* ------------------------------ čas ------------------------------------- */

test('isoWeekday vrací 1 pro pondělí a 7 pro neděli', () => {
  assert.equal(isoWeekday('2026-08-31'), 1);
  assert.equal(isoWeekday('2026-09-06'), 7);
});

test('startOfWeek vrací pondělí daného týdne', () => {
  assert.equal(startOfWeek('2026-09-03'), '2026-08-31');
  assert.equal(startOfWeek('2026-08-31'), '2026-08-31');
});

test('weekKey je shodný pro všechny dny jednoho týdne', () => {
  const key = weekKey('2026-08-31');
  for (let i = 1; i < 7; i += 1) {
    assert.equal(weekKey(addDays('2026-08-31', i)), key);
  }
  assert.notEqual(weekKey(addDays('2026-08-31', 7)), key);
});

test('absoluteMinute umožňuje porovnat noční přesah přes půlnoc', () => {
  const nightEnd = absoluteMinute('2026-08-31', 1440 + 420); // po 16:00 → út 7:00
  const morningStart = absoluteMinute('2026-09-01', 420); // út 7:00
  assert.equal(nightEnd, morningStart);
});

test('diffDays počítá rozdíl dní přes přelom měsíce', () => {
  assert.equal(diffDays('2026-08-30', '2026-09-02'), 3);
});

/* ------------------------------ SPZ ------------------------------------- */

test('normalizePlate odstraní mezery a diakritiku', () => {
  assert.equal(normalizePlate(' 1ab 23-45 '), '1AB2345');
});

test('formatPlate rozdělí českou SPZ na skupiny', () => {
  assert.equal(formatPlate('1ab2345'), '1AB 2345');
});

/* --------------------------- slučování slotů ---------------------------- */

test('mergeSlots sloučí navazující sloty do jednoho bloku', () => {
  const merged = mergeSlots([
    { startMinute: 480, endMinute: 540 },
    { startMinute: 540, endMinute: 600 },
    { startMinute: 720, endMinute: 780 },
  ]);
  assert.deepEqual(merged, [
    { startMinute: 480, endMinute: 600 },
    { startMinute: 720, endMinute: 780 },
  ]);
});

/* ---------------------------- rezervace --------------------------------- */

async function reserve(
  overrides: Partial<Parameters<typeof createReservation>[0]> = {},
) {
  return createReservation({
    spotId: ctx.spot1.id,
    userId: ctx.teacher.id,
    actorId: ctx.teacher.id,
    actorIsAdmin: false,
    date: MONDAY,
    startMinute: 480,
    endMinute: 600,
    kind: 'RANGE',
    ...overrides,
  });
}

test('vytvoří rezervaci a spotřebuje jeden token', async () => {
  const result = await reserve();
  assert.equal(result.spotCode, '1');

  const quota = await getQuota(ctx.teacher.id, MONDAY);
  assert.equal(quota.usedTokens, 1);
  assert.equal(quota.remainingTokens, quota.totalTokens - 1);
});

test('odmítne překrývající se rezervaci na stejném místě', async () => {
  await reserve();
  await assert.rejects(
    () => reserve({ userId: ctx.other.id, actorId: ctx.other.id, startMinute: 540, endMinute: 660 }),
    /již rezervováno/,
  );
});

test('povolí navazující rezervaci jiného kantora bez překryvu', async () => {
  await reserve();
  const second = await reserve({
    userId: ctx.other.id,
    actorId: ctx.other.id,
    startMinute: 600,
    endMinute: 660,
  });
  assert.ok(second.id);
});

test('odmítne dvě rezervace téhož kantora ve stejný čas na různých místech', async () => {
  await reserve();
  await assert.rejects(
    () => reserve({ spotId: ctx.spot2.id, startMinute: 540, endMinute: 600 }),
    /už máte rezervované místo/,
  );
});

test('odmítne rezervaci mimo provozní dobu', async () => {
  await assert.rejects(() => reserve({ startMinute: 300, endMinute: 420 }), /provozní doby/);
  await assert.rejects(() => reserve({ startMinute: 900, endMinute: 1020 }), /provozní doby/);
});

test('odmítne rezervaci o víkendu', async () => {
  await assert.rejects(() => reserve({ date: addDays(MONDAY, 5) }), /nerezervuje/);
});

test('odmítne termín v minulosti', async () => {
  await assert.rejects(() => reserve({ date: addDays(todayString(), -1) }), /minulosti/);
});

test('odmítne rezervaci příliš daleko dopředu', async () => {
  await assert.rejects(() => reserve({ date: addDays(MONDAY, 70) }), /nejvýše/);
});

test('odmítne rezervaci kantora bez SPZ', async () => {
  await prisma.plate.deleteMany({ where: { userId: ctx.teacher.id } });
  await assert.rejects(() => reserve(), /SPZ/);
});

test('respektuje limit rezervací na jeden den', async () => {
  await reserve();
  await assert.rejects(
    () => reserve({ spotId: ctx.spot2.id, startMinute: 660, endMinute: 720 }),
    /na jeden den/i,
  );
});

test('vyčerpání týdenních tokenů zablokuje další rezervaci', async () => {
  await prisma.settings.update({ where: { id: 1 }, data: { weeklyTokens: 2, maxPerDay: 1 } });
  await reserve({ date: MONDAY });
  await reserve({ date: addDays(MONDAY, 1) });
  await assert.rejects(() => reserve({ date: addDays(MONDAY, 2) }), /volné rezervace/);
});

test('rezervace správcem nečerpá tokeny kantora', async () => {
  await createReservation({
    spotId: ctx.spot1.id,
    userId: ctx.teacher.id,
    actorId: ctx.other.id,
    actorIsAdmin: true,
    date: MONDAY,
    startMinute: 480,
    endMinute: 600,
  });
  const quota = await getQuota(ctx.teacher.id, MONDAY);
  assert.equal(quota.usedTokens, 0);
});

/* ------------------------- noční rezervace ------------------------------ */

test('noční rezervace nekoliduje s ranním slotem následujícího dne', async () => {
  await createReservation({
    spotId: ctx.spot1.id,
    userId: ctx.teacher.id,
    actorId: ctx.teacher.id,
    actorIsAdmin: false,
    date: MONDAY,
    startMinute: 960,
    endMinute: 1440 + 420,
    kind: 'OVERNIGHT',
  });
  const morning = await createReservation({
    spotId: ctx.spot1.id,
    userId: ctx.other.id,
    actorId: ctx.other.id,
    actorIsAdmin: false,
    date: addDays(MONDAY, 1),
    startMinute: 420,
    endMinute: 480,
  });
  assert.ok(morning.id);
});

test('noční rezervace blokuje odpolední slot následujícího dne u druhé noci', async () => {
  await createReservation({
    spotId: ctx.spot1.id,
    userId: ctx.teacher.id,
    actorId: ctx.teacher.id,
    actorIsAdmin: false,
    date: MONDAY,
    startMinute: 960,
    endMinute: 1440 + 420,
    kind: 'OVERNIGHT',
  });
  await assert.rejects(
    () =>
      createReservation({
        spotId: ctx.spot1.id,
        userId: ctx.other.id,
        actorId: ctx.other.id,
        actorIsAdmin: false,
        date: MONDAY,
        startMinute: 960,
        endMinute: 1440 + 420,
        kind: 'OVERNIGHT',
      }),
    /již rezervováno/,
  );
});

/* --------------------------- trestné body ------------------------------- */

test('potvrzené trestné body snižují týdenní příděl', async () => {
  await prisma.penaltyReport.create({
    data: {
      plate: '1AB2345',
      plateInput: '1AB 2345',
      reason: 'Zabírá dvě místa',
      points: 3,
      status: 'CONFIRMED',
      targetUserId: ctx.teacher.id,
    },
  });
  const quota = await getQuota(ctx.teacher.id, MONDAY);
  assert.equal(quota.penaltyPoints, 3);
  assert.equal(quota.penaltyLoss, 1);
  assert.equal(quota.totalTokens, quota.baseTokens - 1);
});

test('nepotvrzené a vypršelé body se nezapočítávají', async () => {
  await prisma.penaltyReport.createMany({
    data: [
      {
        plate: '1AB2345',
        plateInput: '1AB 2345',
        reason: 'Čeká na schválení',
        points: 5,
        status: 'PENDING',
        targetUserId: ctx.teacher.id,
      },
      {
        plate: '1AB2345',
        plateInput: '1AB 2345',
        reason: 'Staré',
        points: 5,
        status: 'CONFIRMED',
        targetUserId: ctx.teacher.id,
        occurredAt: new Date(Date.now() - 400 * 86_400_000),
      },
    ],
  });
  const quota = await getQuota(ctx.teacher.id, MONDAY);
  assert.equal(quota.penaltyPoints, 0);
});

test('při dosažení limitu bodů je rezervace zablokovaná', async () => {
  await prisma.penaltyReport.create({
    data: {
      plate: '1AB2345',
      plateInput: '1AB 2345',
      reason: 'Opakovaně blokuje výjezd',
      points: 10,
      status: 'CONFIRMED',
      targetUserId: ctx.teacher.id,
    },
  });
  const quota = await getQuota(ctx.teacher.id, MONDAY);
  assert.equal(quota.isBlocked, true);
  assert.equal(quota.totalTokens, 0);
  await assert.rejects(() => reserve(), /zablokována/);
});

test('ruční úprava správcem mění týdenní příděl', async () => {
  await prisma.tokenAdjustment.create({
    data: { userId: ctx.teacher.id, amount: 2, reason: 'dozor' },
  });
  const quota = await getQuota(ctx.teacher.id, MONDAY);
  assert.equal(quota.totalTokens, quota.baseTokens + 2);
});

/* ----------------------------- mřížka ----------------------------------- */

test('mřížka místa označí obsazený slot jménem držitele', async () => {
  await reserve({ startMinute: 480, endMinute: 600 });
  const week = await getSpotWeek(ctx.spot1.id, MONDAY, ctx.other.id);
  assert.ok(week);
  const monday = week.days.find((d) => d.date === MONDAY);
  assert.ok(monday);
  const taken = monday.slots.filter((s) => s.state === 'TAKEN');
  assert.equal(taken.length, 2); // 8:00–9:00 a 9:00–10:00
  assert.equal(taken[0].holderName, 'Jan Novák');
  assert.equal(monday.slots.find((s) => s.startMinute === 420)?.state, 'FREE');
});

test('vlastní rezervace se v mřížce označí jako MINE', async () => {
  await reserve();
  const week = await getSpotWeek(ctx.spot1.id, MONDAY, ctx.teacher.id);
  const monday = week!.days.find((d) => d.date === MONDAY)!;
  assert.equal(monday.slots.find((s) => s.startMinute === 480)?.state, 'MINE');
});

test('víkendové řádky jsou uzavřené', async () => {
  const week = await getSpotWeek(ctx.spot1.id, MONDAY, ctx.teacher.id);
  const saturday = week!.days.find((d) => d.date === addDays(MONDAY, 5))!;
  assert.equal(saturday.isOpen, false);
  assert.ok(saturday.slots.every((s) => s.state === 'CLOSED'));
});
