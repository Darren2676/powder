// User related types
export interface User {
  id: number;
  username: string;
  email: string;
  real_name: string;
  role: 'admin' | 'manager' | 'staff';
  department?: string;
  phone?: string;
  avatar?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

// Ticket related types
export interface Ticket {
  id: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'closed';
  category?: string;
  creator_id: number;
  assignee_id?: number;
  due_date?: string;
  completed_at?: string;
  creator?: User;
  assignee?: User;
  comments?: Comment[];
  attachments?: Attachment[];
  created_at: string;
  updated_at: string;
}

// Comment related types
export interface Comment {
  id: number;
  ticket_id: number;
  user_id: number;
  content: string;
  user?: User;
  created_at: string;
  updated_at: string;
}

// Attachment related types
export interface Attachment {
  id: number;
  ticket_id: number;
  uploader_id: number;
  original_name: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploader?: User;
  created_at: string;
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

// Dashboard statistics types
export interface DashboardStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  closed: number;
  todayNew: number;
  weekCompleted: number;
  byPriority: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
}

// Request parameter types
export interface TicketQueryParams {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  search?: string;
  creator_id?: number;
  assignee_id?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

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

export interface CreateTicketFormData {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  assignee_id?: number;
  due_date?: string;
}

export interface UpdateTicketFormData {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  assignee_id?: number;
  due_date?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'closed';
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
