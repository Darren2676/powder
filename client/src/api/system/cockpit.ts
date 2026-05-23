import request from '@/utils/request'

export const getCockpitOverview = (params?: { dateFrom?: string; dateTo?: string }) => {
  return request.get('/cockpit/overview', { params })
}
