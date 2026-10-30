/** Debug surfaces are local-development only. They can spend API credits
 * and read local files, so they must 404 on any hosted or production build. */
export function isDebugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}
