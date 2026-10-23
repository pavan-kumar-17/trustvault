import {
  UserProfile,
  DocumentItem,
  GrantItem,
  AuditEventItem,
  ChainVerificationResult,
  FixturePersona,
  PermissionLevel,
} from '../types.js';

const TOKEN_KEY = 'trustvault_auth_token';

export const authStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
};

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMessage = 'An error occurred';
    try {
      const errorJson = await res.json();
      errMessage = errorJson.error || errMessage;
    } catch {
      errMessage = `HTTP ${res.status}: ${res.statusText}`;
    }
    throw new Error(errMessage);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  // Authentication & Demo personas
  async getFixtures(): Promise<{ fixtures: FixturePersona[] }> {
    return apiFetch<{ fixtures: FixturePersona[] }>('/api/auth/fixtures');
  },

  async login(credentials: { email: string; password: string }): Promise<{ token: string; user: UserProfile }> {
    const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    authStorage.setToken(data.token);
    return data;
  },

  async register(payload: {
    fullName: string;
    email: string;
    dateOfBirth: string;
    password: string;
    confirmPassword: string;
    requestedAccountType: 'viewer' | 'document_owner';
    agreeTerms: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    requiresEmailVerification: boolean;
    email: string;
    verificationCode?: string;
    user: UserProfile;
  }> {
    return apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async verifyEmail(payload: { email: string; code: string }): Promise<{
    success: boolean;
    message: string;
    token: string;
    user: UserProfile;
  }> {
    const data = await apiFetch<{
      success: boolean;
      message: string;
      token: string;
      user: UserProfile;
    }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.token) {
      authStorage.setToken(data.token);
    }
    return data;
  },

  async resendVerification(payload: { email: string }): Promise<{
    success: boolean;
    message: string;
    code?: string;
  }> {
    return apiFetch('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async forgotPassword(payload: { email: string }): Promise<{
    success: boolean;
    message: string;
    resetToken?: string;
  }> {
    return apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async resetPassword(payload: { token: string; newPassword: string }): Promise<{
    success: boolean;
    message: string;
  }> {
    return apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  logout(): void {
    authStorage.clearToken();
  },

  async demoLogin(userId: string): Promise<{ token: string; user: UserProfile }> {
    const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    authStorage.setToken(data.token);
    return data;
  },

  async getMe(): Promise<{ user: UserProfile }> {
    return apiFetch<{ user: UserProfile }>('/api/me');
  },


  // Documents
  async getDocuments(params: {
    q?: string;
    category?: string;
    sort?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: DocumentItem[]; total: number; page: number; limit: number }> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.category) query.set('category', params.category);
    if (params.sort) query.set('sort', params.sort);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    return apiFetch(`/api/documents?${query.toString()}`);
  },

  async getDocument(id: string): Promise<DocumentItem> {
    return apiFetch<DocumentItem>(`/api/documents/${id}`);
  },

  async uploadDocument(formData: FormData): Promise<DocumentItem> {
    return apiFetch<DocumentItem>('/api/documents', {
      method: 'POST',
      body: formData,
    });
  },

  async updateDocument(id: string, updates: { display_name?: string; category?: string }): Promise<DocumentItem> {
    return apiFetch<DocumentItem>(`/api/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async deleteDocument(id: string, reason: string): Promise<void> {
    return apiFetch<void>(`/api/documents/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  },

  async downloadDocument(id: string, filename: string): Promise<void> {
    const token = authStorage.getToken();
    const res = await fetch(`/api/documents/${id}/download`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      let err = 'Download failed';
      try {
        const json = await res.json();
        err = json.error || err;
      } catch {}
      throw new Error(err);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // Grants
  async getGrants(documentId: string): Promise<{ grants: GrantItem[] }> {
    return apiFetch<{ grants: GrantItem[] }>(`/api/documents/${documentId}/grants`);
  },

  async upsertGrant(documentId: string, userId: string, permission: PermissionLevel): Promise<void> {
    return apiFetch<void>(`/api/documents/${documentId}/grants/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ permission }),
    });
  },

  async revokeGrant(documentId: string, userId: string): Promise<void> {
    return apiFetch<void>(`/api/documents/${documentId}/grants/${userId}`, {
      method: 'DELETE',
    });
  },

  // Audit
  async getDocumentAudit(documentId: string): Promise<{ items: AuditEventItem[]; total: number }> {
    return apiFetch<{ items: AuditEventItem[]; total: number }>(`/api/documents/${documentId}/audit`);
  },

  // Admin
  async getAdminUsers(): Promise<{ users: UserProfile[] }> {
    return apiFetch<{ users: UserProfile[] }>('/api/admin/users');
  },

  async updateUserStatus(userId: string, isActive: boolean, reason?: string): Promise<UserProfile> {
    return apiFetch<UserProfile>(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive, reason }),
    });
  },

  async getAdminAudit(params: {
    page?: number;
    limit?: number;
    action?: string;
    outcome?: string;
  } = {}): Promise<{ items: AuditEventItem[]; total: number }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.action) query.set('action', params.action);
    if (params.outcome) query.set('outcome', params.outcome);

    return apiFetch(`/api/admin/audit?${query.toString()}`);
  },

  async verifyAuditChain(): Promise<ChainVerificationResult> {
    return apiFetch<ChainVerificationResult>('/api/admin/audit/verify', {
      method: 'POST',
    });
  },
};
