import axios from 'axios';
import { withRetry } from '../utils/retry';
import {
  CampaignReport,
  CampaignStatus,
  DataSourceAdapter,
  ThresholdConfig,
  DEFAULT_THRESHOLDS,
} from '../types/campaign';

/**
 * Raw response shape from CoinGecko /coins/markets endpoint.
 * Only the fields we actually use are typed — avoids over-typing
 * a third-party API while still preventing 'any' leaks.
 */
interface CoinGeckoMarketItem {
  id: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap_rank: number | null;
}

/**
 * Validates that a raw API response item has the shape we expect.
 * Defensive parsing — we don't trust external APIs to always return
 * consistent shapes, especially free-tier endpoints.
 */
function isCoinGeckoMarketItem(item: unknown): item is CoinGeckoMarketItem {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.current_price === 'number'
  );
}

/**
 * CoinGecko adapter — maps cryptocurrency market data to CampaignReport.
 *
 * Mapping rationale (documented in README):
 * - Each coin = a campaign (identifiable entity with performance metrics)
 * - price_change_percentage_24h = metric (simulates CTR/ROAS — a % that
 *   indicates "how well is this performing?")
 * - Thresholds evaluate if the "campaign" needs attention
 *
 * This adapter is intentionally decoupled from the evaluation logic.
 * To add Google Ads, Meta, or any other source, implement DataSourceAdapter
 * and register it — zero changes to the core evaluation pipeline.
 */
export class CoinGeckoAdapter implements DataSourceAdapter<CoinGeckoMarketItem> {
  readonly name = 'CoinGecko';

  private readonly baseUrl = 'https://api.coingecko.com/api/v3';
  private readonly currency: string;
  private readonly limit: number;

  constructor(currency = 'usd', limit = 10) {
    this.currency = currency;
    this.limit = limit;
  }

  async fetchRawData(): Promise<CoinGeckoMarketItem[]> {
    const response = await withRetry(() =>
      axios.get<unknown[]>(`${this.baseUrl}/coins/markets`, {
        params: {
          vs_currency: this.currency,
          order: 'market_cap_desc',
          per_page: this.limit,
          page: 1,
          sparkline: false,
        },
        timeout: 10000,
      })
    );

    if (!Array.isArray(response.data)) {
      throw new Error(
        `[${this.name}] Expected array response, got ${typeof response.data}`
      );
    }

    const validated = response.data.filter(isCoinGeckoMarketItem);

    if (validated.length === 0) {
      throw new Error(
        `[${this.name}] No valid items in API response (${response.data.length} items failed validation)`
      );
    }

    if (validated.length < response.data.length) {
      console.warn(
        `[${this.name}] ${response.data.length - validated.length} items failed validation and were skipped`
      );
    }

    return validated;
  }

  transformToCampaignReport(
    raw: CoinGeckoMarketItem,
    thresholds: ThresholdConfig = DEFAULT_THRESHOLDS
  ): CampaignReport {
    // Normalize: null price change = 0 (no data available)
    const metric = raw.price_change_percentage_24h ?? 0;
    const status = evaluateStatus(metric, thresholds);

    return {
      id: raw.id,
      name: raw.name,
      metric: parseFloat(metric.toFixed(4)),
      status,
      evaluatedAt: new Date(),
    };
  }
}

function evaluateStatus(
  metric: number,
  thresholds: ThresholdConfig
): CampaignStatus {
  if (metric < thresholds.criticalBelow) return 'critical';
  if (metric < thresholds.warningBelow) return 'warning';
  return 'ok';
}
