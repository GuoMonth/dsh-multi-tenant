import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/main.ts',
    platform: 'src/platform/main.ts',
    admin: 'src/platform/admin-cli.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  deps: {
    alwaysBundle: [/^@dsh\//, 'openid-client', 'oauth4webapi', 'jose', /^zod(?:\/|$)/],
    // Validation stays internal: the installed-package type smoke rejects leaked schema dependencies.
    dts: { alwaysBundle: [/^@dsh\//, 'openid-client', 'oauth4webapi', 'jose'], neverBundle: [/^zod(?:\/|$)/] },
  },
})
