# amos.today

Amos 的個人網站 — 作品集 + 觀點站。

> 我用結構說故事，用故事推進。

## Stack
- [Astro](https://astro.build/) (static site generator)
- [Tailwind CSS](https://tailwindcss.com/) (styling)
- Notion (CMS — to be wired in)
- Vercel (deployment)

## Local development

```sh
npm install
npm run dev
```

The dev server runs at `http://localhost:4321`.

## Build

```sh
npm run build
npm run preview
```

## Environment variables

Copy `.env.example` to `.env` and fill in the real values.

```
NOTION_API_KEY=secret_xxx
NOTION_POSTS_DB_ID=...
NOTION_PROJECTS_DB_ID=...
SITE_URL=https://amos.today
```

## Project structure

```
src/
├── layouts/        — shared page layouts
├── pages/          — route files (one .astro per URL)
│   ├── index.astro
│   ├── about.astro
│   ├── work/
│   └── writing/
└── styles/
    └── global.css  — Tailwind entry + base styles
```
