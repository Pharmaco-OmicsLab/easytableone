export function isFisherLike(name: string): boolean {
  return name.startsWith("Fisher's exact");
}

export function isOrdinalRankTest(name: string): boolean {
  return name === "Mann-Whitney U (ordinal)" || name === "Kruskal-Wallis (ordinal)";
}
