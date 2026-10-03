import { Router } from "express";
import { z } from "zod";

import { geminiConfigured, writeLetter } from "../lib/ai.js";
import { asyncHandler } from "../lib/http-error.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * The phone sends the facts its own whisper engine computed (same code that
 * draws the cards, so the numbers are the ledger's) and gets back a letter that
 * only rewords them. The server never queries the ledger for this - it cannot
 * invent a number it was never given.
 */
export const whisperRouter = Router();

whisperRouter.use(requireAuth);

const letterSchema = z.object({
  shopName: z.string().trim().max(80).optional(),
  facts: z.array(z.string().trim().min(1).max(400)).min(1).max(25),
  advice: z.array(z.string().trim().min(1).max(400)).max(6).optional(),
});

whisperRouter.post(
  "/whisper/letter",
  asyncHandler(async (req, res) => {
    const input = letterSchema.parse(req.body);

    if (!geminiConfigured()) {
      res.json({ letter: null, configured: false, source: "local" });
      return;
    }

    const result = await writeLetter(input);
    if (!result) {
      // No key, a rejected reply, or Gemini being unavailable: say so plainly so
      // the app can show its own letter instead of pretending.
      res.json({ letter: null, configured: true, source: "local" });
      return;
    }

    res.json({ letter: result.letter, configured: true, source: "model" });
  }),
);