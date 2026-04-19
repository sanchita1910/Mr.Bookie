const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function getKey() {
  return process.env.OPENAI_API_KEY ?? "";
}

function getModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export async function chatWithOpenAI(
  system,
  userPayload,
  { maxTokens = 320, temperature = 0.65 } = {}
) {
  const key = getKey();
  if (!key) return null;

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getModel(),
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            typeof userPayload === "string"
              ? userPayload
              : JSON.stringify(userPayload),
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText.slice(0, 400));
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

async function chat(system, userPayload) {
  return chatWithOpenAI(system, userPayload, { maxTokens: 320, temperature: 0.65 });
}

export async function narrateReadingPick(context) {
  return chat(
    `You are a warm reading coach. A deterministic scorer already picked the next book using page length vs. time budget, mood fit (from note sentiment), and star rating. Your job is to narrate that choice in 2–4 sentences: celebrate it, echo the constraints, and do NOT invent books or facts not in the JSON. If page count was unknown, acknowledge uncertainty briefly.`,
    context
  );
}

export async function narrateSimilarHybrid(context) {
  return chat(
    `You help readers discover books. Open Library already supplied up to 5 candidate titles (real metadata). Write ONE short paragraph (3–5 sentences): briefly rank or compare them for someone who liked the user's book, mention the user's rating/notes only as context, and do not invent titles beyond the candidate list.`,
    context
  );
}

export function isLlmConfigured() {
  return Boolean(getKey());
}
