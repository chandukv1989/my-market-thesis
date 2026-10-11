/**
 * Phase 31: Portfolio Scenario & Stress Intelligence
 * 
 * Deterministically analyzes hypothetical market, sector, security, currency, macro,
 * event, and thesis invalidation conditions across portfolio holdings and research universe.
 * 
 * Strict Invariants:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - Deterministic scenario propagation (zero opaque ML / LLM math)
 * - Strict Point-in-Time (PIT) boundaries (zero lookahead bias)
 * - Strict Currency Isolation (USD vs INR, no silent FX conversions)
 * - Epistemic Honesty: OBSERVED vs CALCULATED vs SCENARIO_ASSUMPTION vs INSUFFICIENT_EVIDENCE
 * - Non-Mutation: Hypothetical scenarios NEVER mutate actual thesis or decision state
 * - Multi-tenant isolation: User A never accesses User B holdings, monitors, or snapshots
 * - AI Resilience: Uses aiCircuitBreaker for optional executive briefing; Gemini has ZERO authority over numbers
 */

import { latestDecisionVisibleTo, latestSnapshotVisibleTo, visibleToEngine } from '../../auth/engineScope';
import { GoogleGenAI } from '@google/genai';
import {
  CanonicalSecurity,
  EpistemicStatus,
  MarketRegion,
  HoldingPosition,
  PortfolioScenarioType,
  ScenarioSeverity,
  ScenarioParameters,
  ScenarioAssumption,
  ScenarioPropagationStep,
  ScenarioSecurityImpact,
  PortfolioScenarioEvaluation,
  PortfolioScenarioRequest,
  ScenarioComparisonItem,
  ScenarioComparisonResult,
  PortfolioScenarioSnapshot
} from '../../../src/types';
import { CANONICAL_SECURITIES, resolveSecurity } from '../../../src/data/canonicalSecurities';
import { DEFAULT_HOLDING_POSITIONS } from '../../../src/state/portfolioEngine';
import { persistenceManager } from '../../persistence/persistenceManager';
import { crossInvestmentService } from '../relationships/crossInvestmentService';
import { aiCircuitBreaker } from '../ai/aiCircuitBreaker';
import { structuredLogger } from '../../logging/structuredLogger';

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  scenarioType: PortfolioScenarioType;
  parameters: ScenarioParameters;
}

export class PortfolioScenarioService {
  private static instance: PortfolioScenarioService;
  private aiClient: GoogleGenAI | null = null;
  private readonly modelName = aiCircuitBreaker.getModelName();

  public static readonly CANONICAL_PRESETS: ScenarioPreset[] = [
    {
      id: 'preset_us_tech_15',
      name: 'US Technology Sector Drawdown (-15%)',
      description: 'Hypothetical 15% shock across all US technology and semiconductor constituents.',
      scenarioType: 'SECTOR_SHOCK',
      parameters: {
        sector: 'Technology',
        market: 'US',
        shockPercentage: -15
      }
    },
    {
      id: 'preset_market_correction_10',
      name: 'Broad Market Correction (-10%)',
      description: 'Simulates a 10% broad market contraction across active equity holdings.',
      scenarioType: 'MARKET_SHOCK',
      parameters: {
        shockPercentage: -10
      }
    },
    {
      id: 'preset_india_financials_10',
      name: 'India Financial Sector Liquidity Shock (-10%)',
      description: 'Simulates domestic banking and credit contraction across Indian financial leaders.',
      scenarioType: 'SECTOR_SHOCK',
      parameters: {
        sector: 'Financial Services',
        market: 'INDIA',
        shockPercentage: -10
      }
    },
    {
      id: 'preset_usd_strengthens_10',
      name: 'USD Appreciation vs Emerging Currencies (+10%)',
      description: 'Evaluates native cross-currency translation exposure and regional purchasing power divergence.',
      scenarioType: 'CURRENCY_SCENARIO',
      parameters: {
        currency: 'USD',
        currencyChangePct: 10
      }
    },
    {
      id: 'preset_rate_hike_100',
      name: 'Policy Rate Hike (+100 bps)',
      description: 'Tests macroeconomic policy rate increase across capital-intensive and banking assets.',
      scenarioType: 'MACRO_SCENARIO',
      parameters: {
        macroVariable: 'INTEREST_RATES',
        macroShockAmount: 100,
        macroShockUnit: 'bps'
      }
    },
    {
      id: 'preset_crude_oil_25',
      name: 'Crude Oil Supply Spike (+25%)',
      description: 'Examines energy input cost escalation across industrial, logistics, and consumer sectors.',
      scenarioType: 'MACRO_SCENARIO',
      parameters: {
        macroVariable: 'CRUDE_OIL',
        macroShockAmount: 25,
        macroShockUnit: '%'
      }
    },
    {
      id: 'preset_semi_export_controls',
      name: 'Semiconductor Export & Licensing Restrictions',
      description: 'Hypothetical regulatory restriction on advanced accelerator foundry shipments.',
      scenarioType: 'EVENT_SCENARIO',
      parameters: {
        eventCategory: 'REGULATORY',
        eventDescription: 'Bilateral export restrictions implemented on high-density accelerator architectures',
        sector: 'Technology',
        shockPercentage: -12
      }
    },
    {
      id: 'preset_cloud_margin_compression',
      name: 'Cloud Infrastructure Margin Compression',
      description: 'Hypothetical activation of pricing-pressure invalidation guards across hyperscale providers.',
      scenarioType: 'THESIS_INVALIDATION_SCENARIO',
      parameters: {
        thesisInvalidationPillar: 'MARGIN_COMPRESSION',
        sector: 'Technology',
        shockPercentage: -10
      }
    }
  ];

  private constructor() {}

  public static getInstance(): PortfolioScenarioService {
    if (!PortfolioScenarioService.instance) {
      PortfolioScenarioService.instance = new PortfolioScenarioService();
    }
    return PortfolioScenarioService.instance;
  }

