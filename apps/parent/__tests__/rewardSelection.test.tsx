import {
  rewardIconKeys,
  rewardIconKeySchema,
  rewardPresets,
  rewardSelectionFor,
  rewardTermsForSelection,
  rewardTermsSchema,
} from '@chorex/domain';

test('all 24 artwork choices produce valid reward terms and round-trip their selection', () => {
  expect(rewardIconKeys).toHaveLength(24);
  for (const key of rewardIconKeys) {
    const terms = rewardTermsForSelection(key);
    expect(rewardIconKeySchema.parse(key)).toBe(key);
    expect(rewardTermsSchema.parse(terms)).toEqual(rewardPresets[key]);
    expect(rewardSelectionFor(terms)).toBe(key);
  }
});
test('custom and older negotiated titles and types are preserved as Custom', () => {
  expect(rewardTermsForSelection('custom')).toEqual({
    title: '',
    type: 'CUSTOM',
    iconKey: 'gift',
  });
  expect(
    rewardSelectionFor({
      title: 'Cinema with grandma',
      type: 'EXPERIENCE',
      iconKey: 'cinema',
    }),
  ).toBe('custom');
  expect(
    rewardSelectionFor({ title: 'Cinema', type: 'CUSTOM', iconKey: 'cinema' }),
  ).toBe('custom');
});
