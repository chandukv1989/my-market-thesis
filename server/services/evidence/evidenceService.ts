/**
 * Evidence Service (Phase 8A)
 * 
 * Orchestrates multi-source evidence gathering across:
 * - SEC EDGAR XBRL facts and filings (SecEvidenceAdapter)
 * - Twelve Data / India market data quotes & candles (MarketEvidenceAdapter)
 * - Deterministic portfolio position weights & P&L (PortfolioEvidenceAdapter)
 * - Canonical security registry metadata (MetadataEvidenceAdapter)
 * 
 * Stores gathered evidence in EvidenceRepository with deterministic deduplication,
 * conflict tracking, and point-in-time filtering.
 */

import {
  EvidenceItem,
  EvidenceGatherOptions,
  ResearchEvidenceItem,
  SecurityIdentifier,
  IEvidenceRepository,
  EvidenceSourceType
} from '../../../src/types';
import { resolveSecurity } from '../../../src/data/canonicalSecurities';
import { EvidenceRepository, evidenceRepository } from './evidenceRepository';
import { secEvidenceAdapter } from './adapters/secEvidenceAdapter';
import { marketEvidenceAdapter } from './adapters/marketEvidenceAdapter';
import { portfolioEvidenceAdapter } from './adapters/portfolioEvidenceAdapter';
import { metadataEvidenceAdapter } from './adapters/metadataEvidenceAdapter';
import { finmagineEvidenceAdapter } from './adapters/finmagineEvidenceAdapter';
import { createHash } from 'crypto';
import { canRead, resolveOwnerId } from '../../auth/accessPolicy';

/** Source types produced by system providers from public data and therefore classified SHARED at gather time. */
export const SHARED_PROVIDER_SOURCE_TYPES: EvidenceSourceType[] = [
  'SEC_EDGAR',
  'OFFICIAL_FILINGS',
  'MARKET_DATA',
  'CANONICAL_METADATA',
  'FINMAGINE'
];

/**
 * Phase 38.2A: portfolio-derived evidence reflects one tenant's holdings. Stamp it PRIVATE to `ownerUserId`
 * with an owner-scoped evidence id so it can neither be read by, nor overwrite items of, other tenants.
 */
export function scopePortfolioEvidenceToOwner(items: EvidenceItem[], ownerUserId?: string): EvidenceItem[] {
  if (!ownerUserId) return items;
  const suffix = createHash('sha256').update(ownerUserId).digest('hex').slice(0, 8);
  for (const item of items) {
    if (resolveOwnerId(item) === ownerUserId && item.evidenceId.endsWith(`-${suffix}`)) continue;
    item.evidenceId = `${item.evidenceId}-${suffix}`;
    item.ownerUserId = ownerUserId;
    item.userId = ownerUserId;
    item.visibility = 'PRIVATE';
  }
  return items;
}

/**
 * Phase 38.2E: explicit visibility decision for freshly fetched provider evidence (never inferred from a missing owner).
 *  - carries an owner                                   -> PRIVATE
 *  - source type on the approved provider allow-list
 *    AND a named provider AND a parseable publication/retrieval date (verified provenance) -> SHARED
 *  - anything else (unknown source type, blank provider, undated, ambiguous)  -> PRIVATE (restricted: ownerless+PRIVATE)
 * Simulated/unavailable provider items keep their epistemic labels untouched; they are not private data, so they stay
 * on the same sharing path as real provider items (their label is never changed here).
 */
export function classifyProviderEvidence(item: EvidenceItem): 'SHARED' | 'PRIVATE' {
  if (resolveOwnerId(item)) return 'PRIVATE';
  if (item.visibility === 'PRIVATE') return 'PRIVATE';
  const hasProvider = typeof item.provider === 'string' && item.provider.trim().length > 0;
  const hasDate = [item.publishedAt, item.retrievedAt].some(d => !!d && !Number.isNaN(new Date(d as string).getTime()));
  if (SHARED_PROVIDER_SOURCE_TYPES.includes(item.sourceType) && hasProvider && hasDate) return 'SHARED';
  return 'PRIVATE';
}

export class EvidenceService {
  private repository: EvidenceRepository;

  constructor(repository?: EvidenceRepository) {
    // Phase 38.2E: ONE canonical in-memory repository. The decision service and every other consumer import the same
    // `evidenceRepository` singleton, so what gatherEvidence stores is what decisions read (previously this default was a
    // second, independent instance).
    this.repository = repository || evidenceRepository;
  }

  /**
   * Access the backing EvidenceRepository.
   */
  public getRepository(): IEvidenceRepository {
    return this.repository;
  }

