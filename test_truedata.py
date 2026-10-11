"""Test TrueData historical + live connections using credentials from .env.

Usage:
    pip install truedata
    python3 test_truedata.py [SYMBOL]     # default: RELIANCE
"""
import os
import sys
import time

from truedata import TD_hist, TD_live

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")


def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def main():
    env = load_env(ENV_PATH)
    login_id = env.get("TRUEDATA_USERNAME")
    password = env.get("TRUEDATA_PASSWORD")
    if not login_id or not password:
        sys.exit("TRUEDATA_USERNAME and TRUEDATA_PASSWORD must be set in .env")
    symbol = sys.argv[1].upper() if len(sys.argv) > 1 else "RELIANCE"

    print(f"--- Historical: last 5 EOD bars for {symbol} ---")
    td_hist = TD_hist(login_id, password)
    if td_hist.historical_datasource.access_token is None:
        sys.exit("TrueData login failed - check TRUEDATA_USERNAME / TRUEDATA_PASSWORD or subscription status")
    print(td_hist.get_n_historical_bars(symbol, no_of_bars=5, bar_size="EOD"))

    print(f"\n--- Live: subscribing to {symbol} ---")
    td_live = TD_live(login_id, password)
    td_live.start_live_data([symbol])
    time.sleep(5)
    print("Touchline:", td_live.touchline_data or "(none received - market may be closed)")
    print("Live data:", td_live.live_data or "(none received - market may be closed)")
    td_live.disconnect()


if __name__ == "__main__":
    main()
