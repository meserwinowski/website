---
title: The Self-Hosters Guide to Vibe Coding a Website
description: On the technical details of this website
status: draft
tags:
  - software
  - website
thumbnail: /assets/about-page.png
date: 2026-06-07
repo: https://github.com/meserwinowski/website
---
---

Six months ago I would not have attempted to build this website.

For all the flak that AI tools have been getting, I don't really agree with the criticisms of their use in software. The latest tool's abilities to script and develop [greenfield projects](https://en.wikipedia.org/wiki/Greenfield_project) is nothing short of amazing.

I figured a website would be an excellent project to experiment with the available tools and compute at my disposal.

In this article I‘ll walk through the path I took for creating this website, and enumerate my AI tool usage with the hopes of inspiring others to integrate them into their own workflows.

> [!warning]- *Disclaimer*
> Views, statements, and opinions expressed here are solely my own and do not reflect any positions or policies of Microsoft.
> 
> All of the written material here is my own. The website styling and infrastructure was co-designed with AI tools.

---

# Why?

I wanted a digital space to showcase things I've worked on, and share some of the ideas that I like to play around with. Self-hosting a website is also a natural extension of the burgeoning home lab (Project Post Pending) I've assembled for myself over the last few years.

# Overview

This article is the first of a pair. I realized this post was getting out of scope and decided to split it up. This one explores the technical design of the website, and what I did to get it off the digital ground and into your screen.

The second article is more of an opinion piece where I wax poetically about the implications of AI tooling and what I learned and noticed while using them.

---
# Technical

The technical components of the site will be broken up into four sections:
1) Design
2) Hosting
3) Deployment
4) Development

Design will cover how I initially approached the project, and what stack I choose. Hosting covers what my hardware / networking setup looks like. Deployment covers actually getting the website changes online, and Development is about some of the things I encountered in my agentic programming experience.

## Token Spend

I neglected to actually track this, but I can definitely say its in the 10,000 to 50,000 AI Credits (AIC) range. AIC is the unit that Microsoft has for Copilot, and from what I've seen it's roughly $0.01 per credit. So all in all somewhere between $100 and $500 for the v1.0 website in compute costs.

That said, my preference for framing costs is in *time*. If I think about how much time I would have spent learning, searching resources / documentation, and writing code I would be massively over that $500.

---

## Design

The original intent of the site was to be a dual portfolio where I could showcase music and engineering projects. I'm not a well versed UI / UX designer, so my design sense has been in large part cherry picking things I liked from other similar websites.

### Ideals
When imaging my ideal personal site, here are some descriptors I was drawn towards:
- Performant
- Secure
- Maintainable
- Reliable
- Aesthetic
- Reflective
#### Performant, Secure, Maintainable, and Reliable
Clearly my analytical side speaking. I think these really don't need elaboration, but I'll be clear for completeness.
- **Performant** - The website should be smooth. It should load quickly. Memory and execution footprints should be as small as possible.
- **Secure** - Exposing software and hardware to the open internet makes one a target. I should take great care to configure everything to prevent malicious actors from gaining access to my systems. This also includes making sure I'm not mindlessly leaking personal data or cryptographic secrets.
- **Maintainable** - Spaghetti code / systems make interacting with software unbearable. I should be able to understand the codebase and my networking setup without too much struggle.
- **Reliable** - Website doesn't randomly break. The site / web server are portable: easy to teardown and standup wherever they needs to be.
#### Aesthetics
For better or for worse, I have an overriding aesthetic sense that I try to fulfill whenever I have means. I have strong opinions on how art or tools should look, feel, and function. Colors + fonts I like. Layouts I find appropriate and functional. Minimalist.
#### Reflective
Not literally in the material sense, but reflective of who I am. Widgets that make the site more accessible and interesting. Creative elements to distinguish the site from others like it. Much of this reflective component is handled by the aesthetics and material published on the site.

### Minimal Requirements
The site should:
- Be able to host text, images, and video.
- Ingest markdown and support hyperlinks.
- Be self-hosted and portable.
- Not be a massive expense.

From a layout perspective I just wanted a `Projects` directory page, an `About` page, and some buttons to link to my social media, LinkedIn, GitHub, etc.



---

## Hosting

### Web Servers 101
My Network Attached Storage (NAS) unit is the current host of the website - it's always running and provides basic native infrastructure for hosting containers, so it felt like the right home to me.

