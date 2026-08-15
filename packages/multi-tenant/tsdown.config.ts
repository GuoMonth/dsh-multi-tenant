import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/store.ts', 'src/testing.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  deps: {
    neverBundle: ['@deepseek-ai/cordis'],
  },
})
