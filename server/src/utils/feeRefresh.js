import { setFee } from './payments.js';
import { feesChanged } from '../socket/events.js';

// Refreshes the fees that public sources publish, once a day:
//   wise  a live quote for sending 1,000 USD to EUR: the conversion part
//         becomes the percent, the pay-in part the fixed fee
//   btc   the current "fastest" network fee (sat/vB) for a normal-size
//         transaction, in USD at the current Bitcoin price
//   usdt  the Tron energy a USDT transfer burns (about 13.4 TRX when the
//         wallet holds no energy), in USD at the current TRX price
// PayPal, Payoneer and the like publish no rates API, so an admin keeps those.

const SAMPLE_USD = 1000;
const BTC_TX_VBYTES = 140;
const TRX_PER_USDT_TRANSFER = 13.4;
const TIMEOUT_MS = 10000;

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json', 'user-agent': 'business-manager fee refresh' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

async function wiseFee() {
  const q = await getJson(`https://api.wise.com/v1/quotes?source=USD&target=EUR&sourceAmount=${SAMPLE_USD}&rateType=FIXED`);
  const variable = Number(q.feeDetails?.transferwise ?? q.fee ?? 0);
  const fixed = Number(q.feeDetails?.payIn ?? 0);
  return { feePercent: round((variable / SAMPLE_USD) * 100, 3), feeFixed: round(fixed), detail: `Wise quote: ${SAMPLE_USD} USD → EUR, fee ${round(Number(q.fee))} (${round(variable)} conversion + ${round(fixed)} pay-in)` };
}

async function prices() {
  const p = await getJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tron&vs_currencies=usd');
  return { btc: Number(p.bitcoin?.usd), trx: Number(p.tron?.usd) };
}

async function btcFee(btcUsd) {
  const f = await getJson('https://mempool.space/api/v1/fees/recommended');
  const sats = Number(f.fastestFee) * BTC_TX_VBYTES;
  return { feePercent: 0, feeFixed: round((sats / 1e8) * btcUsd), detail: `Bitcoin network: ${f.fastestFee} sat/vB × ${BTC_TX_VBYTES} vB at ${round(btcUsd, 0)} USD/BTC` };
}

const usdtFee = (trxUsd) => ({ feePercent: 0, feeFixed: round(TRX_PER_USDT_TRANSFER * trxUsd), detail: `Tron network: ${TRX_PER_USDT_TRANSFER} TRX at ${round(trxUsd, 4)} USD/TRX` });

// Updates what can be fetched; a source that fails keeps its last value.
export async function refreshFees() {
  const now = new Date();
  const results = {};
  const tasks = {
    wise: wiseFee,
    btc: async () => btcFee((await prices()).btc),
    usdt: async () => usdtFee((await prices()).trx),
  };
  for (const [key, run] of Object.entries(tasks)) {
    try {
      const fee = await run();
      if (!Number.isFinite(fee.feePercent) || !Number.isFinite(fee.feeFixed)) throw new Error('no usable number');
      await setFee(key, { ...fee, source: 'auto', checkedAt: now });
      results[key] = fee;
    } catch (err) {
      results[key] = { error: err.message };
    }
  }
  // Whoever has the fee table open sees the new numbers.
  if (Object.values(results).some((r) => !r.error)) feesChanged();
  return results;
}

// Runs the refresh now and then once a day.
export function scheduleFeeRefresh() {
  const run = () => refreshFees()
    .then((r) => {
      const ok = Object.entries(r).filter(([, v]) => !v.error).map(([k, v]) => `${k} ${v.feePercent}% + ${v.feeFixed}`);
      const bad = Object.entries(r).filter(([, v]) => v.error).map(([k, v]) => `${k}: ${v.error}`);
      console.log(`Payment fees refreshed: ${ok.join(', ') || 'nothing'}${bad.length ? ` (failed: ${bad.join('; ')})` : ''}`);
    })
    .catch((err) => console.error('Payment fee refresh failed:', err));
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
