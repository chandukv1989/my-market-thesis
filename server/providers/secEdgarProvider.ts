/**
 * SEC EDGAR Data Provider Implementation
 * Interacts with official SEC data APIs with CIK mapping, XBRL normalization,
 * in-memory TTL caching, and complete provenance tracking.
 */

import {
  SECDataProvider,
  SECSubmissionsResponse,
  SECCompanyFactsResponse,
  NormalizedFinancialsResult,
  SECXBRLUnitItem
} from './types';
import { FinancialFact, FilingRecord, ProviderHealth } from '../../src/types';

// Canonical Ticker -> CIK mapping
export const CIK_MAPPING: Record<string, string> = {
  NVDA: '0001045810',
  MSFT: '0000789019',
  TSM: '0001046179',
  ASML: '0000937966',
  AVGO: '0001730168',
  AMZN: '0001018724',
  AAPL: '0000320193',
  PLTR: '0001321655',
  LLY: '0000059478',
  JPM: '0000019617'
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class SecEdgarProvider implements SECDataProvider {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
  private lastSuccessfulRetrieval: string | null = null;
  private lastError: string | null = null;
  private status: 'Connected' | 'Throttled' | 'Error' | 'Unavailable' = 'Connected';

  private getUserAgent(): string {
    return (
      process.env.SEC_API_USER_AGENT ||
      'InvestmentIntelligence/1.0 (contact@investment-intelligence.app)'
    );
  }

  public resolveCIK(ticker: string): string | null {
    const sym = ticker.toUpperCase().trim();
    return CIK_MAPPING[sym] || null;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getHealthStatus(): ProviderHealth {
    return {
      name: 'SEC EDGAR (XBRL & Submissions)',
      status: this.status,
      lastSuccessfulRetrieval: this.lastSuccessfulRetrieval,
      dataFreshness: this.lastSuccessfulRetrieval
        ? `Retrieved: ${new Date(this.lastSuccessfulRetrieval).toLocaleTimeString()}`
        : 'Awaiting first query',
      details: this.lastError || 'Active & ready for SEC EDGAR EDGAR submissions and XBRL facts',
      isSimulated: false
    };
  }

  public getProviderHealth(): ProviderHealth {
    return this.getHealthStatus();
  }

  private async fetchSecJson<T>(url: string, cacheKey: string): Promise<T> {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data as T;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12-second timeout

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.getUserAgent(),
          Accept: 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        this.status = 'Throttled';
        this.lastError = 'SEC rate limit reached (10 req/sec limit)';
        throw new Error('SEC rate limit reached. Please wait a moment before requesting again.');
      }

      if (!response.ok) {
        this.status = 'Error';
        this.lastError = `SEC HTTP Error ${response.status}: ${response.statusText}`;
        throw new Error(`SEC API returned status ${response.status} (${response.statusText})`);
      }

      const data = (await response.json()) as T;
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      this.status = 'Connected';
      this.lastError = null;
      this.lastSuccessfulRetrieval = new Date().toISOString();
      return data;
    } catch (err: unknown) {
      clearTimeout(timeout);
      const errMsg = err instanceof Error ? err.message : String(err);
      this.status = errMsg.includes('rate limit') ? 'Throttled' : 'Error';
      this.lastError = errMsg;
      throw err;
    }
  }

  public async getCompanySubmissions(ticker: string): Promise<SECSubmissionsResponse> {
    const cik = this.resolveCIK(ticker);
    if (!cik) {
      throw new Error(`Ticker '${ticker}' does not have a mapped SEC CIK.`);
    }

    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    return this.fetchSecJson<SECSubmissionsResponse>(url, `submissions_${ticker}`);
  }

  public async getCompanyFacts(ticker: string): Promise<SECCompanyFactsResponse> {
    const cik = this.resolveCIK(ticker);
    if (!cik) {
      throw new Error(`Ticker '${ticker}' does not have a mapped SEC CIK.`);
    }

    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    return this.fetchSecJson<SECCompanyFactsResponse>(url, `facts_${ticker}`);
  }

  public async getRecentFilings(ticker: string): Promise<FilingRecord[]> {
    try {
      const submissions = await this.getCompanySubmissions(ticker);
      const cikNumber = parseInt(submissions.cik, 10);
      const recent = submissions.filings?.recent;

      if (!recent || !recent.accessionNumber) {
        return [];
      }

      const records: FilingRecord[] = [];
      const count = Math.min(recent.accessionNumber.length, 30);
      const now = new Date().toISOString();

      for (let i = 0; i < count; i++) {
        const form = recent.form[i];
        // Focus on key informational filings
        if (!['10-K', '10-Q', '8-K', '20-F', '6-K', 'S-1'].includes(form)) {
          continue;
        }

        const accn = recent.accessionNumber[i];
        const accnNoHyphens = accn.replace(/-/g, '');
        const primaryDoc = recent.primaryDocument[i];
        const sourceUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accnNoHyphens}/${primaryDoc}`;

        records.push({
          ticker: ticker.toUpperCase(),
          form,
          filingDate: recent.filingDate[i],
          reportDate: recent.reportDate[i] || recent.filingDate[i],
          accessionNumber: accn,
          primaryDocument: primaryDoc,
          sourceUrl,
          description: recent.primaryDocDescription[i] || `${form} Filing`,
          isSimulated: false,
          retrievedAt: now
        });
      }

      return records;
    } catch {
      return [];
    }
  }

  public async getFinancialFacts(ticker: string): Promise<NormalizedFinancialsResult> {
    const cik = this.resolveCIK(ticker);
    const now = new Date().toISOString();

    if (!cik) {
      return {
        ticker: ticker.toUpperCase(),
        cik: '',
        companyName: ticker.toUpperCase(),
        retrievedAt: now,
        isSimulated: false,
        facts: [],
        filings: [],
        derivedQuarters: [],
        summaryMetrics: {},
        provenance: {
          primarySource: 'SEC EDGAR',
          sourceType: 'SEC_XBRL',
          cik: '',
          recordsCount: 0,
          retrievedAt: now
        }
      };
    }

    const cikNumber = parseInt(cik, 10);

    // Parallel fetch submissions & company facts
    const [submissionsRes, factsRes] = await Promise.allSettled([
      this.getCompanySubmissions(ticker),
      this.getCompanyFacts(ticker)
    ]);

    const filings: FilingRecord[] = [];
    if (submissionsRes.status === 'fulfilled') {
      const recent = submissionsRes.value.filings?.recent;
      if (recent && recent.accessionNumber) {
        const count = Math.min(recent.accessionNumber.length, 25);
        for (let i = 0; i < count; i++) {
          const form = recent.form[i];
          if (['10-K', '10-Q', '8-K', '20-F', '6-K'].includes(form)) {
            const accn = recent.accessionNumber[i];
            const accnNoHyphens = accn.replace(/-/g, '');
            const primaryDoc = recent.primaryDocument[i];
            filings.push({
              ticker: ticker.toUpperCase(),
              form,
              filingDate: recent.filingDate[i],
              reportDate: recent.reportDate[i] || recent.filingDate[i],
              accessionNumber: accn,
              primaryDocument: primaryDoc,
              sourceUrl: `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accnNoHyphens}/${primaryDoc}`,
              description: recent.primaryDocDescription[i] || `${form} Filing`,
              isSimulated: false,
              retrievedAt: now
            });
          }
        }
      }
    }

    if (factsRes.status !== 'fulfilled') {
      return {
        ticker: ticker.toUpperCase(),
        cik,
        companyName: submissionsRes.status === 'fulfilled' ? submissionsRes.value.name : ticker.toUpperCase(),
        retrievedAt: now,
        isSimulated: false,
        facts: [],
        filings,
        derivedQuarters: [],
        summaryMetrics: {},
        provenance: {
          primarySource: 'SEC EDGAR',
          sourceType: 'SEC_XBRL',
          cik,
          recordsCount: filings.length,
          retrievedAt: now
        }
      };
    }

    const factsData = factsRes.value;
    const gaap = factsData.facts['us-gaap'] || {};
    const dei = factsData.facts['dei'] || {};
    const companyName = factsData.entityName || ticker.toUpperCase();

    // Helper to get unit items
    const getUSDItems = (conceptName: string): SECXBRLUnitItem[] => {
      const concept = gaap[conceptName];
      if (!concept || !concept.units || !concept.units.USD) return [];
      return concept.units.USD;
    };

    const getSharesItems = (conceptName: string): SECXBRLUnitItem[] => {
      const fromGaap = gaap[conceptName]?.units?.shares;
      if (fromGaap) return fromGaap;
      const fromDei = dei[conceptName]?.units?.shares;
      return fromDei || [];
    };

    // Candidate concepts
    const revenueItems = [
      ...getUSDItems('RevenueFromContractWithCustomerExcludingAssessedTax'),
      ...getUSDItems('Revenues'),
      ...getUSDItems('SalesRevenueNet')
    ];

    const grossProfitItems = getUSDItems('GrossProfit');
    const operatingIncomeItems = getUSDItems('OperatingIncomeLoss');
    const netIncomeItems = getUSDItems('NetIncomeLoss');
    const ocfItems = getUSDItems('NetCashProvidedByUsedInOperatingActivities');
    const capexItems = [
      ...getUSDItems('PaymentsToAcquirePropertyPlantAndEquipment'),
      ...getUSDItems('PaymentsToAcquireProductiveAssets')
    ];
    const assetItems = getUSDItems('Assets');
    const liabilityItems = getUSDItems('Liabilities');
    const cashItems = getUSDItems('CashAndCashEquivalentsAtCarryingValue');
    const sharesItems = [
      ...getSharesItems('EntityCommonStockSharesOutstanding'),
      ...getSharesItems('CommonStockSharesOutstanding')
    ];

    // Build normalized FinancialFact records
    const normalizedFacts: FinancialFact[] = [];

    const addFact = (
      item: SECXBRLUnitItem,
      metricName: string,
      label: string,
      unit: string = 'USD'
    ) => {
      const accnNoHyphens = item.accn ? item.accn.replace(/-/g, '') : '';
      const sourceUrl = accnNoHyphens
        ? `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accnNoHyphens}/`
        : `https://www.sec.gov/edgar/browse/?CIK=${cik}`;

      normalizedFacts.push({
        ticker: ticker.toUpperCase(),
        metric: metricName,
        label,
        value: item.val,
        unit,
        periodStart: item.start,
        periodEnd: item.end,
        filedDate: item.filed,
        fiscalYear: item.fy,
        fiscalPeriod: item.fp,
        form: item.form,
        accessionNumber: item.accn,
        sourceUrl,
        source: 'SEC EDGAR',
        sourceType: 'SEC_XBRL',
        asOf: item.end || item.filed || now,
        retrievedAt: now,
        isSimulated: false,
        epistemicCategory: 'REAL',
        status: 'available'
      });
    };

    // XBRL concepts are concatenated (e.g. Apple switched revenue tags in 2018), so array order is NOT chronological.
    // Always dedupe (one value per period, latest filing wins) and sort by period end before taking "recent" items.
    const dayMs = 86400000;
    const durationDays = (it: SECXBRLUnitItem): number =>
      it.start && it.end ? Math.round((Date.parse(it.end) - Date.parse(it.start)) / dayMs) : 0;
    const chronological = (items: SECXBRLUnitItem[]): SECXBRLUnitItem[] => {
      const byPeriod = new Map<string, SECXBRLUnitItem>();
      for (const it of items) {
        if (!it.end) continue;
        const key = `${it.start || ''}|${it.end}`;
        const existing = byPeriod.get(key);
        if (!existing || (it.filed || '') > (existing.filed || '')) byPeriod.set(key, it);
      }
      return [...byPeriod.values()].sort((a, b) => (a.end > b.end ? 1 : a.end < b.end ? -1 : (a.start || '') > (b.start || '') ? 1 : -1));
    };
    const revenueSorted = chronological(revenueItems);
    const grossSorted = chronological(grossProfitItems);
    const opSorted = chronological(operatingIncomeItems);
    const netSorted = chronological(netIncomeItems);
    const ocfSorted = chronological(ocfItems);
    const capexSorted = chronological(capexItems);
    const assetSorted = chronological(assetItems);
    const liabilitySorted = chronological(liabilityItems);
    const cashSorted = chronological(cashItems);
    const sharesSorted = chronological(sharesItems);

    // Flow metrics carry quarterly, year-to-date and annual periods; keep ~4 fiscal years so annual comparisons are possible.
    revenueSorted.slice(-24).forEach(it => addFact(it, 'REVENUE', 'Total Revenue'));
    grossSorted.slice(-24).forEach(it => addFact(it, 'GROSS_PROFIT', 'Gross Profit'));
    opSorted.slice(-24).forEach(it => addFact(it, 'OPERATING_INCOME', 'Operating Income'));
    netSorted.slice(-24).forEach(it => addFact(it, 'NET_INCOME', 'Net Income'));
    ocfSorted.slice(-24).forEach(it => addFact(it, 'OPERATING_CASH_FLOW', 'Operating Cash Flow'));
    capexSorted.slice(-24).forEach(it => addFact(it, 'CAPEX', 'Capital Expenditures'));
    assetSorted.slice(-4).forEach(it => addFact(it, 'TOTAL_ASSETS', 'Total Assets'));
    liabilitySorted.slice(-4).forEach(it => addFact(it, 'TOTAL_LIABILITIES', 'Total Liabilities'));
    cashSorted.slice(-4).forEach(it => addFact(it, 'CASH_AND_EQUIVALENTS', 'Cash & Cash Equivalents'));
    sharesSorted.slice(-4).forEach(it => addFact(it, 'SHARES_OUTSTANDING', 'Common Stock Shares Outstanding', 'shares'));

    // Discrete (single-quarter) value for the quarter ending `qe`:
    //   (a) a reported ~3-month item ending on qe, else
    //   (b) cumulative item (same fiscal-year start) minus the previous cumulative item (same start, earlier end).
    // Returns undefined when it cannot be derived from reported figures. Nothing is estimated.
    const discreteValue = (sorted: SECXBRLUnitItem[], qe: string): { val: number; item: SECXBRLUnitItem } | undefined => {
      const atEnd = sorted.filter(it => it.end === qe);
      const quarter = atEnd.find(it => durationDays(it) >= 80 && durationDays(it) <= 100);
      if (quarter) return { val: quarter.val, item: quarter };
      for (const cum of atEnd.filter(it => durationDays(it) > 100)) {
        const prior = sorted
          .filter(it => it.start === cum.start && it.end < qe)
          .sort((a, b) => (a.end > b.end ? -1 : 1))[0];
        if (prior) return { val: cum.val - prior.val, item: cum };
      }
      return undefined;
    };

    // Candidate quarter ends: reported 3-month periods plus fiscal year ends (Q4 = annual minus 9 months).
    const quarterEnds = [...new Set(
      revenueSorted
        .filter(it => it.form === '10-Q' || it.form === '10-K')
        .filter(it => { const d = durationDays(it); return (d >= 80 && d <= 100) || (d >= 350 && d <= 380); })
        .map(it => it.end)
    )].sort();

    const allQuarters = quarterEnds.slice(-12).reverse().flatMap(qe => {
      const rev = discreteValue(revenueSorted, qe);
      const gp = discreteValue(grossSorted, qe);
      const op = discreteValue(opSorted, qe);
      const ni = discreteValue(netSorted, qe);
      const ocf = discreteValue(ocfSorted, qe);
      const cx = discreteValue(capexSorted, qe);
      // A quarter is shown only if every figure is derivable from reported XBRL facts.
      if (!rev || !gp || !op || !ni || !ocf || !cx || rev.val <= 0) return [];
      const revItem = rev.item;
      const capexVal = Math.abs(cx.val);
      const fcfVal = ocf.val - capexVal;
      const grossMarginPct = (gp.val / rev.val) * 100;
      // Label by the quarter's own end date (the filing's fy/fp describe the filing, not a prior-year comparative period).
      const qeDate = new Date(`${qe}T00:00:00Z`);
      const periodLabel = `${qeDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} '${String(qeDate.getUTCFullYear()).slice(-2)}`;
      const accnNoHyphens = revItem.accn ? revItem.accn.replace(/-/g, '') : '';
      const sourceUrl = accnNoHyphens
        ? `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accnNoHyphens}/`
        : `https://www.sec.gov/edgar/browse/?CIK=${cik}`;
      return [{
        period: periodLabel,
        fiscalYear: revItem.fy,
        fiscalPeriod: revItem.fp,
        periodEnd: qe,
        revenue: Math.round(rev.val / 1e6) / 1e3, // In Billions ($B)
        grossProfit: Math.round(gp.val / 1e6) / 1e3,
        grossMarginPct: Math.round(grossMarginPct * 10) / 10,
        operatingIncome: Math.round(op.val / 1e6) / 1e3,
        netIncome: Math.round(ni.val / 1e6) / 1e3,
        operatingCashFlow: Math.round(ocf.val / 1e6) / 1e3,
        capex: Math.round(capexVal / 1e6) / 1e3,
        freeCashFlow: Math.round(fcfVal / 1e6) / 1e3,
        form: revItem.form || '10-Q',
        filedDate: revItem.filed || qe,
        accessionNumber: revItem.accn || 'SEC-XBRL',
        sourceUrl,
        isSimulated: false
      }];
    }).reverse(); // chronological; up to 12 quarters (enough for like-for-like comparisons at earlier as-of dates)
    const derivedQuarters = allQuarters.slice(-5);

    // Summary metrics (from the latest derivable discrete quarter, never from a mixed-period item)
    const latestQ = derivedQuarters[derivedQuarters.length - 1];
    const latestRev = latestQ ? latestQ.revenue * 1e9 : undefined;
    const latestAssets = assetSorted[assetSorted.length - 1]?.val;
    const latestLiab = liabilitySorted[liabilitySorted.length - 1]?.val;
    const latestCash = cashSorted[cashSorted.length - 1]?.val;
    const latestShares = sharesSorted[sharesSorted.length - 1]?.val;

    return {
      ticker: ticker.toUpperCase(),
      cik,
      companyName,
      retrievedAt: now,
      isSimulated: false,
      facts: normalizedFacts,
      filings,
      derivedQuarters,
      historicalQuarters: allQuarters,
      summaryMetrics: {
        latestQuarterlyRevenue: latestRev,
        latestGrossMarginPct: latestQ ? latestQ.grossMarginPct : undefined,
        latestOperatingMarginPct: latestQ && latestQ.revenue > 0 ? Math.round((latestQ.operatingIncome / latestQ.revenue) * 1000) / 10 : undefined,
        sharesOutstanding: latestShares,
        totalAssets: latestAssets,
        totalLiabilities: latestLiab,
        cashAndEquivalents: latestCash
      },
      provenance: {
        primarySource: 'SEC EDGAR (us-gaap)',
        sourceType: 'SEC_XBRL',
        cik,
        recordsCount: normalizedFacts.length,
        retrievedAt: now
      }
    };
  }
}

export const secEdgarProvider = new SecEdgarProvider();
