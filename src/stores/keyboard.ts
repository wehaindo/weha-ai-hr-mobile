'use client';

import { create } from 'zustand';

interface KeyboardState {
  isOpen: boolean;
  layout: 'text' | 'numpad';
  value: string;
  targetId: string;
  onChange: ((value: string) => void) | null;
  onEnter: (() => void) | null;
  lastLayout: 'text' | 'numpad';
  open: (config: {
    layout: 'text' | 'numpad';
    value: string;
    targetId: string;
    onChange: (value: string) => void;
    onEnter?: () => void;
  }) => void;
  close: () => void;
  setValue: (value: string) => void;
  setLayout: (layout: 'text' | 'numpad') => void;
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  isOpen: false,
  layout: 'text',
  value: '',
  targetId: '',
  onChange: null,
  onEnter: null,
  lastLayout: (typeof window !== 'undefined' && localStorage.getItem('keyboard-last-layout') as 'text' | 'numpad') || 'text',

  open: (config) => {
    const savedLayout = (typeof window !== 'undefined' && localStorage.getItem('keyboard-last-layout') as 'text' | 'numpad') || config.layout;
    set({
      isOpen: true,
      layout: savedLayout,
      value: config.value,
      targetId: config.targetId,
      onChange: config.onChange,
      onEnter: config.onEnter || null,
    });
  },

  close: () => {
    set({
      isOpen: false,
      value: '',
      targetId: '',
      onChange: null,
      onEnter: null,
    });
  },

  setValue: (value) => set({ value }),

  setLayout: (layout) => {
    set({ layout });
    if (typeof window !== 'undefined') {
      localStorage.setItem('keyboard-last-layout', layout);
    }
  },
}));
