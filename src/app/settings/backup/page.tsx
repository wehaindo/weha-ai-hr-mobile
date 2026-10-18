'use client';

// Backup settings — matches ai-pos's Backup & Data layout: a green Backup card
// + orange Restore card (2-col) and a full-width red Clear-All card. On Electron
// the actions use the native .db file dialogs (bridge.backup); on web they fall
// back to JSON download/upload (exportJson/importJson).

import { useRef, useState } from 'react';
import { useBridge } from '@/platform';
import { toast } from '@/components/ui/toast';
import { exportJson, importJson, clearAll, downloadSnapshot } from '@/lib/backup/service';
import { Database, AlertCircle, Trash2 } from 'lucide-react';

export default function BackupSettingsPage() {
  const bridge = useBridge();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isElectron = bridge.platform === 'electron';

  async function handleBackup(): Promise<void> {
    setIsBackingUp(true);
    try {
      if (isElectron) {
        const result = await bridge.backup.saveToFile();
        if (result) {
          toast.add({ title: 'Backup Created', description: `Database backed up successfully to: ${result.path}`, type: 'success' });
        }
      } else {
        const json = await exportJson(bridge);
        downloadSnapshot(json);
        toast.add({ title: 'Backup Created', description: 'Snapshot downloaded.', type: 'success' });
      }
    } catch (error) {
      toast.add({ title: 'Backup Failed', description: error instanceof Error ? error.message : 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleRestore(): Promise<void> {
    if (!isElectron) {
      // Web: restore from an uploaded JSON snapshot.
      fileInputRef.current?.click();
      return;
    }
    const confirmed = window.confirm('Are you sure you want to restore from a backup?\n\nWarning: This will overwrite all current data.');
    if (!confirmed) return;

    setIsRestoring(true);
    try {
      const result = await bridge.backup.openFile();
      if (result) {
        toast.add({ title: 'Database Restored', description: 'Database restored successfully. Please restart the application.', type: 'success' });
      }
    } catch (error) {
      toast.add({ title: 'Restore Failed', description: error instanceof Error ? error.message : 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleImportFile(file: File): Promise<void> {
    setIsRestoring(true);
    try {
      const text = await file.text();
      await importJson(bridge, text);
      toast.add({ title: 'Database Restored', description: 'Data restored successfully.', type: 'success' });
    } catch (error) {
      toast.add({ title: 'Restore Failed', description: error instanceof Error ? error.message : 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleClearAll(): Promise<void> {
    const confirmed = window.confirm('Are you sure you want to clear all data?\n\nWarning: This cannot be undone without a backup.');
    if (!confirmed) return;

    setIsResetting(true);
    try {
      const cleared = await clearAll(bridge);
      toast.add({ title: 'Data Cleared', description: `Cleared ${cleared.length} tables. The default users were kept.`, type: 'success' });
    } catch (error) {
      toast.add({ title: 'Clear Failed', description: error instanceof Error ? error.message : 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="backup-settings">
      <div>
        <h3 className="text-lg font-semibold">Backup &amp; Data Settings</h3>
        <p className="text-sm text-muted-foreground">Manage your database backups and data.</p>
      </div>

      {/* Web restore: hidden file input for a JSON snapshot. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleImportFile(file);
        }}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Backup Card */}
        <div className="rounded-lg border p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-green-100 p-3">
              <Database className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium">Backup Database</h4>
              <p className="text-sm mt-1 text-muted-foreground">
                Create a full backup of your database. The backup file will be saved in a location you choose.
              </p>
              <button
                onClick={() => void handleBackup()}
                disabled={isBackingUp}
                className="mt-4 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="backup-create"
              >
                {isBackingUp ? 'Creating Backup...' : 'Create Backup'}
              </button>
            </div>
          </div>
        </div>

        {/* Restore Card */}
        <div className="rounded-lg border p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-orange-100 p-3">
              <Database className="h-6 w-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium">Restore Database</h4>
              <p className="text-sm mt-1 text-muted-foreground">
                Restore from a previous backup.{' '}
                <span className="font-semibold text-orange-600">Warning: This will overwrite all current data.</span>
              </p>
              <button
                onClick={() => void handleRestore()}
                disabled={isRestoring}
                className="mt-4 rounded-md bg-orange-600 px-4 py-2 text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="backup-restore"
              >
                {isRestoring ? 'Restoring...' : 'Restore from Backup'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Clear All Card (Full Width) */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-red-100 p-3">
            <Trash2 className="h-6 w-6 text-red-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-red-800">Clear All Data</h4>
            <p className="mt-1 text-sm text-red-600">
              Clear everything and start fresh. All data and settings will be deleted. The default users stay so you can
              still log in.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-600">This action cannot be undone without a backup.</span>
            </div>
            <button
              onClick={() => void handleClearAll()}
              disabled={isResetting}
              className="mt-4 rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="backup-clear"
            >
              {isResetting ? 'Processing...' : 'Clear All Data (Keeps Users)...'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
