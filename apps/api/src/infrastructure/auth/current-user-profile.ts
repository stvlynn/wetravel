import type { CurrentUserProfile } from "../../application/avatar";
import type { Auth } from "./auth";

export class BetterAuthCurrentUserProfile implements CurrentUserProfile {
  constructor(
    private readonly auth: Auth,
    private readonly headers: Headers,
  ) {}

  async updateImage(image: string | null): Promise<void> {
    await this.auth.api.updateUser({
      body: { image },
      headers: this.headers,
    });
  }
}

