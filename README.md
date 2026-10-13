# TikTok Core with Rileigh — Weekly Tracker

Mobile-friendly weekly check-ins and progress charts. Members enter their exact first/last name and shop name, choose a completed Sunday–Saturday week, then save six metrics and optional comments.

## Publishing

In repository Settings → Pages, choose **GitHub Actions** as the source. The Deploy tracker workflow builds and publishes on pushes to main, and can also be run manually from Actions.

Expected member URL: https://tiktokmentorshipwithrileigh.github.io/WeeklyTracker/

## Data and access

This repository contains frontend source only. Submissions stay in the existing server database; no member data or secret keys are committed here. The configured server API accepts this GitHub Pages origin. Members need no GitHub or ChatGPT account. The mentor link opens the existing protected admin dashboard.

The requested exact name + shop matching is low-assurance access: someone who knows both can access that member's record. It does not provide strong identity verification.

## Local development

Use Node 22.13 or later. Run `npm install`, then `npm run build`. The production API restricts browser requests to the published origin; localhost needs a separately configured development backend.
