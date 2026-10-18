// Data Hub REST client — pull, ack, push, and register events against a hub
// endpoint. Ported from ai-pos src/lib/datahub/client.ts; runs anywhere with
// `fetch` (renderer or main). The hub URL + device token live in datahub_configs.

export interface DatahubConfig {
  enabled: boolean;
  endpoint: string;
  enrollment_key?: string;
  device_id?: string;
  device_token?: string;
}

export interface SyncEvent {
  event_id: string;
  seq: number;
  entity_type: string;
  entity_id: string | null;
  action: string;
  version: number;
  payload: unknown;
  created_at: string;
}

export interface PullResult {
  events: SyncEvent[];
  cursor: number;
  hasMore: boolean;
}

export interface SyncStatus {
  cursors: { entity_type: string; last_cursor: number }[];
  pending: number;
  acked: number;
  server_cursor: number;
}

export interface RegisterResult {
  device: {
    id: string;
    pos_id: string;
    name: string;
    status: string;
    permission_profile: string;
    device_type: string;
    branch_id: string | null;
    organization_id: string | null;
    publishable_entities: string[] | null;
  };
  token?: string;
  requires_approval: boolean;
  message: string;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class DatahubClient {
  private endpoint: string;
  private deviceToken: string;
  private fetchImpl: FetchLike;

  constructor(endpoint: string, deviceToken?: string, fetchImpl?: FetchLike) {
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.deviceToken = deviceToken ?? '';
    this.fetchImpl = fetchImpl ?? (fetch as FetchLike);
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.deviceToken}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.endpoint}${path}`, init);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body?.error?.message ?? `Hub request failed (${res.status})`);
    }
    return res.json() as Promise<T>;
  }

  async pull(cursor: number, entity?: string, limit = 100): Promise<PullResult> {
    const params = new URLSearchParams({ cursor: String(cursor), limit: String(limit) });
    if (entity) params.set('entity', entity);
    return this.request<PullResult>(`/api/v1/sync/pull?${params}`, { headers: this.headers() });
  }

  async ack(eventIds: string[]): Promise<{ acked: number; cursors: Record<string, number> }> {
    if (eventIds.length === 0) return { acked: 0, cursors: {} };
    return this.request('/api/v1/sync/ack', {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ event_ids: eventIds }),
    });
  }

  async status(): Promise<SyncStatus> {
    return this.request<SyncStatus>('/api/v1/sync/status', { headers: this.headers() });
  }

  async push(
    events: Array<{ entity_type: string; entity_id: string; action: string; version?: number; payload?: unknown }>
  ): Promise<{ ok: boolean; results: Array<{ status: string }> }> {
    return this.request('/api/v1/sync/push', {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ events }),
    });
  }

  async resync(entityType: string): Promise<{ id: string; entity_type: string; version: number; count: number }> {
    return this.request('/api/v1/sync/resync', {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ entity_type: entityType }),
    });
  }

  async register(data: {
    pos_id: string;
    name: string;
    device_type?: string;
    enrollment_key?: string;
    ip?: string;
    version?: string;
    os?: string;
    browser?: string;
    organization_id?: string;
    branch_id?: string;
  }): Promise<RegisterResult> {
    return this.request<RegisterResult>('/api/v1/devices/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }
}
