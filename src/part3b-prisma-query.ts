import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Intermediate type representing a campaign with its operator and filtered metrics.
 * Mirrors the Prisma query result shape with explicit includes.
 */
interface CampaignWithRelations {
  id: string;
  name: string;
  operatorId: string;
  operator: {
    id: string;
    name: string;
  };
  metrics: {
    roas: number;
  }[];
}

/**
 * Return type for the worst-ROAS query.
 * Explicitly typed — no 'any' anywhere.
 */
interface OperatorCampaignRoas {
  operatorId: string;
  operatorName: string;
  campaignId: string;
  campaignName: string;
  averageRoas: number;
}

/**
 * Retrieves campaigns with the worst average ROAS over the last 7 days,
 * grouped by operator, ordered from lowest to highest average ROAS.
 *
 * Strategy:
 * 1. Filter CampaignMetrics where recordedAt >= 7 days ago
 * 2. Group by campaign to compute avg ROAS per campaign
 * 3. Include the operator relationship for grouping context
 * 4. Sort by average ROAS ascending (worst first)
 *
 * Why this structure:
 * - Prisma doesn't support groupBy + relation includes natively with
 *   computed aggregates and joins in a single query, so we use a two-step
 *   approach: first get campaigns with their metrics filtered by date,
 *   then compute the average in application code.
 * - This avoids raw SQL while keeping the query readable and type-safe.
 * - For production with millions of rows, I'd consider a raw SQL view
 *   or a materialized aggregation table. At this scale, the approach is clean.
 */
async function getWorstRoasByOperator(
  days = 7
): Promise<OperatorCampaignRoas[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const campaigns = await prisma.campaign.findMany({
    where: {
      metrics: {
        some: {
          recordedAt: { gte: since },
        },
      },
    },
    include: {
      operator: true,
      metrics: {
        where: {
          recordedAt: { gte: since },
        },
        select: {
          roas: true,
        },
      },
    },
  });

  const results: OperatorCampaignRoas[] = (campaigns as CampaignWithRelations[])
    .map((campaign: CampaignWithRelations) => {
      const roasValues = campaign.metrics.map((m: { roas: number }) => m.roas);
      const averageRoas =
        roasValues.length > 0
          ? roasValues.reduce((sum: number, val: number) => sum + val, 0) / roasValues.length
          : 0;

      return {
        operatorId: campaign.operator.id,
        operatorName: campaign.operator.name,
        campaignId: campaign.id,
        campaignName: campaign.name,
        averageRoas: parseFloat(averageRoas.toFixed(4)),
      };
    })
    .sort((a: OperatorCampaignRoas, b: OperatorCampaignRoas) => a.averageRoas - b.averageRoas);

  return results;
}

async function main(): Promise<void> {
  try {
    console.log('[Part 3B] Querying worst ROAS by operator (last 7 days)...\n');
    const results = await getWorstRoasByOperator();

    if (results.length === 0) {
      console.log('[Part 3B] No metrics found for the last 7 days.');
      return;
    }

    results.forEach((r, i) => {
      console.log(
        `  ${i + 1}. [${r.operatorName}] ${r.campaignName} → Avg ROAS: ${r.averageRoas}`
      );
    });
  } catch (error) {
    console.error('[Part 3B] Error:', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

export { getWorstRoasByOperator, OperatorCampaignRoas };
