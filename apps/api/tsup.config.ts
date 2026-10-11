import { defineConfig } from 'tsup';

// Bundles the API and everything it imports (including @lmu/shared) into one file, so the
// production image needs no node_modules at all.
export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate-cli.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  external: ['pino-pretty'],
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? 'dev') },
  // Some bundled CommonJS dependencies call require() for Node built-ins.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
