import type { ComponentProps } from 'react';
import { View } from 'react-native';
import {
  Button,
  CollectionHeading,
  DesignText,
  FormMessage,
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
  return (
    <View style={{ gap: homeTokens.spacing.medium }}>
      {showHeading ? (
        <CollectionHeading
          count={rewards.length}
          onSeeAll={preview ? onSeeAll : undefined}
          label="See all Rewards"
        >
          {title}
        </CollectionHeading>
      ) : null}
      {fromCache ? (
        <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
          Showing saved rewards. Updates may be pending.
        </DesignText>
      ) : null}
      {loading ? (
        <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
          Loading rewards…
        </DesignText>
      ) : null}
      {error ? (
        <>
          <FormMessage message="Your rewards could not be loaded. Try again." />
          {onRetry ? (
            <Button
              label="Try Rewards again"
              variant="outline"
              onPress={onRetry}
            />
          ) : null}
        </>
      ) : null}
      {!loading && !error && !rewards.length ? (
        <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
          {fromCache ? 'No rewards saved yet.' : empty}
        </DesignText>
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
              detail={`${childName ? `${childName} · ` : ''}${pending ? 'Earned' : reward.status === 'AWAITING_CHILD_CONFIRMATION' ? 'Delivered' : 'Received'}`}
              badge={
                pending
                  ? 'Your turn to deliver'
                  : reward.status === 'FULFILLED'
                    ? 'Received'
                    : "Child's turn"
              }
              action={pending ? 'Fulfill reward' : 'Open reward'}
              button={pending}
              label={`Open reward: ${childName ? `${childName} · ` : ''}${reward.terms.title}. ${pending ? 'Your turn to deliver' : reward.status === 'FULFILLED' ? 'Received' : "Child's turn"}`}
              onPress={() => onSelect(reward.id)}
            />
          </ParentHomeCard>
        );
      })}
    </View>
  );
}
