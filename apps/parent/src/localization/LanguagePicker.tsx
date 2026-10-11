import { NativeLanguageSelect, t } from '@chorex/ui';
import { ParentSettingsSection } from '../navigation/ParentSettingsSection';
import { useParentLanguage } from './LanguageProvider';
export function LanguagePicker() {
  const { language, changeLanguage } = useParentLanguage();
  return (
    <ParentSettingsSection title={t('Language')}>
      <NativeLanguageSelect
        value={language}
        onChange={changeLanguage ?? (() => Promise.resolve())}
      />
    </ParentSettingsSection>
  );
}
