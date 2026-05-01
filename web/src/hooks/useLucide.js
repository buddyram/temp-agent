import { useEffect } from 'react';

export function refreshIcons() {
  if (typeof window !== 'undefined' && window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

export function useLucide(deps = []) {
  useEffect(() => { refreshIcons(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, deps);
}
