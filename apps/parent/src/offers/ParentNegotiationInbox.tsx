import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { ChildFamilyMembership } from '@chorex/domain';
import {
  subscribeToCurrentParentNegotiationInbox,
  type ParentNegotiationInboxItem,
} from '@chorex/firebase-client';
import {
  Button,
  FormMessage,
  amberAuroraColors,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { getParentNegotiationInboxErrorMessage } from './messages';

type ParentNegotiationInboxState =
  | { subscriptionKey: string; status: 'loading' }
  | {
      subscriptionKey: string;
      status: 'ready';
      items: readonly ParentNegotiationInboxItem[];
    }
  | { subscriptionKey: string; status: 'error'; message: string };

function formatDeadline(deadlineAt: string): string {
  return new Date(deadlineAt).toLocaleString();
}

export function ParentNegotiationInbox({
  activeChildren,
  authUid,
  familyId,
}: {
  activeChildren: readonly ChildFamilyMembership[];
  authUid: string;
  familyId: string;
}) {
  const dynamicType = useDynamicTypeStyles();
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const subscriptionKey = `${authUid}:${familyId}:${subscriptionAttempt}`;
  const [state, setState] = useState<ParentNegotiationInboxState>({
    subscriptionKey,
    status: 'loading',
  });

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = subscribeToCurrentParentNegotiationInbox(
        familyId,
        (items) => {
          if (active) {
            setState({ subscriptionKey, status: 'ready', items });
          }
        },
        (error) =>
          active &&
          setState({
            subscriptionKey,
            status: 'error',
            message: getParentNegotiationInboxErrorMessage(error),
          }),
      );
    } catch (error) {
      const message = getParentNegotiationInboxErrorMessage(error);
      queueMicrotask(() => {
        if (active) {
          setState({ subscriptionKey, status: 'error', message });
        }
      });
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [familyId, subscriptionKey]);

  const displayedState: ParentNegotiationInboxState =
    state.subscriptionKey === subscriptionKey
      ? state
      : { subscriptionKey, status: 'loading' };

  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface-warm p-5">
      <View className="gap-2">
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="font-bold text-text"
          style={dynamicType.title}
        >
          Counteroffers
        </Text>
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={dynamicType.body}
        >
          Reward changes waiting for your response.
        </Text>
      </View>

      {displayedState.status === 'loading' ? (
        <View className="items-center py-6">
          <ActivityIndicator
            accessibilityLabel="Loading counteroffers"
            color={amberAuroraColors.primaryPressed}
          />
          <Text
            allowFontScaling={false}
            className="mt-3 text-text-muted"
            style={dynamicType.body}
          >
            Loading counteroffers…
          </Text>
        </View>
      ) : null}

      {displayedState.status === 'error' ? (
        <View className="gap-3">
          <FormMessage message={displayedState.message} />
          <Button
            label="Try counteroffers again"
            onPress={() => setSubscriptionAttempt((attempt) => attempt + 1)}
          />
        </View>
      ) : null}

      {displayedState.status === 'ready' &&
      displayedState.items.length === 0 ? (
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={dynamicType.body}
        >
          No counteroffers are waiting for you.
        </Text>
      ) : null}

      {displayedState.status === 'ready' && displayedState.items.length > 0 ? (
        <View className="gap-4">
          {displayedState.items.map(({ offer, revision }) => {
            const childName =
              activeChildren.find((child) => child.uid === offer.childUid)
                ?.displayName ?? 'Child profile unavailable';
            return (
              <View
                className="gap-3 rounded-2xl border border-border bg-background p-4"
                key={offer.id}
              >
                <Text
                  allowFontScaling={false}
                  className="font-semibold text-text"
                  style={dynamicType.body}
                >
                  {childName}
                </Text>
                <Text
                  allowFontScaling={false}
                  className="font-semibold text-text"
                  style={dynamicType.body}
                >
                  Status: Awaiting parent
                </Text>

                <View className="gap-1">
                  <Text
                    allowFontScaling={false}
                    className="font-semibold text-text"
                    style={dynamicType.body}
                  >
                    Proposed reward
                  </Text>
                  <Text
                    allowFontScaling={false}
                    className="text-text-muted"
                    style={dynamicType.body}
                  >
                    {revision.reward.title} · {revision.reward.type}
                  </Text>
                  {revision.reward.description ? (
                    <Text
                      allowFontScaling={false}
                      className="text-text-muted"
                      style={dynamicType.body}
                    >
                      {revision.reward.description}
                    </Text>
                  ) : null}
                </View>

                {revision.note ? (
                  <View className="gap-1">
                    <Text
                      allowFontScaling={false}
                      className="font-semibold text-text"
                      style={dynamicType.body}
                    >
                      Child note
                    </Text>
                    <Text
                      allowFontScaling={false}
                      className="text-text-muted"
                      style={dynamicType.body}
                    >
                      {revision.note}
                    </Text>
                  </View>
                ) : null}

                <View className="gap-1">
                  <Text
                    allowFontScaling={false}
                    className="font-semibold text-text"
                    style={dynamicType.body}
                  >
                    Tasks
                  </Text>
                  {revision.tasks.map((task, index) => (
                    <Text
                      allowFontScaling={false}
                      className="text-text-muted"
                      key={`${offer.id}-task-${index}`}
                      style={dynamicType.body}
                    >
                      {task.title} · {task.targetCount}×
                    </Text>
                  ))}
                </View>

                <Text
                  allowFontScaling={false}
                  className="text-text-muted"
                  style={dynamicType.body}
                >
                  Deadline: {formatDeadline(revision.deadlineAt)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
