# VisionQuiz AI

VisionQuiz AI is an Expo mobile assistant that watches an external screen through the camera, automatically detects stable multiple-choice questions, and displays AI-generated answers without a manual capture workflow.

## Run and operate

- `pnpm --filter @workspace/api-server run dev` — build and run the API server.
- `pnpm --filter @workspace/mobile run dev` — run the Expo development experience on Replit.
- `pnpm run typecheck` — validate all TypeScript projects.
- `pnpm --filter @workspace/api-server run build` — build the production API bundle.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate the API client and Zod contracts.

Required environment variables:

- `PORT` — API or preview server port.
- `OPENAI_API_KEY` — server-side key used for vision analysis.
- `EXPO_PUBLIC_DOMAIN` — public API host embedded in the mobile bundle.

## Architecture

- `artifacts/mobile` — Expo Router/React Native application and Live Assist camera workflow.
- `artifacts/api-server` — Express API and OpenAI vision analysis service.
- `lib/api-spec` — source OpenAPI contract.
- `lib/api-client-react` and `lib/api-zod` — generated client and validation types.
- `artifacts/mockup-sandbox` — independent web design mockup; it is not the live camera product.

## Live Assist flow

1. Decode tiny monitoring frames into luminance signatures locally.
2. Wait for a stable initial question or a stable visual change.
3. Automatically prepare a readable full-frame image.
4. Ask the vision service to locate and extract one complete multiple-choice question.
5. Display the answer while monitoring continues for the next question.

Incomplete, cut-off, or unreadable questions return camera guidance rather than a guessed answer. The app stores up to 200 answer records locally in AsyncStorage.

## Notes

- The production experience uses the rear camera to view another screen; it does not capture the device's own screen.
- The live screen intentionally hides the tab bar and provides safe-area-aware History, Settings, and Pause controls.
- PostgreSQL scaffolding exists in the workspace but is not used by the current application.
