# notifications

Owns contextual notification permission requests and authenticated Expo push registration for both mobile apps.

The package generates a random installation ID with `expo-crypto`, persists it in SecureStore, and writes only the signed-in user's shape-restricted Firestore device record. It removes that account's record before local sign-out. Registration removal does not revoke a Firebase Auth session or resolve individual Child-device access revocation.
