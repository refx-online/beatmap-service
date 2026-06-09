import { config } from "../config";

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

class OsuOAuthClient {
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  async getToken(): Promise<string | null> {
    if (this.cachedToken && Date.now() < this.tokenExpiry - 60_000) {
      return this.cachedToken;
    }

    if (!config.osuClientId || !config.osuClientSecret) {
      return null;
    }

    try {
      const res = await fetch("https://osu.ppy.sh/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: Number(config.osuClientId),
          client_secret: config.osuClientSecret,
          grant_type: "client_credentials",
          scope: "public",
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as OAuthTokenResponse;
      this.cachedToken = data.access_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;
      return this.cachedToken;
    } catch {
      return null;
    }
  }

  clearToken(): void {
    this.cachedToken = null;
    this.tokenExpiry = 0;
  }
}

export const osuOAuth = new OsuOAuthClient();
