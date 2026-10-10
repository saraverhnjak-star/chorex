import { Pressable } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  HomeScreenFrame,
  HomeHeader,
  DesignText,
  homeTokens,
} from '@chorex/ui';
import { useParentSession } from '../../../src/auth/session';
import { useParentFamily } from '../../../src/navigation/FamilyContext';
import { ContractDetail } from '../../../src/contracts/ContractDetail';

export default function ContractScreen() {
  const { contractId } = useLocalSearchParams<{
    contractId: string | string[];
  }>();
  const session = useParentSession();
  const router = useRouter();
  const family = useParentFamily();
  const home = family?.state.status === 'ready' ? family.state.home : undefined;
  if (!session.user) return <Redirect href="/" />;
  const id = typeof contractId === 'string' ? contractId : '';
  return (
    <HomeScreenFrame
      fill
      keyboard
      header={
        <HomeHeader
          compact
          name={home?.profile.displayName ?? 'Parent'}
          leading={
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Back to Contracts"
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace('/contracts')
              }
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <DesignText style={{ fontSize: 14, color: homeTokens.coralText }}>
                ← Contracts
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
        childNames={
          home
            ? Object.fromEntries(
                home.children.map((child) => [child.uid, child.displayName]),
              )
            : {}
        }
      />
    </HomeScreenFrame>
  );
}
