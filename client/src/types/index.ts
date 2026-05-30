// User related types
export interface User {
  id: number;
  username: string;
  email: string;
  real_name: string;
  role: 'admin' | 'manager' | 'staff' | 'sales';
  department?: string;
  phone?: string;
  avatar?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

// Notification related types
export interface Notification {
  id: number;
  user_id: number;
  ticket_id?: number;
  type: 'assigned' | 'commented' | 'status_changed' | 'due_soon';
  title: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Request parameter types
export interface UserQueryParams {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  search?: string;
}

export interface NotificationQueryParams {
  page?: number;
  limit?: number;
  is_read?: boolean;
}

// Form data types
export interface LoginFormData {
  username: string;
  password: string;
}

export interface RegisterFormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  real_name: string;
  department?: string;
  phone?: string;
}

export interface UpdateProfileFormData {
  real_name?: string;
  email?: string;
  department?: string;
  phone?: string;
}

export interface ChangePasswordFormData {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}
