import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'xyz.shiguangjian.app',
  appName: '拾光笺',
  webDir: 'dist',
  android: {
    backgroundColor: '#07131f',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
  },
}

export default config
