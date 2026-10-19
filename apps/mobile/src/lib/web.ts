import { Linking } from 'react-native';
import { ASSET_BASE_URL } from './config';
import { getLocale } from './i18n';

/** Opens a page of the website in the phone's browser (same account there). */
export function openWebsite(path = ''): void {
  Linking.openURL(`${ASSET_BASE_URL}/${getLocale()}${path}`);
}
