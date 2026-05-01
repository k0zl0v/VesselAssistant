import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/calc/**/*.ts'],
      exclude: ['src/calc/**/__tests__/**'],
    },
  },
});
