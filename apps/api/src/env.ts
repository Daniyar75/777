export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  const jwtSecret = env.JWT_SECRET;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!jwtSecret) throw new Error("JWT_SECRET is required");
  return {
    databaseUrl,
    jwtSecret,
    port: env.PORT ? Number(env.PORT) : 3000,
  };
}
