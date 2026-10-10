import { Pressable } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  HomeScreenFrame,
  HomeHeader,
  DesignText,
  homeTokens,
} from '@chorex/ui';
import { useChildSession } from '../../src/auth/session';
import { RewardDetail } from '../../src/rewards/RewardDetail';

export default function RewardScreen() {
  const { rewardId } = useLocalSearchParams<{
    rewardId: string | string[];
  }>();
  const session = useChildSession();
  const router = useRouter();

  if (!session.user) return <Redirect href="/" />;
  const id = typeof rewardId === 'string' ? rewardId : '';
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
              accessibilityLabel="Back to Rewards"
              onPress={() => router.navigate('/rewards')}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <DesignText style={{ fontSize: 14, color: homeTokens.coralText }}>
                ← Rewards
              </DesignText>
            </Pressable>
          }
        />
      }
    >
      <RewardDetail
        key={`${session.user.uid}:${id}`}
        rewardId={id}
        authUid={session.user.uid}
      />
    </HomeScreenFrame>
  );
}
