import type { RewardTerms } from './offer';
import type { RewardIconKey } from './rewardIcons';

export const rewardPresets = {
  gift: { title: 'Surprise gift', type: 'ITEM', iconKey: 'gift' },
  trip: { title: 'Family trip', type: 'EXPERIENCE', iconKey: 'trip' },
  cinema: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' },
  book: { title: 'Book', type: 'ITEM', iconKey: 'book' },
  money: { title: 'Pocket money', type: 'MONEY', iconKey: 'money' },
  'screen-time': {
    title: 'Screen time',
    type: 'PRIVILEGE',
    iconKey: 'screen-time',
  },
  plant: { title: 'Plant', type: 'ITEM', iconKey: 'plant' },
  pizza: { title: 'Pizza night', type: 'EXPERIENCE', iconKey: 'pizza' },
  'ice-cream': { title: 'Ice cream', type: 'ITEM', iconKey: 'ice-cream' },
  'game-night': {
    title: 'Game night',
    type: 'EXPERIENCE',
    iconKey: 'game-night',
  },
  museum: { title: 'Museum', type: 'EXPERIENCE', iconKey: 'museum' },
  sleepover: { title: 'Sleepover', type: 'EXPERIENCE', iconKey: 'sleepover' },
  'shopping-treat': {
    title: 'Shopping treat',
    type: 'ITEM',
    iconKey: 'shopping-treat',
  },
  'baking-together': {
    title: 'Baking together',
    type: 'EXPERIENCE',
    iconKey: 'baking-together',
  },
  zoo: { title: 'Zoo', type: 'EXPERIENCE', iconKey: 'zoo' },
  'concert-music': {
    title: 'Concert',
    type: 'EXPERIENCE',
    iconKey: 'concert-music',
  },
  swimming: { title: 'Swimming', type: 'EXPERIENCE', iconKey: 'swimming' },
  'football-match': {
    title: 'Football match',
    type: 'EXPERIENCE',
    iconKey: 'football-match',
  },
  'choose-dinner': {
    title: 'Choose dinner',
    type: 'PRIVILEGE',
    iconKey: 'choose-dinner',
  },
  'amusement-park': {
    title: 'Amusement park',
    type: 'EXPERIENCE',
    iconKey: 'amusement-park',
  },
  'mini-golf': { title: 'Mini golf', type: 'EXPERIENCE', iconKey: 'mini-golf' },
  'new-toy': { title: 'New toy', type: 'ITEM', iconKey: 'new-toy' },
  'later-bedtime': {
    title: 'Later bedtime',
    type: 'PRIVILEGE',
    iconKey: 'later-bedtime',
  },
  bowling: { title: 'Bowling', type: 'EXPERIENCE', iconKey: 'bowling' },
} as const satisfies Record<RewardIconKey, RewardTerms>;
export type RewardSelection = RewardIconKey | 'custom';
export function rewardSelectionFor(
  terms: Pick<RewardTerms, 'title' | 'type' | 'iconKey'>,
): RewardSelection {
  const preset = rewardPresets[terms.iconKey];
  return preset && preset.title === terms.title && preset.type === terms.type
    ? terms.iconKey
    : 'custom';
}
export function rewardTermsForSelection(
  selection: RewardSelection,
): RewardTerms {
  return selection === 'custom'
    ? { title: '', type: 'CUSTOM', iconKey: 'gift' }
    : { ...rewardPresets[selection] };
}
