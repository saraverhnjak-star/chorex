import { Stack } from 'expo-router';
import { AppNavigation } from '../../src/navigation/AppNavigation';
export default function AuthenticatedLayout() {
  return (
    <AppNavigation>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          freezeOnBlur: true,
        }}
      />
    </AppNavigation>
  );
}
