import * as Localization from "expo-localization";
import { Storage } from "expo-sqlite/kv-store";
import * as SystemUI from "expo-system-ui";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Appearance, Platform, useColorScheme } from "react-native";
import { resolveLanguage, setLanguage, type Language, type LanguagePreference } from "@/i18n";
import { palettes, resolveScheme, ThemeContext, type Scheme, type ThemeMode } from "@/theme";

/**
 * Preferencias de la interfaz: tema (sistema, claro u oscuro) e idioma. Se guardan en el almacén
 * clave-valor de SQLite, que se lee de forma síncrona al arrancar para que la primera pantalla ya
 * salga con el tema y el idioma correctos. No son datos de entrenamiento: no se exportan ni se borran
 * con «Borrar mis datos».
 *
 * Cambiar el idioma vuelve a montar la navegación (ver `src/i18n/index.ts`). Si el idioma es el del
 * teléfono y este cambia con la app abierta, se aplica al volver a abrirla.
 */

export type Preferences = { theme: ThemeMode; language: LanguagePreference };

const KEY = "preferencias";
const DEFAULTS: Preferences = { theme: "system", language: "system" };
const THEMES: readonly ThemeMode[] = ["system", "light", "dark"];
const LANGUAGES: readonly LanguagePreference[] = ["system", "es", "en", "fr", "de"];

function readRaw(): string | null {
  // En la vista web el almacén de SQLite no es síncrono: se usa el del navegador.
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) ?? null;
  return Storage.getItemSync(KEY);
}

function writeRaw(value: string): void {
  if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, value);
  else Storage.setItemSync(KEY, value);
}

function readPreferences(): Preferences {
  try {
    const raw = readRaw();
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme: saved.theme && THEMES.includes(saved.theme) ? saved.theme : DEFAULTS.theme,
      language: saved.language && LANGUAGES.includes(saved.language) ? saved.language : DEFAULTS.language,
    };
  } catch {
    return DEFAULTS;
  }
}

function writePreferences(preferences: Preferences): void {
  try {
    writeRaw(JSON.stringify(preferences));
  } catch {
    // Si no se puede guardar, el cambio vale hasta cerrar la app.
  }
}

function deviceLanguages(): string[] {
  try {
    return Localization.getLocales().map((locale) => locale.languageCode ?? locale.languageTag);
  } catch {
    return [];
  }
}

// El idioma se fija antes de que se dibuje nada.
const initial = readPreferences();
setLanguage(resolveLanguage(initial.language, deviceLanguages()));

type PreferencesValue = {
  preferences: Preferences;
  /** Tema efectivo (el del teléfono si se eligió «sistema»). */
  scheme: Scheme;
  /** Idioma efectivo. */
  language: Language;
  setThemeMode: (theme: ThemeMode) => void;
  setLanguagePreference: (language: LanguagePreference) => void;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(initial);
  const [language, setActiveLanguage] = useState<Language>(() => resolveLanguage(initial.language, deviceLanguages()));
  const scheme = resolveScheme(preferences.theme, useColorScheme());
  const palette = palettes[scheme];

  // Los diálogos del sistema (alertas, selectores) siguen el tema elegido; «unspecified» vuelve al del teléfono.
  useEffect(() => {
    try {
      Appearance.setColorScheme(preferences.theme === "system" ? "unspecified" : preferences.theme);
    } catch {
      // Plataformas sin esta opción: los diálogos siguen el tema del teléfono.
    }
  }, [preferences.theme]);

  // Fondo de la vista raíz (lo que se ve detrás de las pantallas al cambiar de una a otra).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette.bg).catch(() => undefined);
  }, [palette.bg]);

  const setThemeMode = (theme: ThemeMode) => {
    const next = { ...preferences, theme };
    writePreferences(next);
    setPreferences(next);
  };

  const setLanguagePreference = (preference: LanguagePreference) => {
    const next = { ...preferences, language: preference };
    writePreferences(next);
    const resolved = resolveLanguage(preference, deviceLanguages());
    setLanguage(resolved);
    setActiveLanguage(resolved);
    setPreferences(next);
  };

  return (
    <PreferencesContext.Provider value={{ preferences, scheme, language, setThemeMode, setLanguagePreference }}>
      <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences debe usarse dentro de <PreferencesProvider>.");
  return value;
}
