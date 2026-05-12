import { ref, reactive, computed, type Ref } from 'vue'
import { message } from 'ant-design-vue'

/**
 * 通用表格列表逻辑 composable
 * 封装分页、搜索、加载、行选择等通用逻辑
 */
export function useTableList<T = any>(fetchFn: (params: any) => Promise<any>) {
  const loading = ref(false)
  const dataSource = ref<T[]>([]) as Ref<T[]>
  const searchText = ref('')
  const selectedRowKeys = ref<(string | number)[]>([])

  const pagination = reactive({
    current: 1,
    pageSize: 10,
    total: 0,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (total: number) => `共 ${total} 条记录`,
  })

  const rowSelection = computed(() => ({
    selectedRowKeys: selectedRowKeys.value,
    onChange: (keys: (string | number)[]) => {
      selectedRowKeys.value = keys
    },
  }))

  const fetchData = async (extraParams?: Record<string, any>) => {
    loading.value = true
    try {
      const res = await fetchFn({
        page: pagination.current,
        limit: pagination.pageSize,
        search: searchText.value || undefined,
        ...extraParams,
      })
      const data = res.data || res
      if (data.items !== undefined) {
        dataSource.value = data.items
        pagination.total = data.pagination?.total ?? data.total ?? 0
      } else if (Array.isArray(data)) {
        dataSource.value = data
      }
    } catch (err: any) {
      console.error('获取数据失败:', err)
      message.error(err.response?.data?.message || '获取数据失败')
    } finally {
      loading.value = false
    }
  }

  const handleTableChange = (pag: any) => {
    pagination.current = pag.current
    pagination.pageSize = pag.pageSize
    fetchData()
  }

  const handleSearch = () => {
    pagination.current = 1
    fetchData()
  }

  const handleReset = () => {
    searchText.value = ''
    pagination.current = 1
    fetchData()
  }

  return {
    loading,
    dataSource,
    searchText,
    selectedRowKeys,
    pagination,
    rowSelection,
    fetchData,
    handleTableChange,
    handleSearch,
    handleReset,
  }
}
