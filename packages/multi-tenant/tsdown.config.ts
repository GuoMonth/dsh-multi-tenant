import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/mcp.ts',
    'src/web.ts',
    'src/starter-plugin.ts',
    'src/sqlite.ts',
    'src/testing.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  deps: {
    neverBundle: [
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-mcp-client',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-tools',
    ],
  },
})
