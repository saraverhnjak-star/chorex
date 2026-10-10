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
  museum: require('../assets/rewards/museum.png'),
  sleepover: require('../assets/rewards/sleepover.png'),
  'shopping-treat': require('../assets/rewards/shopping-treat.png'),
  'baking-together': require('../assets/rewards/baking-together.png'),
  zoo: require('../assets/rewards/zoo.png'),
  'concert-music': require('../assets/rewards/concert-music.png'),
  swimming: require('../assets/rewards/swimming.png'),
  'football-match': require('../assets/rewards/football-match.png'),
  'choose-dinner': require('../assets/rewards/choose-dinner.png'),
  'amusement-park': require('../assets/rewards/amusement-park.png'),
  'mini-golf': require('../assets/rewards/mini-golf.png'),
  'new-toy': require('../assets/rewards/new-toy.png'),
  'later-bedtime': require('../assets/rewards/later-bedtime.png'),
  bowling: require('../assets/rewards/bowling.png'),
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
  museum: 'Museum',
  sleepover: 'Sleepover',
  'shopping-treat': 'Shopping treat',
  'baking-together': 'Baking together',
  zoo: 'Zoo',
  'concert-music': 'Concert',
  swimming: 'Swimming',
  'football-match': 'Football match',
  'choose-dinner': 'Choose dinner',
  'amusement-park': 'Amusement park',
  'mini-golf': 'Mini golf',
  'new-toy': 'New toy',
  'later-bedtime': 'Later bedtime',
  bowling: 'Bowling',
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
