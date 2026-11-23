# btc-race-bot-20261123

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/qaz19qpl/btc-race-bot-20261123/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/qaz19qpl/btc-race-bot-20261123/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Dip snap-back BTC trading bot for make.fun's 24-hour cbBTC race: it buys a sharp dip (100+ bps below the 120-bar high) only once the bar turns back up, then rides the move and exits on take-profit (+250 bps), stop (-150 bps), an 80 bps trailing stop, or after 360 bars. One position at a time, full-size buys capped so the trade's own price impact stays under 30 bps against the pool depth. Long only, deterministic, standard library only.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1`: one JSON line per minute on stdin, one reply per batch on stdout. See the kit's `sdk/makefun-bars.ts` (vendored under `vendor/`) for the wire protocol.

## Dev result

Graded locally on the published dev window with the kit's own grader:

- Net PnL: **+34.23 USDC** on $1,000 starting capital
- Trades: 8 (win rate 75%), max drawdown 1.28%
- Two executions reproduce byte for byte (deterministic)

Out-of-sample check on the previous race's dev window (2026-11-18, a falling market): +1.53 USDC, 9 trades, max drawdown 1.82%.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mq95vk6b&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
