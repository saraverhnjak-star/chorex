import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  readCurrentChildOfferInbox,
  type ChildOfferInboxItem,
} from '@chorex/firebase-client';
import {
  Button,
  FormMessage,
  amberAuroraColors,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { getOfferInboxErrorMessage } from './messages';

type OfferInboxState =
  | { status: 'loading' }
  | { status: 'ready'; items: readonly ChildOfferInboxItem[] }
  | { status: 'error'; message: string };

function formatDeadline(deadlineAt: string): string {
  return new Date(deadlineAt).toLocaleString();
}

export function OfferInbox({ familyId }: { familyId: string }) {
  const dynamicType = useDynamicTypeStyles();
  const [state, setState] = useState<OfferInboxState>({ status: 'loading' });

  const loadOffers = useCallback(async () => {
    try {
      const items = await readCurrentChildOfferInbox(familyId);
      setState({ status: 'ready', items });
    } catch (error) {
      setState({ status: 'error', message: getOfferInboxErrorMessage(error) });
    }
  }, [familyId]);

  useEffect(() => {
    let active = true;
    void readCurrentChildOfferInbox(familyId)
      .then((items) => {
        if (active) setState({ status: 'ready', items });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: getOfferInboxErrorMessage(error),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [familyId]);

  const refreshOffers = () => {
    setState({ status: 'loading' });
    void loadOffers();
  };

  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface-warm p-5">
      <View className="gap-2">
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="font-bold text-text"
          style={dynamicType.title}
        >
          Offers
        </Text>
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={dynamicType.body}
        >
          Agreements waiting for your response.
        </Text>
      </View>

      {state.status === 'loading' ? (
        <View className="items-center py-6">
          <ActivityIndicator
            accessibilityLabel="Loading offers"
            color={amberAuroraColors.primaryPressed}
          />
          <Text
            allowFontScaling={false}
            className="mt-3 text-text-muted"
            style={dynamicType.body}
          >
            Loading offers…
          </Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View className="gap-3">
          <FormMessage message={state.message} />
          <Button label="Try offers again" onPress={refreshOffers} />
        </View>
      ) : null}

      {state.status === 'ready' && state.items.length === 0 ? (
        <View className="gap-3">
          <Text
            allowFontScaling={false}
            className="text-text-muted"
            style={dynamicType.body}
          >
            No offers are waiting for you.
          </Text>
          <Button
            label="Refresh offers"
            onPress={refreshOffers}
            variant="secondary"
          />
        </View>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <View className="gap-4">
          {state.items.map(({ offer, revision }) => (
            <View
              className="gap-3 rounded-2xl border border-border bg-background p-4"
              key={offer.id}
            >
              <Text
                allowFontScaling={false}
                className="font-semibold text-text"
                style={dynamicType.body}
              >
                Status: Awaiting child
              </Text>

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

              <View className="gap-1">
                <Text
                  allowFontScaling={false}
                  className="font-semibold text-text"
                  style={dynamicType.body}
                >
                  Reward
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

              <Text
                allowFontScaling={false}
                className="text-text-muted"
                style={dynamicType.body}
              >
                Deadline: {formatDeadline(revision.deadlineAt)}
              </Text>
            </View>
          ))}

          <Button
            label="Refresh offers"
            onPress={refreshOffers}
            variant="secondary"
          />
        </View>
      ) : null}
    </View>
  );
}
