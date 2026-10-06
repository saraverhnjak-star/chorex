import { useEffect, useState } from 'react';
import type { Contract, ContractTask, ContractReview } from '@chorex/domain';
import {
  observeContract,
  observeCurrentContractReview,
  observeContractReviews,
  observeTasks,
  observeActiveContracts,
  observeReadyForReviewContracts,
} from './index';
import { ContractReadError, type ReadSnapshot } from './contractReadModel';

export type ContractDetailState =
  | { status: 'loading' }
  | { status: 'missing'; fromCache: boolean }
  | { status: 'error'; error: ContractReadError }
  | {
      status: 'ready';
      contract: Contract;
      tasks: readonly ContractTask[];
      fromCache: boolean;
    };
export function useContractDetail(
  contractId: string,
  authUid: string | undefined,
): ContractDetailState {
  const key = JSON.stringify([contractId, authUid]);
  const [result, setResult] = useState<{
    key: string;
    state: ContractDetailState;
  }>();
  useEffect(() => {
    let active = true;
    let failed = false;
    let contract: ReadSnapshot<Contract | null> | undefined;
    let tasks: ReadSnapshot<readonly ContractTask[]> | undefined;
    const stops: (() => void)[] = [];
    const emit = (state: ContractDetailState) => {
      if (active) setResult({ key, state });
    };
    const fail = (error: unknown) => {
      failed = true;
      emit({
        status: 'error',
        error:
          error instanceof ContractReadError
            ? error
            : new ContractReadError('READ_FAILED'),
      });
      stops.forEach((stop) => stop());
    };
    const update = () => {
      if (failed || !contract) return;
      if (!contract.data) {
        emit({ status: 'missing', fromCache: contract.fromCache });
        return;
      }
      if (!tasks) return;
      const agreement = contract.data;
      if (
        tasks.data.some(
          (task) =>
            task.familyId !== agreement.familyId ||
            task.assigneeUid !== agreement.childUid,
        )
      ) {
        fail(new ContractReadError('MALFORMED_DATA'));
        return;
      }
      emit({
        status: 'ready',
        contract: agreement,
        tasks: tasks.data,
        fromCache: contract.fromCache || tasks.fromCache,
      });
    };
    if (!authUid) {
      fail(new ContractReadError('AUTH_REQUIRED'));
    } else {
      try {
        stops.push(
          observeContract(
            contractId,
            (snapshot) => {
              contract = snapshot;
              update();
            },
            fail,
          ),
        );
        if (!failed)
          stops.push(
            observeTasks(
              contractId,
              (snapshot) => {
                tasks = snapshot;
                update();
              },
              fail,
            ),
          );
        if (failed) stops.forEach((stop) => stop());
      } catch (error) {
        fail(error);
      }
    }
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, [contractId, authUid, key]);
  return result?.key === key ? result.state : { status: 'loading' };
}
export type ActiveContractsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; contracts: readonly Contract[]; fromCache: boolean };
export function useActiveContracts(
  familyId: string,
  authUid: string,
): ActiveContractsState {
  return useContractsInState(familyId, authUid, 'ACTIVE');
}
export function useReadyForReviewContracts(
  familyId: string,
  authUid: string,
): ActiveContractsState {
  return useContractsInState(familyId, authUid, 'READY_FOR_REVIEW');
}
function useContractsInState(
  familyId: string,
  authUid: string,
  status: 'ACTIVE' | 'READY_FOR_REVIEW',
): ActiveContractsState {
  const key = JSON.stringify([familyId, authUid, status]);
  const [result, setResult] = useState<{
    key: string;
    state: ActiveContractsState;
  }>();
  useEffect(() => {
    let active = true;
    const emit = (state: ActiveContractsState) => {
      if (active) setResult({ key, state });
    };
    let stop: (() => void) | undefined;
    try {
      stop = (
        status === 'ACTIVE'
          ? observeActiveContracts
          : observeReadyForReviewContracts
      )(
        familyId,
        (snapshot) =>
          emit({
            status: 'ready',
            contracts: snapshot.data,
            fromCache: snapshot.fromCache,
          }),
        () => emit({ status: 'error' }),
      );
    } catch {
      emit({ status: 'error' });
    }
    return () => {
      active = false;
      stop?.();
    };
  }, [familyId, authUid, key, status]);
  return result?.key === key ? result.state : { status: 'loading' };
}

