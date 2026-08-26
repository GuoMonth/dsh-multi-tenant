import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/runtime.ts',
    'src/operation.ts',
    'src/composition.ts',
    'src/runtime-composition.ts',
    'src/ingress.ts',
    'src/credentials.ts',
    'src/mcp.ts',
    'src/product.ts',
    'src/web.ts',
    'src/diagnostics.ts',
    'src/starter-plugin.ts',
    'src/store.ts',
    'src/sqlite-store.ts',
    'src/testing.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  deps: {
    neverBundle: ['@deepseek-ai/cordis'],
  },
})
