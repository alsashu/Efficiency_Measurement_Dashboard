import { useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export const useAutoSave = ({ data, saveFn, delay = 2000, enabled = true }) => {
  const timerRef = useRef(null);
  const lastSaved = useRef(null);

  const mutation = useMutation({
    mutationFn: saveFn,
    onSuccess: () => {
      lastSaved.current = Date.now();
      toast.success('Auto-saved', { id: 'autosave', duration: 1500, style: { fontSize: '12px' } });
    },
    onError: (err) => toast.error(`Auto-save failed: ${err.message}`, { id: 'autosave-err' }),
  });

  const triggerSave = useCallback(() => {
    if (!enabled || mutation.isPending) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => mutation.mutate(data), delay);
  }, [data, saveFn, delay, enabled, mutation.isPending]);

  useEffect(() => {
    if (!enabled) return;
    triggerSave();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [JSON.stringify(data)]);

  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    mutation.mutate(data);
  }, [data, mutation]);

  return { isSaving: mutation.isPending, saveNow, lastSaved: lastSaved.current };
};
