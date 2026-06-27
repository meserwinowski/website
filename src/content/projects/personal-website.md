---
title: Personal Website
description: Portfolio and blog built with Astro, Tailwind CSS, and deployed to a home server.
status: planning
tags:
  - software
  - website
thumbnail: /images/projects/personal-website.svg
date: 2026-06-07
repo: https://github.com/meserwinowski/website
---

## Overview

A personal portfolio site to document projects and share writing. Built from scratch as a learning exercise in modern web development.

## Tech Stack

- **Framework:** Astro 6 (static site generation)
- **Styling:** Tailwind CSS v4
- **Hosting:** Synology NAS running nginx in Docker
- **DNS/CDN:** Cloudflare

## Features

- Dark/light theme toggle with localStorage persistence
- Responsive design with mobile hamburger menu
- Spring-easing micro-interactions on buttons and links
- View Transitions with directional slide animations
- Content collections for projects and (future) blog posts

## What I Learned

Building this site taught me the basics of HTML, CSS, static site generators, DNS configuration, reverse proxies, and deployment automation with rsync.

```bash
# Deploy with a single command
npm run deploy
```
