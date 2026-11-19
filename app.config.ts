import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Wick',
  slug: 'wick',
  version: '1.0.0',
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: 'https://u.expo.dev/7f1e5fe6-db25-4767-9c2e-571f4d132511',
  },
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
    bundleIdentifier: 'com.senthilmkm.wick',
    appleTeamId: '2KJK6895B3',
    supportsTablet: false,
    associatedDomains: ['applinks:senthilmkm.github.io'],
    config: {
      usesNonExemptEncryption: false,
    },
    entitlements: {
      'com.apple.developer.healthkit': true,
      'com.apple.developer.healthkit.background-delivery': true,
      'com.apple.security.application-groups': ['group.com.senthilmkm.wick'],
      'com.apple.developer.icloud-container-identifiers': ['iCloud.com.senthilmkm.wick'],
      'com.apple.developer.icloud-services': ['CloudKit'],
      'aps-environment': 'production',
    },
    infoPlist: {
      CFBundleDisplayName: 'Wick',
      ITSAppUsesNonExemptEncryption: false,
      NSHealthShareUsageDescription:
        'Wick reads your daily step count from Apple Health to light your candle, animate its flame brightness, and track your daily streak.',
      NSMotionUsageDescription:
        'Wick uses step motion to light your candle on your first step and animate the flame in real time.',
      NSMicrophoneUsageDescription:
        'Wick uses the microphone to detect when you blow out your candle at bedtime and animate the flame in a breeze.',
      CKSharingSupported: true,
      UIBackgroundModes: ['remote-notification'],
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
    '@bacons/apple-targets',
    'expo-secure-store',
    'expo-sqlite',
    'expo-notifications',
    [
      '@kingstinct/react-native-healthkit',
      {
        NSHealthShareUsageDescription:
          'Wick reads your daily step count from Apple Health to light your candle, animate its flame brightness, and track your daily streak.',
        background: true,
      },
    ],
  ],
  extra: {
    eas: {
      projectId: '7f1e5fe6-db25-4767-9c2e-571f4d132511',
    },
  },
};

export default config;
