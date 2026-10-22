// API Client - HTTP client with authentication for external system integration

interface ApiClientConfig {
  baseUrl: string;
  authType: 'api_key' | 'bearer' | 'basic' | 'oauth2' | 'none';
  authConfig?: Record<string, string>;
  timeout?: number;
}

interface ApiResponse {
  success: boolean;
  data?: unknown;
  status?: number;
  error?: string;
  duration_ms?: number;
}

export class ApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = {
      ...config,
      timeout: config.timeout || 30000,
    };
  }

  // Build authentication headers
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.config.authType === 'api_key' && this.config.authConfig?.api_key) {
      headers['X-API-Key'] = this.config.authConfig.api_key;
    } else if (this.config.authType === 'bearer' && this.config.authConfig?.token) {
      headers['Authorization'] = `Bearer ${this.config.authConfig.token}`;
    } else if (this.config.authType === 'basic' && this.config.authConfig?.username) {
      const encoded = btoa(`${this.config.authConfig.username}:${this.config.authConfig.password || ''}`);
      headers['Authorization'] = `Basic ${encoded}`;
    }

    return headers;
  }

  // Make HTTP request
  private async request(method: string, path: string, body?: unknown): Promise<ApiResponse> {
    const url = `${this.config.baseUrl}${path}`;
    const startTime = Date.now();

    try {
      const options: RequestInit = {
        method,
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.config.timeout!),
      };

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const duration_ms = Date.now() - startTime;

      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        success: response.ok,
        data,
        status: response.status,
        duration_ms,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error: unknown) {
      const duration_ms = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Network error';
      return {
        success: false,
        status: 0,
        duration_ms,
        error: error instanceof Error && error.name === 'TimeoutError' ? 'Request timeout' : message || 'Network error',
      };
    }
  }

  // Public methods
  async get(path: string): Promise<ApiResponse> {
    return this.request('GET', path);
  }

  async post(path: string, data?: unknown): Promise<ApiResponse> {
    return this.request('POST', path, data);
  }

  async put(path: string, data?: unknown): Promise<ApiResponse> {
    return this.request('PUT', path, data);
  }

  async patch(path: string, data?: unknown): Promise<ApiResponse> {
    return this.request('PATCH', path, data);
  }

  async delete(path: string): Promise<ApiResponse> {
    return this.request('DELETE', path);
  }

  // Test connection
  async testConnection(): Promise<ApiResponse> {
    return this.get('/');
  }
}

// Factory function
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
