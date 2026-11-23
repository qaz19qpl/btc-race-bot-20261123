// Dip snap-back + rally ride bot for make.fun btc-race-24h-20261123-0511.
//
// Idea: 1-minute cbBTC bars are mostly noise (std ~8 bps), real moves build over
// 30-120 minutes, and a full round trip costs ~26 bps in fees, slippage and
// impact. So the bot trades rarely and only for moves worth catching:
//   * BUY when the price has fallen at least 100 bps from its 120-bar high and
//     the latest bar turns back up (green bar closing above the previous
//     close) -- a sharp dip that is exhausting, not one still falling.
//   * SELL at +250 bps take-profit, -150 bps stop, an 80 bps trailing stop
//     off the peak close since entry, or after 360 bars held.
// Sizing is the whole cash balance, capped so the trade's own price impact
// stays under 30 bps against the pool depth at the latest close. Long only,
// one position at a time, at most one order per reply.
//
// Everything is deterministic: no clock, no randomness, no environment reads.
// Decisions use only the bars the harness has sent (closes, opens, depths).
// Prices are handled as plain numbers in USDC (raw units divided by the
// symbol's price scale); quantities stay bigints exactly as the harness
// reports them, so fills and sells line up with the account.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Strategy constants, tuned on the published dev window (see README).
const DIP_WINDOW = 120; // bars back to look for the high a dip is measured from
const DIP_BPS = 100; // minimum fall from that high, in basis points
const TAKE_PROFIT_BPS = 250; // sell once the close is this far above the fill
const STOP_BPS = 150; // sell once the close is this far below the fill
const TRAIL_BPS = 80; // sell once the close is this far below the peak since entry
const MAX_HOLD_BARS = 360; // sell after holding this many bars, whatever the price
const IMPACT_CAP_BPS = 30; // never size a buy so its own impact tops this
const MAX_SLIPPAGE_BPS = 150; // per order, measured from the latest close
const MIN_NOTIONAL = 1_000_000n; // 1 USDC, in quote units

// Rolling state, rebuilt from the wire alone.
const closes: number[] = []; // closes in USDC, oldest first
const opens: number[] = []; // opens in USDC, oldest first
let priceScale = 5; // set from hello; only used to turn raw prices into USDC
let entryPrice = 0; // USDC fill price of the open position, 0 when flat
let peakClose = 0; // highest close seen while the position is open
let heldBars = 0; // bars held since the position opened

function bpsMove(from: number, to: number): number {
  return ((to - from) / from) * 10000;
}

await runBars({
  onHello(state) {
    const sym = state.symbols.get(SYMBOL);
    if (sym !== undefined) priceScale = sym.price_scale;
  },

  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    if (state.warmingUp) return [];
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];
    const close = Number(bar.c) / 10 ** priceScale;
    const open = Number(bar.o) / 10 ** priceScale;
    closes.push(close);
    opens.push(open);

    // Fold this batch's fills into the position bookkeeping. A buy fill opens
    // the position at its fill price; a sell fill closes it.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        entryPrice = Number(fill.price) / 10 ** priceScale;
        peakClose = entryPrice;
        heldBars = 0;
      } else if (fill.side === 'sell') {
        entryPrice = 0;
        peakClose = 0;
        heldBars = 0;
      }
    }

    const pos = state.positions.get(SYMBOL);
    const qty = pos === undefined ? 0n : pos.qty;
    const n = closes.length;
    if (n < 2) return [];

    if (qty > 0n) {
      // --- holding: manage the exit ---
      heldBars += 1;
      if (close > peakClose) peakClose = close;
      const entry = entryPrice > 0 ? entryPrice : close;
      const gainBps = bpsMove(entry, close);
      const trailBps = bpsMove(peakClose, close);
      const stopHit = gainBps <= -STOP_BPS;
      const profitHit = gainBps >= TAKE_PROFIT_BPS;
      const trailHit = peakClose > 0 && trailBps <= -TRAIL_BPS;
      const timeHit = heldBars >= MAX_HOLD_BARS;
      if (stopHit || profitHit || trailHit || timeHit) {
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // --- flat: look for a dip that is turning back up ---
    if (entryPrice !== 0) {
      // Bookkeeping out of sync (a fill we missed): do not trade blind.
      entryPrice = 0;
      peakClose = 0;
      heldBars = 0;
    }
    const start = Math.max(0, n - DIP_WINDOW);
    let high = 0;
    for (let i = start; i < n; i++) if (closes[i]! > high) high = closes[i]!;
    if (high <= 0) return [];
    const dropBps = bpsMove(close, high); // positive when below the high
    const prevClose = closes[n - 2]!;
    const turningUp = close > prevClose && close > open;
    if (dropBps >= DIP_BPS && turningUp) {
      // Size: all the cash, but keep the trade's own impact under the cap
      // against the pool depth at the latest close.
      const depth = state.depthAt(SYMBOL);
      let notional = state.cash;
      if (depth !== null && depth.length > 0) {
        // depth[0] is USDC raw units (quote scale 6); notional is the same.
        const cap = (depth[0]! * BigInt(IMPACT_CAP_BPS)) / 10000n;
        if (cap < notional) notional = cap;
      }
      if (notional < MIN_NOTIONAL) return [];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
