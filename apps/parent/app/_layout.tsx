import '../global.css';
import { Stack } from 'expo-router';
import { configureFirebase } from '../src/firebase';

export default function RootLayout() {
  configureFirebase();
  return <Stack screenOptions={{ headerShown: false }} />;
}
