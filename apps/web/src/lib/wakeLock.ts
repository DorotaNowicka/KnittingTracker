import { useEffect, useState } from 'react';

export type WakeLockStatus = 'off' | 'active' | 'unsupported' | 'denied';

/**
 * Keep the screen on while knitting (FR-16). The lock is released by the browser whenever the
 * page is hidden, so it is re-acquired on `visibilitychange`.
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [status, setStatus] = useState<'off' | 'active' | 'denied'>('off');

  useEffect(() => {
    if (!enabled || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        setStatus('active');
        sentinel.addEventListener('release', () => {
          if (!cancelled) setStatus('off');
        });
      } catch {
        setStatus('denied');
      }
    };
    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled, supported]);

  if (!enabled) return 'off';
  return supported ? status : 'unsupported';
}
