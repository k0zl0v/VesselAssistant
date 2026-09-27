/** Strings of one screen. `ru` mirrors every `en` key (typecheck enforces it). */
export const en = {} as const;

export const ru: { [K in keyof typeof en]: string } = {};
