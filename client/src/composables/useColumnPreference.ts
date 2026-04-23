import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { getColumnPreference, saveColumnPreference } from '@/api/system/userPreference'

interface ColumnSettingItem {
  key: string
  title: string
  visible: boolean
}

interface Options {
  fixedLeft?: any[]
  fixedRight?: any[]
}

export function useColumnPreference(pageKey: string, defaultDataColumns: any[], options?: Options) {
  const fixedLeft = options?.fixedLeft ?? [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }]
  const fixedRight = options?.fixedRight ?? [{ title: '操作', key: 'action', width: 130, fixed: 'right' as const }]
  const fixedKeys = new Set([...fixedLeft.map(c => c.key), ...fixedRight.map(c => c.key)])

  // 列宽持久化：内部状态跟踪
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let currentPreferenceData = { columnOrder: [] as string[], hiddenColumns: [] as string[], columnWidths: {} as Record<string, number> }

  const collectCurrentWidths = (): Record<string, number> => {
    const widths: Record<string, number> = {}
    for (const col of columns.value) {
      if (!fixedKeys.has(col.key) && col.width) {
        widths[col.key] = col.width
      }
    }
    return widths
  }

  const applyWidths = (cols: any[], widths: Record<string, number>) => {
    for (const col of cols) {
      if (widths[col.key] && !fixedKeys.has(col.key)) {
        col.width = widths[col.key]
      }
    }
  }

  const debouncedSaveWidths = () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(async () => {
      try {
        const columnWidths = collectCurrentWidths()
        currentPreferenceData.columnWidths = columnWidths
        await saveColumnPreference(pageKey, { ...currentPreferenceData })
      } catch {
        // 宽度保存失败不影响使用
      }
    }, 500)
  }

  const buildColumns = (dataCols: any[]) => [
    ...fixedLeft,
    ...dataCols,
    ...fixedRight
  ]

  const columns = ref(buildColumns(defaultDataColumns))

  const columnSettingVisible = ref(false)
  const columnSettingList = ref<ColumnSettingItem[]>([])
  const columnSettingSaving = ref(false)

  const openColumnSetting = () => {
    const currentDataCols = columns.value.filter((c: any) => !fixedKeys.has(c.key))
    const currentKeys = currentDataCols.map((c: any) => c.key)
    const list: ColumnSettingItem[] = currentDataCols.map((c: any) => ({
      key: c.key, title: c.title, visible: true
    }))
    for (const dc of defaultDataColumns) {
      if (!currentKeys.includes(dc.key)) {
        list.push({ key: dc.key, title: dc.title, visible: false })
      }
    }
    columnSettingList.value = list
    columnSettingVisible.value = true
  }

  const moveColumnUp = (index: number) => {
    if (index <= 0) return
    const list = columnSettingList.value
    const temp = list[index]
    list[index] = list[index - 1]
    list[index - 1] = temp
  }

  const moveColumnDown = (index: number) => {
    const list = columnSettingList.value
    if (index >= list.length - 1) return
    const temp = list[index]
    list[index] = list[index + 1]
    list[index + 1] = temp
  }

  const saveColumnSetting = async () => {
    columnSettingSaving.value = true
    try {
      const allOrder = columnSettingList.value.map(c => c.key)
      const hiddenKeys = columnSettingList.value.filter(c => !c.visible).map(c => c.key)
      const columnWidths = collectCurrentWidths()
      await saveColumnPreference(pageKey, { columnOrder: allOrder, hiddenColumns: hiddenKeys, columnWidths })
      const visibleKeys = columnSettingList.value.filter(c => c.visible).map(c => c.key)
      const newDataCols = visibleKeys.map(key => defaultDataColumns.find(dc => dc.key === key)!).filter(Boolean)
      columns.value = buildColumns(newDataCols)
      applyWidths(columns.value, columnWidths)
      currentPreferenceData = { columnOrder: allOrder, hiddenColumns: hiddenKeys, columnWidths }
      columnSettingVisible.value = false
      message.success('列设置已保存')
    } catch {
      message.error('保存列设置失败')
    } finally {
      columnSettingSaving.value = false
    }
  }

  const resetColumnSetting = async () => {
    columnSettingSaving.value = true
    try {
      await saveColumnPreference(pageKey, { columnOrder: [], hiddenColumns: [], columnWidths: {} })
      columns.value = buildColumns(defaultDataColumns)
      currentPreferenceData = { columnOrder: [], hiddenColumns: [], columnWidths: {} }
      columnSettingVisible.value = false
      message.success('已恢复默认列设置')
    } catch {
      message.error('恢复默认失败')
    } finally {
      columnSettingSaving.value = false
    }
  }

  const loadColumnPreference = async () => {
    try {
      const res: any = await getColumnPreference(pageKey)
      if (res?.success && res.data) {
        const { columnOrder, hiddenColumns, columnWidths = {} } = res.data
        currentPreferenceData = { columnOrder: columnOrder || [], hiddenColumns: hiddenColumns || [], columnWidths }
        if (columnOrder && columnOrder.length > 0) {
          const hiddenSet = new Set(hiddenColumns || [])
          const visibleKeys = (columnOrder as string[]).filter(k => !hiddenSet.has(k))
          const newDataCols = visibleKeys.map(key => defaultDataColumns.find(dc => dc.key === key)).filter(Boolean)
          for (const dc of defaultDataColumns) {
            if (!columnOrder.includes(dc.key)) {
              newDataCols.push(dc)
            }
          }
          columns.value = buildColumns(newDataCols as any[])
        }
        if (columnWidths && Object.keys(columnWidths).length > 0) {
          applyWidths(columns.value, columnWidths)
        }
      }
    } catch {
      // 加载失败使用默认列
    }
  }

  const handleResizeColumn = (w: number, col: any) => {
    col.width = w
    debouncedSaveWidths()
  }

  return {
    columns,
    columnSettingVisible,
    columnSettingList,
    columnSettingSaving,
    openColumnSetting,
    moveColumnUp,
    moveColumnDown,
    saveColumnSetting,
    resetColumnSetting,
    loadColumnPreference,
    handleResizeColumn
  }
}
