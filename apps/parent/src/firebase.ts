import { Platform } from 'react-native';
import { initializeFirebase } from '@chorex/firebase-client';

export function configureFirebase() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error(
      'Firebase development setup requires a native iOS or Android client.',
    );
  }
  return initializeFirebase(
    {
      mode: process.env.EXPO_PUBLIC_FIREBASE_MODE,
      host: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
      authPort: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
      firestorePort: process.env.EXPO_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT,
      functionsPort: process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    },
    __DEV__,
  );
}
