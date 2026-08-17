# VisionQuiz AI

VisionQuiz AI is a full-stack mobile application that captures multiple-choice questions, extracts the visible content, and returns a structured AI-assisted explanation. It demonstrates a practical integration between an Expo client, a typed Node.js API, OpenAI vision models, and shared OpenAPI-generated contracts.

## What this project demonstrates

- Mobile camera and image-picker workflows with Expo and React Native
- A server-side OpenAI integration that keeps provider credentials away from the client
- Structured model output validated against a strict JSON schema
- A two-stage confidence and verification workflow for ambiguous questions
- Contract-first API development with OpenAPI, generated Zod types, and a generated React client
- A pnpm monorepo with reusable database and API libraries

## Architecture

| Area | Technology | Responsibility |
| --- | --- | --- |
| Mobile app | Expo, React Native, Expo Router | Capture images, manage history, and display results |
| API server | Node.js, Express, TypeScript | Validate requests and coordinate AI analysis |
| AI integration | OpenAI API | Read question images and return schema-constrained results |
| API contract | OpenAPI, Orval, Zod | Keep the server and client interfaces aligned |
| Data layer | Drizzle ORM | Shared persistence schema and database access |

## Repository layout

```text
artifacts/
  api-server/       Express API and OpenAI integration
  mobile/           Expo mobile application
  mockup-sandbox/   Web-based UI prototype
lib/
  api-spec/         OpenAPI specification and generation config
  api-zod/          Generated schemas and types
  api-client-react/ Generated React client
  db/               Shared Drizzle schema
scripts/            Workspace utilities
```

## Local setup

Prerequisites: Node.js 20+ and pnpm 9+.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the environment template and add your server-side OpenAI key:

   ```bash
   cp .env.example .env
   ```

3. Run the API and mobile packages from their workspace directories, or use the package-level scripts documented in each `package.json`.

4. Validate the full workspace:

   ```bash
   pnpm typecheck
   pnpm build
   ```

Never embed `OPENAI_API_KEY` in the mobile application or commit a populated `.env` file.

## Responsible use

This project is an educational prototype. Users are responsible for following the rules of their school, certification provider, employer, or assessment platform. AI output can be incorrect and should be verified against authoritative sources.

## License

MIT
