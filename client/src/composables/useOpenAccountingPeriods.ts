import { ref, computed } from 'vue'
import { getAccountingPeriods } from '@/api/finance/accountingPeriod'

interface PeriodOption {
  label: string
  value: string
  start_date: string
  end_date: string
}

export function useOpenAccountingPeriods() {
  const openPeriodOptions = ref<PeriodOption[]>([])
  const openPeriodLoading = ref(false)

  const noOpenPeriod = computed(() => openPeriodOptions.value.length === 0)

  const fetchOpenPeriods = async () => {
    openPeriodLoading.value = true
    try {
      const res: any = await getAccountingPeriods({ status: '已开启' })
      if (res?.success) {
        const rows = res.data || []
        openPeriodOptions.value = rows.map((r: any) => ({
          label: r.period_name || r.period_code,
          value: r.period_code,
          start_date: r.start_date,
          end_date: r.end_date,
        }))
      }
    } catch {
      // ignore
    } finally {
      openPeriodLoading.value = false
    }
  }

  const getDefaultPeriod = (): string => {
    if (openPeriodOptions.value.length === 0) return ''
    const today = new Date().toISOString().slice(0, 10)
    const match = openPeriodOptions.value.find((p) => {
      const start = p.start_date?.slice(0, 10) || ''
      const end = p.end_date?.slice(0, 10) || ''
      return today >= start && today <= end
    })
    return match ? match.value : openPeriodOptions.value[0].value
  }

  return { openPeriodOptions, openPeriodLoading, noOpenPeriod, fetchOpenPeriods, getDefaultPeriod }
}
