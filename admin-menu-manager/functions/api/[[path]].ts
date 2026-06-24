import { handle } from "hono/cloudflare-pages";
import { adminApi } from "../../server/app";

export const onRequest = handle(adminApi);
