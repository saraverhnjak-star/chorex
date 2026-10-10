import { WaitingState } from './WaitingState';
import { RewardIcon } from './RewardIcon';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { EarnedReward, UserProfile } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';
import { SurfaceCard, TermsHeading } from './OfferTerms';
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
  if (viewer === 'CHILD')
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
                backgroundColor: homeTokens.mint,
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
        {reward.terms.description ? (
          <DesignText style={{ fontSize: 16, color: homeTokens.text }}>
            {reward.terms.description}
          </DesignText>
        ) : null}
        {reward.status === 'PENDING_FULFILLMENT' ? (
          <WaitingState>{rewardResponsibility(reward, viewer)}</WaitingState>
        ) : (
          <DesignText style={{ fontSize: 16, color: homeTokens.secondary }}>
            {rewardResponsibility(reward, viewer)}
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
  return (
    <>
      <SurfaceCard>
        <View
          style={{
            backgroundColor: rewardTone(reward.status, viewer),
            borderRadius: 16,
            padding: homeTokens.spacing.medium,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Ionicons
              accessible={false}
              name={
                reward.status === 'FULFILLED'
                  ? 'checkmark-circle-outline'
                  : reward.status === 'AWAITING_CHILD_CONFIRMATION'
                    ? 'time-outline'
                    : 'gift-outline'
              }
              size={24}
              color={
                reward.status === 'FULFILLED'
                  ? homeTokens.success
                  : homeTokens.secondary
              }
            />
            <DesignText
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Reward status: ${rewardStatusLabel(reward.status, viewer)}`}
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: '600',
                color: homeTokens.text,
              }}
            >
              {rewardStatusLabel(reward.status, viewer)}
            </DesignText>
          </View>
          <DesignText style={{ fontSize: 15, color: homeTokens.text }}>
            {rewardResponsibility(reward, viewer, childName)}
          </DesignText>
        </View>
        <TermsHeading icon="gift-outline">
          {viewer === 'PARENT' ? 'Earned reward' : 'Your earned reward'}
        </TermsHeading>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <RewardIcon terms={reward.terms} />
          <DesignText
            accessibilityRole="header"
            style={{
              flex: 1,
              fontSize: 22,
              fontWeight: '700',
              color: homeTokens.text,
            }}
          >
            {reward.terms.title}
          </DesignText>
        </View>
        {childName ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: homeTokens.coralSurface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DesignText
                style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: homeTokens.text,
                }}
              >
                {childName.slice(0, 1).toUpperCase()}
              </DesignText>
            </View>
            <DesignText
              style={{ flex: 1, fontSize: 15, color: homeTokens.text }}
            >
              Reward for {childName}
            </DesignText>
          </View>
        ) : null}
        {reward.terms.description ? (
          <DesignText style={{ fontSize: 16, color: homeTokens.text }}>
            {reward.terms.description}
          </DesignText>
        ) : null}
        <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
          Type: {reward.terms.type.toLowerCase()}
        </DesignText>
      </SurfaceCard>
      <SurfaceCard>
        <TermsHeading icon="checkmark-done-outline">
          Reward journey
        </TermsHeading>
        <RewardFulfillmentProgress reward={reward} />
      </SurfaceCard>
    </>
  );
}