Over the years I've developed a basic familiarity with Docker, and I've learned that a web server is a pretty good application to containerize. It helps keep configuration and deployment simple.

For the web server I opted to go for [nginx](https://nginx.org/). I'm not a diehard open source software (OSS) guy (I've mained Windows my whole life), but small memory footprints and OSS fit my preferences.

I'm using the `nginx:alpine` image provided via the Synology Container App, and then I have a `compose.yaml` I deploy from my OneDrive and use to spin up the container. The compose file is surprising straight forward: you configure a port, connect the paths for the website distribution files (`dist`) to the containers html, and the paths for the `.conf` configuration file.

My `compose.yaml` (+ minor obfuscation)

```yaml fold:compose.yaml
services:
	web:
		image: nginx:alpine
		container_name: webserver_nginx
		ports:
		- "XXXX:XX"
		volumes:
		- NAS_DEPLOY_PATH/dist:/usr/share/nginx/html:rw
		# AI/scraper User-Agent blocking + rate limiting.
		# The file is deployed to the NAS by the website repo's scripts/deploy.sh;
		# it must exist before the first `recreate` or Docker will create a dir there.
		- NAS_DEPLOY_PATH/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
		restart: unless-stopped
```

> [!important]- Resiliency
> In the situation that my NAS fails- I'll actually have a lot of issues to deal with. One of my plans is to create a worker that can redeploy my website onto a cloud instance, or another piece of hardware that I own.

### Networking Basics
Starting at the other end of the hosting process - how I got my domain and how your computer found my website to begin with. *If you're not interested in these details I suggest just skipping to the visual below.*

#### Domain
NameCheap was used to register my domain (`mattserwinowski.com`). Easy process, can't complain. 

#### CloudFlare
I've setup CloudFlare to resolve my Domain Name System ([DNS](en.wikipedia.org/wiki/Domain_Name_System)) records. Configuring CloudFlare was more involved, but I learned a lot, and their free tier has been sufficient for my needs.
- The main thing I setup were the DNS records: I have a couple of A records for the apex domain and subdomains, and a CNAME for `www.` to the apex domain. All reverse proxied.
- CloudFlare provides some basic analytics, logs, AI crawler support, DDoS protection, and caching to help with server load.
- I got my first line of defense: A Geo-Block security rule. (Sorry Melissa >.<)
- I was enlightened to [DMARC](https://en.wikipedia.org/wiki/DMARC) and how to prevent email spoofing from my domain.

My server's IP address is dynamic - I setup a script on the NAS that pushes the latest IP to CloudFlare to make sure they stay mostly synchronized.

> [!info]- Domain Name Hierarchy
> It's nuts to me how much of the internet relies on [ICANN](https://en.wikipedia.org/wiki/ICANN) and a handful of operators. I found this [CloudFlare article on DNS](https://www.cloudflare.com/learning/dns/dns-server-types/) to be very good. This wikipedia page on [alternative DNS roots](https://en.wikipedia.org/wiki/Alternative_DNS_root) is also an interesting read.

##### Dynamic DNS ([DDNS](https://en.wikipedia.org/wiki/Dynamic_DNS))
Since my Internet Service Provider (ISP) can always rotate my home network's IP address, I knew I needed to setup DDNS so my website would always be available.

I have a scheduled task on that NAS that periodically pushes an updated IP to CloudFlare which ensures the NAS will continue to resolve.

I had originally looked at Synology's DDNS feature, but I’ll leave that for the Home Lab post.

##### DNS Security Extensions ([DNSSEC](https://en.wikipedia.org/wiki/Domain_Name_System_Security_Extensions))
Another concept I was exposed to from this project. DNSSEC was created to help protect some of the vulnerabilities in DNS. For example, [DNS cache poisoning](https://en.wikipedia.org/wiki/DNS_spoofing).

Not that I expect to be a target of this, but enabled anyways because I do believe in [defense-in-depth](en.wikipedia.org/wiki/Defense_in_depth_(computing)).

#### Local Network
Now that I have traffic resolving to my home network I had to get a bit more serious about configuring all my equipment correctly.

I'm using a Unifi Cloud Gateway as the router for my local network. Hate to fanboy, but I've been seriously impressed with Unifi equipment (price tag aside).

[Intrusion Protection](https://help.ui.com/hc/en-us/articles/360006893234-UniFi-Gateway-Intrusion-Detection-and-Prevention-IDS-IPS) - Enabled
Network -> Flow Control -> Enabled

The only real thing I configured for the gateway was port forwarding so that HTTP/HTTPS worked correctly.

When the gateway receives a request it now knows where to forward that request to my NAS.

### NAS
Besides hosting the web server there were a couple of additional configurations I needed to make. More details on the NAS in the dedicated home lab post (TODO).

#### Reverse Proxy
Reverse proxies honestly took me a minute to wrap my head around, but once it clicked a lot of things about the web made much more sense.

#### Let’s Encrypt
So while I understood the conceptual difference between [HTTP](https://en.wikipedia.org/wiki/HTTP) and [HTTPS](https://en.wikipedia.org/wiki/HTTPS), I did not understand how a website actually knew which one to use until this project.

The key thing’s I learned:
- HTTPS and HTTP are serviced over [different standardized ports](https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Well-known_ports)
- HTTPS uses a [TLS](https://en.wikipedia.org/wiki/Transport_Layer_Security) certificate to secure the connection
- The TLS certificate comes from a [certificate authority](https://en.wikipedia.org/wiki/Certificate_authority), who is the third party that validates the connection for the user
- [Let’s Encrypt](https://en.wikipedia.org/wiki/Let%27s_Encrypt) is the biggest non profit certificate authority, and Synology DSM provides native support for acquiring and renewing a certificate

#### HTTP Strict Transport Security ([HSTS](https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security))
I also configured CloudFlare to automatically try and route HTTP to an HTTPS connection. This was a nice mini mental mystery to resolve, and continued defense in depth.

#### Firewall
A critical feature to get right when exposing your systems to the internet.

The DSM interface was a little confusing, but once I had a sense of the flow it was easy to only expose the ports and IP ranges that I needed to allow my website and my containers to function.

### Visual
Here is a fun graph of the network route that should help mentally map the sections mentioned above. Its a simplification, but accurate to my current knowledge:

![[personal-website-resolve.excalidraw|800x600]]

1) Your device (assuming you're at home on a wired or wireless network) asks your router to resolve `mattserwinowski.com`
2) The router likely does not know my website and will recurse up to ask your Internet Service Provider (ISP) for help resolving.
3) Again, your ISP likely doesn't know my website, but a quick recurse into a [root name server](https://en.wikipedia.org/wiki/Root_name_server) and [TLD name server](https://www.cloudflare.com/learning/dns/top-level-domain/) would let them know to check out CloudFlare's DNS records.
4) Since I've configured CloudFlare to know about my website, they will do their GeoBlock / Security thing and decide if they will send you my (proxied) address.
5) CloudFlare relays the proxy address back to the ISP server.
6) The ISP server relays the proxy address back to your router.
7) Your router requests data from the proxy address, which is a CloudFlare server. This server can cache my website and serve you quicker, and also shield my actual origin IP address.
8) The proxy server has my actual IP address, and will forward a request on to my network.
9) My Unifi Gateway would receive the (usually HTTPS) request and forward it on Port 443.
10) My NAS firewall will do another check and block requester's based on their IP address and what the are trying to access.
11) Once the NAS receives the request it will forward the domain name to the reverse proxy. This proxy is inside the NAS, and tells the NAS which internal port to use (maps 443 -> a different port).
12) That new port is the port the docker container exposes. This port going through docker will again remap to docker's internal port for the `nginx` web server.
13) A valid request for the website will be sent back to the NAS.
14) NAS will relay back to the gateway.
15) Gateway will relay back to the proxy server.
16) Proxy server will relay back to your network.
17) You receive my website data!

