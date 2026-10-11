import { t, useAppLanguage , SummaryMetric } from '@chorex/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useActiveContracts, useEarnedRewards } from '@chorex/firebase-client';

export function ChildHomeSummary({
  familyId,
  authUid,
}: {
  familyId: string;
  authUid: string;
}) {
  useAppLanguage();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const contracts = useActiveContracts(familyId, authUid);
  const rewards = useEarnedRewards(familyId, authUid);
  const deadlines =
    contracts.status === 'ready'
      ? contracts.contracts.map((c) => new Date(c.deadlineAt).getTime())
      : [];
  const next = deadlines.length ? Math.min(...deadlines) : undefined;
  const days =
    next === undefined ? undefined : Math.ceil((next - now) / 86400000);
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <SummaryMetric
        icon="checkbox-outline"
        label={
          contracts.status === 'ready' && contracts.fromCache
            ? t('Saved active contracts')
            : t('Active contracts')
        }
        value={
          contracts.status === 'ready'
            ? String(contracts.contracts.length)
            : '—'
        }
      />
      <SummaryMetric
        icon="calendar-outline"
        tone="blue"
        label={
          contracts.status === 'ready' && contracts.fromCache
            ? t('Saved next deadline')
            : t('Next deadline')
        }
        value={
          contracts.status !== 'ready'
            ? '—'
            : days === undefined
              ? t('None')
              : days < 0
                ? t('Past due')
                : days === 0
                  ? t('Today')
                  : t('{0} days', { '0': days })
        }
      />
      <SummaryMetric
        icon="gift-outline"
        tone="lavender"
        label={
          rewards.status === 'ready' && rewards.fromCache
            ? t('Saved earned rewards')
            : t('Earned rewards')
        }
        value={
          rewards.status === 'ready' ? String(rewards.rewards.length) : '—'
        }
      />
    </View>
  );
}
