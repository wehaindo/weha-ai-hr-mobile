'use client';

import { useEffect, useState } from 'react';
import { useBridge } from '@/platform';
import { MinusIcon, SquareIcon, XIcon } from 'lucide-react';

/** Frameless-window controls — rendered only in Electron. */
export default function WindowControls() {
  const bridge = useBridge();
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(bridge.platform === 'electron');
  }, [bridge]);

  if (!isElectron) return null;

  return (
    <div className="flex items-center" data-testid="window-controls">
      <button
        aria-label="Minimize"
        className="flex h-8 w-10 items-center justify-center text-muted-foreground hover:bg-muted"
        onClick={() => void bridge.window.control('minimize')}
      >
        <MinusIcon className="size-3.5" />
      </button>
      <button
        aria-label="Maximize"
        className="flex h-8 w-10 items-center justify-center text-muted-foreground hover:bg-muted"
        onClick={() => void bridge.window.control('maximize')}
      >
        <SquareIcon className="size-3" />
      </button>
      <button
        aria-label="Close"
        className="flex h-8 w-10 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
        onClick={() => void bridge.window.control('close')}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
