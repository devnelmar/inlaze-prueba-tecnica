import 'dotenv/config';
import axios from 'axios';
import * as fs from 'fs/promises';

const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/campaign-alerts';
const REPORTS_PATH = './data/campaign-reports.json';

/**
 * Sends the Part 1 output to the N8N webhook (Part 2).
 * This bridges both parts into a connected pipeline.
 *
 * Usage: N8N_WEBHOOK_URL=http://... npm run webhook:send
 */
async function main(): Promise<void> {
  try {
    const raw = await fs.readFile(REPORTS_PATH, 'utf-8');
    const data = JSON.parse(raw);

    console.log(`[Webhook] Sending ${data.reports.length} reports to ${WEBHOOK_URL}...`);

    const response = await axios.post(WEBHOOK_URL, data, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    console.log(`[Webhook] Response: ${response.status} ${response.statusText}`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`[Webhook] HTTP Error: ${error.response?.status || 'No response'} — ${error.message}`);
    } else {
      console.error('[Webhook] Error:', error instanceof Error ? error.message : error);
    }
    process.exit(1);
  }
}

main();
