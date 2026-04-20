import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { CoinGeckoAdapter } from '../services/coingecko-adapter';
import { runPipeline } from '../services/campaign-pipeline';
import { generateCampaignSummary } from '../services/llm-summary';
import { sendSummaryToDiscord } from '../services/discord-notifier';
import axios from 'axios';

const QUEUE_NAME = 'campaign-monitor';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const INTERVAL_MINUTES = parseInt(process.env.MONITOR_INTERVAL_MIN || '5', 10);
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/campaign-alerts';

/**
 * BullMQ recurring job — Differentiator.
 *
 * Runs the full campaign monitoring pipeline on a schedule:
 * 1. Fetch data from CoinGecko (Part 1 pipeline)
 * 2. Send results to N8N webhook (Part 2 connection)
 * 3. Generate LLM summary (Part 4)
 * 4. Send summary to Discord (Part 4 differentiator)
 *
 * This replaces manual execution of Parts 1+4 with an automated,
 * repeatable job managed by BullMQ with Redis as the backend.
 *
 * Usage:
 *   redis-server &
 *   OPENROUTER_API_KEY=sk-... npm run start:worker
 */
async function main(): Promise<void> {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

  console.log(`[Worker] Connecting to Redis at ${REDIS_URL}...`);
  await connection.ping();
  console.log('[Worker] Redis connected');

  const queue = new Queue(QUEUE_NAME, { connection });

  // Remove any previous repeatable job to avoid duplicates on restart
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Schedule the repeatable job
  await queue.add(
    'evaluate-campaigns',
    {},
    {
      repeat: { every: INTERVAL_MINUTES * 60 * 1000 },
    }
  );

  console.log(`[Worker] Job scheduled: every ${INTERVAL_MINUTES} minutes`);
  console.log('[Worker] Waiting for jobs... (Ctrl+C to stop)\n');

  // Run once immediately
  await queue.add('evaluate-campaigns', {});

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      console.log(`\n[Job] Starting campaign evaluation at ${new Date().toISOString()}`);

      // Step 1: Run pipeline
      const adapter = new CoinGeckoAdapter('usd', 10);
      const result = await runPipeline(adapter);

      // Step 2: Send to N8N webhook
      try {
        await axios.post(WEBHOOK_URL, result, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        });
        console.log(`[Job] Reports sent to webhook: ${WEBHOOK_URL}`);
      } catch (err) {
        console.warn(
          '[Job] Webhook send failed:',
          err instanceof Error ? err.message : err
        );
      }

      // Step 3: Generate LLM summary (if API key available)
      if (process.env.OPENROUTER_API_KEY) {
        try {
          const summary = await generateCampaignSummary(result.reports);
          console.log(`[Job] LLM summary generated (${summary.criticalCampaigns.length} critical)`);

          // Step 4: Send summary to Discord
          await sendSummaryToDiscord(summary);
        } catch (err) {
          console.warn(
            '[Job] LLM summary failed:',
            err instanceof Error ? err.message : err
          );
        }
      }

      console.log(`[Job] Cycle complete. Next run in ${INTERVAL_MINUTES} minutes.`);
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Worker] Shutting down...');
    await worker.close();
    await queue.close();
    await connection.quit();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Worker] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
