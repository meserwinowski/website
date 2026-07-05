---
title: The Self-Hosters Guide to Vibe Coding a Website (Part 1)
description: Article on creating a self-host website with agentic engineering
status: planning
tags:
  - software
  - website
thumbnail: /images/projects/personal-website.svg
date: 2026-06-07
repo: https://github.com/meserwinowski/website
---
---

Six months ago I would not have attempted to build this website.

For all the flak that AI tools have been getting, I don't really agree with the criticisms of their use in software. The latest tool's abilities to script and develop [greenfield projects](https://en.wikipedia.org/wiki/Greenfield_project) is nothing short of amazing.

I figured this would be a great project to experiment with the available tools and compute at my disposal.

In this article I want to walk through the path I took for creating this website, and enumerate my AI tool usage with the hopes of inspiring others to integrate them into their own workflows.

> [!warning]- *Disclaimer*
> Views, statements, and opinions expressed here are solely my own and do not reflect any positions or policies of Microsoft.
> 
> All of the written material here is my own. The website styling and infrastructure was co-designed with AI tools.

---

# Why?
I wanted a digital space to showcase things I've worked on, and share some of the ideas that I like to play around with. Self-hosting a website is also a natural extension of the burgeoning home lab (Project Post Pending) I've assembled for myself over the last few years.

# Overview

This project post is Part 1 of a two part series. I realized the post was getting out of scope and decided to split it up. Part 1 here deals with the technical design of the website, and what I did to get it off the digital ground and into your screen.

Part 2 is more of an opinion piece where I go wax poetically about the implications of AI tooling and how I used them.

#### A Worthy Challenge(r) Appears
Building a website has been a worthy challenge. My bread and butter is low level systems development; Web development has always been this whole other domain that I felt I could probably understand, but didn't have the patience to really deal with.

AI transform this situation. What was once tedious and frustrating becomes difficult and engaging. I don't have to pick up a textbook or work my way through another tutorial. I can jump right into the thing I *want* to work on. This, in combination with the oracle-like nature of an LLM, reshapes the entire dynamic.

For me this shift puts learning web development squarely into the [zone of proximal development](https://en.wikipedia.org/wiki/Zone_of_proximal_development).

#### Deal with the Devil
[I'd be remiss ](https://www.hubermanlab.com/)if I didn't mention that there are genuine issues around AI tool usage. Issues beyond just [hallucinations](https://en.wikipedia.org/wiki/Hallucination_(artificial_intelligence)) or [producing slop](https://en.wikipedia.org/wiki/AI_slop). Some I find more concerning:

1) **Deskilling** - your skills and cognitive strength will atrophy. It's very similar to how if we don't use our bodies, our muscles become weak and physical stamina decreases.

2) **Drift** - As you get further and further into a project using AI, its very common for the model to conceptually drift and start making mistakes or nonsensical design decisions. The issue here compounds with deskilling and fatigue - when you're mentally drained its hard to catch problems or poor design decisions as they arrive.

There are techniques to deal with both of these, but at the end of the day I feel like like the [No Free Lunch](https://en.wikipedia.org/wiki/No_free_lunch_theorem) principle applies here: AI tools can give you super powers at the cost of degrading your own innate and acquired abilities.

But let's assume you can leverage AI to great effectiveness while also mitigating the side effects. Now the bar has been raised. Expectations are higher. Building a website? Impressive a decade ago. Building one now? Significantly easier.

I've noticed a similar sentiment across blogs and social media.

#### Stay Frosty
- Stop Conditions
- Read the Residual
- The real bottle neck is your mental model
- [Code is no longer the primitive, its the specification.](https://aicoding.leaflet.pub/3mjfruwwuck2d)
- Mind your token burn


---
# Technical Overview
The technical components of the site will be broken up into four sections:
1) Hosting
2) Development
3) Deployment
4) Design

