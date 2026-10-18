// Print pipeline — durable job queue with retry/status tracking on top of the
// print_queue table and the DeviceBridge. Replaces ai-pos's in-memory pipeline
// + window.electronAPI persistence with a bridge-native version.

import type { DeviceBridge } from '@/platform';
import { PrinterAdapter, type PrinterConnectionConfig } from './printer-adapter';
import type { PrintContentItem } from './escpos-buffer';

export interface PrintJobData {
  id: string;
  uuid: string;
  template_id: string | null;
  printer_id: string | null;
  job_type: 'receipt' | 'label' | 'ticket' | 'report';
  rendered_content: string | null;
  raw_template: string | null;
  data_context: string | null;
  status: 'pending' | 'printing' | 'printed' | 'failed' | 'retry';
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  printed_at: string | null;
  created_at: string;
}

export interface PrintPipelineOptions {
  max_retries?: number;
  retry_delay_ms?: number;
  onStatusChange?: (jobId: string, status: string) => void;
}

const DEFAULT_OPTIONS: Required<Omit<PrintPipelineOptions, 'onStatusChange'>> & {
  onStatusChange: (jobId: string, status: string) => void;
} = {
  max_retries: 3,
  retry_delay_ms: 1000,
  onStatusChange: () => {},
};

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class PrintPipeline {
  private options: Required<PrintPipelineOptions>;
  private processing = false;
  private queue: PrintJobData[] = [];

  constructor(private bridge: DeviceBridge, options?: PrintPipelineOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Enqueue a print job for later processing. */
  async enqueue(
    jobData: Omit<PrintJobData, 'id' | 'uuid' | 'status' | 'attempt_count' | 'error_message' | 'printed_at' | 'created_at'>
  ): Promise<string> {
    const uuid = `pj_${randomHex(16)}`;
    const job: PrintJobData = {
      ...jobData,
      id: uuid,
      uuid,
      status: 'pending',
      attempt_count: 0,
      error_message: null,
      printed_at: null,
      created_at: new Date().toISOString(),
    };
    this.queue.push(job);
    void this.processQueue();
    return uuid;
  }

  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const pending = this.queue.filter((j) => j.status === 'pending' || j.status === 'retry');
      for (const job of pending) await this.processJob(job);
    } finally {
      this.processing = false;
    }
  }

  private async processJob(job: PrintJobData): Promise<void> {
    try {
      this.updateJobStatus(job.id, 'printing');

      const connection = await this.resolveConnection(job.printer_id);
      const content = job.rendered_content ? (JSON.parse(job.rendered_content) as PrintContentItem[]) : [];
      const result = await PrinterAdapter.print(this.bridge, content, connection, {
        printer_id: job.printer_id || undefined,
      });

      if (result.success) this.updateJobStatus(job.id, 'printed');
      else this.handleFailure(job, result.error || 'Unknown error');
    } catch (error) {
      this.handleFailure(job, error instanceof Error ? error.message : 'Print error');
    }
  }

  private async resolveConnection(printerId?: string | null): Promise<PrinterConnectionConfig> {
    if (printerId) {
      const rows = await this.bridge.db.query<{ connection_type: string; connection_config: string }>(
        'SELECT connection_type, connection_config FROM hardware_devices WHERE id = ?',
        [printerId]
      );
      if (rows[0]) return PrinterAdapter.resolveConnection(rows[0].connection_type, rows[0].connection_config);
    }
    return { type: 'windows' };
  }

  private handleFailure(job: PrintJobData, errorMessage: string): void {
    const attempts = job.attempt_count + 1;
    job.attempt_count = attempts;
    if (attempts >= job.max_attempts) {
      this.updateJobStatus(job.id, 'failed', errorMessage);
    } else {
      this.updateJobStatus(job.id, 'retry', errorMessage);
      setTimeout(() => void this.processJob(job), this.options.retry_delay_ms * attempts);
    }
  }

  private updateJobStatus(jobId: string, status: PrintJobData['status'], error?: string): void {
    const job = this.queue.find((j) => j.id === jobId);
    if (!job) return;
    job.status = status;
    if (error) job.error_message = error;
    if (status === 'printed') job.printed_at = new Date().toISOString();
    this.options.onStatusChange(jobId, status);
  }

  getQueueStatus(): { total: number; pending: number; printing: number; printed: number; failed: number; retry: number } {
    return {
      total: this.queue.length,
      pending: this.queue.filter((j) => j.status === 'pending').length,
      printing: this.queue.filter((j) => j.status === 'printing').length,
      printed: this.queue.filter((j) => j.status === 'printed').length,
      failed: this.queue.filter((j) => j.status === 'failed').length,
      retry: this.queue.filter((j) => j.status === 'retry').length,
    };
  }

  async retryJob(jobId: string): Promise<boolean> {
    const job = this.queue.find((j) => j.id === jobId);
    if (job && (job.status === 'failed' || job.status === 'retry')) {
      job.status = 'pending';
      job.attempt_count = 0;
      job.error_message = null;
      await this.processJob(job);
      return true;
    }
    return false;
  }

  cancelJob(jobId: string): boolean {
    const job = this.queue.find((j) => j.id === jobId);
    if (job && (job.status === 'pending' || job.status === 'retry')) {
      this.queue = this.queue.filter((j) => j.id !== jobId);
      return true;
    }
    return false;
  }

  clearCompleted(): void {
    this.queue = this.queue.filter((j) => j.status !== 'printed');
  }
}
