import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey, genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "@/db/index.js";
import { config } from "@/config/index.js";
import * as authSchema from "@/db/auth.schema.js";

export const auth = betterAuth({
  baseURL: config.APP_URL,
  secret: config.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: authSchema,
  }),
  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: true,
      trustedProviders: ["google", "microsoft", "hu"],
    },
  },
  plugins: [
    apiKey({
      defaultPrefix: "janus",
      enableMetadata: true,
      enableSessionForAPIKeys: true,
    }),
    genericOAuth({
      config: [
        {
          providerId: "hu",
          clientId: config.HU_AGENT_ID || "",
          authorizationUrl: `${config.HU_URL?.replace("wss://", "https://").replace("ws://", "http://")}/oauth/authorize`,
          tokenUrl: `${config.HU_URL?.replace("wss://", "https://").replace("ws://", "http://")}/oauth/token`,
          userInfoUrl: `${config.HU_URL?.replace("wss://", "https://").replace("ws://", "http://")}/oauth/userinfo`,
          scopes: ["profile", "email"],
          pkce: true,
          redirectURI: `${config.APP_URL}/api/auth/oauth2/callback/hu`,
          getToken: async ({ code, codeVerifier, redirectURI }) => {
            if (!config.HU_AGENT_ID || !config.HU_URL) {
              throw new Error("Hu OAuth not configured");
            }

            const tokenUrl = `${config.HU_URL.replace("wss://", "https://").replace("ws://", "http://")}/oauth/token`;

            const params: Record<string, string> = {
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectURI,
              client_id: config.HU_AGENT_ID,
            };

            if (codeVerifier) {
              params.code_verifier = codeVerifier;
            }

            console.log("[HU OAuth] Token exchange params:", {
              grant_type: params.grant_type,
              code: params.code?.substring(0, 20) + "...",
              redirect_uri: params.redirect_uri,
              client_id: params.client_id,
              code_verifier: params.code_verifier ? "present" : "none",
            });

            const res = await fetch(tokenUrl, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams(params),
            });

            if (!res.ok) {
              const error = await res.text();
              console.error("[HU OAuth] Token exchange failed:", error);
              throw new Error(`Token exchange failed: ${error}`);
            }

            const data = await res.json();

            return {
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              accessTokenExpiresAt: data.expires_in
                ? new Date(Date.now() + data.expires_in * 1000)
                : undefined,
            };
          },
        },
      ],
    }),
    tanstackStartCookies(),
  ],
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      accessType: "offline",
      prompt: "consent",
    },
    microsoft: config.MICROSOFT_CLIENT_ID && config.MICROSOFT_CLIENT_SECRET
      ? {
          clientId: config.MICROSOFT_CLIENT_ID,
          clientSecret: config.MICROSOFT_CLIENT_SECRET,
          scope: [
            "openid",
            "email",
            "profile",
            "offline_access",
            "Calendars.ReadWrite",
          ],
        }
      : undefined,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  trustedOrigins: [config.APP_URL],
});
