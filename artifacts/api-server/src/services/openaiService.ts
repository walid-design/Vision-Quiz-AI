import OpenAI from "openai";

const SYSTEM_PROMPT = `You are analyzing a multiple-choice educational question displayed on a computer screen.

Read the question text and every visible answer option carefully.

Choose the single BEST answer based on the subject context provided.

Pay special attention to qualifier words such as:
NOT, EXCEPT, BEST, MOST, LEAST, PRIMARY, FIRST, NEXT, ALWAYS, NEVER

Pay careful attention to:
- Technical terminology and product names
- Software versions and commands
- Configuration values and architecture terminology
- Certification-specific recommended practices and frameworks
- Distinctions between what is "possible" vs what is "recommended" or "best practice"

Some answer choices may be technically possible but not the best or recommended answer for the given context.

If the image is unclear, blurry, or the question is genuinely ambiguous, lower the confidence score accordingly.

Return ONLY valid JSON with no markdown fences, no preamble, in this exact structure:
{
  "question": "The full question text as you read it",
  "options": {
    "A": "Option A text",
    "B": "Option B text",
    "C": "Option C text",
    "D": "Option D text"
  },
  "answer": "B",
  "answerText": "Full text of the selected answer option",
  "confidence": 0.95,
  "explanation": "One or two sentences explaining why this is the best answer",
  "needsVerification": false
}

Notes:
- "options" may have 2 to 6 entries depending on what is visible
- "answer" must be exactly one of the option keys
- "confidence" must be a decimal between 0.0 and 1.0
- "needsVerification" should be true if the question is ambiguous, the image is unclear, or multiple answers seem plausible`;

export interface AnalysisStageResult {
  question: string;
  options: Record<string, string>;
  answer: string;
  answerText: string;
  confidence: number;
  explanation: string;
  needsVerification: boolean;
}

export interface AnalysisResult extends AnalysisStageResult {
  verified?: boolean;
  verifierAnswer?: string;
  processingTimeMs: number;
}

async function callOpenAI(
  imageBase64: string,
  subject: string,
  isVerification: boolean,
): Promise<AnalysisStageResult> {
  const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

  const subjectCtx =
    subject && subject !== "General Knowledge"
      ? ` This question is from the ${subject} domain/certification. Use domain-specific knowledge to determine the best answer.`
      : "";

  const userText = isVerification
    ? `VERIFICATION PASS — independently re-analyze this question without being influenced by any prior analysis.${subjectCtx} Return your independent JSON answer.`
    : `Analyze this multiple-choice question.${subjectCtx}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
              detail: "high",
            },
          },
          { type: "text", text: userText },
        ],
      },
    ],
    max_tokens: 900,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned non-JSON response");
  }

  return {
    question: String(parsed["question"] ?? ""),
    options: (parsed["options"] as Record<string, string>) ?? {},
    answer: String(parsed["answer"] ?? ""),
    answerText: String(parsed["answerText"] ?? ""),
    confidence: Math.min(1, Math.max(0, Number(parsed["confidence"] ?? 0))),
    explanation: String(parsed["explanation"] ?? ""),
    needsVerification: Boolean(parsed["needsVerification"]),
  };
}

export async function analyzeQuestionImage(
  imageBase64: string,
  subject: string,
  confidenceThreshold = 0.85,
): Promise<AnalysisResult> {
  const startTime = Date.now();

  // Stage 1: fast analysis
  const stage1 = await callOpenAI(imageBase64, subject, false);

  const shouldVerify = stage1.needsVerification || stage1.confidence < confidenceThreshold;

  if (!shouldVerify) {
    return { ...stage1, processingTimeMs: Date.now() - startTime };
  }

  // Stage 2: independent verification pass
  const stage2 = await callOpenAI(imageBase64, subject, true);
  const agreed = stage1.answer === stage2.answer;

  // If disagreement, pick the higher-confidence answer
  const finalBase = stage1.confidence >= stage2.confidence ? stage1 : stage2;

  return {
    ...finalBase,
    needsVerification: true,
    verified: agreed,
    verifierAnswer: stage2.answer,
    processingTimeMs: Date.now() - startTime,
  };
}
