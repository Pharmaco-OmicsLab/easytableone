export function minOf(values: number[]): number {
  let minimum = Infinity;
  for (const value of values) {
    if (value < minimum) minimum = value;
  }
  return minimum;
}

export function maxOf(values: number[]): number {
  let maximum = -Infinity;
  for (const value of values) {
    if (value > maximum) maximum = value;
  }
  return maximum;
}
