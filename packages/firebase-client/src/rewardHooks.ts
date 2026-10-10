import { useEffect, useState } from 'react';
import type { EarnedReward } from '@chorex/domain';
import {
  observeReward,
  observePendingRewards,
  observeEarnedRewards,
} from './index';
import { RewardReadError } from './rewardReadModel';
export type RewardListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rewards: readonly EarnedReward[]; fromCache: boolean };
export function usePendingRewards(
  familyId: string,
  authUid: string,
): RewardListState {
  return useRewards(familyId, authUid, true);
}
export function useEarnedRewards(
  familyId: string,
  authUid: string,
): RewardListState {
  return useRewards(familyId, authUid, false);
}
function useRewards(
  familyId: string,
  authUid: string,
  pending: boolean,
  parentStatus:
    | 'PENDING_FULFILLMENT'
    | 'AWAITING_CHILD_CONFIRMATION'
    | 'FULFILLED' = 'PENDING_FULFILLMENT',
): RewardListState {
  const key = JSON.stringify([familyId, authUid, pending, parentStatus]);
  const [result, setResult] = useState<{
    key: string;
    state: RewardListState;
  }>();
  useEffect(() => {
    let active = true,
      failed = false;
    let stop: (() => void) | undefined;
    const fail = () => {
      failed = true;
      if (active) setResult({ key, state: { status: 'error' } });
      stop?.();
    };
    try {
      stop = (
        pending
          ? (
              family: string,
              callback: Parameters<typeof observePendingRewards>[1],
              error: Parameters<typeof observePendingRewards>[2],
            ) => observePendingRewards(family, callback, error, parentStatus)
          : observeEarnedRewards
      )(
        familyId,
        (snapshot) => {
          if (active && !failed)
            setResult({
              key,
              state: {
                status: 'ready',
                rewards: snapshot.data,
                fromCache: snapshot.fromCache,
              },
            });
        },
        fail,
      );
      if (failed) stop();
    } catch {
      fail();
    }
    return () => {
      active = false;
      stop?.();
    };
  }, [familyId, authUid, pending, parentStatus, key]);
  return result?.key === key ? result.state : { status: 'loading' };
}
export type RewardDetailState =
  | { status: 'loading' }
  | { status: 'error'; error: RewardReadError }
  | { status: 'missing'; fromCache: boolean }
  | { status: 'ready'; reward: EarnedReward; fromCache: boolean };
export function useRewardDetail(
  rewardId: string,
  authUid: string | undefined,
): RewardDetailState {
  const key = JSON.stringify([rewardId, authUid]);
  const [result, setResult] = useState<{
    key: string;
    state: RewardDetailState;
  }>();
  useEffect(() => {
    let active = true,
      failed = false;
    let stop: (() => void) | undefined;
    const fail = (error: RewardReadError) => {
      failed = true;
      if (active) setResult({ key, state: { status: 'error', error } });
      stop?.();
    };
    if (!authUid) fail(new RewardReadError('AUTH_REQUIRED'));
    else
      try {
        stop = observeReward(
          rewardId,
          (snapshot) => {
            if (active && !failed)
              setResult({
                key,
                state: snapshot.data
                  ? {
                      status: 'ready',
                      reward: snapshot.data,
                      fromCache: snapshot.fromCache,
                    }
                  : { status: 'missing', fromCache: snapshot.fromCache },
              });
          },
          fail,
        );
        if (failed) stop();
      } catch (error) {
        fail(
          error instanceof RewardReadError
            ? error
            : new RewardReadError('READ_FAILED'),
        );
      }
    return () => {
      active = false;
      stop?.();
    };
  }, [rewardId, authUid, key]);
  return result?.key === key ? result.state : { status: 'loading' };
}

export function useAwaitingRewards(
  familyId: string,
  authUid: string,
): RewardListState {
  return useRewards(familyId, authUid, true, 'AWAITING_CHILD_CONFIRMATION');
}

export function useReceivedRewards(
  familyId: string,
  authUid: string,
): RewardListState {
  return useRewards(familyId, authUid, true, 'FULFILLED');
}
