import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// The service worker only exists in the exported web build (public/sw.js);
// during `expo start --web` this quietly fails, which is fine — push is a
// production-only concern.
if (
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator
) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
