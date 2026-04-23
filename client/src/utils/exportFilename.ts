/**
 * 生成导出文件名
 * 格式: {baseName}_{YYYYMMDD}_{序号2位}.xlsx
 * 例如: employees_20260422_01.xlsx
 *
 * 同一天同一baseName的导出序号自动递增
 */

const exportCounters: Record<string, { date: string; count: number }> = {}

export function generateExportFilename(baseName: string, ext: string = 'xlsx'): string {
  const now = new Date()
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('')

  const key = `${baseName}_${dateStr}`

  if (!exportCounters[key] || exportCounters[key].date !== dateStr) {
    exportCounters[key] = { date: dateStr, count: 1 }
  } else {
    exportCounters[key].count++
  }

  const seq = String(exportCounters[key].count).padStart(2, '0')
  return `${baseName}_${dateStr}_${seq}.${ext}`
}
