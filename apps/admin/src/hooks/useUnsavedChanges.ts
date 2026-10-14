import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmDialog';

/**
 * Warn before leaving a page with unsaved changes — both in-app navigation
 * (links, back button) and closing or reloading the tab.
 * `isDirty` is read at navigation time, so it can be an inexpensive check.
 */
export function useUnsavedChanges(isDirty: () => boolean, message = 'You have changes that haven’t been saved. If you leave now they’ll be lost.') {
  const confirm = useConfirm();
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    currentLocation.pathname !== nextLocation.pathname && dirtyRef.current());

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    confirm({ title: 'Leave without saving?', message, confirmLabel: 'Leave', cancelLabel: 'Stay', danger: true })
      .then((leave) => (leave ? blocker.proceed?.() : blocker.reset?.()));
  }, [blocker.state]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
