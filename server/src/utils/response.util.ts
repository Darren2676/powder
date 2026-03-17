export const success = (data: any = null, message: string = '成功') => {
  return {
    success: true,
    message,
    data
  };
};

export const error = (message: string = '错误', code: number = 400) => {
  return {
    success: false,
    message,
    code
  };
};

export const paginate = (items: any[], total: number, page: number, limit: number) => {
  return {
    success: true,
    data: {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }
  };
};
