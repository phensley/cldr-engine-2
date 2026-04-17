import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['internal/**/__tests__/**/*.test.ts', 'packages/**/__tests__/**/*.test.ts'],
  },
});
