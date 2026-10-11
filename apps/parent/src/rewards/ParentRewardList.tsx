import { t, useAppLanguage } from '@chorex/ui';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import {
  Button,
  CollectionHeading,
  DesignText,
  FormMessage,
  OfferOutcome,
  homeTokens,
  type RewardList,
} from '@chorex/ui';
import { ParentHomeCard, ParentHomeRow } from '../navigation/ParentHomeRow';

export function ParentRewardList({
  title,
  rewards,
  childNames = {},
  loading,
  error,
  fromCache,
  empty,
  onRetry,
  onSelect,
  preview,
  onSeeAll,
  showHeading = true,
}: ComponentProps<typeof RewardList> & { showHeading?: boolean }) {
  useAppLanguage();

  if (loading) return null;
  return (
    <View style={{ gap: homeTokens.spacing.medium }}>
      {showHeading ? (
        <CollectionHeading
          count={rewards.length}
          onSeeAll={preview ? onSeeAll : undefined}
          label={t('See all Rewards')}
        >
          {title}
        </CollectionHeading>
      ) : null}
      {fromCache ? (
        <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
          {t('Showing saved rewards. Updates may be pending.')}
        </DesignText>
      ) : null}
      {loading ? (
        <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
          {t('Loading rewards…')}
        </DesignText>
      ) : null}
      {error ? (
        <>
          <FormMessage
            message={t('Your rewards could not be loaded. Try again.')}
          />
          {onRetry ? (
            <Button
              label={t('Try Rewards again')}
              variant="outline"
              onPress={onRetry}
            />
          ) : null}
        </>
      ) : null}
      {!loading && !error && !rewards.length ? (
        preview ? (
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {fromCache ? t('No rewards saved yet.') : empty}
          </DesignText>
        ) : (
          <OfferOutcome
            centered
            illustration="no-rewards"
            title={t('No rewards')}
          >
            {fromCache ? t('No rewards saved yet.') : empty}
          </OfferOutcome>
        )
      ) : null}
      {(preview ? rewards.slice(0, 1) : rewards).map((reward) => {
        const pending = reward.status === 'PENDING_FULFILLMENT';
        const childName = childNames[reward.childUid];
        return (
          <ParentHomeCard key={reward.id}>
            <ParentHomeRow
              dense
              title={reward.terms.title}
              reward={reward.terms}
              detail={`${childName ? `${childName} · ` : ''}${pending ? t('Earned') : reward.status === 'AWAITING_CHILD_CONFIRMATION' ? t('Delivered') : t('Received')}`}
              badge={
                pending
                  ? t('Your turn to deliver')
                  : reward.status === 'FULFILLED'
                    ? t('Received')
                    : t("Child's turn")
              }
              action={pending ? t('Fulfill reward') : t('Open reward')}
              button={pending}
              label={t('Open reward: {0}{1}. {2}', {
                '0': childName ? `${childName} · ` : '',
                '1': reward.terms.title,
                '2': pending
                  ? t('Your turn to deliver')
                  : reward.status === 'FULFILLED'
                    ? t('Received')
                    : t("Child's turn"),
              })}
              onPress={() => onSelect(reward.id)}
            />
          </ParentHomeCard>
        );
      })}
    </View>
  );
}
