// API Request/Response types

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface AuthRequest {
  email?: string;
  username?: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: UserDTO;
}

export interface UserDTO {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  isActive: boolean;
  roles: RoleDTO[];
}

export interface RoleDTO {
  id: number;
  name: string;
  permissions?: PermissionDTO[];
}

export interface PermissionDTO {
  id: number;
  module: string;
  action: string;
}
