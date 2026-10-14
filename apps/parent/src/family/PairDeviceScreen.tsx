import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { createPairingSession } from '@chorex/firebase-client';
import type { CreatePairingSessionOutput } from '@chorex/domain';
import {
  Button,
  DesignText,
  FormMessage,
  HomeHeader,
  HomeScreenFrame,
  amberAuroraPalette,
  dateLocale,
  homeTokens,
  t,
  useAppLanguage,
} from '@chorex/ui';
import { useParentFamily } from '../navigation/FamilyContext';
import { getFamilyErrorMessage } from './messages';

export function PairDeviceScreen({ childUid }: { childUid: string }) {
  useAppLanguage();
  const family = useParentFamily();
  const router = useRouter();
  const home = family?.state.status === 'ready' ? family.state.home : undefined;
  const child = home?.children.find((item) => item.uid === childUid);
  if (home && !child) return <Redirect href="/family" />;
  if (family?.state.status === 'onboarding') return <Redirect href="/family" />;
  return (
    <HomeScreenFrame
      fill
      header={
        <HomeHeader
          compact
          name={home?.profile.displayName ?? t('Parent')}
          leading={
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('Back')}
              style={{ minHeight: 44, justifyContent: 'center' }}
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace('/family')
              }
            >
              <DesignText
                style={{
                  fontSize: 14,
                  color: amberAuroraPalette.navigationActive,
                }}
              >
                ← {t('Back')}
              </DesignText>
            </Pressable>
          }
        />
      }
    >
      <DesignText
        accessibilityRole="header"
        style={{ fontSize: 28, fontWeight: '700' }}
      >
        {t('Pair device')}
      </DesignText>
      {home && child ? (
        <PairingSession
          key={`${home.profile.uid}:${home.family.id}:${child.uid}`}
          familyId={home.family.id}
          childUid={child.uid}
          name={child.displayName}
        />
      ) : family?.state.status === 'error' ? (
        <FormMessage message={family.state.message} />
      ) : (
        <ActivityIndicator color={amberAuroraPalette.auroraBlue} />
      )}
    </HomeScreenFrame>
  );
}

function PairingSession({
  familyId,
  childUid,
  name,
}: {
  familyId: string;
  childUid: string;
  name: string;
}) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; data: CreatePairingSessionOutput }
    | { status: 'error'; message: string }
  >({ status: 'loading' });
  const initial = useRef<Promise<CreatePairingSessionOutput> | undefined>(
    undefined,
  );
  const mounted = useRef(false);
  const busy = useRef(false);
  const create = () =>
    createPairingSession({
      familyId,
      childUid,
      idempotencyKey: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
    });
  useEffect(() => {
    mounted.current = true;
    let active = true;
    // Reuse the same initial request across Strict Mode effect replays.
    initial.current ??= createPairingSession({
      familyId,
      childUid,
      idempotencyKey: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
    });
    void initial.current
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch((error) => {
        if (active)
          setState({
            status: 'error',
            message: getFamilyErrorMessage(error, 'pairing'),
          });
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [familyId, childUid]);
  const regenerate = async () => {
    if (busy.current || state.status === 'loading') return;
    busy.current = true;
    setState({ status: 'loading' });
    try {
      const data = await create();
      if (mounted.current) setState({ status: 'ready', data });
    } catch (error) {
      if (mounted.current)
        setState({
          status: 'error',
          message: getFamilyErrorMessage(error, 'pairing'),
        });
    } finally {
      busy.current = false;
    }
  };
  return (
    <View style={{ gap: homeTokens.spacing.card }}>
      <DesignText>
        {t(
          'Scan this QR code in the Child app to connect {0}, or enter the six-digit code. Use it within ten minutes.',
          { '0': name },
        )}
      </DesignText>
      {state.status === 'loading' ? (
        <ActivityIndicator
          accessibilityLabel={t('Pair device')}
          color={amberAuroraPalette.auroraBlue}
        />
      ) : null}
      {state.status === 'error' ? (
        <FormMessage message={state.message} />
      ) : null}
      {state.status === 'ready' ? (
        <View
          style={{
            alignItems: 'center',
            gap: homeTokens.spacing.card,
            padding: homeTokens.spacing.section,
            borderRadius: homeTokens.radius.card,
          }}
        >
          {state.data.token && state.data.code ? (
            <>
              <View
                accessible={false}
                style={{
                  padding: homeTokens.spacing.card,
                  backgroundColor: amberAuroraPalette.paper,
                }}
              >
                <QRCode value={state.data.token} size={200} />
              </View>
              <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
                {t('Or enter this six-digit code')}
              </DesignText>
              <DesignText
                selectable
                style={{ fontSize: 28, fontWeight: '700' }}
              >
                {state.data.code.slice(0, 3)} {state.data.code.slice(3)}
              </DesignText>
            </>
          ) : (
            <DesignText>
              {t(
                'This code was already shown. Create a new code to connect a device.',
              )}
            </DesignText>
          )}
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {t('Expires:')}{' '}
            {new Date(state.data.expiresAt).toLocaleString(dateLocale(), {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </DesignText>
        </View>
      ) : null}
      <Button
        label={t('Create new code')}
        variant="blue"
        lightText
        disabled={state.status === 'loading'}
        onPress={() => void regenerate()}
      />
    </View>
  );
}
