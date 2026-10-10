import { Redirect, useLocalSearchParams } from 'expo-router';
import { ChildSurface } from '../../src/navigation/ChildSurface';
export default function OfferScreen() {
  const { offerId, counterOfferId } = useLocalSearchParams<{
    offerId?: string | string[];
    counterOfferId?: string | string[];
  }>();
  if (typeof offerId !== 'string' || !offerId)
    return <Redirect href="/offers" />;
  return (
    <ChildSurface
      key={offerId}
      area="offers"
      offerId={offerId}
      initialCounterOfferId={
        typeof counterOfferId === 'string' ? counterOfferId : undefined
      }
    />
  );
}