  /**
   * Gather and normalize evidence across all configured adapters.
   * Deterministically deduplicates, preserves conflicts, and returns point-in-time items.
   */
  public async gatherEvidence(options: EvidenceGatherOptions): Promise<EvidenceItem[]> {
    const {
      securityIds,
      securities: explicitSecurities,
      asOfDate,
      portfolioContext,
      filter
    } = options;

    // 1. Resolve securities
    let targetSecurities: SecurityIdentifier[] = [];
    if (explicitSecurities && explicitSecurities.length > 0) {
      targetSecurities = explicitSecurities;
    } else if (securityIds && securityIds.length > 0) {
      targetSecurities = securityIds
        .map(id => resolveSecurity(id))
        .filter((s): s is SecurityIdentifier => s !== null);
    }

    const gatheredItems: EvidenceItem[] = [];
    const ownerUserId = options.ownerUserId;

    // 2. Gather Canonical Metadata Evidence
    for (const sec of targetSecurities) {
      const metaItem = metadataEvidenceAdapter.getMetadataEvidence(sec, asOfDate);
      gatheredItems.push(metaItem);
    }

    // 3. Gather Market Data Evidence (Quotes & Candles)
    for (const sec of targetSecurities) {
      const quotes = await marketEvidenceAdapter.getQuoteEvidence(sec, asOfDate);
      gatheredItems.push(...quotes);

      // Also gather historical candles if appropriate
      const candles = await marketEvidenceAdapter.getHistoricalEvidence(sec, asOfDate);
      gatheredItems.push(...candles);
    }

    // 4. Gather SEC EDGAR Evidence (for US equities)
    for (const sec of targetSecurities) {
      const secFacts = await secEvidenceAdapter.getEvidenceForSecurity(sec, asOfDate);
      gatheredItems.push(...secFacts);
    }

    // 5. Gather Portfolio Evidence (Calculated)
    if ((portfolioContext?.holdings && portfolioContext.holdings.length > 0) || portfolioContext?.metrics) {
      const portItems = portfolioEvidenceAdapter.getEvidenceFromPortfolio(
        portfolioContext,
        targetSecurities,
        asOfDate
      );
      // Phase 38.2A: portfolio-derived evidence reflects one tenant's holdings. It is stamped PRIVATE to the
      // requesting owner with an owner-scoped id so it can neither be read by, nor overwrite items of, other tenants.
      scopePortfolioEvidenceToOwner(portItems, ownerUserId);
      gatheredItems.push(...portItems);
    }

    // 6. Gather Supplemental Finmagine Evidence (Research, Ratios, Valuation)
    const asOfStr = asOfDate instanceof Date ? asOfDate.toISOString() : asOfDate;
    for (const sec of targetSecurities) {
      try {
        const finmagineItems = await finmagineEvidenceAdapter.getEvidenceForSecurity(sec, asOfStr);
        gatheredItems.push(...finmagineItems);
      } catch (err) {
        console.warn(`[EvidenceService] Finmagine gathering error for ${sec.symbol}:`, err instanceof Error ? err.message : String(err));
      }
    }

    // Phase 38.2A: explicit classification. Items fetched from system providers (canonical metadata, market data,
    // SEC EDGAR, Finmagine) are public reference data and are classified SHARED here, by provenance. Items that
    // carry an owner stay PRIVATE. Nothing is ever classified public merely because an owner is missing.
    for (const item of gatheredItems) {
      item.visibility = classifyProviderEvidence(item);
    }

    // 7. Register into EvidenceRepository (deduplicates and flags conflicts)
    this.repository.addEvidenceBatch(gatheredItems);

    // 7. Point-in-time and filtered return (always restricted to what the caller may read)
    const readable = (items: EvidenceItem[]) => items.filter(i => canRead(i, ownerUserId));
    if (asOfDate) {
      return readable(this.repository.getEvidenceAvailableAsOf(asOfDate, filter));
    } else if (filter) {
      return readable(this.repository.queryEvidence(filter));
    }

    // Default: return all newly gathered items (sanitized from repository)
    return readable(gatheredItems.map(item => this.repository.getEvidence(item.evidenceId) || item));
  }

  /**
   * Bridge: Convert EvidenceItem to Phase 7A ResearchEvidenceItem.
   * Ensures 100% backward-compatibility for GeminiResearchEngine.
   */
  public toResearchEvidenceItem(item: EvidenceItem): ResearchEvidenceItem {
    return {
      id: item.evidenceId,
      securityId: item.securityId,
      symbol: (item.sourceReference?.symbol as string) || item.securityId,
      sourceType: item.sourceType as EvidenceSourceType,
      provider: item.provider,
      epistemicStatus: item.epistemicStatus as 'REAL' | 'SIMULATED' | 'UNAVAILABLE' | 'CALCULATED',
      isSimulated: item.isSimulated,
      retrievedAt: item.retrievedAt,
      description: item.content || item.title,
      filingDate: item.filingDate,
      accessionNumber: (item.sourceReference?.accessionNumber as string) || item.documentId,
      data: (typeof item.structuredValue === 'object' && item.structuredValue !== null)
        ? (item.structuredValue as Record<string, unknown>)
        : { value: item.structuredValue, unit: item.unit, currency: item.currency }
    };
  }
}

export const evidenceService = new EvidenceService();
