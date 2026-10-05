import {
  type RequestContractChangesOutput,
  type ContractCommandErrorCode,
} from '@chorex/domain';
import { type Firestore } from 'firebase-admin/firestore';
import {
  executeParentReviewDecision,
  ParentReviewCommandError,
} from './parentReviewDecision';
export class RequestContractChangesCommandError extends Error {
  constructor(readonly code: ContractCommandErrorCode) {
    super(code);
    this.name = 'RequestContractChangesCommandError';
  }
}
export async function executeRequestContractChanges(
  firestore: Firestore,
  actorUid: string | undefined,
  input: unknown,
): Promise<RequestContractChangesOutput> {
  try {
    return await executeParentReviewDecision(
      firestore,
      actorUid,
      input,
      'REQUEST_CHANGES',
    );
  } catch (error) {
    if (error instanceof ParentReviewCommandError)
      throw new RequestContractChangesCommandError(error.code);
    throw error;
  }
}
