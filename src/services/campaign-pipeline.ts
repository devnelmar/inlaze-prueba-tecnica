import * as fs from 'fs/promises';
import * as path from 'path';
import { CampaignReport, DataSourceAdapter } from '../types/campaign';

export interface PipelineResult {
  source: string;
  reports: CampaignReport[];
  summary: {
    total: number;
    ok: number;
    warning: number;
    critical: number;
  };
  executedAt: Date;
}

/**
 * Executes the full campaign evaluation pipeline:
 * 1. Fetch raw data from the adapter
 * 2. Transform each item into a CampaignReport
 * 3. Save results to a JSON file
 * 4. Return a typed result with summary stats
 *
 * The pipeline is adapter-agnostic — pass any DataSourceAdapter
 * and it will work. This is the "core" that doesn't need changes
 * when adding new data sources.
 */
export async function runPipeline(
  adapter: DataSourceAdapter,
  outputPath = './data/campaign-reports.json'
): Promise<PipelineResult> {
  console.log(`\n[Pipeline] Starting evaluation with source: ${adapter.name}`);

  // Step 1: Fetch
  console.log(`[Pipeline] Fetching data from ${adapter.name}...`);
  const rawData = await adapter.fetchRawData();
  console.log(`[Pipeline] Received ${rawData.length} items`);

  // Step 2: Transform & evaluate
  const reports: CampaignReport[] = rawData.map((item) =>
    adapter.transformToCampaignReport(item)
  );

  // Step 3: Build summary
  const summary = {
    total: reports.length,
    ok: reports.filter((r) => r.status === 'ok').length,
    warning: reports.filter((r) => r.status === 'warning').length,
    critical: reports.filter((r) => r.status === 'critical').length,
  };

  const result: PipelineResult = {
    source: adapter.name,
    reports,
    summary,
    executedAt: new Date(),
  };

  // Step 4: Persist
  await saveResults(result, outputPath);

  // Step 5: Log summary
  console.log(`[Pipeline] Evaluation complete:`);
  console.log(`  ✅ OK: ${summary.ok}`);
  console.log(`  ⚠️  Warning: ${summary.warning}`);
  console.log(`  🚨 Critical: ${summary.critical}`);

  return result;
}

async function saveResults(
  result: PipelineResult,
  outputPath: string
): Promise<void> {
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[Pipeline] Results saved to ${outputPath}`);
}
