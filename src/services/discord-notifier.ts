import axios from 'axios';
import { StructuredLLMSummary } from '../types/llm';

/**
 * Sends an LLM-generated campaign summary to a Discord channel
 * via webhook. Uses Discord's embed format for rich formatting.
 *
 * Differentiator: connects the Part 4 LLM summary to the
 * notification channel used in Part 2's N8N flow.
 */
export async function sendSummaryToDiscord(
  summary: StructuredLLMSummary,
  webhookUrl?: string
): Promise<void> {
  const url = webhookUrl || process.env.DISCORD_WEBHOOK_URL;

  if (!url) {
    console.warn('[Discord] DISCORD_WEBHOOK_URL not set — skipping notification');
    return;
  }

  const criticalList = summary.criticalCampaigns.length > 0
    ? summary.criticalCampaigns
        .map((c) => `• **${c.name}** (${c.id}): metric=${c.metric}`)
        .join('\n')
    : '_None_';

  const actionsList = summary.suggestedActions.length > 0
    ? summary.suggestedActions.map((a, i) => `${i + 1}. ${a}`).join('\n')
    : '_None_';

  const payload = {
    embeds: [
      {
        title: '📊 Campaign AI Summary',
        description: summary.summary.substring(0, 2048),
        color: summary.criticalCampaigns.length > 0 ? 0xff0000 : 0x00ff00,
        fields: [
          {
            name: '🚨 Critical Campaigns',
            value: criticalList.substring(0, 1024),
            inline: false,
          },
          {
            name: '💡 Suggested Actions',
            value: actionsList.substring(0, 1024),
            inline: false,
          },
          {
            name: 'Model',
            value: summary.model,
            inline: true,
          },
        ],
        timestamp: summary.generatedAt instanceof Date
          ? summary.generatedAt.toISOString()
          : new Date().toISOString(),
        footer: { text: 'Inlaze Campaign Monitor — AI Summary' },
      },
    ],
  };

  await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  console.log('[Discord] LLM summary sent successfully');
}
