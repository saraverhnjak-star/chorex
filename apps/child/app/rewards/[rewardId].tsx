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
import { RewardDetail } from '../../src/rewards/RewardDetail';

export default function RewardScreen() {
  useAppLanguage();

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
          name={t('Child')}
          leading={
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('Back to Rewards')}
              onPress={() => router.navigate('/rewards')}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <DesignText style={{ fontSize: 14, color: homeTokens.coralText }}>
                {t('← Rewards')}
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
