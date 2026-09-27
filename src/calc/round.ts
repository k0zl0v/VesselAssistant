export const roundTo3 = (x: number): number => Math.round(x * 1000) / 1000;

/** U+202F: groups thousands without breaking a paste into Excel. */
export const THIN_NBSP = ' ';
/** U+2212: a negative remain is a plan/fact mismatch (TZ §8.3), not a hyphen. */
export const MINUS = '−';

const groupThousands = (digits: string): string =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_NBSP);

export const formatTons = (x: number): string => {
  const r = roundTo3(x);
  const [int, frac] = Math.abs(r).toFixed(3).split('.') as [string, string];
  return `${r < 0 ? MINUS : ''}${groupThousands(int)}.${frac}`;
};

/** One decimal and a non-breaking space before the sign: `58.0 %`. */
export const formatPercent = (x: number): string => {
  const r = Math.round(x * 10) / 10;
  return `${r < 0 ? MINUS : ''}${Math.abs(r).toFixed(1)} %`;
};
