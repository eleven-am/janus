import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_PATH: z.string().default("janus.db"),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  HU_URL: z.string().url().optional(),
  HU_AGENT_ID: z.string().optional(),
  HU_PRIVATE_KEY_PATH: z.string().default("./private.pem"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_URL: z.string().url().default("http://localhost:11434"),
}).refine(
  (data) => {
    const hasMsId = data.MICROSOFT_CLIENT_ID !== undefined;
    const hasMsSecret = data.MICROSOFT_CLIENT_SECRET !== undefined;
    return hasMsId === hasMsSecret;
  },
  { message: "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must both be set or both be unset" }
);

export const config = envSchema.parse(process.env);
