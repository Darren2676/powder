import request from '@/utils/request';

export const getColumnPreference = (pageKey: string) => {
  return request({
    url: `/user-preferences/${pageKey}`,
    method: 'GET'
  });
};

export const saveColumnPreference = (pageKey: string, data: { columnOrder: string[]; hiddenColumns: string[] }) => {
  return request({
    url: `/user-preferences/${pageKey}`,
    method: 'PUT',
    data
  });
};
