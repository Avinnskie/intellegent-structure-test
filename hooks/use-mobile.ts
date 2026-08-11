import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Versi shadcn bawaan memanggil setState di dalam effect, yang dilarang oleh
 * aturan `react-hooks/set-state-in-effect` pada proyek ini. `useSyncExternalStore`
 * adalah cara idiomatik untuk berlangganan store eksternal seperti matchMedia,
 * sekaligus aman terhadap SSR karena punya snapshot server tersendiri.
 */
function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
