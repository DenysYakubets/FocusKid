import * as Application from 'expo-application';
import Constants from 'expo-constants';

export function installedAppVersion(): string | null {
  // Some environments have no value from the native module, so use the Expo config version.
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;
}
