import 'dotenv/config';
import * as fs from 'fs/promises';
import { CampaignReport } from './types/campaign';
import { generateCampaignSummary } from './services/llm-summary';
import { generateCampaignSummaryStream } from './services/llm-summary-stream';
import { sendSummaryToDiscord } from './services/discord-notifier';

interface StoredResult {
  reports: CampaignReport[];
}

/**
 * Part 4 — LLM Integration
 *
 * Reads the campaign reports from Part 1 and generates an
 * executive summary using OpenRouter's free LLM tier.
 *
 * Supports two modes:
 * - Default: waits for full response, then prints it.
 * - Streaming (--stream flag): prints tokens as they arrive in real-time.
 *
 * After generating the summary, sends it to Discord if DISCORD_WEBHOOK_URL is set.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-... npm run start:part4
 *   OPENROUTER_API_KEY=sk-... npm run start:part4 -- --stream
 */
async function main(): Promise<void> {
  try {
    const raw = await fs.readFile('./data/campaign-reports.json', 'utf-8');
    const data: StoredResult = JSON.parse(raw);

    const useStream = process.argv.includes('--stream');

    if (useStream) {
      console.log(`[Part 4] Generating AI summary (streaming) for ${data.reports.length} campaigns...\n`);
      console.log('═══════════════════════════════════════════');
      console.log('       EXECUTIVE SUMMARY (streaming)');
      console.log('═══════════════════════════════════════════\n');

      const summary = await generateCampaignSummaryStream(data.reports);

      console.log('\n───────────────────────────────────────────');
      console.log('Structured Output:');
      console.log(`  Critical campaigns: ${summary.criticalCampaigns.length}`);
      summary.criticalCampaigns.forEach((c) => {
        console.log(`    🚨 ${c.name} (${c.id}): metric=${c.metric}`);
      });
      console.log(`  Suggested actions: ${summary.suggestedActions.length}`);
      summary.suggestedActions.forEach((a, i) => {
        console.log(`    ${i + 1}. ${a}`);
      });

      await fs.writeFile(
        './data/llm-summary.json',
        JSON.stringify(summary, null, 2),
        'utf-8'
      );
      console.log('\n[Part 4] Summary saved to data/llm-summary.json');

      // Send to Discord
      await trySendToDiscord(summary);
    } else {
      console.log(`[Part 4] Generating AI summary for ${data.reports.length} campaigns...\n`);

      const summary = await generateCampaignSummary(data.reports);

      console.log('═══════════════════════════════════════════');
      console.log('           EXECUTIVE SUMMARY');
      console.log('═══════════════════════════════════════════');
      console.log(`Model: ${summary.model}`);
      console.log(`Generated: ${summary.generatedAt.toISOString()}\n`);
      console.log(summary.summary);
      console.log('\n───────────────────────────────────────────');
      console.log('Structured Output:');
      console.log(`  Critical campaigns: ${summary.criticalCampaigns.length}`);
      summary.criticalCampaigns.forEach((c) => {
        console.log(`    🚨 ${c.name} (${c.id}): metric=${c.metric}`);
      });
      console.log(`  Suggested actions: ${summary.suggestedActions.length}`);
      summary.suggestedActions.forEach((a, i) => {
        console.log(`    ${i + 1}. ${a}`);
      });

      await fs.writeFile(
        './data/llm-summary.json',
        JSON.stringify(summary, null, 2),
        'utf-8'
      );
      console.log('\n[Part 4] Summary saved to data/llm-summary.json');

      // Send to Discord
      await trySendToDiscord(summary);
    }
  } catch (error) {
    console.error('[Part 4] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function trySendToDiscord(summary: Parameters<typeof sendSummaryToDiscord>[0]): Promise<void> {
  try {
    await sendSummaryToDiscord(summary);
  } catch (error) {
    console.warn(
      '[Part 4] Could not send to Discord:',
      error instanceof Error ? error.message : error
    );
  }
}

main();
