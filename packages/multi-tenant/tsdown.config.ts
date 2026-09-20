import { defineConfig } from 'tsdown'

export default defineConfig([
  { entry: { index: 'src/index.ts', cli: 'src/cli/main.ts' }, format: ['esm'], dts: true, sourcemap: true, clean: true, outDir: 'dist' },
  { entry: { 'cell-platform': '../../integration/cell-platform/src/main.ts', 'cell-admin': '../../integration/cell-platform/src/admin-cli.ts' },
    format: ['esm'], dts: false, sourcemap: true, clean: false, outDir: 'dist', deps: { alwaysBundle: [/./], onlyBundle: ['@dsh/cell-connector-internal', 'openid-client', 'oauth4webapi', 'jose'] } },
])
