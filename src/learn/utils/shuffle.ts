/** Fisher-Yates shuffle — returns a new array, does not mutate input. */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const result = [...arr];
  for (let current = result.length - 1; current > 0; current--) {
    const swapWith = Math.floor(rng() * (current + 1));
    [result[current], result[swapWith]] = [result[swapWith], result[current]];
  }
  return result;
}
