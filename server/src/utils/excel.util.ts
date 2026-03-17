import * as XLSX from 'xlsx';
import { Response } from 'express';

export function exportToExcel(
  items: any[],
  fields: string[],
  headers: string[],
  filename: string,
  res: Response,
  format: 'xlsx' | 'xls' = 'xlsx'
) {
  const data = items.map(item => {
    const row: any = {};
    fields.forEach((f, i) => {
      row[headers[i]] = item[f] ?? '';
    });
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const bookType = format === 'xls' ? 'xls' : 'xlsx';
  const contentType = format === 'xls'
    ? 'application/vnd.ms-excel'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const buffer = XLSX.write(wb, { type: 'buffer', bookType });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename=${filename}.${bookType}`);
  res.send(Buffer.from(buffer));
}

export function parseExcelFile(
  buffer: Buffer,
  fields: string[],
  headers: string[]
): any[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const jsonData: any[] = XLSX.utils.sheet_to_json(ws);
  return jsonData.map((row: any) => {
    const item: any = {};
    fields.forEach((f, i) => {
      item[f] = String(row[headers[i]] ?? row[f] ?? '').trim();
    });
    return item;
  });
}
