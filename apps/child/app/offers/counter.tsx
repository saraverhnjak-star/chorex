import { Redirect, useLocalSearchParams } from 'expo-router';
import { ChildSurface } from '../../src/navigation/ChildSurface';

export default function CounterOfferScreen() {
  const { offerId } = useLocalSearchParams<{ offerId?: string | string[] }>();
  if (typeof offerId !== 'string' || !offerId)
    return <Redirect href="/offers" />;
  return (
    <ChildSurface
      key={offerId}
      area="offers"
      offerId={offerId}
      initialCounterOfferId={offerId}
    />
  );
}
