import { defineConfig } from 'tsdown'
export default defineConfig([{
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/main.ts',
    platform: 'src/platform/main.ts',
    admin: 'src/platform/admin-cli.ts',
    'kubernetes-reference': '../../charts/kubernetes-reference.ts',
  },
  format: ['esm'],
  target: 'node24.22.3',
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  deps: {
    alwaysBundle: ['openid-client', 'oauth4webapi', 'jose', /^zod(?:\/|$)/],
    // Validation stays internal: the installed-package type smoke rejects leaked schema dependencies.
    dts: { alwaysBundle: ['openid-client', 'oauth4webapi', 'jose'], neverBundle: [/^zod(?:\/|$)/] },
  },
}, {
  entry: { install: '../../charts/install.ts' },
  format: ['esm'],
  target: 'node24.22.3',
  outDir: 'charts',
  dts: false,
  clean: false,
  deps: { alwaysBundle: [/^zod(?:\/|$)/] },
}])
