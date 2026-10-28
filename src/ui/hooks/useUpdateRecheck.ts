import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Returns a counter that increments every time the screen regains focus, so
 * <UpdateChecker recheckKey={key} /> refetches the manifest on navigation back
 * to a parent screen (ADR-006: the fetch stays silent, no manual button).
 */
export function useUpdateRecheck(): number {
  const [key, setKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setKey((n) => n + 1);
    }, [])
  );
  return key;
}