# Investment Intelligence App: Step-by-Step Guide and Manual Validation

> **What this app is:** a research and decision-support workspace for US and Indian stocks.
> **What it is not:** a trading bot or a guaranteed stock picker. It never places orders, and nothing in it proves its BUY/HOLD/SELL labels make money. You make every buy and sell decision.
> Never invest money you cannot afford to lose on the strength of these scores.

---

## Part 1: Start the app

1. In a terminal, in the project folder, run `./dev.sh`.
2. Open **http://localhost:4200**.
3. Click **Register**, create an account, then log in. (Backend: http://localhost:4100.)
4. If the page looks stuck, hard-refresh (Cmd+Shift+R).
5. Logs are in `.dev-logs/backend.log` and `.dev-logs/frontend.log`.
6. If login says "Too many attempts", run `./dev.sh` again. That clears it.

## Part 2: Step 0, check that your data is live (do this first)

Nothing else in this guide is worth doing until the data is real.

1. Open **Monitor & Health** in the sidebar. Check each provider's status:
   - US prices: Twelve Data
   - India prices: Fyers (and TrueData)
   - Filings: SEC EDGAR
2. **Fyers token:** the access token usually expires every day. If Indian quotes show UNAVAILABLE or errors, generate a fresh token, put it in `.env` as `FYERS_ACCESS_TOKEN`, and rerun `./dev.sh`. Never share or paste the token.
3. Look for the data labels on the pages (REAL / SIMULATED / UNAVAILABLE).
   - Only trust **REAL**.
   - **UNAVAILABLE** means the provider failed. The app should not invent a number.
   - **SIMULATED** is sample data. Never trade on it.
4. Quick price check (see Part 4, Check 1). If the price is wrong, stop here.

## Part 3: The workflow, step by step

### Step 1: Build a watchlist (Watchlist)
1. Open **Watchlist**.
2. In **Quick Add Symbol**, type a ticker and click **Add**. Use `AAPL`, `MSFT` and `NVDA` for US, and `RELIANCE` and `TCS` for India. Start with 5 to 10 stocks you already know.
3. Optionally record your entry price (the "e.g. 150.00" field) if you own it.

### Step 2: Find candidates (Discover)
1. Open **Discover** and use the search box to filter by ticker, name or reason.
2. Treat the list as research leads, not buy lists. Add interesting ones to your Watchlist.

### Step 3: Study one stock (Deep Dive)
1. Click a stock, then **Deep Dive (TICKER)** in the sidebar.
2. Read the **Analytical Decision Score** and its factor breakdown. The factors matter more than the label.
3. Check the evidence behind each factor. Filing-based items should show **REAL XBRL** or a source link.
4. Write down what would make you wrong (the risks listed).
5. Rule: if you cannot explain why the score is high in one sentence, don't act on it.

### Step 4: Test your idea on history (Backtesting and Strategies)
1. In **Strategies**, define a rule (for example "buy when X, sell when Y") and click **Run Full Backtest**.
2. In **Backtesting**, open the result and read the provenance sections: Execution Fill Ledger, Signal Generation Provenance, Canonical Market Data Provenance.
3. If it says **NO VERIFIED BACKTEST AVAILABLE**, there is no verified result. Do not rely on it.
4. Look at:
   - maximum drawdown (the worst fall), not only total return
   - the number of trades (a handful of trades proves nothing)
   - whether it beat simply holding the index (S&P 500 for US, Nifty 50 for India)
5. A good backtest does not guarantee future profit.

### Step 5: Check your risk (Portfolio and Scenario & Stress)
1. In **Portfolio**, check concentration. Avoid more than about 10 to 15% of your money in one stock.
2. In **Scenario & Stress**, see how the portfolio behaves in a crash.

### Step 6: Set alerts to know when to reconsider (Alerts and Monitor)
1. In **Alerts**, set triggers for events that would change your view, such as a price level or a new filing.
2. The app alerts you. It does not tell you to sell at a precise time. **You decide your exit rules yourself before buying**, for example a stop-loss at about 8% below entry and a profit target or trailing stop.

### Step 7: Decide and record
1. Decide yourself, with your own broker. The app does not trade.
2. Use **Research & RAG** and **Research Memory** to save your reasoning and revisit it later.
3. Start small, for example 25% of your intended position, and add only if the thesis holds.

---

## Part 4: Manual validation checklist (is the app right?)

Do these once per provider, then spot-check weekly. Record results in the table in Part 5.

### Check 1: Prices (live and correct?)
1. Pick 3 US and 3 Indian stocks.
2. Note the app's price and timestamp.
3. Compare against a trusted source at the same time:
   - US: Yahoo Finance, Google Finance or your broker
   - India: NSE website, your broker (Zerodha, Groww) or Google Finance
4. **Pass:** the difference is within about 0.5% during market hours (allow a little for delay). **Fail:** large gaps, a stale timestamp, or SIMULATED labels.
5. Test market hours too: a US price should not change at 2 a.m. IST, and an NSE price should stay flat after 3:30 p.m. IST.

### Check 2: Historical data and charts
1. Pick a past date, for example the close on 1 Sep 2025 for AAPL and RELIANCE.
2. Compare the app's close against Yahoo or NSE historical data.
3. **Pass:** exact or within rounding. Splits and dividends can explain differences (adjusted versus unadjusted close). Note which one the app uses.

### Check 3: Filing and fundamentals data
1. Pick one stock's latest revenue and net income in the app.
2. Verify it in the actual filing. For US, search the company on sec.gov (EDGAR 10-K or 10-Q). For India, use the company results on BSE or NSE.
3. **Pass:** the numbers match the filing, with the right period (quarter versus year) and currency.

### Check 4: Does the score make sense?
1. Open the Deep Dive for a stock whose story you know well.
2. List each factor and ask whether it is true. For example, if it says "revenue growing 15%", you can confirm that in the filing.
3. Compare the scores of one clearly strong and one clearly weak company. The strong one should score higher. If not, the model is suspect.
4. Check that the label (BUY/HOLD/SELL) matches the underlying factors. A BUY with weak factors is a red flag.

### Check 5: Backtest honesty
1. Pick a simple rule (buy and hold AAPL from 2020 to 2024).
2. Compute the return yourself with Yahoo historical prices.
3. **Pass:** the app's number is close. A big difference means a data or logic problem.
4. Check the fill dates and prices in the Execution Fill Ledger against real historical prices.
5. Check that a backtest cannot use information from the future: the signals on a date should only use data available on that date.

### Check 6: Paper-trade before real money (strongly recommended)
1. For 4 to 8 weeks, record every BUY/SELL the app suggests (date, price, reason).
2. Do not trade. Compare the results to the index over the same period.
3. Only if it consistently adds value after a decent sample (at least 20 or more calls) should you consider small real positions.
4. Keep the log in a spreadsheet.

### Red flags (stop using the app for decisions)
- Prices differ materially from your broker.
- Labels show SIMULATED or UNAVAILABLE and the UI still shows a confident score.
- Fundamentals don't match filings.
- The backtest has no provenance or conflicts with your own calculation.
- The score changes drastically from refresh to refresh without a data change.

---

## Part 5: Validation log (copy and fill in)

| Date | Check | Stock | App value | Trusted source value | Diff | Pass/Fail |
|---|---|---|---|---|---|---|
| | Price | AAPL | | | | |
| | Price | RELIANCE | | | | |
| | Historical close | | | | | |
| | Revenue | | | | | |
| | Backtest | | | | | |

## Part 6: Paper-trade log (copy and fill in)

| Date | Stock | App signal | Price | Reason | Result after 1 / 4 / 12 weeks | Index change |
|---|---|---|---|---|---|---|
| | | | | | | |

---

## Part 7: Common problems

| Problem | Fix |
|---|---|
| Page keeps reloading | Fixed in `vite.config.ts` (it ignores `data/`). Hard-refresh the browser. |
| "Too many authentication attempts" | Run `./dev.sh` to restart the backend. |
| Indian prices missing | Refresh `FYERS_ACCESS_TOKEN` in `.env`, then run `./dev.sh`. |
| US prices missing | Check `TWELVE_DATA_API_KEY` and the free-plan rate limits. |
| Something broke | Check `.dev-logs/backend.log`. |

## Reminder

This app supports research. It cannot predict the market. Treat every signal as one input among many, verify its data yourself, size positions carefully, and decide your exit before you enter.