#### Token Spend
I neglected to actually track this, but I can definitely say its in the 10,000 to 50,000 AI Credits (AIC) range. AIC is the unit that Microsoft has for Copilot, and from what I've seen it's roughly $0.01 per credit. So all in all somewhere between $100 and $500 for the v1.0 website in compute costs.

That said, my preference for framing costs is in *time*. If I think about how much time I would have spent learning, searching resources / documentation, and writing code I would be massively over that $500.

## Hosting

### Web Servers 101
My Network Attached Storage (NAS) unit is the current host of the website - it's always running and provides basic native infrastructure for running containers, so it felt like the right home to me.

Over the years I've developed a basic familiarity with Docker, and I've learned that a web server is a pretty good application to containerize. It helps keep configuration and deployment simple.

For the web server I opted to go for [nginx](https://nginx.org/). I'm not a diehard open source software (OSS) guy (I've mained Windows my whole life), but small memory footprints and OSS are my preferences.

I'm using the `nginx:alpine` image provided via the Synology Container App, and then I have a `compose.yaml` I deploy from my OneDrive and use to spin up the container. The compose file is surprising straight forward: you configure a port, connect the paths for the website distribution files to the containers html, and the paths for the `.conf` configuration file.

> [!important] Resiliency
> In the situation that my NAS fails- I'll actually have a lot of issues to deal with. One of my plans though is to create a worker that can redeploy my website onto a cloud instance, or another piece of hardware that I own.

### Networking Basics
Starting at the other end of the hosting process - how I got my domain and how your computer found my website to begin with.

#### Domain
[NameCheap](https://www.namecheap.com/) was used to register my domain (`mattserwinowski.com`). Easy process, can't complain.

#### CloudFlare
I've setup CloudFlare to resolve my Domain Name System (DNS) records. Configuring CloudFlare was more involved, but I learned a lot, and their free tier has been sufficient for my needs.
- The main thing I setup were the DNS records: I have a couple of A records for the apex domain and subdomains, and a CNAME for `www.` to the apex domain. All reverse proxied.
- CloudFlare provides some basic analytics, logs, AI crawler support, DDoS protection, and caching to help with server load.
- I got my first line of defense: A Geo-Block security rule. (Sorry Melissa >.<)
- I was enlightened to [DMARC](https://en.wikipedia.org/wiki/DMARC) and how to prevent email spoofing from my domain.

My server's IP address is dynamic - I setup a script on the NAS that pushes the latest IP to CloudFlare to make sure they stay mostly synchronized.

#### Local Network
I'm using a Unifi Cloud Gateway as the router for my local network. Hate to fanboy, but I've been seriously impressed with Unifi equipment (the price tag aside).

### Visual

> [!attention]- A small misadventure
> I was showing my new website to coworkers, and it kept getting blocked on the corporate network as "Malware". Annoying, but I assumed this was standard policy. I filed a report with network IT more as a curiosity than expecting a resolution, and they got back quickly saying their cybersecurity relies on categorization from Palo Alto Networks (PAN).
> 
> Sure enough, PAN's test-a-site service had categorized my website as malware. Some digging suggested this was an issue with my website not configuring SSL certificates correctly. Considering I had the website for some time before doing getting it certified, my bet was this was the reason. So I filed a re-categorization request.
> 
> PAN's automated response: "You requested re-categorization: 'Personal Site / Blog'; Upon review we have chosen 'Music'. This is an unmonitored mailbox. Thank you."
> 
> I'll take it. Definitely better than malware.

---

## Development

## Deployment


---

The website is enabled by the following components:
- Hardware
  - Synology NAS
  - Unifi Cloud Gateway
- Virtualization
  - Operating System - [Synology DiskStation Manager (DSM)](https://www.synology.com/en-global/dsm)
  - Sandbox - Docker
  - Webserver - nginx
- Software
  - Astro - JS Framework
  - Tailwind - CSS
  - Vite - Testing
  - Git - Source Control
  - GitHub Actions / rsync - CI/CD
- Network
  - Domain - Namecheap
  - DNS Records - CloudFlare

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