> [!attention]- A minor misadventure
> I was showing my new website to coworkers, and it kept getting blocked on the corporate network as "Malware". Annoying, but I assumed this was standard policy. I filed a report with network IT more as a curiosity than expecting a resolution, and they got back quickly saying their cybersecurity relies on categorization from Palo Alto Networks (PAN).
> 
> Sure enough, PAN's test-a-site service had categorized my website as malware. Some digging suggested this was an issue with my website not configuring SSL certificates correctly. Considering I had the website for some time before doing getting it certified, my bet was this was the reason. So I filed a re-categorization request.
> 
> PAN's automated response: "You requested re-categorization: 'Personal Site / Blog'; Upon review we have chosen 'Music'. This is an unmonitored mailbox. Thank you."
> 
> I'll take it. Definitely better than malware.

---

## Deployment

My entire deployment setup is pretty modern (I think?) while also committing (pun intended) the cardinal sin of pushing directly to prod.

What I've done is vibe-scripted some automation that links the following pieces together:
1) Obsidian
2) My local `website` repository
3) My remote `website` repository + GitHub Actions
4) My NAS host container

### Obsidian
All the text for this website is written in [Markdown](https://en.wikipedia.org/wiki/Markdown).

In recent months I have [migrated all of my notes and writing to Markdown for use in Obsidian](https://obsidian.md/). Obsidian's interface is very clean, extendable, and configurable. I cannot sing its praises enough.

I have a directory that contains all of the writing and assets for this website. All I have to do is create a new project note, give it the right frontmatter, write the article, and upload any media to the `assets` subdirectory in the vault.

Because my Obsidian vault is synced across all of my devices, I can work on website material whenever I feel like it. Works great on my Windows devices, my MacBook, and my iPhone. Markdown syntax is super simple too so I don't have to fiddle with all of the tools like most editors.

### Local Repo
#### Synchronization
To get my Obsidian articles and assets into the actual website I have a bunch of `.mjs`, `.sh`, and `.ps1` scripts that pull binaries from the Obsidian vault, do some cleaning / conversion, and then put them in the expected paths in the repository. Finally, there are scripts and infrastructure for local and remote deployment.

Since I am using Astro and `npm` I have my `package.json` configured to define execution aliases that make deployment super easy.

First I run `npm run sync` which is what synchronizes the content in the Obsidian vault to my local repo.
- It does this by kicking off a `run-local-script.mjs` wrapper script that determines if we are on Windows or macOS / Linux, and which scripts to kick off (`sync-content.sh` / `sync-content.ps1`).
- Once we chose our platform, the script pulls in `deploy.env` which has all of the relevant local paths/credentials and even the Spotify API URL. You can see details in `deploy.env.example` which is what is pushed to the public repository.
- The article markdowns are copied from `VAULT_SUBPATH` and any SVGs from `EXCALIDRAW_SUBPATH`, and put into the local repository paths.
- Another script is then called: `sync-obsidian-assets.mjs`. This script copies over media, which is a much heavier lift. It has logic to check if we have already sync'd an image, so we don't needlessly copy it every time.
- Next ANOTHER script is called: `strip-image-metadata.mjs`. This script removes metadata from images (so y'all can't data mine my pictures...), and converts the annoying Apple HEIC images into WebP for performance / compatibility reasons.

And now the repository is in sync with the Obsidian version of the project. This is a one way synchronization, so nothing goes into the vault.

#### Local Deploy
At the very beginning I did not have an established workflow or enough experience to start with good footing. I wanted to stand up something I could look at as soon as I could.

Given the web server was running on my NAS, but my development was on my MacBook or Windows desktop, I had to script a bridge between the two for local deployment. Since my NAS exposes its file system to my local network (given the right credentials are supplied), I just asked Copilot for a way to deploy binaries from my local repository, to my NAS.

What the agent and I settled on after a back and forth was to use [`rsync`](https://en.wikipedia.org/wiki/Rsync). Again, a tool I wasn't familiar with, but its 30 years old and cross platform.

`npm run deploy` is the alias I use for local deployment. It kicks off `deploy.ps1` or `deploy.sh` using the same `run-local-script.mjs` wrapper script. The script syncs content from Obsidian, builds the site, and then drops the binaries on the NAS using `rsync` and `ssh`.

Copilot also created a custom tool `nasctl` to act as a shim for reloading the web server whenever the content or configuration changed, among several other helpful features.

### GitHub Actions
I wanted a remote repository I could open source and publish, and GitHub is the de facto spot to do this. I figured I would explore deployment via GitHub while I was at it.

I knew GitHub supported CI / CD pipelines, but I had never actually set one up. [GitHub Actions](https://github.com/features/actions) (GA) ended up being a pretty seamless experience, and this is my current deployment path even though it adds a pretty big dependency.

The way Actions works is that when the `main` branch on the remote repository receives new commits, it automatically kicks off a work flow that 1) builds the repository, 2) runs the tests, and 3) publishes the website binaries.

From my perspective, I'm just running `git push` and then my website updates in about ~1 minute.

#### `Deploy Website`
GA is super easy to setup: you just drop a `.yml` file in `<repo>/.github/workflows` and GitHub will just pick and up.

The Action dispatch uses `secrets` that were manually added to the remote repo when creating the runner. The most interesting as a fine grained OAuth token from my Tailscale network - this allows the GitHub runner to actually resolve the local hostname that my NAS uses as if the runner were on my local network.

The deploy script I generated with Copilot is below.

```yml fold:deploy.yml
# CI/CD Pipeline: Build, test, and deploy to Synology NAS
# Triggers on push to main branch
#
# Required GitHub Secrets:
#   NAS_SSH_KEY          - Private SSH key for NAS access (nas_deploy_key)
#   NAS_HOST             - NAS hostname (e.g. a Tailscale MagicDNS name)
#   NAS_USER             - SSH username on NAS
#   NAS_DEPLOY_PATH      - Deployment path on the NAS (e.g., /path/to/webserver/dist)
#   TS_OAUTH_CLIENT_ID   - Tailscale OAuth client ID (lets the runner join your tailnet)
#   TS_OAUTH_SECRET      - Tailscale OAuth client secret

name: Deploy Website

on:
  push:
    branches: [main]

  # Allow manual trigger from GitHub UI
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      # 1. Check out the repository (includes committed content)
      - name: Checkout code
        uses: actions/checkout@v6

      # 2. Set up Node.js with dependency caching for faster installs
      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      # 3. Install dependencies
      - name: Install dependencies
        run: npm ci

      # 4. Build the Astro site
      - name: Build site
        run: npm run build

      # 5. Run tests against the built output
      - name: Run tests
        run: npm test

      # 6. Join the tailnet so the runner can reach the NAS over Tailscale
      - name: Connect to Tailscale
        uses: tailscale/github-action@v2
        with:
          oauth-client-id: ${{ secrets.TS_OAUTH_CLIENT_ID }}
          oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}
          tags: tag:ci

      # 7. Deploy to NAS via rsync over SSH
      - name: Deploy to NAS
        env:
          NAS_SSH_KEY: ${{ secrets.NAS_SSH_KEY }}
          NAS_HOST: ${{ secrets.NAS_HOST }}
          NAS_USER: ${{ secrets.NAS_USER }}
          NAS_DEPLOY_PATH: ${{ secrets.NAS_DEPLOY_PATH }}
        run: |
          # Write the SSH private key to a temp file
          mkdir -p ~/.ssh
          echo "$NAS_SSH_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key

          # Disable strict host key checking (NAS is on private network)
          echo "Host *" > ~/.ssh/config
          echo "  StrictHostKeyChecking no" >> ~/.ssh/config
          echo "  UserKnownHostsFile=/dev/null" >> ~/.ssh/config

          # Deploy with rsync
          rsync -avz --delete \
            --exclude='.DS_Store' \
            -e "ssh -i ~/.ssh/deploy_key -o RemoteCommand=none -o RequestTTY=no" \
            ./dist/ "$NAS_USER@$NAS_HOST:$NAS_DEPLOY_PATH/"

          # Clean up
          rm -f ~/.ssh/deploy_key
```

### Back to the Host
So now finally the GitHub Actions runner will have built my website from the remote repository, and used `rsync` itself to place the latest binaries on my local web server's docker container (which is what `NAS_DEPLOY_PATH` is).

Then I just check www.mattserwinowski.com for the latest changes.

## Development

### Preamble
I originally had this as the third main section, but decided it would make more sense to talk about last.

I'm not a web developer - I had a very basic understanding of what went into a website at the start of this project.

> [!info]- Now I did have a slight edge
> I had a bunch of experience working on the [Windows' Settings app](https://en.wikipedia.org/wiki/Settings_(Windows)) during my Microsoft tenure. Because the Settings app has an [MVVM architecture](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93viewmodel), I was exposed to some conceptual things around front-end, back-end, views, models, frameworks, etc. These concepts made the web jump a lot easier than I think it would have been otherwise.

And of course this website is pretty much [completely vibe coded.](https://en.wikipedia.org/wiki/Vibe_coding)

Though I think I prefer the term [agentic engineering](https://simonwillison.net/guides/agentic-engineering-patterns/what-is-agentic-engineering/). The rest of this article will be details about practices and design patterns I experimented with for this website.

### Getting Started

#### Specification

#### Documentation

#### Tests

### Program Manager Vibes

#### Colors

#### Feel

#### Bug Fixes

### Help Me Understand

#### Comments

### Copycat

#### LLMs Can See



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
