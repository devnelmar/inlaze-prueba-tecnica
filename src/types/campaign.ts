/**
 * Core campaign report type used across all parts of the system.
 * Represents a normalized campaign evaluation regardless of the data source.
 */
export type CampaignStatus = 'ok' | 'warning' | 'critical';

export type CampaignReport = {
  id: string;
  name: string;
  metric: number;
  status: CampaignStatus;
  evaluatedAt: Date;
};

/**
 * Threshold configuration for campaign evaluation.
 * Externalized to allow easy tuning without code changes.
 */
export interface ThresholdConfig {
  warningBelow: number;
  criticalBelow: number;
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  warningBelow: 2.5,
  criticalBelow: 1.0,
};

/**
 * Generic interface for any data source adapter.
 * Allows adding new data sources (Google Ads, Meta, etc.) without
 * modifying the core evaluation logic — just implement this interface.
 */
export interface DataSourceAdapter<TRaw = unknown> {
  readonly name: string;
  fetchRawData(): Promise<TRaw[]>;
  transformToCampaignReport(raw: TRaw, thresholds?: ThresholdConfig): CampaignReport;
}
