/** `dischargeFromHold` could not cover the requested tons; `short_tons` is unrounded. */
export class InsufficientCargoError extends Error {
  constructor(
    readonly hold_id: string,
    readonly short_tons: number,
  ) {
    super(`Insufficient cargo in hold ${hold_id}: ${short_tons} tons short`);
    this.name = 'InsufficientCargoError';
  }
}
