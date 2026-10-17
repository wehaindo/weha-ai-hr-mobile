import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.next', 'out'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/lib/**/*.ts', 'src/db/**/*.ts', 'src/auth/**/*.ts', 'src/sync/**/*.ts', 'src/platform/**/*.ts', 'src/stores/**/*.ts'],
      exclude: ['src/types/**', 'src/**/*.d.ts'],
    },
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