export type CurrentContractReviewState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; error: ContractReadError }
  | { status: 'ready'; review: ContractReview | null; fromCache: boolean };
export function useCurrentContractReview(
  contract: Contract | undefined,
  authUid: string | undefined,
): CurrentContractReviewState {
  const id = contract?.id,
    familyId = contract?.familyId,
    cycle = contract?.reviewCycle,
    parentUid = contract?.parentUid,
    childUid = contract?.childUid,
    status = contract?.status;
  const key = JSON.stringify([
    id,
    familyId,
    cycle,
    parentUid,
    childUid,
    status,
    authUid,
  ]);
  const [result, setResult] = useState<{
    key: string;
    state: CurrentContractReviewState;
  }>();
  useEffect(() => {
    let active = true;
    let failed = false;
    let stop: (() => void) | undefined;
    const emit = (state: CurrentContractReviewState) => {
      if (active) setResult({ key, state });
    };
    const fail = (error: ContractReadError) => {
      failed = true;
      emit({ status: 'error', error });
      stop?.();
    };
    if (!contract) emit({ status: 'idle' });
    else if (!authUid) fail(new ContractReadError('AUTH_REQUIRED'));
    else
      try {
        stop = observeCurrentContractReview(
          contract,
          (snapshot) => {
            if (!failed)
              emit({
                status: 'ready',
                review: snapshot.data,
                fromCache: snapshot.fromCache,
              });
          },
          fail,
        );
        if (failed) stop();
      } catch (error) {
        fail(
          error instanceof ContractReadError
            ? error
            : new ContractReadError('READ_FAILED'),
        );
      }
    return () => {
      active = false;
      stop?.();
    };
  }, [contract, authUid, key]);
  if (!contract) return { status: 'idle' };
  return result?.key === key ? result.state : { status: 'loading' };
}

export type ContractReviewsState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; error: ContractReadError }
  | { status: 'ready'; reviews: readonly ContractReview[]; fromCache: boolean };
export function useContractReviews(
  contract: Contract | undefined,
  authUid: string | undefined,
): ContractReviewsState {
  const id = contract?.id,
    familyId = contract?.familyId,
    parentUid = contract?.parentUid,
    childUid = contract?.childUid;
  // History scope does not change when a new round opens or lifecycle status changes.
  const key = JSON.stringify([id, familyId, parentUid, childUid, authUid]);
  const [result, setResult] = useState<{
    key: string;
    state: ContractReviewsState;
  }>();
  useEffect(() => {
    let active = true,
      failed = false;
    let stop: (() => void) | undefined;
    const fail = (error: ContractReadError) => {
      failed = true;
      if (active) setResult({ key, state: { status: 'error', error } });
      stop?.();
    };
    if (!id || !familyId || !parentUid || !childUid) return;
    if (!authUid) fail(new ContractReadError('AUTH_REQUIRED'));
    else
      try {
        // Only identity fields are used by the observer; no current-cycle/status inference.
        stop = observeContractReviews(
          { id, familyId, parentUid, childUid },
          (snapshot) => {
            if (active && !failed)
              setResult({
                key,
                state: {
                  status: 'ready',
                  reviews: snapshot.data,
                  fromCache: snapshot.fromCache,
                },
              });
          },
          fail,
        );
        if (failed) stop();
      } catch (error) {
        fail(
          error instanceof ContractReadError
            ? error
            : new ContractReadError('READ_FAILED'),
        );
      }
    return () => {
      active = false;
      stop?.();
    };
  }, [id, familyId, parentUid, childUid, authUid, key]);
  if (!contract) return { status: 'idle' };
  return result?.key === key ? result.state : { status: 'loading' };
}
