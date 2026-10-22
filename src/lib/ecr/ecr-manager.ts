// ECR service — orchestrates payment-terminal flow over the DeviceBridge.
// Resolves the terminal from hardware_devices (type='payment_terminal'), builds
// a bank packet, exchanges it via bridge.hardware.exchange (send + wait for the
// ETX-delimited response), parses the reply, and logs to ecr_logs. Ported from
// ai-pos electron/ecr/ecr-manager.js, minus the missing sendRefund gap.

import type { DeviceBridge } from '@/platform';
import { getBankAdapter, type BankResponse } from './banks';
import { parsePacket, buildStatusPacket, buildSettlementPacket } from './protocol';

const DEFAULT_TIMEOUT_MS = 60_000;

export interface EcrTerminal {
  id: string;
  name: string;
  connection_type: string;
  bank: string;
  port_path?: string;
  baud_rate?: number;
  ip?: string;
  port?: number;
  paper_width?: number;
}

export interface EcrResult {
  success: boolean;
  approved?: boolean;
  responseCode?: string;
  message?: string;
  authCode?: string;
  cardType?: string;
  rrn?: string;
  bank?: string;
  terminal_name?: string;
  error?: string;
}

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function now(): string {
  return new Date().toISOString();
}

export class EcrService {
  constructor(private bridge: DeviceBridge) {}

  /** Resolve a terminal: by id → default → any active payment_terminal. */
  async resolveTerminal(terminalId?: string): Promise<EcrTerminal | null> {
    const byId = terminalId
      ? await this.bridge.db.query<Record<string, never>>(
          "SELECT * FROM hardware_devices WHERE id = ? AND type = 'payment_terminal' AND is_active = 1",
          [terminalId]
        )
      : [];
    const byDefault = byId.length
      ? byId
      : await this.bridge.db.query<Record<string, never>>(
          "SELECT * FROM hardware_devices WHERE type = 'payment_terminal' AND is_default = 1 AND is_active = 1 LIMIT 1"
        );
    const rows = byDefault.length
      ? byDefault
      : await this.bridge.db.query<Record<string, never>>(
          "SELECT * FROM hardware_devices WHERE type = 'payment_terminal' AND is_active = 1 LIMIT 1"
        );

    const row = rows[0] as unknown as {
      id: string;
      name: string;
      connection_type: string;
      connection_config: string;
    } | undefined;
    if (!row) return null;

    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(row.connection_config || '{}');
    } catch {
      config = {};
    }

    return {
      id: row.id,
      name: row.name,
      connection_type: row.connection_type,
      bank: (config.bank as string) || 'generic',
      port_path: (config.port_path as string) || undefined,
      baud_rate: (config.baud_rate as number) || undefined,
      ip: (config.ip as string) || undefined,
      port: (config.port as number) || undefined,
      paper_width: (config.paper_width as number) || undefined,
    };
  }

  private targetFor(terminal: EcrTerminal): { port_path: string; baud_rate?: number } | { ip: string; port: number } {
    if (terminal.connection_type === 'serial' || terminal.connection_type === 'bluetooth') {
      return { port_path: terminal.port_path ?? '', baud_rate: terminal.baud_rate ?? 9600 };
    }
    return { ip: terminal.ip ?? '', port: terminal.port ?? 53535 };
  }

  private async log(
    terminalId: string | null,
    command: string,
    status: 'info' | 'approved' | 'declined' | 'error',
    details?: string,
    request?: string,
    response?: string
  ): Promise<void> {
    await this.bridge.db.execute(
      `INSERT INTO ecr_logs (id, terminal_id, command, request_data, response_data, status, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomHex(16), terminalId, command, request ?? null, response ?? null, status, details ?? null, now()]
    );
  }

  /** Generic request/response round-trip against a resolved terminal. */
  private async run(
    command: string,
    terminalId: string | undefined,
    build: (adapter: ReturnType<typeof getBankAdapter>) => Uint8Array,
    parse: boolean
  ): Promise<EcrResult> {
    const terminal = await this.resolveTerminal(terminalId);
    if (!terminal) {
      return { success: false, error: 'No ECR terminal configured. Add a payment terminal in Hardware settings.' };
    }

    const adapter = getBankAdapter(terminal.bank);
    const packet = build(adapter);
    await this.log(terminal.id, command, 'info', `${command} → ${terminal.name}`);

    try {
      const responseBytes = await this.bridge.hardware.exchange(this.targetFor(terminal), packet, {
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
      const parsed = parsePacket(responseBytes);
      if (!parsed.valid) {
        await this.log(terminal.id, command, 'error', `Invalid response: ${parsed.error}`, undefined, parsed.error ?? undefined);
        return { success: false, error: `Invalid response: ${parsed.error}` };
      }

      if (!parse) {
        await this.log(terminal.id, command, 'approved', 'OK', undefined, parsed.payload);
        return { success: true, approved: true, bank: terminal.bank, terminal_name: terminal.name };
      }

      const response: BankResponse = adapter.parseResponse(parsed.payload);
      const status = response.approved ? 'approved' : 'declined';
      await this.log(terminal.id, command, status, response.message, undefined, parsed.payload);

      return {
        success: true,
        approved: response.approved,
        responseCode: response.responseCode,
        message: response.message,
        authCode: response.authCode,
        cardType: response.cardTypeName || response.cardType,
        rrn: response.rrn,
        bank: terminal.bank,
        terminal_name: terminal.name,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.log(terminal.id, command, 'error', message);
      return { success: false, error: message };
    }
  }

  async sendSale(params: { terminal_id?: string; amount_cents: number; invoice: string | number }): Promise<EcrResult> {
    return this.run('sale', params.terminal_id, (a) => a.buildSale(params.amount_cents, params.invoice), true);
  }

  async sendVoid(params: { terminal_id?: string; invoice: string | number }): Promise<EcrResult> {
    return this.run('void', params.terminal_id, (a) => a.buildVoid(params.invoice), true);
  }

  async sendRefund(params: { terminal_id?: string; amount_cents: number; invoice: string | number }): Promise<EcrResult> {
    return this.run('refund', params.terminal_id, (a) => a.buildRefund(params.amount_cents, params.invoice), true);
  }

  async sendSettlement(params: { terminal_id?: string }): Promise<EcrResult> {
    return this.run('settlement', params.terminal_id, () => buildSettlementPacket(), true);
  }

  /** Connection test — open + send a status packet (does not require a reply). */
  async getStatus(params: { terminal_id?: string }): Promise<EcrResult> {
    const terminal = await this.resolveTerminal(params.terminal_id);
    if (!terminal) return { success: false, error: 'No ECR terminal configured' };

    try {
      await this.bridge.hardware.exchange(this.targetFor(terminal), buildStatusPacket(), { timeoutMs: 5000 });
      await this.log(terminal.id, 'status', 'info', 'Connection test successful');
      return { success: true, bank: terminal.bank, terminal_name: terminal.name };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.log(terminal.id, 'status', 'error', message);
      return { success: false, error: message };
    }
  }
}

export async function listEcrLogs(bridge: DeviceBridge, terminalId?: string, limit = 50) {
  if (terminalId) {
    return bridge.db.query('SELECT * FROM ecr_logs WHERE terminal_id = ? ORDER BY created_at DESC LIMIT ?', [terminalId, limit]);
  }
  return bridge.db.query('SELECT * FROM ecr_logs ORDER BY created_at DESC LIMIT ?', [limit]);
}
