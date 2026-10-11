import {
  t,
  useAppLanguage,
  HomeScreenFrame,
  HomeHeader,
  DesignText,
  homeTokens,
} from '@chorex/ui';
import { Pressable } from 'react-native';
import { useRouter, Redirect, useLocalSearchParams } from 'expo-router';
import { useChildSession } from '../../src/auth/session';
import { ContractDetail } from '../../src/contracts/ContractDetail';

export default function ContractScreen() {
  useAppLanguage();

  const { contractId } = useLocalSearchParams<{
    contractId: string | string[];
  }>();
  const session = useChildSession();
  const router = useRouter();

  if (!session.user) return <Redirect href="/" />;
  const id = typeof contractId === 'string' ? contractId : '';
  return (
    <HomeScreenFrame
      child
      fill
      header={
        <HomeHeader
          child
          compact
          name={t('Child')}
          leading={
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('Back to My chores')}
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace('/contracts')
              }
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <DesignText style={{ fontSize: 14, color: homeTokens.coralText }}>
                {t('← My chores')}
              </DesignText>
            </Pressable>
          }
        />
      }
    >
      <ContractDetail
        key={`${session.user.uid}:${id}`}
        contractId={id}
        authUid={session.user.uid}
      />
    </HomeScreenFrame>
  );
}
