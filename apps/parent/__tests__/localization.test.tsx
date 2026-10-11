import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import {
  DesignText,
  HomeFeatureCard,
  setAppLanguage,
  t,
  translateMessage,
  useAppLanguage,
  dateLocale,
} from '@chorex/ui';
import { LanguageProvider } from '../src/localization/LanguageProvider';
import { LanguagePicker } from '../src/localization/LanguagePicker';
import { de } from '../../../packages/ui/src/locales/de';
import { sl } from '../../../packages/ui/src/locales/sl';
import { hr } from '../../../packages/ui/src/locales/hr';
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
const readLanguage = jest.mocked(SecureStore.getItemAsync);
const saveLanguage = jest.mocked(SecureStore.setItemAsync);
function ProductCopy() {
  useAppLanguage();
  return (
    <>
      <DesignText>{t('Create offer')}</DesignText>
      <HomeFeatureCard
        title="Home"
        detail="Custom family content"
        reward={{ type: 'CUSTOM', iconKey: 'gift' }}
        tone="mint"
      />
    </>
  );
}
beforeEach(() => {
  readLanguage.mockReset();
  saveLanguage.mockReset();
  setAppLanguage('en');
  readLanguage.mockResolvedValue(null);
  saveLanguage.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => setAppLanguage('en'));
});
it('restores the stored language before rendering product copy', async () => {
  let finish!: (value: string) => void;
  readLanguage.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <LanguageProvider>
      <ProductCopy />
    </LanguageProvider>,
  );
  expect(screen.queryByText('Create offer')).toBeNull();
  await act(async () => finish('de'));
  expect(screen.getByText('Angebot erstellen')).toBeOnTheScreen();
  expect(screen.getByText('Home')).toBeOnTheScreen();
  expect(dateLocale()).toBe('de-DE');
});
it('shows native language names and flags, updates immediately and persists the choice', async () => {
  render(
    <LanguageProvider>
      <LanguagePicker />
      <ProductCopy />
    </LanguageProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Language: English')).toBeOnTheScreen(),
  );
  fireEvent.press(screen.getByLabelText('Language: English'));
  const picker = screen.getByTestId('language-native-picker');
  expect(
    picker.props.items.map((item: { label: string }) => item.label),
  ).toEqual(['🇬🇧 English', '🇩🇪 Deutsch', '🇸🇮 Slovenščina', '🇭🇷 Hrvatski']);
  fireEvent(picker, 'change', { nativeEvent: { newValue: 'sl', newIndex: 2 } });
  expect(saveLanguage).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByLabelText('Jezik: Slovenščina')).toBeOnTheScreen();
  expect(screen.getByText('Ustvari ponudbo')).toBeOnTheScreen();
  expect(screen.getByText('Home')).toBeOnTheScreen();
  await waitFor(() =>
    expect(saveLanguage).toHaveBeenCalledWith('chorex.parent.language', 'sl'),
  );
});
it('falls back safely when storage fails and reports a failed language save', async () => {
  readLanguage.mockRejectedValueOnce(new Error('unavailable'));
  saveLanguage.mockRejectedValueOnce(new Error('unavailable'));
  render(
    <LanguageProvider>
      <LanguagePicker />
    </LanguageProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Language: English')).toBeOnTheScreen(),
  );
  fireEvent.press(screen.getByLabelText('Language: English'));
  fireEvent(screen.getByTestId('language-native-picker'), 'change', {
    nativeEvent: { newValue: 'hr', newIndex: 3 },
  });
  fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() =>
    expect(
      screen.getByText('Language could not be saved. Try again.'),
    ).toBeOnTheScreen(),
  );
  expect(screen.getByLabelText('Language: English')).toBeOnTheScreen();
});
it('localizes errors and interpolation without translating inserted user content', () => {
  setAppLanguage('sl');
  expect(translateMessage('Email is required.')).toBe('E-pošta je obvezna.');
  expect(translateMessage('Use at least 6 characters.')).toBe(
    'Uporabi vsaj 6 znakov.',
  );
  expect(
    translateMessage('Too big: expected string to have <=80 characters'),
  ).toBe('Vnesi največ 80 znakov.');
  expect(t('Agreement with {0}', { '0': 'Home' })).toBe(
    'Dogovor z otrokom Home',
  );
  setAppLanguage('hr');
  expect(t('Your turn')).toBe('Ti si na redu');
});
it('has complete catalogs with matching interpolation parameters for all product translation calls', () => {
  const catalogs = [de, sl, hr];
  const params = (value: string) => (value.match(/\{\d+\}/g) ?? []).sort();
  for (const catalog of catalogs) {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(de).sort());
    for (const [key, value] of Object.entries(catalog)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(params(value)).toEqual(params(key));
    }
  }
});

it('does not save a wheel selection when the native sheet is cancelled', async () => {
  render(
    <LanguageProvider>
      <LanguagePicker />
    </LanguageProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Language: English')).toBeOnTheScreen(),
  );
  fireEvent.press(screen.getByLabelText('Language: English'));
  fireEvent(screen.getByTestId('language-native-picker'), 'change', {
    nativeEvent: { newValue: 'de', newIndex: 1 },
  });
  fireEvent.press(screen.getAllByRole('button', { name: 'Cancel' }).at(-1)!);
  expect(saveLanguage).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Language: English')).toBeOnTheScreen();
  fireEvent.press(screen.getByLabelText('Language: English'));
  expect(screen.getByTestId('language-native-picker').props.selectedIndex).toBe(
    0,
  );
});
