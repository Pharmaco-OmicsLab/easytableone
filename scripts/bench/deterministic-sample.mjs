export function seededRandom(seed) {
  let value = seed >>> 0;
  value = (value + 0x6d2b79f5) | 0;
  let next = Math.imul(value ^ (value >>> 15), 1 | value);
  next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
  return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
}

export function deterministicSample(rows, n, seed) {
  const indexed = rows.map((row, index) => ({ row, key: seededRandom(seed + index * 1013904223) }));
  indexed.sort((a, b) => a.key - b.key);
  return indexed.slice(0, n).map((item) => item.row);
}
