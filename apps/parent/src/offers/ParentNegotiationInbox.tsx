import { amberAuroraPalette } from '@chorex/ui';
import { ParentEmptyState } from '../navigation/ParentEmptyState';
import {
  t,
  useAppLanguage,
  FocusHeading,
  announceAction,
  ProposalTerms,
  OfferOutcome,
  CollectionHeading,
  HomeListRow,
  Button,
  FormMessage,
  homeTokens,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { ParentHomeCard, ParentHomeRow } from '../navigation/ParentHomeRow';
import { useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { ChildFamilyMembership, CounterOfferInput } from '@chorex/domain';
import {
  acceptOffer,
  counterOffer,
  rejectOffer,
  subscribeToCurrentParentNegotiationInbox,
  type ParentNegotiationInboxItem,
} from '@chorex/firebase-client';
import {
  getAcceptOfferErrorMessage,
  getCounterOfferErrorMessage,
  getRejectOfferErrorMessage,
  getParentNegotiationInboxErrorMessage,
} from './messages';

import { ParentCounterofferForm } from './ParentCounterofferForm';

type ParentNegotiationInboxState =
  | { subscriptionKey: string; status: 'loading' }
  | {
      subscriptionKey: string;
      status: 'ready';
      items: readonly ParentNegotiationInboxItem[];
    }
  | { subscriptionKey: string; status: 'error'; message: string };

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function ParentNegotiationInbox({
  activeChildren,
  authUid,
  familyId,
  preview = false,
  list = false,
  showHeading = true,
  offerId,
  counterRevisionId,
  onLoadingChange,
}: {
  activeChildren: readonly ChildFamilyMembership[];
  preview?: boolean;
  list?: boolean;
  showHeading?: boolean;
  offerId?: string;
  counterRevisionId?: string;
  onLoadingChange?: (loading: boolean) => void;
  authUid: string;
  familyId: string;
}) {
  useAppLanguage();

  const router = useRouter();
  const dynamicType = useDynamicTypeStyles();
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const subscriptionKey = `${authUid}:${familyId}:${offerId ?? 'all'}:${subscriptionAttempt}`;
  const [state, setState] = useState<ParentNegotiationInboxState>({
    subscriptionKey,
    status: 'loading',
  });

  const [rejectionConfirmation, setRejectionConfirmation] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const mutating = useRef(false);
  const keys = useRef(new Map<string, string>());
  const scope = useRef(subscriptionKey);
  useEffect(() => {
    scope.current = subscriptionKey;
  }, [subscriptionKey]);

  const acceptCounteroffer = async (item: ParentNegotiationInboxItem) => {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setActionError(undefined);
    setMessage(undefined);
    const identity = `${subscriptionKey}:${item.offer.id}:${item.revision.id}`;
    const key = keys.current.get(identity) ?? `accept-${newIdempotencyKey()}`;
    keys.current.set(identity, key);
    try {
      await acceptOffer({
        offerId: item.offer.id,
        currentRevisionId: item.revision.id,
        idempotencyKey: key,
      });
      if (scope.current === subscriptionKey) {
        setMessage(t('Contract active'));
        announceAction(t('Agreement reached. Contract is active.'));
      }
    } catch (error) {
      if (scope.current === subscriptionKey)
        setActionError(getAcceptOfferErrorMessage(error));
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };

  const rejectCounteroffer = async (item: ParentNegotiationInboxItem) => {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setActionError(undefined);
    setMessage(undefined);
    const identity = `${subscriptionKey}:reject:${item.offer.id}:${item.revision.id}`;
    const key = keys.current.get(identity) ?? `reject-${newIdempotencyKey()}`;
    keys.current.set(identity, key);
    try {
      await rejectOffer({
        offerId: item.offer.id,
        currentRevisionId: item.revision.id,
        idempotencyKey: key,
      });
      if (scope.current === subscriptionKey) {
        setMessage(t('Counteroffer rejected'));
        announceAction(t('Counteroffer declined.'));
        setRejectionConfirmation(undefined);
      }
    } catch (error) {
      if (scope.current === subscriptionKey)
        setActionError(getRejectOfferErrorMessage(error));
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };

  const sendCounteroffer = async (proposal: CounterOfferInput) => {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setActionError(undefined);
    setMessage(undefined);
    const terms = { ...proposal, idempotencyKey: undefined };
    const fingerprint = `${subscriptionKey}:counter:${JSON.stringify(terms)}`;
    const key =
      keys.current.get(fingerprint) ?? `counter-${newIdempotencyKey()}`;
    keys.current.set(fingerprint, key);
    try {
      await counterOffer({ ...terms, idempotencyKey: key });
      if (scope.current === subscriptionKey) {
        setMessage(t('Counteroffer sent'));
        announceAction(t('Counteroffer sent. Waiting for Child.'));
        setEditing(undefined);
        if (counterRevisionId)
          router.replace({
            pathname: '/offers/[offerId]',
            params: { offerId: proposal.offerId, sent: 'true' },
          });
      }
    } catch (error) {
      if (scope.current === subscriptionKey)
        setActionError(getCounterOfferErrorMessage(error));
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };

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
      ? state.status === 'ready' && offerId
        ? {
            ...state,
            items: state.items.filter(({ offer }) => offer.id === offerId),
          }
        : state
      : { subscriptionKey, status: 'loading' };

  useLayoutEffect(() => {
    onLoadingChange?.(displayedState.status === 'loading');
  }, [displayedState.status, onLoadingChange]);
  if (displayedState.status === 'loading') return null;
  return (
    <View style={{ gap: homeTokens.spacing.section, flexGrow: 1 }}>
      {list && showHeading ? (
        <CollectionHeading
          seeAllColor={amberAuroraPalette.navigationActive}
          count={
            displayedState.status === 'ready'
              ? displayedState.items.length
              : undefined
          }
          label={t('Counteroffers')}
        >
          {t('Counteroffers')}
        </CollectionHeading>
      ) : null}

      {message ? (
        <OfferOutcome
          title={
            message === t('Contract active')
              ? t('Agreement reached')
              : message === t('Counteroffer rejected')
                ? t('Declined')
                : t('New proposal sent')
          }
          success={message === t('Contract active')}
          centered={message === t('Contract active')}
        >
          {message}
        </OfferOutcome>
      ) : null}
      {actionError ? <FormMessage message={actionError} /> : null}

      {displayedState.status === 'error' ? (
        <View className="gap-3">
          <FormMessage message={displayedState.message} />
          <Button
            label={t('Try counteroffers again')}
            onPress={() => setSubscriptionAttempt((attempt) => attempt + 1)}
          />
        </View>
      ) : null}

      {displayedState.status === 'ready' &&
      displayedState.items.length === 0 &&
      !message ? (
        <ParentEmptyState
          title={offerId ? t('Offer unavailable') : t('No counteroffers')}
        >
          {t('No counteroffers are waiting for you.')}
        </ParentEmptyState>
      ) : null}

      {displayedState.status === 'ready' && displayedState.items.length > 0 ? (
        <View className="gap-4" style={offerId ? { flexGrow: 1 } : undefined}>
          {list
            ? displayedState.items.map(({ offer, revision }) => (
                <ParentHomeCard tone="coralSurface" key={offer.id}>
                  <ParentHomeRow
                    dense
                    reward={revision.reward}
                    title={revision.reward.title}
                    detail={t('{0} · Your turn', {
                      '0':
                        activeChildren.find(
                          (child) => child.uid === offer.childUid,
                        )?.displayName ?? t('Child'),
                    })}
                    badge={t('Your turn')}
                    action={t('View offer')}
                    label={t('View offer')}
                    onPress={() =>
                      router.push({
                        pathname: '/offers/[offerId]',
                        params: { offerId: offer.id },
                      })
                    }
                  />
                </ParentHomeCard>
              ))
            : preview
              ? displayedState.items.slice(0, 2).map(({ offer, revision }) => (
                  <HomeListRow
                    key={offer.id}
                    reward={revision.reward}
                    title={revision.reward.title}
                    detail={t('{0} · Your turn', {
                      '0':
                        activeChildren.find(
                          (child) => child.uid === offer.childUid,
                        )?.displayName ?? t('Child'),
                    })}
                    label={t('Open Offer: {0}', {
                      '0': revision.reward.title,
                    })}
                    icon="document-text-outline"
                    onPress={() => router.navigate('/offers')}
                  />
                ))
              : displayedState.items.map((item) => {
                  const { offer, revision } = item;
                  const identity = `${subscriptionKey}:${offer.id}:${revision.id}`;
                  const childName =
                    activeChildren.find((child) => child.uid === offer.childUid)
                      ?.displayName ?? t('Child profile unavailable');
                  if (counterRevisionId) {
                    return revision.id === counterRevisionId ? (
                      <ParentCounterofferForm
                        key={identity}
                        revision={revision}
                        busy={busy}
                        onCancel={() =>
                          router.canGoBack()
                            ? router.back()
                            : router.replace('/offers')
                        }
                        onSubmit={sendCounteroffer}
                      />
                    ) : (
                      <FormMessage
                        key={identity}
                        message={t(
                          'This offer changed. Refresh it before countering.',
                        )}
                      />
                    );
                  }
                  return (
                    <View
                      style={{
                        gap: homeTokens.spacing.medium,
                        flexGrow: offerId ? 1 : undefined,
                      }}
                      key={offer.id}
                    >
                      <ProposalTerms
                        cardHeader
                        participantName={childName}
                        layout="rewardFirst"
                        revision={revision}
                        status={t('Your turn')}
                        author={t('Proposed by {0}', { '0': childName })}
                        support={t(
                          '{0} made a counteroffer. Review the current terms below.',
                          { '0': childName },
                        )}
                      />
                      <View
                        style={{
                          gap: homeTokens.spacing.medium,
                          marginTop: offerId ? 'auto' : undefined,
                          paddingTop: homeTokens.spacing.medium,
                        }}
                      >
                        {rejectionConfirmation === identity ? (
                          <View className="gap-3">
                            <FocusHeading
                              allowFontScaling={false}
                              accessibilityRole="alert"
                              accessibilityLiveRegion="assertive"
                              className="text-home-text"
                              style={dynamicType.body}
                            >
                              {t(
                                'Rejecting this counteroffer ends this Offer negotiation. The terms will remain in its history.',
                              )}
                            </FocusHeading>
                            <Button
                              label={t('Confirm reject counteroffer')}
                              variant="danger"
                              loading={busy}
                              onPress={() => void rejectCounteroffer(item)}
                            />
                            <Button
                              label={t('Keep negotiating')}
                              variant="outline"
                              disabled={busy}
                              onPress={() =>
                                setRejectionConfirmation(undefined)
                              }
                            />
                          </View>
                        ) : editing === identity ? (
                          <ParentCounterofferForm
                            key={identity}
                            revision={revision}
                            busy={busy}
                            onCancel={() => setEditing(undefined)}
                            onSubmit={sendCounteroffer}
                          />
                        ) : (
                          <Button
                            label={t('Accept counteroffer')}
                            variant="primary"
                            lightText
                            loading={busy}
                            onPress={() => {
                              void acceptCounteroffer(item);
                            }}
                          />
                        )}
                        {rejectionConfirmation !== identity &&
                        editing !== identity ? (
                          <Button
                            label={t('Counteroffer')}
                            variant="outline"
                            disabled={busy}
                            onPress={() => {
                              router.push({
                                pathname: '/offers/counter',
                                params: {
                                  offerId: offer.id,
                                  revisionId: revision.id,
                                },
                              });
                              setActionError(undefined);
                              setMessage(undefined);
                            }}
                          />
                        ) : null}
                        {rejectionConfirmation !== identity &&
                        editing !== identity ? (
                          <Button
                            label={t('Reject counteroffer')}
                            variant="danger"
                            disabled={busy}
                            onPress={() => {
                              setRejectionConfirmation(identity);
                              setEditing(undefined);
                              setActionError(undefined);
                              setMessage(undefined);
                            }}
                          />
                        ) : null}
                      </View>
                    </View>
                  );
                })}
        </View>
      ) : null}
    </View>
  );
}
