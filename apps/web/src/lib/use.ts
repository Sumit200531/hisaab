import { useSyncExternalStore } from 'react';
import { app } from './app';

/** Re-render whenever app state changes; components read `app` directly. */
export function useApp() {
  useSyncExternalStore(app.subscribe, app.getVersion);
  return app;
}
