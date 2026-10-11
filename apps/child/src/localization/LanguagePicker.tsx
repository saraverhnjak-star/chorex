import { NativeLanguageSelect, SettingsSection, t } from '@chorex/ui';
import { useChildLanguage } from './LanguageProvider';
export function LanguagePicker() {
  const { language, changeLanguage } = useChildLanguage();
  return (
    <SettingsSection title={t('Language')}>
      <NativeLanguageSelect
        value={language}
        onChange={changeLanguage ?? (() => Promise.resolve())}
      />
    </SettingsSection>
  );
}
