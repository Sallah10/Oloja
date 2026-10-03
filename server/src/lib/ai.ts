/**
 * The weekly letter: the local whisper engine already produces verified facts
 * (businessHealth + advice), and this module asks a model to *rephrase* those
 * facts as a short shopkeeper's letter.
 *
 * Two rules make it safe to run on a business's own numbers:
 *
 *  1. The model is given the facts as JSON and is told to add none. It writes
 *     words, never figures.
 *  2. Every number in the reply must already appear in the facts we sent. Any
 *     digit the model invents is rejected and the caller falls back to the
 *     deterministic letter (fallbackLetter) - the same way an offline phone
 *     does.
 *
 * With no GEMINI_API_KEY configured, writeLetter() returns null and the app
 * uses its local letter, so the feature costs nothing and blocks nothing.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// gemini-2.5-flash is retired for new API keys; 3.8-flash is the current
// free flash model. Overridable so a shop can pin another one.
const DEFAULT_MODEL = "gemini-3.8-flash";
// Room for the whole paragraph: a run that hits this cap comes back with
// finishReason MAX_TOKENS and a half-sentence, which the checks below reject.
const MAX_TOKENS = 2048;

export type LetterFacts = {
  shopName?: string;
  /** Pre-rendered facts, one per line. The model's only source of truth. */
  facts: string[];
  /** The local advice lines, already grounded and phrased. */
  advice?: string[];
};

export type LetterResult = {
  letter: string;
  /** Where the words came from, so the UI can be honest about it. */
  source: "model";
};

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

const INSTRUCTIONS = [
  "You are writing one short paragraph for a small shop owner in Nigeria who sells everyday goods.",
  "You are given verified facts about their shop. Use ONLY those facts.",
  "Do not invent, estimate, round differently or add any number that is not in the facts.",
  "Write figures exactly as given (write 10, not 'ten'), and only say 'twice', 'half' or 'a third'",
  "next to a figure you were given. Never write a count that has no figure beside it.",
  "Do not mention the word 'facts', JSON, or that you are an AI.",
  "Sound like a calm, sharp shopkeeper's friend: plain English, short sentences, no jargon,",
  "no markdown, no lists, no headings, no emoji. 3 to 5 sentences. Speak about the week",
  "that just passed and the one thing to do next. Start and end warmly but briefly.",
].join(" ");

function prompt(facts: LetterFacts): string {
  const lines = [
    `Shop: ${facts.shopName?.trim() || "a small shop"}`,
    "",
    "Verified facts:",
    ...facts.facts.map((f) => `- ${f}`),
  ];
  if (facts.advice?.length) {
    lines.push("", "Already-computed advice (keep the meaning, reword freely):", ...facts.advice.map((a) => `- ${a}`));
  }
  return lines.join("\n");
}

/** Every number-like token in the text, normalised so "1,200" == "1200". */
function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.match(/\d[\d,._]*/g) ?? []) {
    found.add(match.replace(/[,_.]/g, ""));
  }
  return found;
}

/**
 * Spelled-out counts. A model can dodge a digit check by writing "three
 * customers" instead of "3 customers", so these words are read as the numbers
 * they are.
 */
const COUNT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, million: 1000000,
};

/**
 * Relative quantities only make sense attached to a figure that came from the
 * ledger, so they are allowed only when an allowed number sits next to them.
 */
const RELATIVE_WORDS = /half|halves|twice|double|triplet?h?ice|thrice|third|quarter|dozen|halving/i;

function relativeWordsAreAnchored(reply: string, allowed: Set<string>): boolean {
  return (reply.match(RELATIVE_WORDS) ?? []).every((word) => {
    const at = reply.toLowerCase().indexOf(word.toLowerCase());
    return numbersNear(reply, at, allowed);
  });
}

