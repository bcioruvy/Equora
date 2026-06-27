import { useEffect, useRef } from 'react';
import { addDays, addMonths, addWeeks, addYears, isBefore, isAfter, parseISO } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { addNotification, updateTransaction } from '../firebase/firestore';
import { getCategoryById } from '../lib/constants';
import { formatMoney } from '../lib/format';

function nextOccurrence(date, recurrence) {
  switch (recurrence) {
    case 'daily': return addDays(date, 1);
    case 'weekly': return addWeeks(date, 1);
    case 'monthly': return addMonths(date, 1);
    case 'yearly': return addYears(date, 1);
    default: return null;
  }
}

function computeStableDueDate(baseDate, recurrence) {
  let due = nextOccurrence(baseDate, recurrence);
  if (!due) return null;
  const now = new Date();
  let guard = 0;
  while (isBefore(due, now) && guard < 1000) {
    const advanced = nextOccurrence(due, recurrence);
    if (!advanced) break;
    due = advanced;
    guard += 1;
  }
  return due;
}

export function useFinancialAutomation() {
  const { user, profile } = useAuth();
  const { transactions, activeBudgets, goals, notifications } = useData();
  const processedRef = useRef(new Set());

  useEffect(() => {
    if (!user) return;
    transactions
      .filter((t) => t.recurrence && t.recurrence !== 'none')
      .forEach((t) => {
        const writeGuardKey = `recurdate-${t.id}`;
        if (processedRef.current.has(writeGuardKey)) return;

        const baseDate = typeof t.date === 'string' ? parseISO(t.date) : new Date(t.date);
        const storedDue = t.nextDueDate ? parseISO(t.nextDueDate) : null;
        const needsRecompute = !storedDue || isBefore(storedDue, new Date());
        if (!needsRecompute) return;

        const due = computeStableDueDate(storedDue || baseDate, t.recurrence);
        const dueStr = due?.toISOString().slice(0, 10);
        if (due && dueStr !== t.nextDueDate) {
          processedRef.current.add(writeGuardKey);
          updateTransaction(user.uid, t.id, { nextDueDate: dueStr }).catch(() => {
            processedRef.current.delete(writeGuardKey);
          });
        }
      });
  }, [user, transactions]);

  useEffect(() => {
    if (!user) return;
    activeBudgets.forEach((b) => {
      const key = `budget-${b.id}-exceeded`;
      if (b.percentUsed >= 100 && !processedRef.current.has(key)) {
        processedRef.current.add(key);
        const alreadyExists = notifications.some((n) => n.dedupeKey === key);
        if (!alreadyExists) {
          addNotification(user.uid, {
            category: 'budget',
            message: `You've exceeded your "${b.name}" budget.`,
            dedupeKey: key,
            read: false,
          }).catch(() => {
            processedRef.current.delete(key);
          });
        }
      }
    });
  }, [user, activeBudgets, notifications]);

  useEffect(() => {
    if (!user) return;
    const soon = addDays(new Date(), 3);
    transactions
      .filter((t) => t.recurrence !== 'none' && t.nextDueDate)
      .forEach((t) => {
        const due = parseISO(t.nextDueDate);
        const key = `bill-${t.id}-${t.nextDueDate}`;
        if (isBefore(due, soon) && isAfter(due, new Date()) && !processedRef.current.has(key)) {
          processedRef.current.add(key);
          const alreadyExists = notifications.some((n) => n.dedupeKey === key);
          if (!alreadyExists) {
            addNotification(user.uid, {
              category: 'bill',
              message: `${getCategoryById(t.category).label} bill of ${formatMoney(t.amount, profile?.currency || 'USD')} is due soon.`,
              dedupeKey: key,
              read: false,
            }).catch(() => {
              processedRef.current.delete(key);
            });
          }
        }
      });
  }, [user, transactions, notifications, profile]);

  useEffect(() => {
    if (!user) return;
    goals.forEach((g) => {
      const pct = Math.min(100, ((g.currentAmount || 0) / Math.max(1, g.targetAmount)) * 100);
      [25, 50, 75, 100].forEach((milestone) => {
        const key = `goal-${g.id}-${milestone}`;
        if (pct >= milestone && !processedRef.current.has(key)) {
          processedRef.current.add(key);
          const alreadyExists = notifications.some((n) => n.dedupeKey === key);
          if (!alreadyExists) {
            addNotification(user.uid, {
              category: 'goal',
              message:
                milestone === 100
                  ? `You reached your "${g.name}" savings goal!`
                  : `You're ${milestone}% of the way to your "${g.name}" goal.`,
              dedupeKey: key,
              read: false,
            }).catch(() => {
              processedRef.current.delete(key);
            });
          }
        }
      });
    });
  }, [user, goals, notifications]);
}