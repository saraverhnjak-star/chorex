import { useEffect, useState } from 'react';
import type { Contract, ContractTask } from '@chorex/domain';
import { observeContract, observeTasks, observeActiveContracts } from './index';
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
  const key = JSON.stringify([familyId, authUid]);
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
      stop = observeActiveContracts(
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
  }, [familyId, authUid, key]);
  return result?.key === key ? result.state : { status: 'loading' };
}
