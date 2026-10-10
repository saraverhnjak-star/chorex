import { Pressable } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  HomeScreenFrame,
  HomeHeader,
  DesignText,
  homeTokens,
} from '@chorex/ui';
import { useChildSession } from '../../src/auth/session';
import { ContractDetail } from '../../src/contracts/ContractDetail';

export default function ContractScreen() {
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
          name="Child"
          leading={
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Back to My chores"
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace('/contracts')
              }
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <DesignText style={{ fontSize: 14, color: homeTokens.coralText }}>
                ← My chores
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
