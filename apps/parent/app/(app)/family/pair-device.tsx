import { useLocalSearchParams } from 'expo-router';
import { PairDeviceScreen } from '../../../src/family/PairDeviceScreen';
export default function PairDeviceRoute() {
  const { childUid } = useLocalSearchParams<{ childUid?: string | string[] }>();
  return (
    <PairDeviceScreen childUid={typeof childUid === 'string' ? childUid : ''} />
  );
}
