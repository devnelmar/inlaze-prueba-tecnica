import axios from 'axios';
import { CampaignReport } from '../types/campaign';
import {
  LLMSummary,
  StructuredLLMSummary,
  OpenRouterResponse,
} from '../types/llm';
import { withRetry } from '../utils/retry';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemma-4-31b-it:free';

/**
 * Builds a prompt with concrete instructions for the LLM.
 * The prompt asks for both a natural-language summary AND a JSON block
 * for structured output (differentiator).
 */
function buildPrompt(reports: CampaignReport[]): string {
  const reportsJson = JSON.stringify(
    reports.map((r) => ({
      id: r.id,
      name: r.name,
      metric: r.metric,
      status: r.status,
    })),
    null,
    2
  );

  return `You are a campaign performance analyst. Analyze the following campaign reports and produce an executive summary.

## Campaign Data
${reportsJson}

## Instructions
1. **Critical campaigns**: Identify and highlight every campaign with status "critical". Explain why each is concerning.
2. **Warning summary**: Summarize the overall state of campaigns in "warning" status. Group them if patterns exist.
3. **Suggested actions**: Provide at least one concrete, actionable recommendation based on the data.
4. **General overview**: Give a brief overall assessment of portfolio health.

## Output Format
First, write the executive summary in natural language (2-3 paragraphs).

Then, output a JSON block wrapped in \`\`\`json tags with this exact structure:
\`\`\`json
{
  "criticalCampaigns": [{"id": "...", "name": "...", "metric": 0.0}],
  "suggestedActions": ["Action 1", "Action 2"]
}
\`\`\`

Be concise and data-driven. Do not invent data that is not in the reports.`;
}

/**
 * Calls the OpenRouter API to generate a campaign summary.
 *
 * Provider choice (documented in README):
 * OpenRouter with Gemma 4 31B — free tier, no billing required,
 * sufficient quality for structured analysis tasks.
 */
export async function generateCampaignSummary(
  reports: CampaignReport[],
  apiKey?: string,
  model = DEFAULT_MODEL
): Promise<StructuredLLMSummary> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY is required. Get a free key at https://openrouter.ai/keys'
    );
  }

  if (reports.length === 0) {
    return {
      generatedAt: new Date(),
      model,
      summary: 'No campaign reports to analyze.',
      criticalCampaigns: [],
      suggestedActions: [],
    };
  }

  const prompt = buildPrompt(reports);

  const response = await withRetry(
    () =>
      axios.post<OpenRouterResponse>(
        OPENROUTER_API_URL,
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          temperature: 0.3, // Low temp for analytical consistency
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/inlaze-test',
          },
          timeout: 30000,
        }
      ),
    { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 10000 }
  );

  const content = response.data?.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string') {
    throw new Error('LLM returned an empty or invalid response');
  }

  // Parse structured output from the response
  const structured = parseStructuredOutput(content, reports);

  return {
    generatedAt: new Date(),
    model: response.data.model || model,
    summary: extractSummaryText(content),
    rawResponse: response.data,
    criticalCampaigns: structured.criticalCampaigns,
    suggestedActions: structured.suggestedActions,
  };
}

/**
 * Extracts the natural-language summary (everything before the JSON block).
 */
function extractSummaryText(content: string): string {
  const jsonBlockStart = content.indexOf('```json');
  if (jsonBlockStart === -1) return content.trim();
  return content.substring(0, jsonBlockStart).trim();
}

/**
 * Parses the structured JSON block from the LLM response.
 * Falls back gracefully if the LLM doesn't produce valid JSON.
 */
function parseStructuredOutput(
  content: string,
  reports: CampaignReport[]
): Pick<StructuredLLMSummary, 'criticalCampaigns' | 'suggestedActions'> {
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch?.[1]) throw new Error('No JSON block found');

    const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;

    const criticalCampaigns = Array.isArray(parsed.criticalCampaigns)
      ? parsed.criticalCampaigns.map((c: Record<string, unknown>) => ({
          id: String(c.id || ''),
          name: String(c.name || ''),
          metric: Number(c.metric || 0),
        }))
      : [];

    const suggestedActions = Array.isArray(parsed.suggestedActions)
      ? parsed.suggestedActions.map(String)
      : [];

    return { criticalCampaigns, suggestedActions };
  } catch {
    // Fallback: extract critical campaigns from the original data
    console.warn('[LLM] Could not parse structured output — using fallback');
    return {
      criticalCampaigns: reports
        .filter((r) => r.status === 'critical')
        .map((r) => ({ id: r.id, name: r.name, metric: r.metric })),
      suggestedActions: ['Review critical campaigns immediately'],
    };
  }
}
