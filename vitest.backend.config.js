import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['backend/tests/**/*.{test,spec}.{js,mjs,cjs}'],
    exclude: ['node_modules', 'dist'],
    server: {
      deps: {
        inline: [/backend/],
      },
    },
  },
});
