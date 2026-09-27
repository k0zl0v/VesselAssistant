import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'e2e/tauri-bridge/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/calc/**/*.ts'],
      exclude: ['src/calc/**/__tests__/**'],
    },
  },
});
