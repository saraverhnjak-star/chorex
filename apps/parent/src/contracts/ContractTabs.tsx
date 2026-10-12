import { useAppLanguage, StatusTabs, homeTokens } from '@chorex/ui';
import {
  useActiveContracts,
  useReadyForReviewContracts,
} from '@chorex/firebase-client';
import { useState } from 'react';
import { View } from 'react-native';
import { ActiveContracts, ReadyForReviewContracts } from './ActiveContracts';

export function ContractTabs(props: {
  familyId: string;
  authUid: string;
  childNames: Readonly<Record<string, string>>;
}) {
  useAppLanguage();
  const [selected, setSelected] = useState<'active' | 'review'>('review');
  const active = useActiveContracts(props.familyId, props.authUid);
  const review = useReadyForReviewContracts(props.familyId, props.authUid);
  if (active.status === 'loading' || review.status === 'loading') return null;
  const List =
    selected === 'active' ? ActiveContracts : ReadyForReviewContracts;
  return (
    <View style={{ gap: homeTokens.spacing.section }}>
      <StatusTabs
        tone="neutral"
        labels={['For review', 'Active']}
        selected={selected === 'review' ? 'For review' : 'Active'}
        onSelect={(label) =>
          setSelected(label === 'For review' ? 'review' : 'active')
        }
        counts={{
          'For review': review.status === 'ready' ? review.contracts.length : 0,
          Active: active.status === 'ready' ? active.contracts.length : 0,
        }}
      />
      <List {...props} showHeading={false} />
    </View>
  );
}
