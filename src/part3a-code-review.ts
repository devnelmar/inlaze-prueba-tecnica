import axios from 'axios';

// ---------------------------------------------------------------------------
// Original code from the team (with problems identified in README):
//
// Problem 1: Division by zero — if impressions is 0, ctr becomes Infinity/NaN.
//            No guard before `data.clicks / data.impressions`.
//
// Problem 2: No error handling — if one campaign fetch fails, the entire
//            processCampaigns function throws and we lose all previously
//            fetched results. No try/catch anywhere.
//
// Problem 3: No response validation — blindly trusts that response.data has
//            the expected shape. A missing field would propagate as undefined.
//
// Problem 4: Sequential execution — campaigns are fetched one by one.
//            With 100 campaigns, this is 100x slower than necessary.
//
// Problem 5: No typing on the return value — the function returns an
//            untyped object literal, losing TypeScript's safety guarantees.
// ---------------------------------------------------------------------------

/** Typed return shape for a campaign's computed data */
interface CampaignData {
  id: string;
  clicks: number;
  impressions: number;
  ctr: number;
}

/** Expected shape from the API response */
interface CampaignApiResponse {
  id: string;
  clicks: number;
  impressions: number;
}

/** Validates that the API returned the fields we need */
function isValidApiResponse(data: unknown): data is CampaignApiResponse {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.clicks === 'number' &&
    typeof obj.impressions === 'number'
  );
}

/**
 * Fetches a single campaign and computes its CTR.
 * Fix 1: Guards against division by zero.
 * Fix 2: Wraps in try/catch so one failure doesn't kill the batch.
 * Fix 3: Validates API response shape before using it.
 * Fix 5: Return type is explicitly CampaignData.
 */
async function fetchCampaignData(campaignId: string): Promise<CampaignData> {
  const response = await axios.get(`https://api.example.com/campaigns/${campaignId}`);
  const data: unknown = response.data;

  if (!isValidApiResponse(data)) {
    throw new Error(`Invalid API response for campaign ${campaignId}`);
  }

  return {
    id: data.id,
    clicks: data.clicks,
    impressions: data.impressions,
    ctr: data.impressions > 0 ? data.clicks / data.impressions : 0, // Fix 1: safe division
  };
}

/**
 * Processes campaigns with controlled concurrency (max 3 simultaneous).
 * Fix 4: Replaces sequential loop with concurrent execution using p-limit.
 * Fix 2: Individual failures are caught — partial results are returned.
 *
 * Differentiator: concurrency is limited to 3 to respect external API rate limits.
 */
async function processCampaigns(
  ids: string[],
  concurrencyLimit = 3
): Promise<CampaignData[]> {
  // Dynamic import because p-limit is ESM-only in v4+
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(concurrencyLimit);

  const tasks = ids.map((id) =>
    limit(async () => {
      try {
        return await fetchCampaignData(id);
      } catch (error) {
        console.error(
          `[processCampaigns] Failed to fetch campaign ${id}: ${
            error instanceof Error ? error.message : error
          }`
        );
        return null; // Don't break the batch — skip failed campaigns
      }
    })
  );

  const results = await Promise.all(tasks);
  return results.filter((r): r is CampaignData => r !== null);
}

// ---------------------------------------------------------------------------
// New function: filter and sort campaigns by low CTR
// ---------------------------------------------------------------------------

/**
 * Returns campaigns with CTR below the given threshold (default 0.02),
 * sorted from lowest to highest CTR.
 */
function getLowPerformingCampaigns(
  campaigns: CampaignData[],
  threshold = 0.02
): CampaignData[] {
  return campaigns
    .filter((c) => c.ctr < threshold)
    .sort((a, b) => a.ctr - b.ctr);
}

// ---------------------------------------------------------------------------
// Demo execution
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --- Part A: Demo with real API (will fail to show error handling) ---
  const sampleIds = ['camp-001', 'camp-002', 'camp-003', 'camp-004', 'camp-005'];

  console.log('[Part 3A] === Demo 1: Error handling with real API call ===');
  console.log('[Part 3A] Using api.example.com — will fail intentionally to demo error handling.\n');

  const apiResults = await processCampaigns(sampleIds);
  console.log(`\n[Part 3A] Successfully fetched: ${apiResults.length}/${sampleIds.length}`);
  console.log('[Part 3A] All failed gracefully — no crash, partial results returned.\n');

  // --- Part B: Demo with mock data to show the full pipeline working ---
  console.log('[Part 3A] === Demo 2: Full pipeline with mock data ===\n');

  const mockCampaigns: CampaignData[] = [
    { id: 'camp-001', clicks: 150, impressions: 10000, ctr: 0.015 },
    { id: 'camp-002', clicks: 320, impressions: 8000,  ctr: 0.040 },
    { id: 'camp-003', clicks: 5,   impressions: 12000, ctr: 0.000417 },
    { id: 'camp-004', clicks: 80,  impressions: 5000,  ctr: 0.016 },
    { id: 'camp-005', clicks: 200, impressions: 0,     ctr: 0 },  // impressions=0 → ctr=0 (Fix 1)
  ];

  console.log('[Part 3A] All campaigns:');
  mockCampaigns.forEach((c) => {
    console.log(`  ${c.id}: clicks=${c.clicks}, impressions=${c.impressions}, CTR=${c.ctr.toFixed(6)}`);
  });

  const lowPerformers = getLowPerformingCampaigns(mockCampaigns);
  console.log(`\n[Part 3A] Low CTR campaigns (< 0.02): ${lowPerformers.length}`);
  lowPerformers.forEach((c) => {
    console.log(`  ⚠️ ${c.id}: CTR=${c.ctr.toFixed(6)}`);
  });

  console.log(`\n[Part 3A] High CTR campaigns (>= 0.02): ${mockCampaigns.length - lowPerformers.length}`);
  mockCampaigns
    .filter((c) => c.ctr >= 0.02)
    .forEach((c) => {
      console.log(`  ✅ ${c.id}: CTR=${c.ctr.toFixed(6)}`);
    });
}

main();

export { fetchCampaignData, processCampaigns, getLowPerformingCampaigns, CampaignData };
