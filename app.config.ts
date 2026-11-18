import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Wick',
  slug: 'wick',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: {
    image: './assets/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0A0A0C',
  },
  scheme: 'wick',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: 'com.wick.app',
    buildNumber: '1',
    supportsTablet: false,
    associatedDomains: ['applinks:wick.app'],
    config: {
      usesNonExemptEncryption: false,
    },
    entitlements: {
      'com.apple.developer.healthkit': true,
      'com.apple.developer.healthkit.background-delivery': true,
      'com.apple.security.application-groups': ['group.com.wick.app'],
      'com.apple.developer.icloud-container-identifiers': ['iCloud.com.wick.app'],
      'com.apple.developer.icloud-services': ['CloudKit'],
      'aps-environment': 'production',
    },
    infoPlist: {
      NSHealthShareUsageDescription:
        "Wick reads your daily step count and sleep schedule to animate your candle's brightness and freeze decay while you sleep. Your health data never leaves your device.",
      NSMotionUsageDescription:
        'Wick uses step motion to light your candle on your first step and animate the flame in real time.',
      NSMicrophoneUsageDescription:
        'Wick listens for a gentle blow into the microphone when you choose to blow out your candle at bedtime.',
      UIBackgroundModes: ['fetch', 'remote-notification', 'processing'],
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
        },
      ],
    },
  },
  plugins: [
    'expo-secure-store',
    'expo-sqlite',
    'expo-notifications',
    [
      '@kingstinct/react-native-healthkit',
      {
        NSHealthShareUsageDescription:
          "Wick reads your daily step count and sleep schedule to animate your candle's brightness and freeze decay while you sleep. Your health data never leaves your device.",
        background: true,
      },
    ],
  ],
};

export default config;
