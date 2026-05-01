import { setLang, useLang, type Lang } from '../i18n';

const LANGS: Lang[] = ['en', 'ru'];

export function LanguageSwitcher() {
  const lang = useLang();
  return (
    <span className="lang-switcher" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`lang-pill ${lang === l ? 'active' : ''}`}
          aria-pressed={lang === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </span>
  );
}
