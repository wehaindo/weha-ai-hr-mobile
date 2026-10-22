'use client';

import { useCallback, useRef, useEffect } from 'react';
import Keyboard from 'react-simple-keyboard';
import { useKeyboardStore } from '@/stores/keyboard';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

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

const TEXT_LAYOUT = {
  default: [
    'q w e r t y u i o p',
    'a s d f g h j k l',
    '{shift} z x c v b n m {backspace}',
    '{space} {enter}',
  ],
  shift: [
    'Q W E R T Y U I O P',
    'A S D F G H J K L',
    '{shift} Z X C V B N M {backspace}',
    '{space} {enter}',
  ],
};

const NUMPAD_LAYOUT = {
  default: [
    '7 8 9',
    '4 5 6',
    '1 2 3',
    '. 0 {backspace}',
    '{space} {enter}',
  ],
};

const DISPLAY_TEXT: Record<string, string> = {
  '{backspace}': '⌫',
  '{enter}': '⏎',
  '{space}': '␣',
  '{shift}': '⇧',
  '{layout}': '123',
};

interface KeyboardInstance {
  setInput(input: string): void;
  setOptions(options: { layoutName: string }): void;
  options: { layoutName?: string };
}

export default function TouchKeyboard() {
  const { isOpen, layout, value, onChange, onEnter, close, setLayout } = useKeyboardStore();
  const keyboardRef = useRef<KeyboardInstance | null>(null);

  useEffect(() => {
    if (keyboardRef.current) {
      keyboardRef.current.setInput(value);
    }
  }, [value]);

  const onKeyPress = useCallback((button: string) => {
    playKeyClick();

    if (button === '{enter}') {
      onEnter?.();
      close();
      return;
    }

    if (button === '{shift}') {
      const keyboard = keyboardRef.current;
      if (keyboard) {
        const currentLayout = keyboard.options.layoutName;
        keyboard.setOptions({ layoutName: currentLayout === 'default' ? 'shift' : 'default' });
      }
      return;
    }
  }, [onEnter, close]);

  const onChangeInput = useCallback((input: string) => {
    onChange?.(input);
  }, [onChange]);

  const handleLayoutToggle = useCallback(() => {
    setLayout(layout === 'text' ? 'numpad' : 'text');
  }, [layout, setLayout]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] animate-slide-up">
      <div className="bg-white border-t border-gray-200 shadow-2xl">
        {/* Display Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <span className="text-2xl font-mono text-gray-900 truncate block">
              {value || <span className="text-gray-300">_</span>}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={close}
            className="ml-2 text-gray-400 hover:text-gray-600 shrink-0"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Keyboard */}
        <div className="p-2">
          <Keyboard
            keyboardRef={(instance: KeyboardInstance) => {
              keyboardRef.current = instance;
            }}
            layout={layout === 'text' ? TEXT_LAYOUT : NUMPAD_LAYOUT}
            display={DISPLAY_TEXT}
            onKeyPress={onKeyPress}
            onChange={onChangeInput}
            theme="hg-theme-default touch-keyboard-theme"
            buttonTheme={[
              {
                buttons: '{enter}',
                class: 'touch-keyboard-enter',
              },
              {
                buttons: '{space}',
                class: 'touch-keyboard-space',
              },
              {
                buttons: '{backspace}',
                class: 'touch-keyboard-backspace',
              },
              {
                buttons: '{shift}',
                class: 'touch-keyboard-shift',
              },
            ]}
          />
        </div>

        {/* Layout Toggle */}
        <div className="flex justify-center pb-2">
          <button
            onClick={handleLayoutToggle}
            className="px-4 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
          >
            {layout === 'text' ? '123 🔢' : 'ABC 🔤'}
          </button>
        </div>
      </div>
    </div>
  );
}
