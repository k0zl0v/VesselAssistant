import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildLoadPlanWorkbook, dumpWorkbook } from './fixtures/import/build-load-plan';

const COMMITTED = fileURLToPath(
  new URL('./fixtures/import/appendix-c-load-plan.xlsx', import.meta.url),
);

async function load(bytes: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  return wb;
}

describe('import fixture freshness', () => {
  it('committed appendix-c-load-plan.xlsx matches a fresh build from src/fixtures/kavkaz-iv.ts', async () => {
    const buf = readFileSync(COMMITTED);
    const committed = await load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const fresh = await load((await buildLoadPlanWorkbook().xlsx.writeBuffer()) as ArrayBuffer);

    const dump = dumpWorkbook(committed);
    expect(Object.keys(dump)).toHaveLength(4);
    expect(Object.values(dump)[1]!.K25).toBe(4082);
    // Stale copy → run `npm run fixtures:import` and commit the result.
    expect(dump).toEqual(dumpWorkbook(fresh));
  });
});
