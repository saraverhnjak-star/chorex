import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { pairingSessionTokenSchema } from '@chorex/domain';
import {
  Button,
  DesignText,
  FormMessage,
  homeTokens,
  t,
  useAppLanguage,
} from '@chorex/ui';
import { getPairingErrorMessage } from './messages';
import { PairingCodeInput } from './PairingCodeInput';

export function PairingEntry({
  pair,
}: {
  pair: (credential: string, key: string) => Promise<unknown>;
}) {
  useAppLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'choice' | 'scan' | 'manual'>('choice');
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const code = digits.join('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const retry = useRef<{ credential: string; key: string } | undefined>(
    undefined,
  );
  const submit = async (credential: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    if (retry.current?.credential !== credential)
      retry.current = {
        credential,
        key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
      };
    try {
      await pair(credential, retry.current.key);
    } catch (failure) {
      setError(getPairingErrorMessage(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const scan = async () => {
    setError(undefined);
    try {
      const result = permission?.granted
        ? permission
        : await requestPermission();
      if (result.granted) setMode('scan');
      else {
        setMode('manual');
        setError(
          t('Camera access is unavailable. Enter the six-digit code instead.'),
        );
      }
    } catch {
      setMode('manual');
      setError(
        t('Camera access is unavailable. Enter the six-digit code instead.'),
      );
    }
  };
  return (
    <View style={{ gap: homeTokens.spacing.card }}>
      <FormMessage message={error} />
      {mode === 'scan' && permission?.granted ? (
        <CameraView
          accessibilityLabel={t('Scan pairing QR code')}
          style={{ height: 260, borderRadius: homeTokens.radius.card }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onMountError={() => {
            setMode('manual');
            setError(
              t(
                'Camera access is unavailable. Enter the six-digit code instead.',
              ),
            );
          }}
          onBarcodeScanned={
            busy
              ? undefined
              : ({ data }) => {
                  if (!pairingSessionTokenSchema.safeParse(data).success) {
                    setError(t('This is not a ChoreX pairing QR code.'));
                    return;
                  }
                  void submit(data);
                }
          }
        />
      ) : null}
      {mode !== 'scan' ? (
        <Button
          label={t('Scan QR code')}
          variant="blue"
          lightText
          disabled={busy}
          onPress={() => void scan()}
        />
      ) : null}
      {mode === 'manual' ? (
        <>
          <PairingCodeInput
            digits={digits}
            disabled={busy}
            onChange={(next) => {
              setDigits(next);
              retry.current = undefined;
              setError(undefined);
            }}
          />
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {t('Enter the six-digit code shown in the Parent app.')}
          </DesignText>
          <Button
            label={t('Connect')}
            variant="blue"
            lightText
            loading={busy}
            disabled={code.length !== 6}
            onPress={() => void submit(code)}
          />
        </>
      ) : (
        <Button
          label={t('Enter code manually')}
          variant="outline"
          disabled={busy}
          onPress={() => setMode('manual')}
        />
      )}
      {permission && !permission.granted && !permission.canAskAgain ? (
        <Button
          label={t('Open Settings')}
          variant="outline"
          onPress={() => {
            void Linking.openSettings().catch(() => undefined);
          }}
        />
      ) : null}
      {mode === 'scan' ? (
        <Button
          label={t('Cancel')}
          variant="outline"
          disabled={busy}
          onPress={() => setMode('choice')}
        />
      ) : null}
    </View>
  );
}
