import { Image, type ImageSourcePropType } from 'react-native';
import {
  rewardIconKeySchema,
  rewardTypeSchema,
  rewardTypeDefaultIcons,
  type RewardIconKey,
} from '@chorex/domain';

// Metro requires static asset references; domain keys never import these modules.
export const rewardIconAssets = {
  gift: require('../assets/rewards/surprise-gift.png'),
  trip: require('../assets/rewards/family-trip.png'),
  cinema: require('../assets/rewards/cinema.png'),
  book: require('../assets/rewards/new-book.png'),
  money: require('../assets/rewards/pocket-money.png'),
  'screen-time': require('../assets/rewards/extra-screen-time.png'),
  plant: require('../assets/rewards/new-plant.png'),
  pizza: require('../assets/rewards/pizza-night.png'),
  'ice-cream': require('../assets/rewards/ice-cream.png'),
  'game-night': require('../assets/rewards/game-night.png'),
} satisfies Record<RewardIconKey, ImageSourcePropType>;

export const rewardIconLabels = {
  gift: 'Gift',
  trip: 'Family trip',
  cinema: 'Cinema',
  book: 'Book',
  money: 'Pocket money',
  'screen-time': 'Screen time',
  plant: 'Plant',
  pizza: 'Pizza night',
  'ice-cream': 'Ice cream',
  'game-night': 'Game night',
} satisfies Record<RewardIconKey, string>;

export function resolveRewardIconKey(terms: {
  iconKey?: unknown;
  type?: unknown;
}): RewardIconKey {
  const key = rewardIconKeySchema.safeParse(terms.iconKey);
  if (key.success && rewardIconAssets[key.data]) return key.data;
  const type = rewardTypeSchema.safeParse(terms.type);
  const fallback = type.success ? rewardTypeDefaultIcons[type.data] : 'gift';
  return rewardIconAssets[fallback] ? fallback : 'gift';
}
export function RewardIcon({
  terms,
  size = 44,
}: {
  terms: { iconKey?: unknown; type?: unknown };
  size?: number;
}) {
  return (
    <Image
      accessible={false}
      source={rewardIconAssets[resolveRewardIconKey(terms)]}
      resizeMode="contain"
      style={{ width: size, height: size }}
    />
  );
}
