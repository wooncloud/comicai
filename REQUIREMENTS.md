# User Requirements

A web app / platform where AI draws comics.

1. **MVP**: focused on the comic-drawing feature.
2. **Phase 2**: a community for serializing the comics that were created.

The MVP is the priority.

**The most critical aspect of this service**: the AI must maintain consistency across the comic's context — characters, backgrounds, story content, world-building, and other settings.

---

## 1. Project (Project screen)

1. **Description**: A project holds the consistency information needed to draw a comic, and also stores the various comic pages that are created and drawn.

2. **Consistency Information** (Consistency Information screen)
   1. **Description**: A mechanism for maintaining consistency. Because the AI will reference these items, each piece of information needs an ID. In the editor the user types `@` and the ID to insert a reference.
   2. **Art Style Information** (a reference image of the art style to imitate)
   3. **Character Information and Images** (text + image)
   4. **Key Background Images and Descriptions** (text + image)
   5. **World-building Settings** (image + text)
   6. **Story Editor** (initially built rough, for the user's reference; later, exploring a way to let the AI reference it too)

3. **Pages** (Page screen)
   1. Pages can be added. Page size and aspect ratio can be configured.
   2. This area will later also let the user define webtoon or manuscript frames.
   3. **Page Editor**
      1. **Drawing Panels**
         1. The user can draw panels by sketching rectangles of various shapes. The AI will draw inside these panels.
         2. Panels support various shapes and stroke colors. Supporting black rectangles and a transparent color enables a wide range of stagings.
      2. **Filling Panel Content** — each panel can be filled with the information needed to render it. This information is scoped to that panel.
         1. **Drawing the Storyboard** (the user can draw a storyboard directly. Alternatively, the AI can be prompted to draw a draft storyboard inside the panel first — fast and lightweight.)
         2. **Adding Text** (text inside the editor that the AI will read. Used to describe the scene. Typing `@` lets the user attach consistency information.)
         3. **Uploading Images in the Editor** (the AI can reference user-uploaded images.)
         4. **Panel Rendering**
            1. When a panel is rendered, the storyboard, text, mentioned consistency items, and uploaded images are all aggregated and passed to the AI via a model adapter; the resulting image fills that panel.
            2. Each panel runs as an independent job (BullMQ). A failure in one panel doesn't affect the others.
   4. **Work History**
      1. Work must be reversible — history must be retained.
      2. History is capped at 20 entries. When a new entry is added, the oldest is evicted (FIFO queue).
   5. **AI Model Selection**
      1. Nano Banana (Gemini)
      2. GPT Image gen
   6. **Page Export**
      1. JPG, PNG, etc.

## 2. Credits (placed in the user screen)

1. Each AI model has a defined credit cost. One render consumes the model's defined credits.
2. The end goal is a subscription model, but the MVP ships with credit-purchase first.
3. The service launches in Korea first; no overseas plans for now.
4. **>>> Important caveat**: the above is the long-term design. For the MVP, build the architecture to support it but ship the initial version with **BYOK** — the user provides their own Gemini / GPT API keys. API security must be rigorous.

## 3. Users (User screen)

1. Email + password.
2. OAuth supported. MVP supports Google and GitHub.

## 4. Tech / Architecture

1. **Next.js**
2. **Nest.js** — chosen because the service handles many images, long-running renders, and likely batch jobs, so a dedicated backend is needed.
3. **Tailwind + shadcn**
4. **PostgreSQL** — stores user info, consistency information, created pages, credits, etc.
5. **Storage**: served from a personal PC, so Docker volumes for now.
6. **Consistency Injection Strategy (fixed)**
   1. Techniques like IP-Adapter / ControlNet / LoRA are specific to Stable Diffusion–family open models and will **not** be used here (we're committed to Gemini nano banana 2.5 / GPT image gen).
   2. Chosen approach: each consistency item (`@character`, `@background`, `@style`, `@worldview`) stores N representative reference images plus a text description. At panel render time, the mentioned items' images + text are collected and passed to the model API as references.
   3. A per-model adapter converts a shared intermediate representation (`RenderIR`) into each API's format.
7. **Editor**: PoC with tldraw; if it hits limits, migrate to Konva.
8. **Async image generation** — directly tied to why Nest.js is used. Render requests go to a queue (BullMQ + Redis), workers process them, and the frontend receives progress via SSE/WebSocket. Adds one Redis container.
9. **Hosting**: server runs on a personal PC. Exposed via Cloudflare Zero Trust Tunnel. The stack is composed with Docker; `cloudflared` also runs in Docker.

---

> **MVP scope recommendation**
> Consistency is the hardest problem, so for the MVP narrow the scope to **a single character + a single background + 1–3 pages** to first validate the consistency mechanism as a PoC. The story editor and the 20-entry history queue can be deferred.

>>> Acknowledged.

Running on a personal PC carries some risks, but this isn't a commercial venture yet. If the service matures into a real business, the plan is to migrate to something like AWS — so don't worry about it for now.

---

Stable Diffusion will **not** be used. We will use Gemini nano banana 2.5 or GPT Image gen. Both support image-attached generation that can produce high-quality, consistent outputs grounded on a reference image. Check their most recent updates.

---

**`@` mention serialization spec** — define how an ID like `@char_001` resolves into the final prompt. Example: `@char_001` → `"Protagonist Kim Cheolsu, short black hair, red hoodie"` + a character sheet image attached.

**Render failure / timeout handling** — under BYOK there's no credit deduction, but if a call made with the user's API key fails, we still need a retry policy and a partial-result preservation policy.

→ Both items above require technical follow-up.
