import { browserLanguage, languageName, LANGUAGES, setLanguage, t, useLanguageChoice } from '@/i18n';
import { Card } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Form';

/** Picks the language of Jellyfied's own text, from the languages it has been translated to. */
export function LanguageCard() {
  const choice = useLanguageChoice();
  return (
    <Card title={t('settings.language.title')} description={t('settings.language.description')}>
      <Field label={t('settings.language.label')} hint={t('settings.language.count', { count: LANGUAGES.length })} className="max-w-sm">
        <Select value={choice ?? ''} onChange={(e) => setLanguage(e.target.value || null)}>
          <option value="">{t('settings.language.auto', { language: languageName(browserLanguage()) })}</option>
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageName(code)}
            </option>
          ))}
        </Select>
      </Field>
    </Card>
  );
}
