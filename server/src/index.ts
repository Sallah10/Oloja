import "dotenv/config";

import cors from "cors";
import express from "express";
import { z } from "zod";

import { HttpError } from "./lib/http-error.js";
import { authRouter } from "./routes/auth.routes.js";
import { customersRouter } from "./routes/customers.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import { salesRouter } from "./routes/sales.routes.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/api", productsRouter);
app.use("/api", customersRouter);
app.use("/api", salesRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: "Invalid input", issues: err.issues });
  }
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err instanceof HttpError ? err.message : "Something went wrong",
  });
});

app.listen(port, () => {
  console.log(`oloja server listening on http://localhost:${port}`);
});