export function isCronAuthorized(request: Request, env: { NODE_ENV?: string; CRON_SECRET?: string } = process.env) {
  if (env.NODE_ENV !== "production" && !env.CRON_SECRET) return true;
  if (!env.CRON_SECRET) return false;
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}
