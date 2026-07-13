import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

const shortText = z.string().trim().min(1).max(160);
const bodyText = z.string().trim().min(1).max(800);

export const agentUiCatalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(["row", "column"]).nullish(),
        gap: z.enum(["xs", "sm", "md", "lg"]).nullish(),
        align: z.enum(["start", "center", "end", "stretch"]).nullish(),
      }),
      slots: ["default"],
      description: "Groups related generated UI elements in a row or column.",
    },
    Card: {
      props: z.object({
        title: shortText.nullish(),
        description: bodyText.nullish(),
        tone: z.enum(["default", "highlight", "muted"]).nullish(),
      }),
      slots: ["default"],
      description: "A compact surface for one itinerary idea or comparison section.",
    },
    Text: {
      props: z.object({
        content: bodyText,
        variant: z.enum(["body", "heading", "caption", "mono"]).nullish(),
      }),
      description: "Short explanatory text. Keep it concise and avoid repeating nearby titles.",
    },
    Badge: {
      props: z.object({
        label: shortText,
        tone: z.enum(["neutral", "info", "success", "warning"]).nullish(),
      }),
      description: "A short category, status, or recommendation label.",
    },
    Alert: {
      props: z.object({
        title: shortText.nullish(),
        message: bodyText,
        severity: z.enum(["info", "success", "warning", "critical"]),
      }),
      description: "A material weather, timing, route, or budget notice.",
    },
    DayPlan: {
      props: z.object({
        dayNumber: z.number().int().min(1).max(90),
        title: shortText,
        date: z.string().trim().max(40).nullish(),
        summary: bodyText.nullish(),
      }),
      slots: ["default"],
      description: "One day in a proposed itinerary. Child StopSummary elements are ordered chronologically.",
    },
    StopSummary: {
      props: z.object({
        stopId: z.string().trim().max(120).nullish(),
        time: z.string().trim().max(24).nullish(),
        name: shortText,
        category: z.string().trim().max(60).nullish(),
        note: bodyText.nullish(),
      }),
      description: "A compact itinerary stop. Use real ids only when they exist in the trip snapshot.",
    },
    OptionComparison: {
      props: z.object({
        title: shortText,
        options: z
          .array(
            z.object({
              label: shortText,
              summary: bodyText,
              pros: z.array(shortText).max(4),
              cons: z.array(shortText).max(4),
              recommended: z.boolean(),
            }),
          )
          .min(2)
          .max(4),
      }),
      description: "Compares two to four route, lodging, timing, or itinerary options.",
    },
    BudgetSummary: {
      props: z.object({
        currency: z.string().trim().min(3).max(8),
        total: z.number().finite().nonnegative(),
        items: z
          .array(
            z.object({
              label: shortText,
              amount: z.number().finite().nonnegative(),
            }),
          )
          .min(1)
          .max(10),
      }),
      description: "A clearly labelled estimate or recorded-spend summary. Never present estimates as recorded expenses.",
    },
    StreetViewCard: {
      props: z.object({
        imageId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
        placeLabel: shortText.nullish(),
      }),
      description:
        "A trusted street-view preview card. Use only an opaque image id returned by a street-view tool; metadata is hydrated by the application.",
    },
    ActionButton: {
      props: z.object({
        label: shortText,
        variant: z.enum(["primary", "secondary", "outline"]).nullish(),
      }),
      description: "A user-triggered action. Bind press only to an allowlisted catalog action.",
    },
  },
  actions: {
    sendAgentFollowUp: {
      params: z.object({ message: z.string().trim().min(1).max(500) }),
      description: "Send a concrete follow-up message to the trip agent. Use this to discuss or request writing a proposal; writes still require tool approval.",
    },
    focusDay: {
      params: z.object({ dayNumber: z.number().int().min(1).max(90) }),
      description: "Focus an existing trip day in the planner without changing trip data.",
    },
    focusStop: {
      params: z.object({ stopId: z.string().trim().min(1).max(120) }),
      description: "Focus an existing stop from the current trip snapshot without changing trip data.",
    },
    openStreetView: {
      params: z.object({ imageId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/) }),
      description: "Open the shared interactive street-view dialog for a trusted image id.",
    },
  },
});

export const agentUiPrompt = agentUiCatalog.prompt({
  mode: "inline",
  customRules: [
    "Use generated UI only when it makes a plan, comparison, alert, or summary materially easier to understand than concise prose.",
    "Never use generated UI as a substitute for a trip write tool or its approval. A write-looking button may only send a follow-up asking the agent to perform the approved workflow.",
    "Use day numbers and stop ids only when they occur in the current trip snapshot or trusted tool results.",
    "Keep generated interfaces compact enough for a narrow chat panel and avoid duplicating the same information in prose and UI.",
    "When presenting estimated costs, label them as estimates and do not imply that they are recorded expenses.",
    "Use StreetViewCard only with image ids from streetViewSearch or streetViewInspect. Add an openStreetView button only when the trusted result has supports360=true. Put place names in placeLabel; the application hydrates preview, capture time, and attribution.",
    "For this compact catalog, do not use state, dynamic props, repeat, watch, or built-in state actions. Create explicit elements and bind only ActionButton on.press to sendAgentFollowUp, focusDay, focusStop, or openStreetView.",
  ],
});

export type AgentUiCatalog = typeof agentUiCatalog;
