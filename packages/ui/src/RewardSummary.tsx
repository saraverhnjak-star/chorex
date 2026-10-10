import { WaitingState } from './WaitingState';
import { RewardIcon } from './RewardIcon';
import { View } from 'react-native';
import type { EarnedReward, UserProfile } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';
import { TermsHeading } from './OfferTerms';
import {
  rewardStatusLabel,
  rewardResponsibility,
  rewardTone,
  RewardFulfillmentProgress,
} from './RewardPresentation';
export function RewardSummary({
  reward,
  childName,
  viewer = 'CHILD',
}: {
  reward: EarnedReward;
  childName?: string;
  viewer?: UserProfile['accountType'];
}) {
  return (
    <View style={{ gap: homeTokens.spacing.section }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: homeTokens.spacing.medium,
        }}
      >
        <RewardIcon terms={reward.terms} size={88} />
        <View style={{ flex: 1, gap: homeTokens.spacing.small }}>
          <DesignText
            accessibilityRole="header"
            style={{
              fontSize: 26,
              fontWeight: '700',
              color: homeTokens.text,
            }}
          >
            {reward.terms.title}
          </DesignText>
          <View
            style={{
              alignSelf: 'flex-start',
              borderRadius: homeTokens.radius.card,
              backgroundColor: rewardTone(reward.status, viewer),
              paddingHorizontal: homeTokens.spacing.medium,
              paddingVertical: homeTokens.spacing.small,
            }}
          >
            <DesignText
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Reward status: ${rewardStatusLabel(reward.status, viewer)}`}
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: homeTokens.success,
              }}
            >
              {rewardStatusLabel(reward.status, viewer)}
            </DesignText>
          </View>
        </View>
      </View>
      {viewer === 'PARENT' && childName ? (
        <DesignText style={{ fontSize: 16, color: homeTokens.secondary }}>
          Reward for {childName}
        </DesignText>
      ) : null}
      {reward.terms.description ? (
        <DesignText style={{ fontSize: 16, color: homeTokens.text }}>
          {reward.terms.description}
        </DesignText>
      ) : null}
      {viewer === 'CHILD' && reward.status === 'PENDING_FULFILLMENT' ? (
        <WaitingState>
          {rewardResponsibility(reward, viewer, childName)}
        </WaitingState>
      ) : (
        <DesignText style={{ fontSize: 16, color: homeTokens.secondary }}>
          {rewardResponsibility(reward, viewer, childName)}
        </DesignText>
      )}
      <View style={{ gap: homeTokens.spacing.medium }}>
        <TermsHeading icon="checkmark-done-outline">
          Reward journey
        </TermsHeading>
        <RewardFulfillmentProgress reward={reward} />
      </View>
    </View>
  );
}
