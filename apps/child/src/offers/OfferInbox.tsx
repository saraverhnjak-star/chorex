import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  acceptOffer,
  readCurrentChildOfferInbox,
  type ChildOfferInboxItem,
} from '@chorex/firebase-client';
import {
  Button,
  FormMessage,
  amberAuroraColors,
  useDynamicTypeStyles,
} from '@chorex/ui';
import {
  getAcceptOfferErrorMessage,
  getOfferInboxErrorMessage,
} from './messages';

type OfferInboxState =
  | { status: 'loading' }
  | { status: 'ready'; items: readonly ChildOfferInboxItem[] }
  | { status: 'error'; message: string };

function formatDeadline(deadlineAt: string): string {
  return new Date(deadlineAt).toLocaleString();
}

function newIdempotencyKey(): string {
  return `accept-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function OfferInbox({ familyId }: { familyId: string }) {
  const dynamicType = useDynamicTypeStyles();
  const [state, setState] = useState<OfferInboxState>({ status: 'loading' });
  const [acceptingOfferId, setAcceptingOfferId] = useState<string>();
  const [acceptError, setAcceptError] = useState<string>();
  const [activeContractId, setActiveContractId] = useState<string>();
  const acceptingRef = useRef(false);
  const idempotencyKeys = useRef(new Map<string, string>());

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

  const acceptCurrentOffer = async (item: ChildOfferInboxItem) => {
    if (acceptingRef.current) return;
    acceptingRef.current = true;
    const key =
      idempotencyKeys.current.get(item.offer.id) ?? newIdempotencyKey();
    idempotencyKeys.current.set(item.offer.id, key);
    setAcceptingOfferId(item.offer.id);
    setAcceptError(undefined);
    try {
      const output = await acceptOffer({
        offerId: item.offer.id,
        currentRevisionId: item.offer.currentRevisionId,
        idempotencyKey: key,
      });
      idempotencyKeys.current.delete(item.offer.id);
      setActiveContractId(output.contract.id);
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              items: current.items.filter(
                ({ offer }) => offer.id !== item.offer.id,
              ),
            }
          : current,
      );
    } catch (error) {
      setAcceptError(getAcceptOfferErrorMessage(error));
    } finally {
      acceptingRef.current = false;
      setAcceptingOfferId(undefined);
    }
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

      {activeContractId ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="font-semibold text-text"
          style={dynamicType.body}
        >
          Contract is active.
        </Text>
      ) : null}

      <FormMessage message={acceptError} />

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
              <Button
                label="Accept offer"
                loading={acceptingOfferId === offer.id}
                disabled={
                  acceptingOfferId !== undefined &&
                  acceptingOfferId !== offer.id
                }
                onPress={() => void acceptCurrentOffer({ offer, revision })}
              />
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
