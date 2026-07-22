export interface UserMergeAssessment {
  canonicalUserId: string;
  duplicateUserId: string;
  blockers: string[];
}

export interface UserMergePort {
  assess(
    canonicalUserId: string,
    duplicateUserId: string,
  ): Promise<UserMergeAssessment>;
  merge(canonicalUserId: string, duplicateUserId: string): Promise<void>;
}

export class UserMergeBlockedError extends Error {
  constructor(readonly blockers: string[]) {
    super(`User merge requires manual resolution: ${blockers.join(", ")}`);
    this.name = "UserMergeBlockedError";
  }
}

/** Explicit maintenance use case; it is intentionally not exposed over HTTP. */
export class MergeUsers {
  constructor(private readonly port: UserMergePort) {}

  async execute(
    canonicalUserId: string,
    duplicateUserId: string,
  ): Promise<void> {
    if (!canonicalUserId || !duplicateUserId || canonicalUserId === duplicateUserId) {
      throw new UserMergeBlockedError(["invalid_user_selection"]);
    }
    const assessment = await this.port.assess(
      canonicalUserId,
      duplicateUserId,
    );
    if (assessment.blockers.length > 0) {
      throw new UserMergeBlockedError(assessment.blockers);
    }
    await this.port.merge(canonicalUserId, duplicateUserId);
  }
}