/** Is one of the figures we sent sitting in the same sentence as this word? */
function numbersNear(reply: string, index: number, allowed: Set<string>): boolean {
  const before = reply.slice(0, index);
  const start =
    Math.max(
      before.lastIndexOf("."),
      before.lastIndexOf("!"),
      before.lastIndexOf("?"),
      before.lastIndexOf("\n"),
    ) + 1;
  const after = reply.slice(index);
  const stop = after.search(/[.!?\n]/);
  const end = stop === -1 ? reply.length : index + stop;
  const sentence = reply.slice(start, end);
  return (sentence.match(/\d[\d,._]*/g) ?? []).some((n) => allowed.has(n.replace(/[,_.]/g, "")));
}

/**
 * A model that invents a figure is worse than no model at all, so this is a
 * hard gate: any number in the reply - digits or words - that is not sitting
 * next to a figure we actually sent rejects the whole letter. Being strict is
 * the point: the caller falls back to a letter built from the same numbers
 * with no model involved at all.
 */
export function inventsNumbers(reply: string, facts: LetterFacts): boolean {
  const source = [...facts.facts, ...(facts.advice ?? [])].join("\n");
  const allowed = numbersIn(source);

  if ([...numbersIn(reply)].some((n) => !allowed.has(n))) return true;

  for (const match of reply.matchAll(/\b[a-z]+\b/gi)) {
    const word = match[0].toLowerCase();
    if (word in COUNT_WORDS && !numbersNear(reply, match.index ?? 0, allowed)) return true;
  }

  if (!RELATIVE_WORDS.test(reply)) return false;
  return !relativeWordsAreAnchored(reply, allowed);
}

/** Collapse the model's spacing without touching its words. */
function tidy(reply: string): string {
  return reply
    .replace(/\s+/g, " ")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
}

/** One request to Gemini. Returns null for "try again" (429/5xx) vs "give up". */
async function generateLetter(facts: LetterFacts): Promise<string | null | false> {
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  try {
    const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: "user", parts: [{ text: prompt(facts) }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.6 },
      }),
    });

    // 429 (quota) and 5xx are worth one more go; 400/404 are not.
    if (response.status === 429 || response.status >= 500) {
      debug(`retryable ${response.status}`, (await response.text()).slice(0, 200));
      return null;
    }

    if (!response.ok) return false;

    const body = (await response.json()) as {
      candidates?: {
        finishReason?: string;
        content?: { parts?: { text?: string; thought?: boolean }[] };
      }[];
    };
    const candidate = body.candidates?.[0];
    // Anything other than STOP (MAX_TOKENS, SAFETY, RECITATION) means the text
    // is not a finished letter.
    if (!candidate || (candidate.finishReason && candidate.finishReason !== "STOP")) return "";
    // Gemini 3 can return its reasoning as thought parts; only the visible
    // answer is the letter.
    const parts = candidate.content?.parts ?? [];
    return parts
      .filter((part) => part.thought !== true)
      .map((part) => part.text ?? "")
      .join("");
  } catch {
    // A timeout or a dropped connection: retry once.
    return null;
  }
}

/** Set AI_DEBUG=true to hear why a letter was refused (quota, grounding, ...). */
function debug(reason: string, detail?: unknown): void {
  if (process.env.AI_DEBUG === "true") {
    console.warn(`[ai] ${reason}`, detail ?? "");
  }
}

export async function writeLetter(facts: LetterFacts): Promise<LetterResult | null> {
  if (!process.env.GEMINI_API_KEY) {
    debug("no GEMINI_API_KEY, using the local letter");
    return null;
  }

  // Two attempts: a busy free tier 503s often enough to matter, and the reader
  // is looking at a button that should just work.
  let raw: string | null | false = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    raw = await generateLetter(facts);
    if (raw !== null) break;
    debug("retryable failure from Gemini", `attempt ${attempt + 1}`);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  if (typeof raw !== "string") {
    debug("Gemini refused the request, falling back to the local letter");
    return null;
  }
  const letter = tidy(raw);
  if (letter.length < 40) {
    debug("reply too short to be a letter", letter);
    return null;
  }
  if (!/[.!?]$/.test(letter)) {
    debug("reply looks cut off mid-sentence", letter);
    return null;
  }
  if (inventsNumbers(letter, facts)) {
    debug("reply invented a figure, rejecting it", letter);
    return null;
  }

  return { letter, source: "model" };
}