import { useLocalSearchParams } from 'expo-router';
import { ChildSurface } from '../../src/navigation/ChildSurface';
export default function Collection() {
  const { counterOfferId } = useLocalSearchParams<{
    counterOfferId?: string;
  }>();
  return <ChildSurface area="offers" initialCounterOfferId={counterOfferId} />;
}
