import { t, useAppLanguage } from './localization';
import { RewardIcon } from './RewardIcon';
import { Pressable, View } from 'react-native';
import { useState, type ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { EarnedReward, UserProfile } from '@chorex/domain';
import { DesignText, homeTokens } from './Home';
import {
  rewardStatusLabel,
  rewardResponsibility,
  RewardFulfillmentProgress,
} from './RewardPresentation';
export function RewardSummary({
  reward,
  childName,
  viewer = 'CHILD',
  actions,
}: {
  reward: EarnedReward;
  childName?: string;
  viewer?: UserProfile['accountType'];
  actions?: ReactNode;
}) {
  useAppLanguage();
  const [expandedRewardId, setExpandedRewardId] = useState<string>();
  const expanded = expandedRewardId === reward.id;

  return (
    <View
      style={{
        gap: homeTokens.spacing.section,
        flexGrow: 1,
      }}
    >
      <View style={{ flexGrow: 1, justifyContent: 'center' }}>
        <View
          style={{
            backgroundColor: homeTokens.mint,
            borderRadius: homeTokens.radius.card,
            padding: homeTokens.spacing.card,
            paddingVertical: homeTokens.spacing.section,
            justifyContent: 'center',
            alignItems: 'center',
            gap: homeTokens.spacing.medium,
          }}
        >
          <DesignText
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('Reward status: {0}', {
              '0': rewardStatusLabel(reward.status, viewer),
            })}
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: homeTokens.success,
              textAlign: 'center',
            }}
          >
            {reward.status === 'PENDING_FULFILLMENT'
              ? viewer === 'PARENT'
                ? t('Your turn')
                : t("Parent's turn")
              : reward.status === 'AWAITING_CHILD_CONFIRMATION'
                ? viewer === 'PARENT'
                  ? t('Kids turn')
                  : t('Your turn')
                : t('Received')}
          </DesignText>
          <DesignText
            accessibilityRole="header"
            style={{
              fontSize: 26,
              fontWeight: '700',
              color: homeTokens.text,
              textAlign: 'center',
            }}
          >
            {reward.terms.title}
          </DesignText>
          {viewer === 'PARENT' && childName ? (
            <DesignText
              style={{
                fontSize: 16,
                color: homeTokens.secondary,
                textAlign: 'center',
              }}
            >
              {t('Reward for {0}', { '0': childName })}
            </DesignText>
          ) : null}
          <RewardIcon terms={reward.terms} size={200} />
          {reward.terms.description ? (
            <DesignText
              style={{
                fontSize: 16,
                color: homeTokens.text,
                textAlign: 'center',
              }}
            >
              {reward.terms.description}
            </DesignText>
          ) : null}
          {viewer === 'CHILD' && reward.status === 'PENDING_FULFILLMENT' ? (
            <DesignText
              style={{
                fontSize: 16,
                color: homeTokens.secondary,
                textAlign: 'center',
              }}
            >
              {t('Reward is on the way!')}
            </DesignText>
          ) : null}
          {viewer === 'PARENT' ? (
            <DesignText
              style={{
                fontSize: 16,
                color: homeTokens.secondary,
                textAlign: 'center',
              }}
            >
              {rewardResponsibility(reward, viewer, childName)}
            </DesignText>
          ) : null}
          {actions ? (
            <View style={{ alignSelf: 'stretch' }}>{actions}</View>
          ) : null}
        </View>
      </View>
      <View
        style={{
          gap: homeTokens.spacing.medium,
          marginTop: 'auto',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Reward journey')}
          accessibilityState={{ expanded }}
          onPress={() => setExpandedRewardId(expanded ? undefined : reward.id)}
          style={{
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: homeTokens.spacing.medium,
          }}
        >
          <DesignText
            accessibilityRole="header"
            style={{
              flex: 1,
              fontSize: 16,
              fontWeight: '600',
              color: homeTokens.text,
            }}
          >
            {t('Reward journey')}
          </DesignText>
          <Ionicons
            accessible={false}
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={homeTokens.secondary}
          />
        </Pressable>
        {expanded ? (
          <RewardFulfillmentProgress reward={reward} taskStyle />
        ) : null}
      </View>
    </View>
  );
}
