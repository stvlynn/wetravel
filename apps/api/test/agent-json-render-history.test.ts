import { describe, expect, it } from "vitest";
import type { FileStorage } from "../src/application/storage";
import type {
  AgentMessage,
  AgentMessagePart,
} from "../src/domain/agent";
import {
  agentUiRefinementFromHistory,
  removeUnchangedRefinementUi,
  toModelMessages,
} from "../src/infrastructure/ai/agent-model.ai-sdk";

const tripId = "trip-1";
const storage: FileStorage = {
  write: async () => {},
  read: async () => null,
  delete: async () => {},
  getPublicUrl: (path) => path,
};

const generatedParts: AgentMessagePart[] = [
  {
    type: "data-spec",
    data: {
      type: "flat",
      spec: {
        root: "summary",
        elements: {
          summary: {
            type: "Text",
            props: { content: "Original plan", variant: "body" },
            children: [],
          },
        },
      },
    },
  },
];

function message(
  id: string,
  role: AgentMessage["role"],
  parts: AgentMessagePart[],
): AgentMessage {
  return {
    id,
    seq: 1,
    tripId,
    role,
    parts,
    actorUserId: role === "user" ? "user-1" : null,
    source: "chat",
    tripVersion: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("agent json-render history", () => {
  it("does not flatten a previous generated interface into a fresh request", async () => {
    const history = [
      message("assistant-1", "assistant", generatedParts),
      message("user-1", "user", [
        { type: "text", text: "给一些东京塔的街景照片" },
      ]),
    ];

    expect(agentUiRefinementFromHistory(history)).toBeNull();
    const modelMessages = await toModelMessages(
      history,
      () => "Steven",
      storage,
      tripId,
    );
    const serialized = JSON.stringify(modelMessages);
    expect(serialized).not.toContain("Previously generated interface");
    expect(serialized).not.toContain("Original plan");
    expect(modelMessages).toEqual([
      { role: "user", content: "[Steven] 给一些东京塔的街景照片" },
    ]);
  });

  it("uses the official currentSpec prompt for an explicit refinement", async () => {
    const history = [
      message("assistant-1", "assistant", generatedParts),
      message("user-1", "user", [
        { type: "text", text: "把这个卡片改得更简短" },
      ]),
    ];
    const refinement = agentUiRefinementFromHistory(history);

    expect(refinement?.spec.root).toBe("summary");
    const modelMessages = await toModelMessages(
      history,
      () => "Steven",
      storage,
      tripId,
      refinement,
    );
    const content = modelMessages.at(-1)?.content;
    expect(content).toContain("CURRENT UI STATE");
    expect(content).toContain("USER REQUEST: [Steven] 把这个卡片改得更简短");
    expect(content).not.toContain("Previously generated interface");
  });

  it("drops an unchanged refinement seed but keeps effective patches", () => {
    const refinement = agentUiRefinementFromHistory([
      message("assistant-1", "assistant", generatedParts),
      message("user-1", "user", [
        { type: "text", text: "修改这个卡片" },
      ]),
    ])!;
    const textPart: AgentMessagePart = { type: "text", text: "Done" };

    expect(
      removeUnchangedRefinementUi([...generatedParts, textPart], refinement.spec),
    ).toEqual([textPart]);

    const patchPart: AgentMessagePart = {
      type: "data-spec",
      data: {
        type: "patch",
        patch: {
          op: "replace",
          path: "/elements/summary/props/content",
          value: "Short plan",
        },
      },
    };
    expect(
      removeUnchangedRefinementUi(
        [...generatedParts, patchPart, textPart],
        refinement.spec,
      ),
    ).toHaveLength(3);
  });
});
