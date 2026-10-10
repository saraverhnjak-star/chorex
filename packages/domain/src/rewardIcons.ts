import { z } from 'zod';
import type { RewardType } from './offer';

export const rewardIconKeys = [
  'gift',
  'trip',
  'cinema',
  'book',
  'money',
  'screen-time',
  'plant',
  'pizza',
  'ice-cream',
  'game-night',
  'museum',
  'sleepover',
  'shopping-treat',
  'baking-together',
  'zoo',
  'concert-music',
  'swimming',
  'football-match',
  'choose-dinner',
  'amusement-park',
  'mini-golf',
  'new-toy',
  'later-bedtime',
  'bowling',
] as const;
export const rewardIconKeySchema = z.enum(rewardIconKeys);
export type RewardIconKey = z.output<typeof rewardIconKeySchema>;

export const rewardTypeDefaultIcons = {
  EXPERIENCE: 'cinema',
  ITEM: 'gift',
  MONEY: 'money',
  PRIVILEGE: 'screen-time',
  CUSTOM: 'gift',
} as const satisfies Record<RewardType, RewardIconKey>;
