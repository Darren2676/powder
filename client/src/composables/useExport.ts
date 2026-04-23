import { ref } from 'vue'
import { message } from 'ant-design-vue'

/**
 * 通用导出导入 composable
 * 封装 Excel 导出/导入逻辑
 */
export function useExport(fetchData: () => Promise<void>) {
  const exportLoading = ref(false)
  const importLoading = ref(false)
  const fileInputRef = ref<HTMLInputElement | null>(null)

  /** 导出 Excel */
  const handleExport = async (
    exportFn: (params?: any) => Promise<any>,
    filename = 'export.xlsx',
    extraParams?: Record<string, any>
  ) => {
    exportLoading.value = true
    try {
      const res = await exportFn(extraParams)
      const blob = new Blob([res.data || res], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      window.URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch {
      message.error('导出失败')
    } finally {
      exportLoading.value = false
    }
  }

  /** 触发文件选择 */
  const handleImportClick = () => {
    fileInputRef.value?.click()
  }

  /** 处理文件导入 */
  const handleFileChange = async (
    e: Event,
    importFn: (formData: FormData) => Promise<any>
  ) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    importLoading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await importFn(formData)
      if (res.success || res.data) {
        message.success(res.message || '导入成功')
        await fetchData()
      }
    } catch {
      message.error('导入失败')
    } finally {
      importLoading.value = false
      if (fileInputRef.value) {
        fileInputRef.value.value = ''
      }
    }
  }

  /** 导出选中行 */
  const handleExportSelected = async (
    exportFn: (params: any) => Promise<any>,
    selectedKeys: (string | number)[],
    filename = 'export.xlsx'
  ) => {
    if (selectedKeys.length === 0) {
      message.warning('请先选择要导出的记录')
      return
    }
    await handleExport(
      (params) => exportFn({ ...params, selected_ids: selectedKeys }),
      filename
    )
  }

  return {
    exportLoading,
    importLoading,
    fileInputRef,
    handleExport,
    handleImportClick,
    handleFileChange,
    handleExportSelected,
  }
}
