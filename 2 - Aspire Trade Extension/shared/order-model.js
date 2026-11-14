(() => {
const Side = Object.freeze({ BUY: "BUY", SELL: "SELL", UNKNOWN: "UNKNOWN" });

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(value) {
  return String(value ?? "").replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)));
}

function cleanText(value) {
  return normalizeDigits(value).replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  const normalized = cleanText(value).replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSide(value) {
  const text = cleanText(value).toLowerCase();
  if (/(شراء|buy|شراء\s*\/?\s*buy)/.test(text)) return Side.BUY;
  if (/(بيع|sell|بيع\s*\/?\s*sell)/.test(text)) return Side.SELL;
  return Side.UNKNOWN;
}

function normalizeOrder(raw, source = "aspire-dom") {
  const symbol = cleanText(raw.symbol);
  return {
    source,
    orderId: cleanText(raw.orderId) || null,
    symbol,
    company: cleanText(raw.company),
    side: normalizeSide(raw.side),
    status: cleanText(raw.status),
    remainingQuantity: parseNumber(raw.remainingQuantity),
    price: parseNumber(raw.price),
    validity: cleanText(raw.validity),
    account: cleanText(raw.account),
    capturedAt: new Date().toISOString()
  };
}

function aggregateOrders(orders) {
  const buckets = new Map();
  for (const order of orders) {
    if (!order.symbol || order.side === Side.UNKNOWN) continue;
    const key = `${order.symbol}::${order.side}`;
    const bucket = buckets.get(key) ?? {
      symbol: order.symbol,
      company: order.company,
      side: order.side,
      orderCount: 0,
      totalRemainingQuantity: 0,
      weightedPriceNumerator: 0,
      statuses: new Set()
    };
    bucket.orderCount += 1;
    bucket.totalRemainingQuantity += order.remainingQuantity;
    bucket.weightedPriceNumerator += order.remainingQuantity * order.price;
    if (order.status) bucket.statuses.add(order.status);
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map(bucket => ({
      symbol: bucket.symbol,
      company: bucket.company,
      side: bucket.side,
      orderCount: bucket.orderCount,
      totalRemainingQuantity: bucket.totalRemainingQuantity,
      weightedAveragePrice: bucket.totalRemainingQuantity ? bucket.weightedPriceNumerator / bucket.totalRemainingQuantity : 0,
      statuses: [...bucket.statuses].join(", ")
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.side.localeCompare(b.side));
}

globalThis.GreenValleyOrderModel = { Side, normalizeDigits, cleanText, parseNumber, normalizeSide, normalizeOrder, aggregateOrders };
})();
