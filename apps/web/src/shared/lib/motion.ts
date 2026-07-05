/** Motion class-name identifiers.
 *
 * Single reference point for the interaction utilities defined in
 * `app/styles/global.css`, which in turn read the motion tokens in
 * `tokens/spacing.css` (`--press-scale`, `--ease-out`, `--dur-*`). Consume
 * these instead of hardcoding `active:scale-[0.96]`, raw cubic-beziers, or
 * duplicate transition strings across components.
 */

/** Press-scale feedback only (transition: scale + `:active` press). */
export const pressable = "wf-pressable";

/** Background/color feedback plus press scale (GPU-only, no box-shadow). */
export const interactive = "wf-interactive";

/** Background + border feedback for form fields (inputs, textareas, selects). */
export const field = "wf-field";
