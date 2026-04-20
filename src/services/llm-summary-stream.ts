import axios from 'axios';
import { CampaignReport } from '../types/campaign';
import { StructuredLLMSummary } from '../types/llm';
import { withRetry } from '../utils/retry';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemma-4-31b-it:free';

/**
 * Builds the same prompt as the non-streaming version.
 * Extracted here to avoid importing private function from llm-summary.ts.
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
 * Streaming variant of generateCampaignSummary.
 *
 * Uses OpenRouter's SSE streaming (compatible with OpenAI's format)
 * to print tokens as they arrive instead of waiting for the full response.
 *
 * Differentiator: real-time output gives immediate feedback to the user
 * while still returning the same StructuredLLMSummary type.
 */
export async function generateCampaignSummaryStream(
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
      axios.post(
        OPENROUTER_API_URL,
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          temperature: 0.3,
          stream: true,
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/inlaze-test',
          },
          timeout: 60000,
          responseType: 'stream',
        }
      ),
    { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 10000 }
  );

  const fullContent = await processSSEStream(response.data);

  if (!fullContent) {
    throw new Error('LLM streaming returned empty content');
  }

  const structured = parseStructuredOutput(fullContent, reports);

  return {
    generatedAt: new Date(),
    model,
    summary: extractSummaryText(fullContent),
    criticalCampaigns: structured.criticalCampaigns,
    suggestedActions: structured.suggestedActions,
  };
}

/**
 * Processes the SSE stream from OpenRouter.
 * Each line follows the format: `data: {...}\n\n`
 * The stream ends with `data: [DONE]`.
 *
 * Tokens are printed to stdout as they arrive for real-time feedback.
 */
async function processSSEStream(stream: NodeJS.ReadableStream): Promise<string> {
  let fullContent = '';
  let buffer = '';

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6)) as {
              choices?: { delta?: { content?: string } }[];
            };
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              process.stdout.write(token);
              fullContent += token;
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    });

    stream.on('end', () => {
      // Process any remaining buffer
      if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
        try {
          const json = JSON.parse(buffer.trim().slice(6)) as {
            choices?: { delta?: { content?: string } }[];
          };
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            process.stdout.write(token);
            fullContent += token;
          }
        } catch {
          // Skip
        }
      }
      process.stdout.write('\n');
      resolve(fullContent);
    });

    stream.on('error', reject);
  });
}

function extractSummaryText(content: string): string {
  const jsonBlockStart = content.indexOf('```json');
  if (jsonBlockStart === -1) return content.trim();
  return content.substring(0, jsonBlockStart).trim();
}

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
    console.warn('[LLM Stream] Could not parse structured output — using fallback');
    return {
      criticalCampaigns: reports
        .filter((r) => r.status === 'critical')
        .map((r) => ({ id: r.id, name: r.name, metric: r.metric })),
      suggestedActions: ['Review critical campaigns immediately'],
    };
  }
}
