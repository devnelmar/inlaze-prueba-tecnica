import 'dotenv/config';
import { CoinGeckoAdapter } from './services/coingecko-adapter';
import { runPipeline } from './services/campaign-pipeline';

/**
 * Part 1 — API Integration & Business Logic
 *
 * Fetches cryptocurrency market data from CoinGecko,
 * transforms it into CampaignReport[], evaluates thresholds,
 * and saves the result to data/campaign-reports.json.
 *
 * This output is consumed by Parts 2, 3, and 4.
 */
async function main(): Promise<void> {
  try {
    const adapter = new CoinGeckoAdapter('usd', 10);
    const result = await runPipeline(adapter);

    console.log('\n[Part 1] Reports generated:');
    result.reports.forEach((r) => {
      const icon = r.status === 'critical' ? '🚨' : r.status === 'warning' ? '⚠️' : '✅';
      console.log(`  ${icon} ${r.name}: metric=${r.metric} → ${r.status}`);
    });
  } catch (error) {
    console.error('[Part 1] Fatal error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
