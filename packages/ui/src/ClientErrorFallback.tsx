import { useEffect } from 'react';
import { Button } from './Button';
import { DesignText } from './Home';
import { Screen } from './Screen';
// Expo Router owns the catch/retry boundary. A caught render error is non-fatal.
export function ClientErrorFallback({
  error,
  retry,
  report,
}: {
  error: Error;
  retry: () => void;
  report: (error: Error) => void;
}) {
  useEffect(() => report(error), [error, report]);
  return (
    <Screen design entry>
      <DesignText
        accessibilityRole="header"
        style={{ fontSize: 24, fontWeight: '700' }}
      >
        Something went wrong
      </DesignText>
      <DesignText style={{ fontSize: 16 }}>
        Please try again. If this continues, restart the app.
      </DesignText>
      <Button onPress={retry} label="Try again" />
    </Screen>
  );
}
