'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircleIcon } from 'lucide-react';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/auth/crypto';

interface PinInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<void> | void;
  userName: string;
  error?: string;
}

function playKeyClick() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
  } catch {}
}

export default function PinInput({ isOpen, onClose, onSubmit, userName, error }: PinInputProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
    }
  }, [isOpen]);

  async function handleSubmit() {
    if (pin.length < PIN_MIN_LENGTH) return;
    setLoading(true);
    try {
      await onSubmit(pin);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key >= '0' && e.key <= '9' && pin.length < PIN_MAX_LENGTH) {
        playKeyClick();
        setPin((prev) => prev + e.key);
        return;
      }
      if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key === 'Enter' && pin.length >= PIN_MIN_LENGTH) {
        void handleSubmit();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pin.length]);

  function handleNumpadClick(num: string) {
    playKeyClick();
    if (pin.length < PIN_MAX_LENGTH) {
      setPin((prev) => prev + num);
    }
  }

  function handleDelete() {
    playKeyClick();
    setPin((prev) => prev.slice(0, -1));
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="pin-dialog">
        <DialogHeader>
          <DialogTitle className="text-center">Welcome back, {userName}</DialogTitle>
          <DialogDescription className="text-center">
            Enter your PIN ({PIN_MIN_LENGTH}–{PIN_MAX_LENGTH} digits)
          </DialogDescription>
        </DialogHeader>

        {/* PIN Display */}
        <div className="flex justify-center gap-2 py-4" data-testid="pin-display">
          {Array.from({ length: PIN_MAX_LENGTH }).map((_, i) => (
            <div
              key={i}
              data-testid={`pin-digit-${i}`}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-all ${
                i < pin.length ? 'scale-105 border-primary bg-primary' : 'border-border bg-muted'
              }`}
            >
              {i < pin.length && <div className="h-3 w-3 rounded-full bg-primary-foreground" />}
            </div>
          ))}
        </div>

        {error && (
          <Alert variant="destructive" data-testid="pin-error">
            <AlertCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2" data-testid="pin-numpad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              data-testid={`pin-numpad-${num}`}
              onClick={() => handleNumpadClick(num)}
              className="h-14 rounded-xl bg-muted font-bold text-xl transition-colors active:scale-95 hover:bg-muted/80"
            >
              {num}
            </button>
          ))}
          <button
            data-testid="pin-delete"
            onClick={handleDelete}
            className="h-14 rounded-xl bg-muted font-bold text-xl transition-colors active:scale-95 hover:bg-muted/80"
          >
            ⌫
          </button>
          <button
            data-testid="pin-numpad-0"
            onClick={() => handleNumpadClick('0')}
            className="h-14 rounded-xl bg-muted font-bold text-xl transition-colors active:scale-95 hover:bg-muted/80"
          >
            0
          </button>
          <button
            data-testid="pin-submit"
            onClick={() => void handleSubmit()}
            disabled={pin.length < PIN_MIN_LENGTH || loading}
            className="h-14 rounded-xl bg-primary font-bold text-xl text-primary-foreground transition-colors active:scale-95 disabled:opacity-50"
          >
            {loading ? '...' : '✓'}
          </button>
        </div>

        <Button variant="ghost" onClick={onClose} className="w-full" data-testid="pin-back">
          Back to Users
        </Button>
      </DialogContent>
    </Dialog>
  );
}