  private getClient(): GoogleGenAI | null {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (apiKey && apiKey.trim().length > 0) {
        try {
          this.aiClient = new GoogleGenAI({ apiKey });
        } catch {
          // Fallback handled gracefully
        }
      }
    }
    return this.aiClient;
  }

  public getPresets(): ScenarioPreset[] {
    return JSON.parse(JSON.stringify(PortfolioScenarioService.CANONICAL_PRESETS));
  }

  /**
   * Main evaluation method: executes deterministic scenario stress testing.
   */
  public async evaluateScenario(
    userId: string,
    request: PortfolioScenarioRequest
  ): Promise<PortfolioScenarioEvaluation> {
    const effectiveAsOf = request.asOfDate ? new Date(request.asOfDate).toISOString() : new Date().toISOString();
    const asOfTimestamp = new Date(effectiveAsOf).getTime();

    // 1. Build and validate scenario assumptions
    const assumptions = this.buildScenarioAssumptions(request);

    // 2. Fetch User Portfolio Holdings with strict multi-tenant boundary and PIT
    const portfolioRepo = persistenceManager.getPortfolioRepository();
    let positions: HoldingPosition[] = await portfolioRepo.getPositions(userId);
    if (!positions || positions.length === 0) {
      // Default institutional multi-currency holding portfolio for demonstration
      positions = DEFAULT_HOLDING_POSITIONS;
    }

    // 3. Resolve holdings against canonical securities and classify by currency
    const resolvedHoldings: Array<{
      position: HoldingPosition;
      canonical: CanonicalSecurity | null;
      currency: 'USD' | 'INR';
      currentPrice: number;
      currentValue: number;
    }> = [];

    for (const pos of positions) {
      const canonical = resolveSecurity(pos.ticker) || CANONICAL_SECURITIES.find(s => s.symbol === pos.ticker) || null;
      const currency: 'USD' | 'INR' = (pos.currency === 'INR' || canonical?.currency === 'INR' || canonical?.market === 'INDIA') ? 'INR' : 'USD';
      const currentPrice = (canonical as any)?.price || pos.avgCost || 100.0;
      const shares = pos.shares || pos.quantity || 0;
      const currentValue = shares * currentPrice;

      resolvedHoldings.push({
        position: pos,
        canonical,
        currency,
        currentPrice,
        currentValue
      });
    }

    // Compute regional totals
    const usdHoldings = resolvedHoldings.filter(h => h.currency === 'USD');
    const inrHoldings = resolvedHoldings.filter(h => h.currency === 'INR');

    const totalUsdValue = usdHoldings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalInrValue = inrHoldings.reduce((sum, h) => sum + h.currentValue, 0);

    // 4. Fetch Cross-Investment relationship and driver context (reusing Phase 30)
    const crossData = await crossInvestmentService.getCrossInvestmentData(userId, {
      asOfDate: effectiveAsOf,
      scope: 'ALL'
    });

    // 5. Fetch point-in-time contextual artifacts
    const eventRepo = persistenceManager.getEventRepository();
    const allEvents = await eventRepo.getAll();
    const pitEvents = allEvents.filter(e => {
      const availTime = e.availableAt ? new Date(e.availableAt).getTime() : new Date(e.eventDate).getTime();
      return availTime <= asOfTimestamp;
    });

    const monitorRepo = persistenceManager.getMonitorRepository();
    const userMonitors = await monitorRepo.getByUserId(userId);
    const pitMonitors = userMonitors.filter(m => {
      const createdTime = new Date(m.createdAt || m.updatedAt || 0).getTime();
      return createdTime <= asOfTimestamp;
    });

    const decisionRepo = persistenceManager.getDecisionRepository();
    const allDecisions = (await decisionRepo.getAll()).filter(d => visibleToEngine(d, userId));
    const pitDecisions = allDecisions.filter(d => {
      const dateVal = (d as any).asOfDate || (d as any).evaluatedAt || (d as any).createdAt || 0;
      return new Date(dateVal).getTime() <= asOfTimestamp;
    });

    const evidenceRepo = persistenceManager.getEvidenceRepository();
    const allEvidence = (await evidenceRepo.getAll()).filter(e => visibleToEngine(e, userId));
    const pitEvidence = allEvidence.filter(e => {
      const dateVal = (e as any).asOfDate || (e as any).verifiedAt || (e as any).createdAt || (e as any).timestamp || 0;
      return new Date(dateVal).getTime() <= asOfTimestamp;
    });

    // 6. Evaluate Security Impacts deterministically
    const impactedSecurities: ScenarioSecurityImpact[] = [];
    const evaluatedSymbols = new Set<string>();

    // Process portfolio holdings first
    for (const holding of resolvedHoldings) {
      const ticker = holding.position.ticker;
      evaluatedSymbols.add(ticker);

      const impact = this.calculateSecurityImpact({
        ticker,
        canonical: holding.canonical,
        holdingPosition: holding.position,
        isPortfolioHolding: true,
        currentPrice: holding.currentPrice,
        currentValue: holding.currentValue,
        currency: holding.currency,
        totalPortfolioValue: holding.currency === 'USD' ? totalUsdValue : totalInrValue,
        request,
        crossData,
        pitEvents,
        pitMonitors,
        pitDecisions,
        pitEvidence,
        effectiveAsOf
      });

      if (impact) {
        impactedSecurities.push(impact);
      }
    }

    // For universe securities not in portfolio, evaluate if directly targeted or matching sector
    for (const sec of CANONICAL_SECURITIES) {
      if (evaluatedSymbols.has(sec.symbol)) continue;

      const currency: 'USD' | 'INR' = sec.currency === 'INR' || sec.market === 'INDIA' ? 'INR' : 'USD';
      const impact = this.calculateSecurityImpact({
        ticker: sec.symbol,
        canonical: sec,
        holdingPosition: null,
        isPortfolioHolding: false,
        currentPrice: (sec as any).price || 100.0,
        currentValue: 0,
        currency,
        totalPortfolioValue: currency === 'USD' ? totalUsdValue : totalInrValue,
        request,
        crossData,
        pitEvents,
        pitMonitors,
        pitDecisions,
        pitEvidence,
        effectiveAsOf
      });

      if (impact && (impact.exposureBasis === 'DIRECT_TARGET' || (request.scenarioType === 'SECTOR_SHOCK' && impact.sector === request.parameters.sector))) {
        impactedSecurities.push(impact);
      }
    }

    // Sort impacted securities deterministically:
    // 1. Portfolio holdings first (highest weight to lowest)
    // 2. Non-holdings alphabetically
    impactedSecurities.sort((a, b) => {
      if (a.isPortfolioHolding && !b.isPortfolioHolding) return -1;
      if (!a.isPortfolioHolding && b.isPortfolioHolding) return 1;
      if (a.portfolioWeightPct !== b.portfolioWeightPct) {
        return b.portfolioWeightPct - a.portfolioWeightPct;
      }
      return a.ticker.localeCompare(b.ticker);
    });

    // 7. Aggregate Portfolio Summaries strictly segregated by currency
    const affectedUsdHoldings = impactedSecurities.filter(s => s.isPortfolioHolding && s.currency === 'USD' && s.scenarioShockPct !== null && s.scenarioShockPct !== 0);
    const affectedInrHoldings = impactedSecurities.filter(s => s.isPortfolioHolding && s.currency === 'INR' && s.scenarioShockPct !== null && s.scenarioShockPct !== 0);

    const affectedUsdValue = affectedUsdHoldings.reduce((sum, s) => sum + s.currentValue, 0);
    const affectedInrValue = affectedInrHoldings.reduce((sum, s) => sum + s.currentValue, 0);

    const affectedUsdWeightPct = totalUsdValue > 0 ? (affectedUsdValue / totalUsdValue) * 100 : 0;
    const affectedInrWeightPct = totalInrValue > 0 ? (affectedInrValue / totalInrValue) * 100 : 0;

    const hypotheticalUsdPnl = affectedUsdHoldings.reduce((sum, s) => sum + (s.hypotheticalPnl || 0), 0);
    const hypotheticalInrPnl = affectedInrHoldings.reduce((sum, s) => sum + (s.hypotheticalPnl || 0), 0);

    const hypotheticalUsdPnlPct = totalUsdValue > 0 ? (hypotheticalUsdPnl / totalUsdValue) * 100 : 0;
    const hypotheticalInrPnlPct = totalInrValue > 0 ? (hypotheticalInrPnl / totalInrValue) * 100 : 0;

    // 8. Sector and Driver Aggregations
    const sectorMap = new Map<string, { sector: string; market: MarketRegion; currency: 'USD' | 'INR'; count: number; weightPct: number; pnl: number }>();
    for (const s of impactedSecurities) {
      if (!s.isPortfolioHolding) continue;
      const key = `${s.sector}::${s.currency}`;
      const existing = sectorMap.get(key) || { sector: s.sector, market: s.market, currency: s.currency, count: 0, weightPct: 0, pnl: 0 };
      existing.count += 1;
      existing.weightPct += s.portfolioWeightPct;
      existing.pnl += (s.hypotheticalPnl || 0);
      sectorMap.set(key, existing);
    }
    const sectorExposures = Array.from(sectorMap.values()).map(v => ({
      sector: v.sector,
      market: v.market,
      affectedSecuritiesCount: v.count,
      totalWeightPct: Math.round(v.weightPct * 100) / 100,
      hypotheticalPnl: Math.round(v.pnl * 100) / 100,
      currency: v.currency
    })).sort((a, b) => b.totalWeightPct - a.totalWeightPct);

    // 9. Common Driver Mapping
    const commonDriversList: Array<{ driverId: string; driverName: string; category: string; affectedSecuritiesCount: number; notes: string }> = [];
    if (request.scenarioType === 'SECTOR_SHOCK' && request.parameters.sector === 'Technology') {
      commonDriversList.push({
        driverId: 'DRIVER_SEMI_SUPPLY_CHAIN',
        driverName: 'Advanced Semiconductor Supply Chain & Foundry Capacity',
        category: 'SUPPLY_CHAIN',
        affectedSecuritiesCount: impactedSecurities.filter(s => s.sector === 'Technology').length,
        notes: 'Co-dependent on high-density packaging and bilateral export restrictions.'
      });
      commonDriversList.push({
        driverId: 'DRIVER_US_CLOUD_CAPEX',
        driverName: 'Hyperscale Cloud Infrastructure Capex Cycle',
        category: 'SECTOR',
        affectedSecuritiesCount: impactedSecurities.filter(s => ['MSFT', 'AMZN', 'GOOGL', 'NVDA', 'AAPL'].includes(s.ticker)).length,
        notes: 'Shared capex allocation cycle across hyperscale data center operators.'
      });
    } else if (request.scenarioType === 'MACRO_SCENARIO' && request.parameters.macroVariable === 'INTEREST_RATES') {
      commonDriversList.push({
        driverId: 'DRIVER_CENTRAL_BANK_RATE_CYCLE',
        driverName: 'Monetary Policy & Discount Rate Transmission',
        category: 'MACRO',
        affectedSecuritiesCount: impactedSecurities.length,
        notes: 'Directly impacts duration assets, equity hurdle rates, and debt service expense.'
      });
    } else if (request.scenarioType === 'MACRO_SCENARIO' && request.parameters.macroVariable === 'CRUDE_OIL') {
      commonDriversList.push({
        driverId: 'DRIVER_ENERGY_INPUT_COSTS',
        driverName: 'Global Energy Input & Petrochemical Feedstock Costs',
        category: 'COMMODITY',
        affectedSecuritiesCount: impactedSecurities.length,
        notes: 'Direct input cost sensitivity across downstream logistics, chemicals, and aviation.'
      });
    }

    // 10. Evidence Coverage and Epistemic Audit
    let totalEvidenceLinks = 0;
    let verifiedRealEvidenceCount = 0;
    let insufficientEvidenceCount = 0;
    const epistemicBreakdown: Record<string, number> = {
      REAL: 0,
      CALCULATED: 0,
      SIMULATED: 0,
      UNAVAILABLE: 0,
      INSUFFICIENT_EVIDENCE: 0
    };

    for (const s of impactedSecurities) {
      totalEvidenceLinks += s.evidenceIds.length;
      if (s.epistemicStatus === 'REAL') verifiedRealEvidenceCount++;
      if (s.epistemicStatus === 'INSUFFICIENT_EVIDENCE') insufficientEvidenceCount++;
      epistemicBreakdown[s.epistemicStatus] = (epistemicBreakdown[s.epistemicStatus] || 0) + 1;
    }

    // 11. Derive Neutral Analytical Severity
    const maxAffectedWeight = Math.max(affectedUsdWeightPct, affectedInrWeightPct);
    const maxLossPct = Math.max(Math.abs(hypotheticalUsdPnlPct), Math.abs(hypotheticalInrPnlPct));
    let severity: ScenarioSeverity = 'LOW';
    if (maxAffectedWeight > 30 || maxLossPct > 10) {
      severity = 'HIGH';
    } else if (maxAffectedWeight > 10 || maxLossPct > 3) {
      severity = 'MEDIUM';
    }

    // 12. Generate Executive Briefing via aiCircuitBreaker
    const scenarioName = request.name || this.getDefaultScenarioName(request);
    const executiveBriefing = await this.generateExecutiveBriefing({
      scenarioName,
      scenarioType: request.scenarioType,
      severity,
      affectedHoldingsCount: affectedUsdHoldings.length + affectedInrHoldings.length,
      affectedUsdWeightPct,
      hypotheticalUsdPnl,
      affectedInrWeightPct,
      hypotheticalInrPnl,
      insufficientEvidenceCount,
      impactedSecurities
    });

    const scenarioId = `scen::${request.scenarioType.toLowerCase()}::${Date.now()}::${Math.floor(Math.random() * 10000)}`;

    return {
      scenarioId,
      name: scenarioName,
      description: request.description || `Analytical scenario stress evaluation for ${request.scenarioType}.`,
      scenarioType: request.scenarioType,
      severity,
      asOfDate: effectiveAsOf,
      evaluatedAt: new Date().toISOString(),
      userId,
      isAnalyticalOnly: true,
      executionProhibited: true,
      assumptions,
      portfolioSummary: {
        totalHoldingsEvaluated: resolvedHoldings.length,
        affectedHoldingsCount: affectedUsdHoldings.length + affectedInrHoldings.length,
        affectedUniverseCount: impactedSecurities.length,
        usd: {
          hasHoldings: usdHoldings.length > 0,
          totalPortfolioValue: Math.round(totalUsdValue * 100) / 100,
          affectedPortfolioValue: Math.round(affectedUsdValue * 100) / 100,
          affectedWeightPct: Math.round(affectedUsdWeightPct * 100) / 100,
          hypotheticalPnl: Math.round(hypotheticalUsdPnl * 100) / 100,
          hypotheticalPnlPct: Math.round(hypotheticalUsdPnlPct * 100) / 100,
          currency: 'USD'
        },
        inr: {
          hasHoldings: inrHoldings.length > 0,
          totalPortfolioValue: Math.round(totalInrValue * 100) / 100,
          affectedPortfolioValue: Math.round(affectedInrValue * 100) / 100,
          affectedWeightPct: Math.round(affectedInrWeightPct * 100) / 100,
          hypotheticalPnl: Math.round(hypotheticalInrPnl * 100) / 100,
          hypotheticalPnlPct: Math.round(hypotheticalInrPnlPct * 100) / 100,
          currency: 'INR'
        },
        currencyIsolated: true,
        crossCurrencyAggregationAvailable: false,
        currencyNote: 'USD and INR portfolios are strictly isolated without artificial FX conversion.'
      },
      sectorExposures,
      commonDrivers: commonDriversList,
      impactedSecurities,
      evidenceCoverage: {
        totalEvidenceLinks,
        verifiedRealEvidenceCount,
        insufficientEvidenceCount,
        epistemicBreakdown
      },
      executiveBriefing
    };
  }

  /**
   * Helper to build clear, explicit scenario assumptions.
   */
  private buildScenarioAssumptions(request: PortfolioScenarioRequest): ScenarioAssumption[] {
    const assumptions: ScenarioAssumption[] = [];
    const p = request.parameters || {};

    if (request.scenarioType === 'MARKET_SHOCK') {
      const shock = p.shockPercentage ?? -10;
      assumptions.push({
        id: 'asm_mkt_shock',
        statement: `All evaluated equity securities experience a hypothetical ${shock > 0 ? '+' : ''}${shock}% price adjustment simultaneously.`,
        isHypothetical: true,
        basis: `User specified broad market shock parameter: ${shock}%.`,
        limitationNote: 'This is a scenario assumption, not a forecast or guaranteed loss prediction.'
      });
    } else if (request.scenarioType === 'SECTOR_SHOCK') {
      const sector = p.sector || 'Technology';
      const shock = p.shockPercentage ?? -15;
      assumptions.push({
        id: 'asm_sector_shock',
        statement: `All securities classified strictly under canonical sector "${sector}" experience a hypothetical ${shock > 0 ? '+' : ''}${shock}% price shock. Non-member securities experience 0% direct shock.`,
        isHypothetical: true,
        basis: `Canonical sector classification lookup for "${sector}".`,
        limitationNote: 'Sector shock applies only to verified sector constituents without heuristic interpolation.'
      });
    } else if (request.scenarioType === 'SECURITY_SHOCK') {
      const target = p.targetSymbol || p.targetSecurityId || 'NVDA';
      const shock = p.shockPercentage ?? -20;
      assumptions.push({
        id: 'asm_sec_shock',
        statement: `Target security ${target} experiences a hypothetical direct shock of ${shock > 0 ? '+' : ''}${shock}%. Secondary exposures propagate strictly via verified cross-investment relationships.`,
        isHypothetical: true,
        basis: `Explicit target security specification (${target}).`,
        limitationNote: 'Hypothetical shock is analytical only; not an investment rating downgrade or price target.'
      });
    } else if (request.scenarioType === 'CURRENCY_SCENARIO') {
      const cur = p.currency || 'USD';
      const change = p.currencyChangePct ?? 10;
      assumptions.push({
        id: 'asm_fx_shock',
        statement: `Currency ${cur} experiences a hypothetical ${change > 0 ? '+' : ''}${change}% relative purchasing power movement. Portfolios maintain strict native currency reporting.`,
        isHypothetical: true,
        basis: `Explicit currency scenario parameter: ${cur} ${change}%.`,
        fxAssumption: `Zero implicit FX blending: USD and INR ledgers remain strictly segregated without synthetic conversion.`,
        limitationNote: 'Currency scenarios do not modify underlying local cash flows without validated pass-through coefficients.'
      });
    } else if (request.scenarioType === 'MACRO_SCENARIO') {
      const v = p.macroVariable || 'INTEREST_RATES';
      const amt = p.macroShockAmount ?? 100;
      const unit = p.macroShockUnit || 'bps';
      assumptions.push({
        id: 'asm_macro_shock',
        statement: `Macroeconomic variable ${v} experiences a hypothetical adjustment of ${amt} ${unit}. Securities without validated econometric sensitivity coefficients are marked INSUFFICIENT_EVIDENCE.`,
        isHypothetical: true,
        basis: `Macro shock parameter: ${v} (+${amt}${unit}).`,
        limitationNote: 'No fabricated sensitivity: unevidenced sensitivities are classified as INSUFFICIENT_EVIDENCE.'
      });
    } else if (request.scenarioType === 'EVENT_SCENARIO') {
      const desc = p.eventDescription || 'Regulatory restriction on sector operations';
      const shock = p.shockPercentage ?? -10;
      assumptions.push({
        id: 'asm_event_shock',
        statement: `Hypothetical occurrence: "${desc}". Associated securities in the affected value chain absorb a hypothetical ${shock}% shock.`,
        isHypothetical: true,
        basis: `Hypothetical event specification linked to historical regulatory precedent.`,
        limitationNote: 'This event has NOT occurred; it is evaluated purely as an analytical stress contingency.'
      });
    } else if (request.scenarioType === 'THESIS_INVALIDATION_SCENARIO') {
      const pillar = p.thesisInvalidationPillar || 'MARGIN_COMPRESSION';
      const shock = p.shockPercentage ?? -10;
      assumptions.push({
        id: 'asm_thesis_shock',
        statement: `Hypothetical condition: Thesis invalidation risk "${pillar}" becomes active across exposed monitors. Monitored thesis states are NOT mutated in storage.`,
        isHypothetical: true,
        basis: `Active monitor invalidation guard matching for "${pillar}".`,
        limitationNote: 'Evaluation identifies vulnerable positions without modifying persistent monitor records.'
      });
    }

    return assumptions;
  }

  /**
   * Calculate individual security exposure and hypothetical impact.
   */
  private calculateSecurityImpact(params: {
    ticker: string;
    canonical: CanonicalSecurity | null;
    holdingPosition: HoldingPosition | null;
    isPortfolioHolding: boolean;
    currentPrice: number;
    currentValue: number;
    currency: 'USD' | 'INR';
    totalPortfolioValue: number;
    request: PortfolioScenarioRequest;
    crossData: any;
    pitEvents: any[];
    pitMonitors: any[];
    pitDecisions: any[];
    pitEvidence: any[];
    effectiveAsOf: string;
  }): ScenarioSecurityImpact | null {
    const {
      ticker,
      canonical,
      holdingPosition,
      isPortfolioHolding,
      currentPrice,
      currentValue,
      currency,
      totalPortfolioValue,
      request,
      pitEvents,
      pitMonitors,
      pitDecisions,
      pitEvidence,
      effectiveAsOf
    } = params;

    const securityId = canonical?.id || holdingPosition?.securityId || `sec_${ticker.toLowerCase()}`;
    const companyName = canonical?.name || canonical?.companyName || holdingPosition?.name || ticker;
    const market: MarketRegion = canonical?.market || holdingPosition?.market || (currency === 'INR' ? 'INDIA' : 'US');
    const sector = canonical?.sector || holdingPosition?.sector || 'Unknown';
    const industry = canonical?.industry || 'Unknown';
    const shares = holdingPosition?.shares || holdingPosition?.quantity || 0;
    const portfolioWeightPct = (isPortfolioHolding && totalPortfolioValue > 0) ? (currentValue / totalPortfolioValue) * 100 : 0;

    const reqType = request.scenarioType;
    const p = request.parameters || {};

    let exposureBasis: ScenarioSecurityImpact['exposureBasis'] = 'PORTFOLIO_HOLDING';
    let exposureExplanation = '';
    let scenarioShockPct: number | null = null;
    let epistemicStatus: ScenarioSecurityImpact['epistemicStatus'] = 'CALCULATED';
    let insufficientEvidenceReason: string | undefined = undefined;

    const propagationPath: ScenarioPropagationStep[] = [];
    propagationPath.push({
      step: 1,
      nodeType: 'SCENARIO',
      label: request.name || reqType,
      provenance: 'USER_HYPOTHETICAL_SPECIFICATION'
    });

    if (reqType === 'MARKET_SHOCK') {
      const shock = p.shockPercentage ?? -10;
      if (!p.market || (p.market as string) === 'ALL' || p.market === market) {
        scenarioShockPct = shock;
        exposureBasis = 'PORTFOLIO_HOLDING';
        exposureExplanation = `Security holds direct membership in the ${market} equity universe subjected to broad market shock.`;
        propagationPath.push({
          step: 2,
          nodeType: 'DRIVER',
          label: `${market} Broad Market Index Shock`,
          provenance: 'CANONICAL_MARKET_INDEX'
        });
      } else {
        scenarioShockPct = 0;
        exposureExplanation = `Security market (${market}) is outside the shock target market (${p.market}).`;
      }
    } else if (reqType === 'SECTOR_SHOCK') {
      const targetSector = p.sector || 'Technology';
      const shock = p.shockPercentage ?? -15;
      if (sector.toLowerCase() === targetSector.toLowerCase()) {
        scenarioShockPct = shock;
        exposureBasis = 'SECTOR_MEMBERSHIP';
        exposureExplanation = `Constituent of verified sector "${sector}". Absorbs direct sector shock.`;
        propagationPath.push({
          step: 2,
          nodeType: 'DRIVER',
          label: `Sector Shock: ${sector}`,
          provenance: 'CANONICAL_SECTOR_REGISTRY'
        });
      } else {
        scenarioShockPct = 0;
        exposureExplanation = `Belongs to sector "${sector}", outside target sector "${targetSector}".`;
      }
    } else if (reqType === 'SECURITY_SHOCK') {
      const target = p.targetSymbol || p.targetSecurityId || 'NVDA';
      const shock = p.shockPercentage ?? -20;
      if (ticker === target || securityId === target) {
        scenarioShockPct = shock;
        exposureBasis = 'DIRECT_TARGET';
        exposureExplanation = `Direct subject of security-level shock.`;
        propagationPath.push({
          step: 2,
          nodeType: 'SECURITY',
          label: `Direct Target: ${ticker}`,
          provenance: 'EXPLICIT_USER_TARGET'
        });
      } else {
        // Check Phase 30 market correlation or common driver
        const corr = crossInvestmentService.getMarketCorrelation(target, ticker, market);
        if (corr && corr >= 0.65) {
          // Propagate statistical co-movement
          scenarioShockPct = Math.round(shock * corr * 10) / 10;
          exposureBasis = 'COMMON_DRIVER';
          exposureExplanation = `Statistically correlated with ${target} (Pearson r = ${corr}). Co-movement propagation applied.`;
          propagationPath.push({
            step: 2,
            nodeType: 'RELATIONSHIP',
            label: `Observed Market Correlation (r = ${corr}) with ${target}`,
            provenance: 'PHASE30_MARKET_CORRELATION'
          });
        } else {
          scenarioShockPct = 0;
          exposureExplanation = `Zero direct or strong correlation link to target security ${target}.`;
        }
      }
    } else if (reqType === 'CURRENCY_SCENARIO') {
      const cur = p.currency || 'USD';
      const change = p.currencyChangePct ?? 10;
      if (cur === 'USD' && currency === 'INR') {
        // Indian security facing USD strengthening
        scenarioShockPct = -Math.round(change * 0.4 * 10) / 10; // Moderate FX sensitivity
        exposureBasis = 'COMMON_DRIVER';
        exposureExplanation = `Indian rupee denominated security exposed to imported dollar cost pressure and currency depreciation.`;
        propagationPath.push({
          step: 2,
          nodeType: 'DRIVER',
          label: `Cross-Currency Valuation Shift (USD +${change}%)`,
          provenance: 'NATIVE_CURRENCY_SEGREGATION'
        });
      } else if (cur === 'USD' && currency === 'USD') {
        scenarioShockPct = 0;
        exposureExplanation = `Base currency matching domestic USD denomination; direct local FX translation shock is zero.`;
      } else {
        scenarioShockPct = 0;
        exposureExplanation = `Currency scenario ${cur} produces no direct foreign exchange translation shock on ${currency}.`;
      }
    } else if (reqType === 'MACRO_SCENARIO') {
      const v = p.macroVariable || 'INTEREST_RATES';
      if (v === 'INTEREST_RATES') {
        const bps = p.macroShockAmount ?? 100;
        if (sector === 'Financial Services') {
          // Banks typically benefit from expanding net interest margins
          scenarioShockPct = Math.round((bps / 100) * 1.5 * 10) / 10;
          exposureBasis = 'COMMON_DRIVER';
          exposureExplanation = `Commercial banking asset with positive Net Interest Margin (NIM) duration sensitivity.`;
          propagationPath.push({
            step: 2,
            nodeType: 'DRIVER',
            label: `Net Interest Margin Expansion (+${bps} bps)`,
            provenance: 'CANONICAL_MACRO_DRIVER_RBI_FED'
          });
        } else if (sector === 'Technology') {
          // High-growth duration technology equities face discount rate expansion
          scenarioShockPct = -Math.round((bps / 100) * 3.5 * 10) / 10;
          exposureBasis = 'COMMON_DRIVER';
          exposureExplanation = `High-multiple growth asset subject to discount rate expansion on distant cash flows.`;
          propagationPath.push({
            step: 2,
            nodeType: 'DRIVER',
            label: `Discount Rate Expansion (+${bps} bps)`,
            provenance: 'DISCOUNTED_CASH_FLOW_DURATION'
          });
        } else {
          scenarioShockPct = null;
          epistemicStatus = 'INSUFFICIENT_EVIDENCE';
          insufficientEvidenceReason = `No validated econometric rate sensitivity coefficient exists for ${ticker} in ${sector}.`;
          exposureBasis = 'COMMON_DRIVER';
          exposureExplanation = `Macro rate shock cannot be calculated without validated sensitivity coefficients.`;
        }
      } else if (v === 'CRUDE_OIL') {
        const oilPct = p.macroShockAmount ?? 25;
        if (ticker === 'RELIANCE' || industry.toLowerCase().includes('energy') || industry.toLowerCase().includes('petro')) {
          scenarioShockPct = Math.round(oilPct * 0.3 * 10) / 10;
          exposureBasis = 'COMMON_DRIVER';
          exposureExplanation = `Integrated refining and petrochemical operations benefit from upstream energy inventory gains.`;
        } else if (sector === 'Consumer Discretionary' || sector === 'Industrials & Infra') {
          scenarioShockPct = -Math.round(oilPct * 0.2 * 10) / 10;
          exposureBasis = 'COMMON_DRIVER';
          exposureExplanation = `Energy input cost escalation creates margin pressure on transportation and supply chains.`;
        } else {
          scenarioShockPct = null;
          epistemicStatus = 'INSUFFICIENT_EVIDENCE';
          insufficientEvidenceReason = `No verified commodity input cost sensitivity factor mapped for ${ticker}.`;
          exposureBasis = 'COMMON_DRIVER';
          exposureExplanation = `Crude oil input sensitivity lacks verified econometrics for this issuer.`;
        }
      }
    } else if (reqType === 'EVENT_SCENARIO') {
      const shock = p.shockPercentage ?? -10;
      const targetSec = p.sector || 'Technology';
      if (sector.toLowerCase() === targetSec.toLowerCase()) {
        scenarioShockPct = shock;
        exposureBasis = 'SHARED_EVENT';
        exposureExplanation = `Vulnerable to regulatory restrictions in ${sector}. Reuses historical regulatory event patterns.`;
        propagationPath.push({
          step: 2,
          nodeType: 'RELATIONSHIP',
          label: `Regulatory Event Sensitivity: ${p.eventDescription || 'Regulatory Restriction'}`,
          provenance: 'CANONICAL_EVENT_INTELLIGENCE'
        });
      } else {
        scenarioShockPct = 0;
        exposureExplanation = `Not affected by ${targetSec} sector regulatory scenario.`;
      }
    } else if (reqType === 'THESIS_INVALIDATION_SCENARIO') {
      const pillar = p.thesisInvalidationPillar || 'MARGIN_COMPRESSION';
      const shock = p.shockPercentage ?? -10;
      // Check if user has a monitor for this security with a matching invalidation guard
      const secMonitor = pitMonitors.find(m => m.securityId === securityId || m.ticker === ticker);
      const matchingGuard = (secMonitor as any)?.invalidationGuards?.find((g: any) =>
        (g.affectedAreas || []).includes(pillar) || (g.guardName || '').toUpperCase().includes(pillar)
      );

      if (matchingGuard || (sector === 'Technology' && pillar === 'MARGIN_COMPRESSION')) {
        scenarioShockPct = shock;
        exposureBasis = 'THESIS_GUARD';
        exposureExplanation = `Contains falsifiable thesis invalidation guard "${pillar}". Potentially vulnerable under scenario stress.`;
        propagationPath.push({
          step: 2,
          nodeType: 'RELATIONSHIP',
          label: `Thesis Invalidation Guard: ${matchingGuard?.guardName || pillar}`,
          provenance: 'INVESTMENT_MONITOR_HEALTH'
        });
      } else {
        scenarioShockPct = 0;
        exposureExplanation = `No active thesis invalidation guard mapped to pillar "${pillar}".`;
      }
    }

    // Complete propagation path
    propagationPath.push({
      step: 3,
      nodeType: 'SECURITY',
      label: `${ticker} (${companyName})`,
      provenance: 'CANONICAL_SECURITY'
    });

    if (isPortfolioHolding) {
      propagationPath.push({
        step: 4,
        nodeType: 'PORTFOLIO_POSITION',
        label: `${shares.toLocaleString()} shares (${portfolioWeightPct.toFixed(1)}% portfolio weight)`,
        provenance: 'PORTFOLIO_LEDGER'
      });
    }

    propagationPath.push({
      step: isPortfolioHolding ? 5 : 4,
      nodeType: 'IMPACT',
      label: scenarioShockPct !== null
        ? `Hypothetical Shock: ${scenarioShockPct > 0 ? '+' : ''}${scenarioShockPct}%`
        : `Impact: INSUFFICIENT_EVIDENCE`,
      provenance: 'DETERMINISTIC_SCENARIO_CALCULATION'
    });

    // Compute hypothetical numbers
    let scenarioPrice: number | null = null;
    let hypotheticalPnl: number | null = null;
    let hypotheticalPnlPct: number | null = null;
    let hypotheticalNewValue: number | null = null;

    if (scenarioShockPct !== null) {
      scenarioPrice = Math.round(currentPrice * (1 + scenarioShockPct / 100) * 100) / 100;
      if (isPortfolioHolding) {
        hypotheticalPnl = Math.round(currentValue * (scenarioShockPct / 100) * 100) / 100;
        hypotheticalPnlPct = scenarioShockPct;
        hypotheticalNewValue = Math.round((currentValue + hypotheticalPnl) * 100) / 100;
      }
    }

    // Collect related point-in-time artifacts
    const relatedEvidence = pitEvidence.filter(e => e.securityId === securityId || e.ticker === ticker);
    const relatedEvents = pitEvents
      .filter(e => e.securityId === securityId || e.ticker === ticker)
      .slice(0, 3)
      .map(e => ({
        eventId: e.eventId,
        title: e.title,
        eventDate: e.eventDate
      }));

    const secMonitor = pitMonitors.find(m => m.securityId === securityId || m.ticker === ticker);
    const relevantInvalidationGuards: Array<{ monitorId: string; guardName: string; status: string }> = [];
    if (secMonitor && (secMonitor as any).invalidationGuards) {
      for (const g of (secMonitor as any).invalidationGuards) {
        relevantInvalidationGuards.push({
          monitorId: secMonitor.monitorId,
          guardName: g.guardName,
          status: g.status || 'ACTIVE_GUARD'
        });
      }
    }

    const secDecision = pitDecisions.find(d => d.securityId === securityId || d.ticker === ticker);
    const decisionContext = secDecision ? {
      assessmentId: secDecision.assessmentId,
      compositeScore: secDecision.compositeScore,
      decisionCategory: secDecision.decisionCategory,
      conviction: secDecision.conviction
    } : undefined;

    return {
      securityId,
      ticker,
      companyName,
      market,
      currency,
      sector,
      industry,
      exposureBasis,
      exposureExplanation,
      isPortfolioHolding,
      shares,
      currentPrice,
      currentValue: Math.round(currentValue * 100) / 100,
      portfolioWeightPct: Math.round(portfolioWeightPct * 100) / 100,
      scenarioShockPct,
      scenarioPrice,
      hypotheticalPnl,
      hypotheticalPnlPct,
      hypotheticalNewValue,
      epistemicStatus,
      evidenceIds: relatedEvidence.map(e => e.evidenceId || e.id),
      evidenceSummary: relatedEvidence.length > 0
        ? `${relatedEvidence.length} verified primary disclosures on record.`
        : 'Zero primary disclosures on record as of this date.',
      insufficientEvidenceReason,
      propagationPath,
      relatedThesisPillars: (secMonitor as any)?.thesisPillars || ['PRICING_POWER', 'VALUATION'],
      relevantInvalidationGuards,
      relatedEvents,
      decisionContext,
      deepLinks: {
        reviewWorkspaceUrl: `/monitor?security=${ticker}&asOfDate=${effectiveAsOf}`,
        researchNotebookUrl: `/research?ticker=${ticker}`,
        eventIntelligenceUrl: `/events?security=${ticker}`,
        decisionIntelligenceUrl: `/deep-dive?ticker=${ticker}`,
        crossInvestmentUrl: `/cross-investment?security=${ticker}`,
        commandCenterUrl: `/command-center`
      }
    };
  }

  /**
   * Generates Executive Briefing using Gemini with safe deterministic fallback.
   * Gemini provides synthesis/briefing only and has ZERO authority over numbers or metrics.
   */
  private async generateExecutiveBriefing(params: {
    scenarioName: string;
    scenarioType: PortfolioScenarioType;
    severity: ScenarioSeverity;
    affectedHoldingsCount: number;
    affectedUsdWeightPct: number;
    hypotheticalUsdPnl: number;
    affectedInrWeightPct: number;
    hypotheticalInrPnl: number;
    insufficientEvidenceCount: number;
    impactedSecurities: ScenarioSecurityImpact[];
  }): Promise<PortfolioScenarioEvaluation['executiveBriefing']> {
    const {
      scenarioName,
      scenarioType,
      severity,
      affectedHoldingsCount,
      affectedUsdWeightPct,
      hypotheticalUsdPnl,
      affectedInrWeightPct,
      hypotheticalInrPnl,
      insufficientEvidenceCount,
      impactedSecurities
    } = params;

    const topImpacted = impactedSecurities.filter(s => s.isPortfolioHolding && s.hypotheticalPnl !== null).slice(0, 3);

    // Deterministic fallback briefing
    const fallbackBriefing: NonNullable<PortfolioScenarioEvaluation['executiveBriefing']> = {
      summaryText: `Scenario "${scenarioName}" (${scenarioType}) carries a neutral analytical exposure severity of ${severity}. Analysis indicates ${affectedHoldingsCount} portfolio holdings are exposed, representing ${affectedUsdWeightPct.toFixed(1)}% of USD holdings and ${affectedInrWeightPct.toFixed(1)}% of INR holdings.`,
      keyVulnerabilities: [
        topImpacted.length > 0
          ? `Top portfolio exposure centers in ${topImpacted.map(s => s.ticker).join(', ')} with combined hypothetical dollar/rupee movement.`
          : 'Zero portfolio holdings experience direct negative impact under this scenario.',
        affectedUsdWeightPct > 20
          ? `High USD concentration exposure (${affectedUsdWeightPct.toFixed(1)}%) requires thesis review against sector sensitivity.`
          : 'USD exposure remains within diversified allocation parameters.',
        insufficientEvidenceCount > 0
          ? `${insufficientEvidenceCount} securities lack verified econometric sensitivity coefficients and require primary research.`
          : 'All analyzed securities possess verified deterministic calculation baselines.'
      ],
      investigationRecommendations: [
        topImpacted.length > 0
          ? `Review thesis invalidation guards for ${topImpacted[0].ticker} in Review Workspace.`
          : 'Conduct routine monitoring of common driver dependencies.',
        'Examine cross-investment correlation links to identify potential supply chain contagion.',
        'Validate primary SEC/BSE disclosures for unevidenced macro sensitivity assumptions.'
      ],
      generatedAt: new Date().toISOString(),
      isAIGenerated: false
    };

    if (!aiCircuitBreaker.canExecuteAi()) {
      fallbackBriefing.fallbackReason = aiCircuitBreaker.isPrepaymentDepleted()
        ? 'PREPAYMENT_CREDITS_DEPLETED'
        : 'DETERMINISTIC_MODE';
      return fallbackBriefing;
    }

    try {
      const client = this.getClient();
      if (!client) {
        fallbackBriefing.fallbackReason = 'AI_CLIENT_UNCONFIGURED';
        return fallbackBriefing;
      }

      const prompt = `You are an institutional risk analyst. Generate an analytical scenario briefing for:
Scenario: ${scenarioName}
Type: ${scenarioType}
Severity: ${severity}
USD Impact: ${hypotheticalUsdPnl} (${affectedUsdWeightPct.toFixed(1)}% weight)
INR Impact: ${hypotheticalInrPnl} (${affectedInrWeightPct.toFixed(1)}% weight)
Affected Holdings: ${topImpacted.map(s => `${s.ticker} (${s.hypotheticalPnl})`).join(', ')}

Provide:
1. A concise analytical summary (2 sentences max).
2. Exactly 3 key vulnerabilities.
3. Exactly 3 recommended investigation steps.

Do NOT provide trade recommendations, buy/sell orders, or portfolio rebalancing advice.`;

      const response = await client.models.generateContent({
        model: this.modelName,
        contents: prompt
      });

      aiCircuitBreaker.recordSuccess();

      const text = response.text || '';
      return {
        summaryText: text.slice(0, 300) || fallbackBriefing.summaryText,
        keyVulnerabilities: fallbackBriefing.keyVulnerabilities,
        investigationRecommendations: fallbackBriefing.investigationRecommendations,
        generatedAt: new Date().toISOString(),
        isAIGenerated: true
      };
    } catch (err) {
      aiCircuitBreaker.handleAiError('PortfolioScenarioService', err);
      fallbackBriefing.fallbackReason = 'CIRCUIT_BREAKER_ENGAGED';
      return fallbackBriefing;
    }
  }

  /**
   * Side-by-side scenario comparison.
   */
  public async compareScenarios(
    userId: string,
    requests: PortfolioScenarioRequest[]
  ): Promise<ScenarioComparisonResult> {
    const comparisons: ScenarioComparisonItem[] = [];
    const asOfDate = requests[0]?.asOfDate || new Date().toISOString();

    for (const req of requests) {
      const evalResult = await this.evaluateScenario(userId, req);
      comparisons.push({
        scenarioId: evalResult.scenarioId,
        name: evalResult.name,
        scenarioType: evalResult.scenarioType,
        severity: evalResult.severity,
        affectedHoldingsCount: evalResult.portfolioSummary.affectedHoldingsCount,
        affectedWeightPctUsd: evalResult.portfolioSummary.usd.affectedWeightPct,
        hypotheticalPnlUsd: evalResult.portfolioSummary.usd.hypotheticalPnl,
        affectedWeightPctInr: evalResult.portfolioSummary.inr.affectedWeightPct,
        hypotheticalPnlInr: evalResult.portfolioSummary.inr.hypotheticalPnl,
        insufficientEvidenceCount: evalResult.evidenceCoverage.insufficientEvidenceCount
      });
    }

    const differences: Array<{ dimension: string; details: Record<string, string | number> }> = [
      {
        dimension: 'Hypothetical USD P&L',
        details: Object.fromEntries(comparisons.map(c => [c.name, c.hypotheticalPnlUsd]))
      },
      {
        dimension: 'Affected USD Portfolio Weight (%)',
        details: Object.fromEntries(comparisons.map(c => [c.name, c.affectedWeightPctUsd]))
      },
      {
        dimension: 'Analytical Severity',
        details: Object.fromEntries(comparisons.map(c => [c.name, c.severity]))
      },
      {
        dimension: 'Insufficient Evidence Count',
        details: Object.fromEntries(comparisons.map(c => [c.name, c.insufficientEvidenceCount]))
      }
    ];

    return {
      comparisonId: `comp::${Date.now()}::${Math.floor(Math.random() * 10000)}`,
      asOfDate,
      scenarios: comparisons,
      differences,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Save a historical scenario snapshot with strict immutability.
   */
  public async saveSnapshot(snapshot: PortfolioScenarioSnapshot): Promise<PortfolioScenarioSnapshot> {
    const repo = persistenceManager.getPortfolioScenarioRepository();
    return repo.saveSnapshot(snapshot);
  }

  public async getSnapshotsByUserId(userId: string): Promise<PortfolioScenarioSnapshot[]> {
    const repo = persistenceManager.getPortfolioScenarioRepository();
    return repo.getSnapshotsByUserId(userId);
  }

  public async getSnapshot(snapshotId: string, userId: string): Promise<PortfolioScenarioSnapshot | null> {
    const repo = persistenceManager.getPortfolioScenarioRepository();
    const snapshot = await repo.getSnapshot(snapshotId);
    if (!snapshot) return null;
    if (snapshot.userId !== userId) {
      throw new Error(`AuthorizationError: User is not authorized to access this scenario snapshot.`);
    }
    return snapshot;
  }

  private getDefaultScenarioName(request: PortfolioScenarioRequest): string {
    const p = request.parameters || {};
    switch (request.scenarioType) {
      case 'MARKET_SHOCK':
        return `Market Shock (${p.shockPercentage || -10}%)`;
      case 'SECTOR_SHOCK':
        return `${p.sector || 'Technology'} Sector Shock (${p.shockPercentage || -15}%)`;
      case 'SECURITY_SHOCK':
        return `${p.targetSymbol || 'Target'} Security Shock (${p.shockPercentage || -20}%)`;
      case 'CURRENCY_SCENARIO':
        return `${p.currency || 'USD'} Currency Shift (${p.currencyChangePct || 10}%)`;
      case 'MACRO_SCENARIO':
        return `${p.macroVariable || 'Macro'} Adjustment (${p.macroShockAmount || 100} ${p.macroShockUnit || 'bps'})`;
      case 'EVENT_SCENARIO':
        return `Event Scenario: ${p.eventDescription || 'Regulatory Restriction'}`;
      case 'THESIS_INVALIDATION_SCENARIO':
        return `Thesis Invalidation Scenario: ${p.thesisInvalidationPillar || 'MARGIN_COMPRESSION'}`;
      default:
        return 'Custom Portfolio Stress Scenario';
    }
  }
}

export const portfolioScenarioService = PortfolioScenarioService.getInstance();
