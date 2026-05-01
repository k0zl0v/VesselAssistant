export const roundTo3 = (x: number): number => Math.round(x * 1000) / 1000;

export const formatTons = (x: number): string => roundTo3(x).toFixed(3);
