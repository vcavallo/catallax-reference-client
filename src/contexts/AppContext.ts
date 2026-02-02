import { createContext } from "react";

export type Theme = "dark" | "light" | "system";
export type RelayMode = "default" | "user" | "custom";

export interface AppConfig {
  /** Current theme */
  theme: Theme;
  /** Selected relay URL (legacy, kept for compatibility) */
  relayUrl: string;
  /** Which relay set to use */
  relayMode: RelayMode;
  /** Custom single relay URL (when relayMode is "custom") */
  customRelay?: string;
  /** Cached user relays from NIP-65 (when relayMode is "user") */
  userRelays?: string[];
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: AppConfig) => AppConfig) => void;
  /** Optional list of preset relays to display in the RelaySelector */
  presetRelays?: { name: string; url: string }[];
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
