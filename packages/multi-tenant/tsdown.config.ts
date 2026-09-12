import { defineConfig } from 'tsdown'

export default defineConfig({ entry: { index: 'src/index.ts', cli: 'src/cli/main.ts' }, format: ['esm'], dts: true, sourcemap: true, clean: true, outDir: 'dist' })
