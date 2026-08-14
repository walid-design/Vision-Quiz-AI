# VisionQuiz AI

VisionQuiz AI is an Expo mobile assistant that watches an external screen through the camera, automatically detects stable multiple-choice questions, and displays AI-generated answers without a manual capture workflow.

## Run and operate

- `pnpm --filter @workspace/api-server run dev` — build and run the API server.
- `pnpm --filter @workspace/mobile run dev` — run the Expo development experience on Replit.
- `pnpm run typecheck` — validate all TypeScript projects.
- `pnpm --filter @workspace/api-server run build` — build the production API bundle.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate the API client and Zod contracts.

Runtime configuration:

- `PORT` — API or preview server port.
- `EXPO_PUBLIC_DOMAIN` — public API host embedded in the mobile bundle.
- For AI access, use either:
  - Replit-managed OpenAI: approve **OpenAI (Replit managed)** in Replit Integrations. Replit supplies the managed credential and base URL.
  - Bring your own key: add `OPENAI_API_KEY` to Replit Secrets.
- Optional model overrides: `OPENAI_FAST_VISION_MODEL` controls the low-latency first pass and `OPENAI_QUALITY_VISION_MODEL` controls verification. Defaults are `gpt-4o-mini` and `gpt-5.6-terra`.

Provider credentials are read only by the API server. They must never use an `EXPO_PUBLIC_` name or be placed in the mobile application.

## Architecture

- `artifacts/mobile` — Expo Router/React Native application and Live Assist camera workflow.
- `artifacts/api-server` — Express API and OpenAI vision analysis service.
- `lib/api-spec` — source OpenAPI contract.
- `lib/api-client-react` and `lib/api-zod` — generated client and validation types.
- `artifacts/mockup-sandbox` — independent web design mockup; it is not the live camera product.

## Live Assist flow

1. Create dependency-free visual fingerprints from tiny monitoring frames locally.
2. Capture when the frame stabilizes, with a short deadline so camera noise or monitor flicker can never block the first answer indefinitely.
3. Confirm visual changes across consecutive frames and use an adaptive periodic recheck as a backstop, so text-only changes never require a manual tap.
4. Automatically prepare a readable full-frame image.
5. Use a fast vision pass for the common case and the stronger model only when confidence is low or the question is ambiguous.
6. Display the answer while monitoring continues for the next question.

Incomplete, cut-off, or unreadable questions return camera guidance rather than a guessed answer. The app stores up to 200 answer records locally in AsyncStorage.

The live screen checks `/api/quiz-readiness` before monitoring. If no provider is connected, it shows an actionable setup card instead of waiting indefinitely. **Analyze now** remains an optional fallback; initial and subsequent questions are submitted automatically.

## Notes

- The production experience uses the rear camera to view another screen; it does not capture the device's own screen.
- The live screen intentionally hides the tab bar and provides safe-area-aware History, Settings, and Pause controls.
- PostgreSQL scaffolding exists in the workspace but is not used by the current application.
