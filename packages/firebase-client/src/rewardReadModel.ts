import { rewardSchema, type EarnedReward } from '@chorex/domain';
import { ContractReadError } from './contractReadModel';
export { ContractReadError as RewardReadError } from './contractReadModel';
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
export function deserializeReward(
  id: string,
  data: Record<string, unknown>,
): EarnedReward {
  try {
    return rewardSchema.parse({
      id,
      familyId: data.familyId,
      contractId: data.contractId,
      parentUid: data.parentUid,
      childUid: data.childUid,
      terms: data.terms,
      status: data.status,
      earnedAt: iso(data.earnedAt),
      ...(data.deliveredAt === undefined
        ? {}
        : { deliveredAt: iso(data.deliveredAt) }),
      ...(data.deliveredBy === undefined
        ? {}
        : { deliveredBy: data.deliveredBy }),
      ...(data.confirmedAt === undefined
        ? {}
        : { confirmedAt: iso(data.confirmedAt) }),
      ...(data.confirmedBy === undefined
        ? {}
        : { confirmedBy: data.confirmedBy }),
      ...(data.fulfilledAt === undefined
        ? {}
        : { fulfilledAt: iso(data.fulfilledAt) }),
    });
  } catch {
    throw new ContractReadError('MALFORMED_DATA');
  }
}
