import { recordOperationalError } from './observabilityCore';
import {
  contractReviewSchema,
  type ContractReview,
  contractSchema,
  contractTaskSchema,
  type Contract,
  type ContractTask,
} from '@chorex/domain';

export interface ReadSnapshot<T> {
  data: T;
  fromCache: boolean;
}
export class ContractReadError extends Error {
  constructor(
    public readonly code:
      | 'AUTH_REQUIRED'
      | 'INVALID_INPUT'
      | 'FORBIDDEN'
      | 'NETWORK_UNAVAILABLE'
      | 'MALFORMED_DATA'
      | 'READ_FAILED',
  ) {
    super(code);
    this.name = 'ContractReadError';
  }
}
export function translateContractReadError(error: unknown): ContractReadError {
  if (error instanceof ContractReadError) {
    recordOperationalError(error, 'contractRead', error.code);
    return error;
  }
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  if (code.endsWith('permission-denied'))
    return new ContractReadError('FORBIDDEN');
  if (code.endsWith('unavailable'))
    return new ContractReadError('NETWORK_UNAVAILABLE');
  recordOperationalError(error, 'contractRead', 'READ_FAILED');
  return new ContractReadError('READ_FAILED');
}
function iso(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('toDate' in value) ||
    typeof value.toDate !== 'function'
  )
    throw new ContractReadError('MALFORMED_DATA');
  const date: unknown = value.toDate();
  if (!(date instanceof Date) || Number.isNaN(date.valueOf()))
    throw new ContractReadError('MALFORMED_DATA');
  return date.toISOString();
}
export function deserializeContract(
  id: string,
  data: Record<string, unknown>,
): Contract {
  try {
    const contract = contractSchema.parse({
      id,
      familyId: data.familyId,
      parentUid: data.parentUid,
      childUid: data.childUid,
      source: data.source,
      rewardTerms: data.rewardTerms,
      deadlineAt: iso(data.deadlineAt),
      status: data.status,
      reviewCycle: data.reviewCycle,
      ...(data.approvedAt === undefined
        ? {}
        : { approvedAt: iso(data.approvedAt) }),
      createdAt: iso(data.createdAt),
      updatedAt: iso(data.updatedAt),
    });
    if (
      !Array.isArray(data.participantUids) ||
      data.participantUids.length !== 2 ||
      !data.participantUids.includes(contract.parentUid) ||
      !data.participantUids.includes(contract.childUid) ||
      contract.parentUid === contract.childUid
    )
      throw new ContractReadError('MALFORMED_DATA');
    return contract;
  } catch {
    throw new ContractReadError('MALFORMED_DATA');
  }
}
export function deserializeTasks(
  contractId: string,
  documents: readonly { id: string; data: Record<string, unknown> }[],
): ContractTask[] {
  try {
    return documents
      .map(({ id, data }) => {
        const task = contractTaskSchema.parse({
          id,
          familyId: data.familyId,
          contractId: data.contractId,
          assigneeUid: data.assigneeUid,
          title: data.title,
          ...(data.description === undefined
            ? {}
            : { description: data.description }),
          targetCount: data.targetCount,
          completedCount: data.completedCount,
          ...(data.lastCompletedAt === undefined
            ? {}
            : { lastCompletedAt: iso(data.lastCompletedAt) }),
          createdAt: iso(data.createdAt),
          updatedAt: iso(data.updatedAt),
        });
        if (task.contractId !== contractId)
          throw new ContractReadError('MALFORMED_DATA');
        return task;
      })
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  } catch {
    throw new ContractReadError('MALFORMED_DATA');
  }
}

function deserializeReview(
  id: string,
  data: Record<string, unknown>,
  contract: Pick<Contract, 'id' | 'familyId' | 'parentUid'>,
): ContractReview {
  try {
    const review = contractReviewSchema.parse({
      id,
      familyId: data.familyId,
      contractId: data.contractId,
      cycle: data.cycle,
      reviewerUid: data.reviewerUid,
      decision: data.decision,
      ...(data.note === undefined ? {} : { note: data.note }),
      createdAt: iso(data.createdAt),
    });
    if (
      review.familyId !== contract.familyId ||
      review.contractId !== contract.id ||
      review.reviewerUid !== contract.parentUid
    )
      throw new ContractReadError('MALFORMED_DATA');
    return review;
  } catch {
    throw new ContractReadError('MALFORMED_DATA');
  }
}
export function deserializeContractReview(
  id: string,
  data: Record<string, unknown>,
  contract: Contract,
): ContractReview {
  const review = deserializeReview(id, data, contract);
  if (
    review.cycle !== contract.reviewCycle ||
    (contract.status === 'CHANGES_REQUESTED' &&
      (review.decision !== 'REQUEST_CHANGES' || !review.note))
  )
    throw new ContractReadError('MALFORMED_DATA');
  return review;
}
export function deserializeContractReviews(
  documents: readonly { id: string; data: Record<string, unknown> }[],
  contract: Pick<Contract, 'id' | 'familyId' | 'parentUid'>,
): ContractReview[] {
  const cycles = new Set<number>();
  return documents
    .map(({ id, data }) => {
      const review = deserializeReview(id, data, contract);
      if (
        cycles.has(review.cycle) ||
        (review.decision === 'REQUEST_CHANGES' && !review.note)
      )
        throw new ContractReadError('MALFORMED_DATA');
      cycles.add(review.cycle);
      return review;
    })
    .sort((a, b) => a.cycle - b.cycle);
}
