import { useState } from 'react';
import { Pressable } from 'react-native';
import {
  Ionicons,
  appLanguages,
  DesignText,
  FormMessage,
  homeTokens,
  t,
} from '@chorex/ui';
import { ParentSettingsSection } from '../navigation/ParentSettingsSection';
import { useParentLanguage } from './LanguageProvider';
export function LanguagePicker() {
  const { language, changeLanguage } = useParentLanguage();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const selected = appLanguages.find((option) => option.code === language)!;
  return (
    <ParentSettingsSection title={t('Language')}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('Language')}: ${selected.name}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{
          minHeight: 56,
          padding: homeTokens.spacing.medium,
          flexDirection: 'row',
          alignItems: 'center',
          gap: homeTokens.spacing.medium,
        }}
      >
        <DesignText accessible={false} style={{ fontSize: 24 }}>
          {selected.flag}
        </DesignText>
        <DesignText style={{ flex: 1, fontSize: 16, color: homeTokens.text }}>
          {selected.name}
        </DesignText>
        <Ionicons
          accessible={false}
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={homeTokens.secondary}
        />
      </Pressable>
      {open
        ? appLanguages.map((option) => (
            <Pressable
              key={option.code}
              accessibilityRole="radio"
              accessibilityLabel={option.name}
              accessibilityState={{ selected: language === option.code }}
              onPress={() => {
                setOpen(false);
                setError(false);
                if (changeLanguage)
                  void changeLanguage(option.code).catch(() => setError(true));
              }}
              style={{
                minHeight: 52,
                paddingHorizontal: homeTokens.spacing.medium,
                flexDirection: 'row',
                alignItems: 'center',
                gap: homeTokens.spacing.medium,
                backgroundColor:
                  language === option.code
                    ? homeTokens.blue
                    : homeTokens.surface,
              }}
            >
              <DesignText accessible={false} style={{ fontSize: 24 }}>
                {option.flag}
              </DesignText>
              <DesignText
                style={{ flex: 1, fontSize: 16, color: homeTokens.text }}
              >
                {option.name}
              </DesignText>
              {language === option.code ? (
                <Ionicons
                  accessible={false}
                  name="checkmark"
                  size={20}
                  color={homeTokens.text}
                />
              ) : null}
            </Pressable>
          ))
        : null}
      {error ? (
        <FormMessage message={t('Language could not be saved. Try again.')} />
      ) : null}
    </ParentSettingsSection>
  );
}
