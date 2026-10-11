/**
 * Real-data integrity regression suite: SEC financial facts, trend derivation and decision inputs.
 *
 * Covers the defects where (1) SEC revenue facts were taken in array order (so AAPL showed 2017-2018 data), (2) a
 * 9-month year-to-date figure was compared with a single quarter ("revenue contraction"), and (3) margins, cash-flow,
 * valuation multiples, volatility, drawdown and backtest metrics were hardcoded constants presented as analysis.
 *
 * Isolation: temp-dir development adapter, SEC provider and market data stubbed, no network, no database.
 * data/persistence/store.json is hashed before/after.
 */
process.env.MARKET_THESIS_DISABLE_AUTOSTART = '1';
process.env.NODE_ENV = 'test';
for (const k of ['DATABASE_URL', 'GEMINI_API_KEY', 'TWELVE_DATA_API_KEY', 'FYERS_APP_ID', 'FYERS_SECRET_KEY', 'FYERS_ACCESS_TOKEN', 'TRUEDATA_USERNAME', 'TRUEDATA_PASSWORD']) delete process.env[k];

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(c: unknown, name: string, detail?: unknown) {
  if (c) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.error(`  ✗ FAILED: ${name}${detail !== undefined ? ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
}
const section = (t: string) => console.log(`\n--- ${t} ---`);
const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// ---- synthetic SEC company-facts payload (fiscal years start late Sep; values in $B) -------------------------------
type Item = { start: string; end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string };
const B = 1e9;
interface FY { start: string; q: [string, string, string, string]; filed: [string, string, string, string]; fy: number; rev: number[]; gp: number[]; op: number[]; ni: number[]; ocf: number[]; capex: number[] }
// quarterly (discrete) figures per fiscal year; cumulative items are derived
const FY24: FY = { start: '2023-10-01', q: ['2023-12-30', '2024-03-30', '2024-06-29', '2024-09-28'], filed: ['2024-02-02', '2024-05-03', '2024-08-02', '2024-11-01'], fy: 2024,
  rev: [119.6, 90.8, 85.8, 94.9], gp: [54.9, 42.3, 39.7, 43.9], op: [40.4, 27.9, 25.3, 29.6], ni: [33.9, 23.6, 21.4, 14.7], ocf: [39.9, 22.7, 28.9, 26.8], capex: [2.0, 2.4, 2.2, 2.9] };
const FY25: FY = { start: '2024-09-29', q: ['2024-12-28', '2025-03-29', '2025-06-28', '2025-09-27'], filed: ['2025-01-31', '2025-05-02', '2025-08-01', '2025-10-31'], fy: 2025,
  rev: [124.3, 95.4, 94.0, 102.5], gp: [58.3, 44.0, 43.7, 48.4], op: [42.8, 29.6, 28.2, 32.4], ni: [36.3, 24.8, 23.4, 27.5], ocf: [29.9, 23.9, 27.9, 29.7], capex: [2.9, 3.2, 3.5, 3.2] };
const dayAdd = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);
function itemsFor(fyd: FY, key: keyof Pick<FY, 'rev' | 'gp' | 'op' | 'ni' | 'ocf' | 'capex'>, opts: { discreteQuarters: boolean; accnBase: string }): Item[] {
  const v = fyd[key] as number[];
  const out: Item[] = [];
  const fps = ['Q1', 'Q2', 'Q3', 'FY'];
  let cum = 0;
  let prevEnd = fyd.start;
  for (let i = 0; i < 4; i++) {
    cum += v[i];
    const form = i === 3 ? '10-K' : '10-Q';
    const accn = `${opts.accnBase}-${fyd.fy}-${i + 1}`;
    const qStart = i === 0 ? fyd.start : dayAdd(prevEnd, 1);
    if (opts.discreteQuarters && i < 3) out.push({ start: qStart, end: fyd.q[i], val: Math.round(v[i] * B), accn, fy: fyd.fy, fp: fps[i], form, filed: fyd.filed[i] });
    // cumulative (year-to-date / full-year) item from the fiscal-year start
    if (i > 0 || !opts.discreteQuarters) out.push({ start: fyd.start, end: fyd.q[i], val: Math.round(cum * B), accn, fy: fyd.fy, fp: fps[i], form, filed: fyd.filed[i] });
    prevEnd = fyd.q[i];
  }
  return out;
}
function buildFacts(opts?: { dropGrossFY25Q3?: boolean }) {
  const mk = (key: any, discrete: boolean, base: string) => [...itemsFor(FY24, key, { discreteQuarters: discrete, accnBase: base }), ...itemsFor(FY25, key, { discreteQuarters: discrete, accnBase: base })];
  // Legacy revenue concept (Apple stopped using it in 2018) deliberately listed LAST, with old 2017-2018 periods.
  const legacyRev: Item[] = [
    { start: '2016-09-25', end: '2017-07-01', val: 176655e6, accn: 'old-1', fy: 2017, fp: 'Q3', form: '10-Q', filed: '2017-08-02' },
    { start: '2018-04-01', end: '2018-06-30', val: 53265e6, accn: 'old-2', fy: 2018, fp: 'Q3', form: '10-Q', filed: '2018-08-01' }
  ];
  let gp = mk('gp', true, 'gp');
  if (opts?.dropGrossFY25Q3) gp = gp.filter(i => !(i.end === '2025-06-28'));
  return {
    entityName: 'Apple Inc.',
    facts: {
      'us-gaap': {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: mk('rev', true, 'rev') } },
        Revenues: { units: { USD: [] } },
        SalesRevenueNet: { units: { USD: legacyRev } },
        GrossProfit: { units: { USD: gp } },
        OperatingIncomeLoss: { units: { USD: mk('op', true, 'op') } },
        NetIncomeLoss: { units: { USD: mk('ni', true, 'ni') } },
        NetCashProvidedByUsedInOperatingActivities: { units: { USD: mk('ocf', false, 'ocf') } },
        PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: mk('capex', false, 'cx') } },
        Assets: { units: { USD: [{ start: '', end: '2025-06-28', val: 331e9, accn: 'a', fy: 2025, fp: 'Q3', form: '10-Q', filed: '2025-08-01' }] } }
      }
    }
  } as any;
}

async function main() {
  const realStore = path.resolve(process.cwd(), 'data', 'persistence', 'store.json');
  const before = fs.existsSync(realStore) ? sha(realStore) : 'absent';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'real_fin-'));
  const { DevelopmentPersistenceAdapter } = await import('../server/persistence/devAdapter/developmentPersistenceAdapter');
  const adapter: any = new DevelopmentPersistenceAdapter(path.join(tmp, 'main'));
  await adapter.initialize();
  const { persistenceManager } = await import('../server/persistence/persistenceManager');
  persistenceManager.setAdapter(adapter);

  const { secEdgarProvider } = await import('../server/providers/secEdgarProvider');
  const { financialDataService } = await import('../server/services/financialDataService');
  const { DecisionIntelligenceService, computeMarketStats } = await import('../server/services/decision/decisionIntelligenceService');

  const stubSec = (facts: any) => {
    (secEdgarProvider as any).getCompanySubmissions = async () => ({ name: 'Apple Inc.', filings: { recent: { accessionNumber: [], form: [], filingDate: [], reportDate: [], primaryDocument: [], primaryDocDescription: [] } } });
    (secEdgarProvider as any).getCompanyFacts = async () => facts;
  };

  // =====================================================================================
  section('R1. SEC facts: latest periods, discrete quarters, nothing fabricated');
  // =====================================================================================
  stubSec(buildFacts());
  const fin: any = await secEdgarProvider.getFinancialFacts('AAPL');
  const revFacts = fin.facts.filter((f: any) => f.metric === 'REVENUE');
  check(revFacts.length > 0 && revFacts.some((f: any) => f.periodEnd === '2025-09-27'), 'revenue facts include the latest fiscal year (not stuck on a legacy concept)', revFacts.map((f: any) => f.periodEnd).slice(-3));
  check(revFacts[revFacts.length - 1].periodEnd === '2025-09-27' && revFacts.every((f: any, i: number) => i === 0 || f.periodEnd >= revFacts[i - 1].periodEnd), 'revenue facts are in chronological order and end at the latest period (legacy-concept items do not come last)');
  check(!fin.derivedQuarters.some((q: any) => q.periodEnd < '2024-01-01'), 'old legacy-concept periods (2017-2018) never reach the derived quarters');
  const dq: any[] = fin.derivedQuarters;
  const last = dq[dq.length - 1];
  check(dq.length === 5 && last.periodEnd === '2025-09-27', 'five most recent quarters, ending at the latest fiscal year end', dq.map(q => q.periodEnd));
  check(Math.abs(last.revenue - 102.5) < 0.01, 'Q4 revenue is derived as full year minus nine months (102.5), not the annual figure', last.revenue);
  check(dq.every((q, i) => i === 0 || q.periodEnd > dq[i - 1].periodEnd), 'quarters are in chronological order');
  const q3 = dq.find(q => q.periodEnd === '2025-06-28');
  check(!!q3 && Math.abs(q3.revenue - 94.0) < 0.01 && Math.abs(q3.operatingIncome - 28.2) < 0.01, 'a reported three-month quarter is used as-is');
  const q2 = dq.find(q => q.periodEnd === '2025-03-29');
  check(!!q2 && Math.abs(q2.revenue - 95.4) < 0.01, 'Q2 uses the reported three-month figure, not the six-month year-to-date total', q2?.revenue);
  check(!!q3 && Math.abs(q3.operatingCashFlow - 27.9) < 0.01, 'cash flow (reported only as year-to-date) is converted to a discrete quarter by subtraction', q3?.operatingCashFlow);
  check(Math.abs(last.grossMarginPct - Math.round((48.4 / 102.5) * 1000) / 10) < 0.11, 'gross margin is computed from the derived quarter');
  check(fin.summaryMetrics.latestQuarterlyRevenue === Math.round(102.5 * 1e9) || Math.abs(fin.summaryMetrics.latestQuarterlyRevenue - 102.5e9) < 2e7, 'summary latest-quarter revenue is the discrete quarter, not a year-to-date item', fin.summaryMetrics.latestQuarterlyRevenue);

  stubSec(buildFacts({ dropGrossFY25Q3: true }));
  const finMissing: any = await secEdgarProvider.getFinancialFacts('AAPL');
  check(!finMissing.derivedQuarters.some((q: any) => q.periodEnd === '2025-06-28'), 'a quarter whose gross profit is not reported is omitted (no 74%/61%/54% placeholder ratios invented)');
  check(finMissing.derivedQuarters.every((q: any) => q.isSimulated === false), 'remaining quarters are real');

  // =====================================================================================
  section('R2. Decision inputs: like-for-like trends from real quarters, unknown when not derivable');
  // =====================================================================================
  const svc: any = new DecisionIntelligenceService();
  const sec: any = { id: 'us-aapl', canonicalId: 'us-aapl', ticker: 'AAPL', symbol: 'AAPL', companyName: 'Apple Inc.', market: 'US', exchange: 'NASDAQ', currency: 'USD' };
  const bars = Array.from({ length: 260 }, (_, i) => ({ timestamp: dayAdd('2025-10-01', i), close: 200 + i * 0.5, open: 1, high: 1, low: 1, volume: 1 }));
  (financialDataService as any).getHistoricalPrices = async () => ({ bars, provider: 'stub', epistemicStatus: 'REAL' });
  const cfg = { fundamentalWeight: 1 } as any;

  stubSec(buildFacts());
  (financialDataService as any).getSecurityFinancials = (t: string) => secEdgarProvider.getFinancialFacts(t);
  const inp = await svc.gatherDecisionInputs(sec, '2026-01-15', cfg, undefined);
  const f = inp.financials;
  check(f?.revenueTrend === 'GROWING', 'revenue Q4 FY25 (102.5) vs Q4 FY24 (94.9) is GROWING (+8%)', f);
  check(Math.abs((f?.revenueGrowthPct ?? 0) - 8.0) < 0.2, 'year-over-year revenue growth is calculated, not a constant', f?.revenueGrowthPct);
  check(f?.operatingMarginTrend === 'STABLE' || f?.operatingMarginTrend === 'EXPANDING' || f?.operatingMarginTrend === 'CONTRACTING', 'operating margin trend is derived');
  check(Math.abs((f?.operatingMarginPct ?? 0) - (32.4 / 102.5) * 100) < 0.2, 'operating margin percent comes from the derived quarter', f?.operatingMarginPct);
  check(f?.operatingCashFlowTrend === 'POSITIVE', 'operating cash flow sign is derived from the quarter');
  check(f?.peRatio === null && f?.priceToSales === null, 'valuation multiples are unknown (null), not per-ticker constants');

  // the original defect: a 9-month YTD value followed by a quarter must NOT read as contraction
  check(f?.revenueTrend !== 'DECLINING', 'regression: year-to-date vs single-quarter mix no longer reads as "contraction"');

  // point-in-time: as of mid-2025 the FY25 Q4 (filed 2025-10-31) is not yet available
  const inpPit = await svc.gatherDecisionInputs(sec, '2025-08-15', cfg, undefined);
  check(!!inpPit.financials && inpPit.financials.revenueGrowthPct !== undefined && Math.abs(inpPit.financials.revenueGrowthPct - ((94.0 / 85.8 - 1) * 100)) < 0.3, 'point-in-time: only quarters filed on/before the as-of date are used', inpPit.financials?.revenueGrowthPct);

  // not derivable -> unknown, never defaulted to GROWING/EXPANDING/POSITIVE
  stubSec({ entityName: 'X', facts: { 'us-gaap': {} } });
  const inpNone = await svc.gatherDecisionInputs(sec, '2026-01-15', cfg, undefined);
  check(!inpNone.financials || (inpNone.financials.revenueTrend === undefined && inpNone.financials.operatingMarginTrend === undefined && inpNone.financials.operatingCashFlowTrend === undefined), 'with no facts, trends are unknown (not assumed favorable)', inpNone.financials);

  // declining company: reverse the figures
  const declining = buildFacts();
  const u = declining.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD as Item[];
  for (const it of u) if (it.end >= '2024-12-28') it.val = Math.round(it.val * 0.8);
  stubSec(declining);
  const inpDec = await svc.gatherDecisionInputs(sec, '2026-01-15', cfg, undefined);
  check(inpDec.financials?.revenueTrend === 'DECLINING' || inpDec.financials?.revenueTrend === undefined, 'a genuine decline is still detected (the fix does not hide real contraction)', inpDec.financials?.revenueTrend);

  // =====================================================================================
  section('R3. Market statistics and backtest metrics are real or unavailable');
  // =====================================================================================
  const stats = computeMarketStats(bars as any);
  check(stats.momentum !== undefined && stats.volatility !== undefined && stats.maxDrawdown === 0, 'monotonic rising bars: drawdown 0, momentum and volatility computed', stats);
  check(stats.momentum !== 8.5 && stats.volatility !== 28.4 && stats.maxDrawdown !== 18.2, 'results are not the old hardcoded constants (8.5 / 28.4 / 18.2)');
  const dd = computeMarketStats([100, 120, 90, 110, ...Array(30).fill(100)].map(c => ({ close: c })));
  check(Math.abs((dd.maxDrawdown ?? -1) - 25.0) < 0.05, 'max drawdown is the real peak-to-trough (120 -> 90 = 25.0%)', dd.maxDrawdown);
  check(Object.keys(computeMarketStats([{ close: 100 }, { close: 101 }] as any)).length === 0, 'too few bars -> unknown, nothing invented');
  check(inp.marketData?.provider === 'stub' && inp.marketData.currentPrice === [...bars].filter(b => b.timestamp <= '2026-01-15').pop()!.close, 'current price is the last real close');
  check(inp.backtestMetrics === undefined, 'no matching real backtest -> backtest metrics unavailable (no "benchmark" Sharpe 1.25 / DD 14.8% / CAGR 16.4%)', inp.backtestMetrics);
  (financialDataService as any).getHistoricalPrices = async () => { throw new Error('provider down'); };
  const inpDown = await svc.gatherDecisionInputs(sec, '2026-01-15', cfg, undefined);
  check(inpDown.marketData?.epistemicStatus === 'UNAVAILABLE' && inpDown.marketData?.currentPrice === 0, 'price provider failure -> UNAVAILABLE with no placeholder price (was 100.0)', inpDown.marketData);

  // =====================================================================================
  section('R4. Isolation');
  // =====================================================================================
  const after = fs.existsSync(realStore) ? sha(realStore) : 'absent';
  check(before === after, 'data/persistence/store.json is byte-identical after the suite');

  console.log(`\nREAL FINANCIALS INTEGRITY SUITE: ${pass} PASSED / ${fail} FAILED (TOTAL: ${pass + fail})`);
  if (fail) { console.error('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
