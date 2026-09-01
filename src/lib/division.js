/**
 * The app-wide division switch: Food or BSA (Personal Care).
 *
 * The tooling is identical for both — pipeline, review flow, tables — so the only
 * difference is WHICH rows are read and what new uploads are tagged as. This module
 * is the single source of truth for that choice, so no page invents its own filter.
 */
import { useEffect, useState } from 'react';

const KEY = 'tp_division';
const EVENT = 'tp_division_change';

export const DIVISIONS = [
  { value: 'Food', label: 'Food' },
  { value: 'BSA', label: 'Personal Care' },
];

export function getDivision() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'BSA' ? 'BSA' : 'Food';
  } catch {
    return 'Food';
  }
}

export function setDivision(value) {
  const next = value === 'BSA' ? 'BSA' : 'Food';
  try { localStorage.setItem(KEY, next); } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

/**
 * Entity filter for the active division. Records created before the split carry no
 * main_group, so a MISSING value counts as Food — otherwise every existing food
 * record would disappear from its own page.
 */
export function divisionQuery(division) {
  return division === 'BSA'
    ? { main_group: 'BSA' }
    : { main_group: { $in: [null, 'Food'] } };
}

export function useDivision() {
  const [division, setLocal] = useState(getDivision);

  useEffect(() => {
    const onChange = () => setLocal(getDivision());
    window.addEventListener(EVENT, onChange);
    // Keep other open tabs in step.
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return division;
}