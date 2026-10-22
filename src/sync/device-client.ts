// DeviceClient — HTTP client for the WEHA ERP device API.
// Endpoints: /api/device/{configCode}?tenantId={slug}, activation + heartbeat.

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface ListResponse<T = unknown> {
  success: boolean;
  data: {
    items: T[];
    total: number;
    limit: number;
    offset: number;
  };
}

export interface ActivationResult {
  deviceToken: string;
  tenantId: string;
  device: { deviceCode?: string; [key: string]: unknown };
  scopes: string[];
}

export class DeviceClient {
  private baseUrl: string;
  private tenantSlug: string;
  private deviceToken: string | null = null;

  constructor(baseUrl: string, tenantSlug: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.tenantSlug = tenantSlug;
  }

  setToken(token: string | null): void {
    this.deviceToken = token;
  }

  setTenant(tenantSlug: string): void {
    this.tenantSlug = tenantSlug;
  }

  async activate(activationToken: string): Promise<ActivationResult> {
    const res = await fetch(`${this.baseUrl}/api/device/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: activationToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? data.error ?? 'Activation failed');
    this.deviceToken = data.credentials.deviceToken;
    return {
      deviceToken: data.credentials.deviceToken,
      tenantId: data.credentials.tenantId,
      device: data.device,
      scopes: data.credentials.scopes ?? [],
    };
  }

  async register(deviceCode: string): Promise<ApiResponse> {
    return this.request('POST', '/api/device/v1/register-feature', { deviceCode });
  }

  async get<T = unknown>(configCode: string, params?: Record<string, unknown>): Promise<ListResponse<T>> {
    const query = new URLSearchParams({ tenantId: this.tenantSlug });
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) query.set(key, String(value));
      }
    }
    return this.request('GET', `/api/device/${configCode}?${query}`);
  }

  async read<T = unknown>(configCode: string, id: string): Promise<ApiResponse<T>> {
    return this.request('GET', `/api/device/${configCode}/${id}?tenantId=${this.tenantSlug}`);
  }

  async post<T = unknown>(configCode: string, data: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this.request('POST', `/api/device/${configCode}?tenantId=${this.tenantSlug}`, data);
  }

  async put<T = unknown>(configCode: string, id: string, data: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this.request('PUT', `/api/device/${configCode}/${id}?tenantId=${this.tenantSlug}`, data);
  }

  async patch<T = unknown>(configCode: string, id: string, data: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this.request('PATCH', `/api/device/${configCode}/${id}?tenantId=${this.tenantSlug}`, data);
  }

  async delete(configCode: string, id: string): Promise<ApiResponse> {
    return this.request('DELETE', `/api/device/${configCode}/${id}?tenantId=${this.tenantSlug}`);
  }

  async heartbeat(deviceCode: string): Promise<void> {
    try {
      await this.request('POST', '/api/device/v1/ai-box/heartbeat', { deviceCode });
    } catch {
      /* non-critical */
    }
  }

  async testConnection(): Promise<{ success: boolean; durationMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      await this.get('PRODUCT', { limit: 1 });
      return { success: true, durationMs: Date.now() - startTime };
    } catch (error) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.deviceToken) headers['Authorization'] = `Bearer ${this.deviceToken}`;

    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const httpMethod = body ? method : method === 'POST' ? 'POST' : method;

    const res = await fetch(url, {
      method: httpMethod,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: Record<string, unknown> & { error?: { message?: string } | string };
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text } as Record<string, unknown>;
    }

    if (!res.ok) {
      const err = data?.error;
      const msg =
        (typeof err === 'object' && err?.message) ||
        (typeof err === 'string' ? err : undefined) ||
        `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data as T;
  }
}
