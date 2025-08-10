# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Router v7 application with server-side rendering, built using the React Router CLI template. It's designed as a full-stack React application that can be deployed to Cloudflare Workers. The project uses shadcn/ui components and follows modern React patterns.

## Key Technologies

- React Router v7
- React 19
- TypeScript
- Tailwind CSS
- Vite
- Cloudflare Workers (deployment target)
- shadcn/ui components

## Common Commands

### Development
- `npm run dev` - Start the development server with HMR
- `npm run build` - Create a production build
- `npm run preview` - Preview the production build locally
- `npm run typecheck` - Run TypeScript type checking

### Deployment
- `npm run deploy` - Build and deploy directly to production
- `npx wrangler versions upload` - Deploy a preview URL
- `npx wrangler versions deploy` - Promote a version to production

### Code Generation
- `npm run cf-typegen` - Generate Cloudflare Worker types

## Architecture

### File Structure
- `app/` - Main application code
  - `routes.ts` - Route definitions
  - `root.tsx` - Root layout component
  - `routes/` - Route components
  - `components/` - Shared UI components (shadcn/ui)
  - `lib/` - Utility functions
  - `styles/` - Global styles
  - `welcome/` - Welcome page components
- `public/` - Static assets
- `workers/` - Cloudflare Worker configurations
- `wrangler.jsonc` - Wrangler configuration

### Routing
Routes are defined in `app/routes.ts` using the React Router route configuration API. Components for each route are located in `app/routes/`. The current routes are:
- `/` (index route) - renders `app/routes/home.tsx`
- `/about` - renders `app/routes/home2.tsx`

### Data Loading
Data loading is handled through loader functions in route components, which can access Cloudflare Worker context via the `context` parameter. The context includes environment variables defined in `wrangler.jsonc`.

### Styling
The project uses Tailwind CSS for styling with shadcn/ui components. The alias `@` is configured to point to the `app/` directory, making it easy to import components and utilities.

### Component Library
The project uses shadcn/ui components which are located in `app/components/ui/`. These components are pre-built with Tailwind CSS and can be customized.

### Cloudflare Integration
The application is designed to run on Cloudflare Workers with server-side rendering. Environment variables can be defined in `wrangler.jsonc` and accessed through the loader context.

## Development Notes
- The project uses TypeScript with strict type checking
- Route components follow the React Router v7 convention with loader, meta, and component exports
- Cloudflare Worker context is available in loaders through the context parameter
- Components use the `@` alias for imports (e.g., `@/components/ui/button`)
- The project includes both client-side and server-side code that can be deployed to Cloudflare Workers