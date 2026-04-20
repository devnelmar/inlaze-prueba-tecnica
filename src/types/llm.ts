import { CampaignReport } from './campaign';

export interface LLMSummary {
  generatedAt: Date;
  model: string;
  summary: string;
  rawResponse?: unknown;
}

/**
 * Structured output — differentiator.
 * Parses the LLM response into actionable data instead of just text.
 */
export interface StructuredLLMSummary extends LLMSummary {
  criticalCampaigns: {
    id: string;
    name: string;
    metric: number;
  }[];
  suggestedActions: string[];
}

/** Shape of OpenRouter's chat completion response */
export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
