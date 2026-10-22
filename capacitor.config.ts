import type { CapacitorConfig } from '@capacitor/cli';
import deviceConfig from './device.config';

const config: CapacitorConfig = {
  appId: deviceConfig.appId,
  appName: deviceConfig.appName,
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
