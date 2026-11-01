import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// In development the chat API runs inside Vite, so one `npm run dev` is enough.
// It loads api/chat.ts exactly as Vercel does and hands it a web Request.
function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use("/api/chat", async (req, res) => {
        try {
          const mod = (await server.ssrLoadModule("/api/chat.ts")) as Record<string, (r: Request) => Promise<Response> | Response>;
          const handler = mod[req.method ?? "GET"];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
          const request = new Request(`http://${req.headers.host}${req.originalUrl}`, {
            method: req.method,
            headers,
            body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          const reader = response.body?.getReader();
          for (let next = await reader?.read(); next && !next.done; next = await reader!.read()) res.write(next.value);
          res.end();
        } catch (error) {
          server.config.logger.error(String(error));
          res.statusCode = 500;
          res.end("Dev API crashed");
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // The dev token from `vercel env pull` lives in .env.local.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    // GitHub Pages serves it at magnus.is-a.dev/ai-receptionist/; Vercel serves it at the root.
    base: process.env.VERCEL ? "/" : "/ai-receptionist/",
    plugins: [react(), tailwindcss(), devApi()],
    server: { port: 5182, strictPort: true },
    preview: { port: 4182, strictPort: true },
  };
});
