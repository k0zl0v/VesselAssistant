/**
 * Regenerates src/services/__tests__/fixtures/import/appendix-c-load-plan.xlsx
 * from src/fixtures/kavkaz-iv.ts. Run: `npm run fixtures:import`, then commit the file.
 * import-fixture-freshness.test.ts fails while the committed copy is stale.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLoadPlanWorkbook } from '../src/services/__tests__/fixtures/import/build-load-plan';

const target = fileURLToPath(
  new URL('../src/services/__tests__/fixtures/import/appendix-c-load-plan.xlsx', import.meta.url),
);

mkdirSync(dirname(target), { recursive: true });
await buildLoadPlanWorkbook().xlsx.writeFile(target);
console.log(`wrote ${target}`);
