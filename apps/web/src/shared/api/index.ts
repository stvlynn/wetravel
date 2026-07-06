export { apiFetch, ApiError } from "./client";
export {
  searchPlaces,
  reversePlace,
  type PlaceResult,
  type SearchPlacesOptions,
} from "./geocode";
export {
  fetchTrips,
  fetchTrip,
  createTrip,
  renameTrip,
  addTripDay,
  insertStop,
  toggleVote,
  addComment,
  addExpense,
  type CreateTripInput,
  type InsertStopInput,
  type AddExpenseInput,
} from "./trips";
export {
  fetchPreferences,
  updatePreferences,
  type UserPreference,
  type UpdatePreferencesInput,
} from "./preferences";
