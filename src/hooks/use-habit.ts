import { useEffect, useState } from "react";
import { getHabitState, subscribeHabit, type HabitState } from "@/lib/habit";

export function useHabitState(): HabitState {
  const [habit, setHabit] = useState(() => getHabitState());

  useEffect(() => {
    return subscribeHabit(() => setHabit({ ...getHabitState() }));
  }, []);

  return habit;
}
