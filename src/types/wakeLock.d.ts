// Wake Lock API type definitions
interface WakeLockSentinel extends EventTarget {
  readonly type: 'screen';
  release(): Promise<void>;
  readonly released: boolean;
}

interface Navigator {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
}