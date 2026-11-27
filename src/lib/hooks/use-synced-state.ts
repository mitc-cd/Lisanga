"use client";
import { useState } from "react";

/**
 * État local initialisé depuis une prop et réinitialisé quand la prop change
 * (motif « ajuster l'état pendant le rendu » recommandé par React, sans effet).
 */
export function useSyncedState<T>(value: T, enabled = true) {
  const [state, setState] = useState(value);
  const [prev, setPrev] = useState(value);
  if (enabled && !Object.is(prev, value)) {
    setPrev(value);
    setState(value);
  }
  return [state, setState] as const;
}
