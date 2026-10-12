import {
  t,
  useAppLanguage,
  HomeScreenFrame,
  HomeHeader,
  DesignText,
  amberAuroraPalette,
} from '@chorex/ui';
import { useChildFamily } from '../../src/navigation/FamilyContext';
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
  const family = useChildFamily();
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
          name={
            family?.state.status === 'ready'
              ? family.state.home.profile.displayName
              : (t('Child'))
          }
          leading={
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('Back to Rewards')}
              onPress={() => router.navigate('/rewards')}
              style={{ minHeight: 44, justifyContent: 'center' }}
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
      <RewardDetail
        key={`${session.user.uid}:${id}`}
        rewardId={id}
        authUid={session.user.uid}
      />
    </HomeScreenFrame>
  );
}
