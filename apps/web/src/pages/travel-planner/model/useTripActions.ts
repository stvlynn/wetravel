import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  moveTripStop,
  reorderTripDays as reorderDaysLocal,
  type MoveTripStopInput,
  type Trip,
} from "@/entities/trip";
import {
  addComment,
  addExpense,
  updateExpense,
  addTripDay,
  deleteTripDay,
  insertStop,
  moveStop,
  reorderTripDays,
  toggleVote,
  updateStop,
  updateTripDay,
  type AddExpenseInput,
  type InsertStopInput,
  type UpdateStopInput,
  type UpdateTripDayInput,
} from "@/shared/api";
import { queryKeys } from "@/shared/config";

/** Trip mutations. Each returns the updated Trip; we write it straight into the
 * query cache so the UI reflects server-computed budget/settlement. */
export function useTripActions(tripId: string) {
  const qc = useQueryClient();
  const onSuccess = (trip: Trip) => qc.setQueryData(queryKeys.trip(tripId), trip);

  const vote = useMutation({
    mutationFn: (stopId: string) => toggleVote(tripId, stopId),
    onSuccess,
  });
  const comment = useMutation({
    mutationFn: (v: { stopId: string; text: string }) =>
      addComment(tripId, v.stopId, v.text),
    onSuccess,
  });
  const stop = useMutation({
    mutationFn: (input: InsertStopInput) => insertStop(tripId, input),
    onSuccess,
  });
  const stopUpdate = useMutation({
    mutationFn: (v: { stopId: string; patch: UpdateStopInput }) =>
      updateStop(tripId, v.stopId, v.patch),
    onSuccess,
  });
  // Stop movement is optimistic for the same reason as day reorder: the board
  // should reflect the drop immediately, then reconcile with the server trip.
  const stopMove = useMutation({
    mutationFn: (input: MoveTripStopInput) =>
      moveStop(tripId, input.stopId, { day: input.day, index: input.index }),
    onMutate: async (input: MoveTripStopInput) => {
      await qc.cancelQueries({ queryKey: queryKeys.trip(tripId) });
      const previous = qc.getQueryData<Trip>(queryKeys.trip(tripId));
      if (previous) {
        qc.setQueryData(queryKeys.trip(tripId), moveTripStop(previous, input));
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.trip(tripId), context.previous);
      }
    },
    onSuccess,
  });
  const expense = useMutation({
    mutationFn: (input: AddExpenseInput) => addExpense(tripId, input),
    onSuccess,
  });
  const expenseUpdate = useMutation({
    mutationFn: (v: { expenseId: string; input: AddExpenseInput }) =>
      updateExpense(tripId, v.expenseId, v.input),
    onSuccess,
  });
  const day = useMutation({
    mutationFn: () => addTripDay(tripId),
    onSuccess,
  });
  const dayUpdate = useMutation({
    mutationFn: (input: { dayNumber: number; patch: UpdateTripDayInput }) =>
      updateTripDay(tripId, input.dayNumber, input.patch),
    onSuccess,
  });
  // Reorder days optimistically so the board reflects the drop instantly, then
  // reconcile with the server-computed trip. On error, restore the snapshot.
  const dayDelete = useMutation({
    mutationFn: (dayNumber: number) => deleteTripDay(tripId, dayNumber),
    onSuccess,
  });
  const dayReorder = useMutation({
    mutationFn: (order: number[]) => reorderTripDays(tripId, order),
    onMutate: async (order: number[]) => {
      await qc.cancelQueries({ queryKey: queryKeys.trip(tripId) });
      const previous = qc.getQueryData<Trip>(queryKeys.trip(tripId));
      if (previous) {
        qc.setQueryData(queryKeys.trip(tripId), reorderDaysLocal(previous, order));
      }
      return { previous };
    },
    onError: (_err, _order, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.trip(tripId), context.previous);
      }
    },
    onSuccess,
  });

  return {
    vote,
    comment,
    stop,
    stopUpdate,
    stopMove,
    expense,
    expenseUpdate,
    day,
    dayUpdate,
    dayDelete,
    dayReorder,
  };
}
