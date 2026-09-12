# SunnyPanel

SunnyPanel is a full-stack web platform for secure key workflow management, built with React, TypeScript, Supabase, and Cloudflare deployment.

## Production Domain

https://mityangho.id.vn

## Main Features

* Free key workflow with multi-step verification
* VIP / admin-managed key system
* Admin and user dashboard separation
* Link rotation logic
* Secure claim session handling
* Rate limit and blocklist protection
* Supabase Edge Functions integration
* Cache-safe frontend deployment

## Tech Stack

* Vite
* TypeScript
* React
* Tailwind CSS
* shadcn/ui
* Supabase
* Cloudflare

## Development

```bash
git clone https://github.com/ziokass01/sunnypanel-3d8eed58.git
cd sunnypanel-3d8eed58
npm install
npm run dev
```

## Deployment

Frontend is deployed with Cloudflare.

Backend uses Supabase:

* database migrations
* edge functions
* auth/session logic

## Current Workflow Coverage

* free-start
* free-gate
* free-claim
* admin free-key control
* test flow execution
* block / fingerprint protection
* rate-limit handling

## Free Key Flow Manual Test Checklist

* /free → select key → Get Key → pass gate → claim → verify → receive key
* TOO_FAST handling
* Reload gate protection
* Reload claim protection
* Reveal twice protection
* Missing claim handling
* Admin test mode
* Rate limit handling
* Blocklist verification

## Repository Status

This repository is actively maintained with continuous production fixes, deployment updates, UI improvements, and backend workflow adjustments.
