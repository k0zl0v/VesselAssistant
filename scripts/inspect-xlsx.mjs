// One-shot exploration: dump every sheet of the source XLSX so we can
// hand-pick the cells that go into the regression fixture.
//
// Run: node scripts/inspect-xlsx.mjs <path-to-xlsx>
import ExcelJS from 'exceljs';

const path = process.argv[2];
const sheetFilter = process.argv[3];
if (!path) {
  console.error('Usage: node scripts/inspect-xlsx.mjs <path-to-xlsx> [sheetName]');
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path);

for (const sheet of wb.worksheets) {
  if (sheetFilter && sheet.name !== sheetFilter) continue;
  console.log(`\n══════════ SHEET: ${sheet.name} (rowCount=${sheet.rowCount}, colCount=${sheet.columnCount}) ══════════`);
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const display =
        v && typeof v === 'object' && 'result' in v
          ? `=${v.formula}|=${v.result}`
          : v && typeof v === 'object' && 'richText' in v
            ? v.richText.map((r) => r.text).join('')
            : v;
      cells.push(`${cell.address}=${JSON.stringify(display)}`);
    });
    if (cells.length) console.log(`  R${rowNumber}: ${cells.join(' | ')}`);
  });
}
