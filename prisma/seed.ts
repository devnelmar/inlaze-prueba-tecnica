import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds the database with sample operators, campaigns and metrics
 * so that Part 3B can demonstrate a real Prisma query with results.
 */
async function main(): Promise<void> {
  // Clean existing data
  await prisma.campaignMetric.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.operator.deleteMany();

  const now = new Date();

  const operator1 = await prisma.operator.create({
    data: {
      name: 'Operator Alpha',
      campaigns: {
        create: [
          {
            name: 'Campaign Facebook Ads',
            metrics: {
              create: [
                { roas: 0.8, recordedAt: daysAgo(now, 1) },
                { roas: 0.6, recordedAt: daysAgo(now, 2) },
                { roas: 0.9, recordedAt: daysAgo(now, 5) },
              ],
            },
          },
          {
            name: 'Campaign Google Ads',
            metrics: {
              create: [
                { roas: 3.2, recordedAt: daysAgo(now, 1) },
                { roas: 2.8, recordedAt: daysAgo(now, 3) },
                { roas: 3.5, recordedAt: daysAgo(now, 6) },
              ],
            },
          },
        ],
      },
    },
  });

  const operator2 = await prisma.operator.create({
    data: {
      name: 'Operator Beta',
      campaigns: {
        create: [
          {
            name: 'Campaign TikTok Ads',
            metrics: {
              create: [
                { roas: 1.1, recordedAt: daysAgo(now, 1) },
                { roas: 0.9, recordedAt: daysAgo(now, 4) },
                { roas: 1.3, recordedAt: daysAgo(now, 6) },
              ],
            },
          },
          {
            name: 'Campaign Instagram Ads',
            metrics: {
              create: [
                { roas: 4.5, recordedAt: daysAgo(now, 2) },
                { roas: 4.1, recordedAt: daysAgo(now, 5) },
              ],
            },
          },
        ],
      },
    },
  });

  // Campaign with metrics older than 7 days — should NOT appear in query
  await prisma.operator.create({
    data: {
      name: 'Operator Gamma',
      campaigns: {
        create: [
          {
            name: 'Campaign Old',
            metrics: {
              create: [
                { roas: 0.1, recordedAt: daysAgo(now, 15) },
                { roas: 0.2, recordedAt: daysAgo(now, 20) },
              ],
            },
          },
        ],
      },
    },
  });

  console.log('[Seed] Database seeded successfully:');
  console.log(`  - ${operator1.name}: 2 campaigns with recent metrics`);
  console.log(`  - ${operator2.name}: 2 campaigns with recent metrics`);
  console.log(`  - Operator Gamma: 1 campaign with old metrics (should be excluded by query)`);
}

function daysAgo(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

main()
  .catch((e) => {
    console.error('[Seed] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
