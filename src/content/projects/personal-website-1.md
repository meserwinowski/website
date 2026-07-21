---
title: The Self-Hosters Guide to Vibe Coding a Website
description: On the technical details of this website
status: ongoing
tags:
  - software
  - website
thumbnail: /assets/personal-website-1/about-page.png
date: 2026-06-07
repo: https://github.com/meserwinowski/website
---
---

Six months ago I would not have attempted to build this website.

For all the flak that AI tools have been getting, I don't really agree with the criticisms of their use in software. The latest tool's abilities to script and develop [greenfield projects](https://en.wikipedia.org/wiki/Greenfield_project) is nothing short of amazing.

I figured a website would be an excellent project to experiment with the available tools and compute at my disposal.

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

The technical components of the site will be broken up into four sections:
1) Design
2) Hosting
3) Deployment
4) Development

Design will cover how I initially approached the project, and what stack I choose. Hosting covers what my hardware / networking setup looks like. Deployment covers actually getting the website changes online, and Development is about some of the things I encountered in my agentic programming experience.

## Token Spend

I neglected to actually track this, but I can definitely say its in the 10,000 to 50,000 AI Credits (AIC) range. AIC is the unit that Microsoft has for Copilot, and from what I've seen it's roughly $0.01 per credit. So all in all somewhere between $100 and $500 for the v1.0 website in compute costs.

That said, my preference for framing costs is in *time*. If I think about how much time I would have spent learning, searching resources / documentation, and writing code I would be massively over that $500.

I ran with Opus 4.6 and Opus 4.8 for most of this project, with GPT 5.5 as a rubber ducky. On occasion I also tasked smaller models and Copilot's `Auto` mode on simple problems - I was **not** very impressed with the results.

---

## Design

The original intent of the site was to be a dual portfolio where I could showcase music and engineering projects. I'm not well versed in UI / UX, so my design sense has been in large part cherry picking things I liked from other websites.

### Minimal Requirements
The site should:
- Be able to host text, images, and video.
- Ingest markdown and support hyperlinks.
- Be self-hosted and portable.
- Not be a massive expense.

From a layout perspective I just wanted a `Projects` directory page, an `About` page, and some buttons to link to my social media, LinkedIn, GitHub, etc.

### Ideals
When imaging my ideal personal site, here are some principles I was drawn towards:
- Performant
- Secure
- Maintainable
- Reliable
- Aesthetic
- Reflective

#### Performant, Secure, Maintainable, and Reliable
Clearly my analytical side speaking. I think these really don't need elaboration, but I'll be clear for completeness.
- **Performant** - The website should be smooth. It should load quickly. Memory and execution footprints should be as small as possible.
- **Secure** - Exposing software and hardware to the open internet makes one a target. I should take great care to configure everything I can to prevent malicious actors from gaining access to my systems. This also includes making sure I'm not mindlessly leaking personal data or cryptographic secrets.
- **Maintainable** - Spaghetti code / systems make interacting with software unbearable. I should be able to understand the codebase and my networking setup without too much struggle.
- **Reliable** - Website doesn't randomly break. The site / web server are portable: easy to teardown and standup wherever they needs to be.
#### Aesthetics
For better or for worse, I have an overriding aesthetic sense that I try to fulfill whenever I have the means. I have strong opinions on how art or tools should look, feel, and function. Colors + fonts I like. Layouts I find appropriate and functional. Minimalist.
#### Reflective
Not literally in the material sense, but reflective of who I am. Widgets that make the site more accessible and interesting. Creative elements to distinguish the site from others like it. Much of this reflective component is handled by the aesthetics and articles published on the site.

### Widgets
Every website needs a light / dark mode toggle. Its 2026, and it drives me nuts when a site or application does not support dark mode. This was the only widget I knew I needed to have. As the project evolved I added more widgets that caught my attention on other websites. They definitely bring a static site to life!

The widgets I added for version 1.0:
- Light / Dark toggle button
- A button to bring you back to the top of the page
- Reading progress bar at the top edge
- The Spotify workers on the About page which pull my latest activity

![hello](about-page.png)

### Research
Essentially all I knew going into this was that I was going to containerize the server, and I was going to be messing with JavaScript, CSS, and HTML.

The first thing that became clear from trying to figure out what to do was that I was going to want a [static web page](https://en.wikipedia.org/wiki/Static_web_page). This is in contrast to a [dynamic web page](https://en.wikipedia.org/wiki/Dynamic_web_page).

The second thing that became abundantly clear is that writing HTML is definitely not a thing people have done for quite some time. Instead [site generators](https://en.wikipedia.org/wiki/Static_web_page#Static_site_generators), or frameworks, are used to *compile* the HTML from a bunch of source binaries and content. Past conversations around Node/React/Next/Vue and other front end technologies have started to make a lot more sense.

Now I needed to choose some frameworks.

Focusing on runtime performance and development loop speed a quick web search suggested [Astro](https://astro.build/) and [Hugo](https://gohugo.io/) as my options for modern frameworks. I ended up choosing Astro, probably because of the marketing copy.

The third thing I had to decide was what tools I would use to build the site and generate [CSS](https://en.wikipedia.org/wiki/CSS). For CSS, [Tailwind](https://tailwindcss.com/docs/installation/using-vite) seems to be the most popular so I went with that. [Vite](https://vite.dev/) appeared to be the native build tool behind Astro and Tailwind, so I defaulted to that without looking at possible alternatives. For testing, [Vitest](https://vitest.dev/) followed from the Vite dependency.

And finally [`git`](https://en.wikipedia.org/wiki/Git) for source control.

---

## Hosting

### Web Servers 101
My Network Attached Storage ([NAS](https://en.wikipedia.org/wiki/Network-attached_storage)) unit is the current host of the website - it's always running and provides basic native infrastructure for hosting containers, so it felt like the right home to me.

Over the years I've developed a basic familiarity with [Docker](https://en.wikipedia.org/wiki/Docker_(software)), and I've learned that a web server is a pretty good application to containerize. It helps keep configuration and deployment simple.

For the web server I opted to go for [nginx](https://nginx.org/). I'm not a diehard open source software (OSS) guy (I've mained Windows my whole life), but small memory footprints fit my preferences + its popular so probably robust and lots of documentation.

I'm using the `nginx:alpine` image provided via the Synology Container App, and then I have a `compose.yaml` I use to spin up the container. The compose file is surprising straight forward: you configure a port, connect the paths for the website distribution files (`dist`) to the containers html, and the paths for the `.conf` configuration file.

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
Starting at the other end of the hosting process - how I got my domain, and how your computer found my website to begin with. *If you're not interested in these details I suggest just skipping to the visual below.*

![[nas-gateway-pi.HEIC]]

#### Domain
NameCheap was used to register my domain (`mattserwinowski.com`). Easy process, can't complain. 

#### CloudFlare
I've setup CloudFlare to resolve my Domain Name System ([DNS](en.wikipedia.org/wiki/Domain_Name_System)) records. Configuring CloudFlare was more involved, but I learned a lot, and their free tier has been sufficient for my needs.
- The main thing I setup were the DNS records: I have an A record for the apex domain, and CNAMEs for the subdomains / `www.`. All cloud proxied.
- CloudFlare provides some basic analytics, logs, AI crawler support, DDoS protection, and caching to help with server load.
- I got my first line of defense: A Geo-Block security rule. (Sorry Melissa >.<)
- I was enlightened to [DMARC](https://en.wikipedia.org/wiki/DMARC) and how to prevent email spoofing from my domain.

My server's IP address is dynamic - I setup a script on the NAS that pushes the latest IP to CloudFlare to make sure they stay mostly synchronized.

> [!info]- Domain Name Hierarchy
> It's nuts to me how much of the internet relies on [ICANN](https://en.wikipedia.org/wiki/ICANN) and a handful of operators. I found this [CloudFlare article on DNS](https://www.cloudflare.com/learning/dns/dns-server-types/) to be very good. This wikipedia page on [alternative DNS roots](https://en.wikipedia.org/wiki/Alternative_DNS_root) is also an interesting read.

##### Dynamic DNS ([DDNS](https://en.wikipedia.org/wiki/Dynamic_DNS))
Since my Internet Service Provider (ISP) can always rotate my home network's IP address, I expected that  I needed to setup DDNS. This way my website wouldn't just randomly be unavailable until I fixed the CloudFlare record.

I have a scheduled task on my NAS that periodically pushes an updated IP to CloudFlare which ensures the NAS will continue to resolve.

I had originally looked at Synology's DDNS feature, but I’ll leave that for the Home Lab post.

##### DNS Security Extensions ([DNSSEC](https://en.wikipedia.org/wiki/Domain_Name_System_Security_Extensions))
Another concept I was exposed to from this project. DNSSEC was created to help protect some of the vulnerabilities in DNS. For example, [DNS cache poisoning](https://en.wikipedia.org/wiki/DNS_spoofing).

Not that I expect to be a target of this, but enabled anyways because I do believe in [defense-in-depth](en.wikipedia.org/wiki/Defense_in_depth_(computing)).

#### Local Network
Now that I have traffic resolving to my home network I had to get a bit more serious about configuring all my equipment correctly.

I'm using a Unifi Cloud Gateway as the router for my local network. Hate to fanboy, but I've been seriously impressed with Unifi equipment (price tag aside).

The only real thing I configured for the gateway was port forwarding so that HTTP / HTTPS worked correctly. When the gateway receives a request on my public IP it now knows to forward that request to my NAS.

---

### NAS
Besides hosting the web server there were a couple of additional configurations I needed to make.

The NAS should be receiving  [HTTP](https://en.wikipedia.org/wiki/HTTP) and [HTTPS](https://en.wikipedia.org/wiki/HTTPS) requests from the gateway, and as the web server host the NAS needs to figure out how to respond to them.

#### Let’s Encrypt
So while I understood the conceptual difference between HTTP and HTTPS I did not understand how a website actually knew which one to use until this project.

The key thing’s I learned:
- HTTPS and HTTP are serviced over [different standardized ports](https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Well-known_ports)
- HTTPS uses a [TLS](https://en.wikipedia.org/wiki/Transport_Layer_Security) certificate to secure the connection
- The TLS certificate comes from a [certificate authority](https://en.wikipedia.org/wiki/Certificate_authority), who is the third party that validates the connection for the user
- [Let’s Encrypt](https://en.wikipedia.org/wiki/Let%27s_Encrypt) is the biggest non profit certificate authority, and Synology DSM provides native support for acquiring and renewing a certificate

#### HTTP Strict Transport Security ([HSTS](https://en.wikipedia.org/wiki/HTTP_Strict_Transport_Security))
I also configured CloudFlare to automatically try and route HTTP to an HTTPS connection. This was a nice mini mental mystery to resolve, and continued defense-in-depth.

#### Firewall
A critical feature to get right when exposing your systems to the internet.

The DSM interface was a little confusing, but once I had a sense of the flow it was easy to only expose the ports and IP ranges that I needed to allow my website and my containers to function.

---

#### Reverse Proxy
Reverse proxies honestly took me a minute to wrap my head around, but once it clicked a lot of things about the web made much more sense.

This proxy, internal to the NAS, can direct HTTPS traffic (port 443) to the correct internal port using the domain as a map key. This is an essential feature for me, as it allows the NAS to distinguish callers **by their subdomain**. So connections to my website, plex server, raspberry pi, and DSM can all share my apex domain, and then they can be routed by their subdomain once they reach the reverse proxy.

##### DSM Access Control Profile (ACP)
The reverse proxy also supports these access profiles which seem to be Access Control Lists (ACLs) for IP ranges/addresses. [CIDR](https://en.wikipedia.org/wiki/Classless_Inter-Domain_Routing) bit masking for sub nets has now also become a lot clearer for me between this and configuring the firewall. This is useful because I can limit access to the different systems at the reverse proxy where the connections diverge on my local network. For example, only my local network and Tailscale network connections can access my home services like Plex and DSM.

> [!bug]- PiHole Split DNS
> Creating an ACP for my Plex subdomain seemed to trigger this bug where trying to access the subdomain always resulted in a `SSL_ERROR_BAD_CERT_DOMAIN` error. For some reason the default DSM certificate was being compared against the subdomain, and not the Let's Encrypt cert that was created for it.
> 
> Important to note I use a [PiHole](https://pi-hole.net/) as my DNS on my home network. I had created a Local DNS record on my PiHole so that my Tailscale devices that used my NAS as an exit node could loopback and access my home lab services.
> 
> Anyways, with the ACP I couldn't access my Plex server anymore. Copilot helped me figure out that this was a split DNS issue - I was handling exit node A records, but AAAA records were flying out to CloudFlare and coming back and using the DSM default certificate. The fix was to make a `dnsmasq_lines` change to the PiHole. I'm 100% confident that in the past this would have taken me ages to figure out.

### Visual
Here is a fun graph of the network route that should help mentally map the sections mentioned above. Its a simplification, but accurate to my current knowledge:

![[personal-website-resolve.excalidraw|800x600]]

1) Your device (assuming you're at home on a wired or wireless network) asks your router to resolve `mattserwinowski.com`
2) The router likely does not know my website and will [recurse up](https://www.cloudflare.com/learning/dns/what-is-recursive-dns/) to ask your ISP for help resolving.
3) Again, your ISP likely doesn't know my website, but a quick recurse into a [root name server](https://en.wikipedia.org/wiki/Root_name_server) and [TLD name server](https://www.cloudflare.com/learning/dns/top-level-domain/) would let them know to check out CloudFlare's DNS records.
4) Since I've configured CloudFlare to know about my website, they will do their GeoBlock / Security thing and decide if they will send you my (proxied) address.
5) CloudFlare relays the proxy address back to the ISP server.
6) The ISP server relays the proxy address back to your router.
7) Your router requests data from the proxy address, which is a CloudFlare server. This server can cache my website and serve you quicker, and also shield my actual origin IP address.
8) The proxy server has my actual IP address, and will forward a request on to my network.
9) My Unifi Gateway would receive the (usually HTTPS) request and forward it on Port 443.
10) My NAS firewall will do another check and block requester's based on their IP address and what destination / port they are trying to access.
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
> Sure enough, PAN's test-a-site service had categorized my website as malware. Some digging suggested this was an issue with my website not configuring SSL certificates correctly. Considering I had the domain setup for some time before getting it certified, my bet was that this was the reason. So I filed a re-categorization request.
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

In recent months I have migrated all of my notes and writing to Markdown for use in [Obsidian](https://obsidian.md/). Obsidian's interface is very clean, extendable, and configurable. I cannot sing its praises enough.

![[obsidian-view.png|600x400]]

I have a directory that contains all of the writing and assets for this website. All I have to do is create a new project note, give it the right front matter, write the article, and upload any media to the `assets` subdirectory in the vault.

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
At the very beginning I did not have an established workflow, or enough experience to start with good footing. I wanted to stand up something I could look at ASAP.

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
GA is super easy to setup: you just drop a `.yml` file in `<repo>/.github/workflows` and GitHub will just pickup the file and run with it.

The Action dispatch uses `secrets` that were manually added to the remote repo when creating the runner. The most interesting detail to me is the fine grained OAuth token from my Tailscale network - this allows the GitHub runner to actually resolve the local hostname that my NAS uses as if the runner were on my local network.

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

And of course this website is pretty much [completely vibe coded.](https://en.wikipedia.org/wiki/Vibe_coding)

Though I think I prefer the term [agentic engineering](https://simonwillison.net/guides/agentic-engineering-patterns/what-is-agentic-engineering/). The rest of this article will be about some of the decisions I made in the development process and a couple of things I noticed with using LLMs.

> [!info]- I did have a slight edge
> I had a bunch of experience working on the [Windows' Settings app](https://en.wikipedia.org/wiki/Settings_(Windows)) during my Microsoft tenure. Because the Settings app has an [MVVM architecture](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93viewmodel), I was exposed to some conceptual things around front-end, back-end, views, models, frameworks, etc. These concepts made the web jump a lot easier than I think it would have been otherwise.

### Getting Started
Standard `git init` to start the project. Using `gh` (GitHub CLI) to configure my remote repository. Link them together with `origin`. Using VS Code as my IDE. Setup my workspace.

Now obviously where this deviates is that I wasn't intending to write any code. I've got two harnesses configured: 1) The Copilot chat window in VS Code and 2) Copilot CLI in one of my terminal tabs.

![[terminal-screenshot.png|600x400]]

I've been particularly interested in new ways of thinking about software development. I don't want to get sidetracked, so I'll just say [this blog post](https://aicoding.leaflet.pub/3mjfruwwuck2d) has been on my mind in particular.

#### Standup
My first goal is to get some `localhost` version of the website spun up, and to evolve + learn a new development cycle along the way.

So the first prompt is requesting Copilot to scaffold a project structure and a basic "Hello World" site using Astro. Unfortunately, I did not capture progress pictures as I was doing this, so my textual descriptions will have to suffice.

> [!idea]- Here's an idea
> Since the repository is public, maybe replaying the commit history would yield a visual history.

Conveniently, Astro + Vite can spin up a development or `preview` server that let's me see how the website is progressing without having to worry about deployment. Copilot quickly turned these into nice `npm` aliases:

`npm run dev` - build the static site, and Vite spins up something on the backend that hosts the server on my laptop. With realtime updates and debug tools!

![[npm-run-dev.png|400x200]]

`npm run preview` - does the same as dev, but exposes the development site to my local network so I could render and play with the site on my phone.

#### Tests & Docs
Asking for tests and documentations from the AI has been a pretty solid strategy so far. Early on I made sure that was a part of the development flow - Copilot quickly adapted and created instructions + memories that persisted across sessions. Every feature I added Copilot would automatically handle text execution, and it investigated any failures. Incredible really.

For documentation I opted for just a `README.md` on this project. From this frame the site is definitely more vibe-coded than engineered. I didn't create any design or specification documents. I prompted design iteratively and solved problems as they arose. Documentation and tests have been really helpful for mitigating [drift](https://docs.aws.amazon.com/prescriptive-guidance/latest/gen-ai-lifecycle-operational-excellence/prod-monitoring-drift.html).

I will say though that the [AI slop ](https://en.wikipedia.org/wiki/AI_slop)prose is definitely grating. I find AI documentation to be written in such a way that its helpful for keeping an LLM on track, but not helpful as a reader trying to understand.

Now I did make heavy use of the agent *Plan* mode so I could review any AI actions / intentions before I let the LLM loose. Allowing the agent to run on autopilot was only used after approving a set of changes.

> [!info]- I did a trial run of an "external docs" pattern
>  I kept design, TODO, and planning documents in my obsidian vault, and just symlink'd them into the repository. [Symbolic linking](https://en.wikipedia.org/wiki/Symbolic_link) made it a bit easier for me to mentally shift into design / planning and implementation mindsets. The initial impulse for this was to to keep all of these documents private, yet still publish the repository, keep them in a workspace, and keep them easily consumable by an agent. It also allows artifacts and learnings to persist beyond the project, within my own notes, for potential reuse in future projects.

#### Content Synchronization
Synchronizing and importing my Obsidian notes was one of the first systems I spun up. This is what I went over in the deployment section.

### Project Manager?
Once I had the basic website going and ironed out major issues I felt my role pivot to being more of a project manager.

#### Colors
This was very fun - I essentially got to dial in the colors and themes of the website by just asking the LLM. Worked surprisingly well.

The blue highlights on dark mode are probably my favorite combination. The burnt orange for light mode was inspired by [one of my guitars](https://www.mattserwinowski.com/projects/stage-mixer/#final-thoughts).

I put a bit of time into messing around with brightness and contrast to make sure the website was easy on the eyes.

#### Feel
Navigating a website is so important. I really don't like some older sites that haven't upgraded and everything is very static or doesn't dynamically resize.

I spent some time with the springy-ness of button clicks. On making sure the scrolling on mobile worked properly. Where things were placed. Golden ratios galore.

I also really like the [Obsidian callouts](https://obsidian.md/help/callouts) so I instructed the AI to pretty much copy them verbatim. Took a couple of iterations and bug fixes of minor issues.

### Help Me Understand
One of my greatest worries with using AI is [deskilling](https://en.wikipedia.org/wiki/Deskilling) - I actually put in my global Copilot instructions that agents should be aware of this and communicate in ways that help me stay sharp.

I'm definitely in the camp of people who believe that domain knowledge and system / code comprehension are the real bottlenecks.

In my experience, project velocity is tied to how much you actually understand the system and how detailed your mental map of the codebase is. You will also burn less tokens if you can really specify what you need an agent to do, and guide it away from costly tools like [Playwright MCP](https://github.com/microsoft/playwright-mcp).

#### Comments
Asking the LLM to leave comments was helpful while perusing the code base. I also found that sometimes doc strings would be overly technical or repetitive. The [model will fixate on certain ideas or patterns in ways that remind me of dynamic attractors](https://en.wikipedia.org/wiki/Attractor). Still navigating that, but I haven't found a good solution.

### Copycat
Doing is really the best way to learn. It also is the gateway to noticing. I've read a lot of blogs and I've been to many websites, but recently I have had a fresh set of eyes for little details and features that didn't stand out before.

Reading progress bar at the top was one. Spotify widget was one. Layouts. Header and footer contents. Dynamic effects that respond to your mouse.

My response has gone from "[thats pretty neat](https://youtu.be/Hm3JodBR-vs?t=57)", to "thats pretty neat, I wonder how it was implemented / I would guess its being done this way".

#### LLMs Can See
Nothing new here, but it really is incredible how well LLMs can handle visual modalities. I didn't initially intend to use Playwright MCP, but when debugging some visual issues the model requested I install it so it could:
1) spin up the dev server
2) navigate the website using playwright
3) reproduce the issue I was seeing
4) and then actually fix the issue, and verify it was fixed.

---

# Final Thoughts

Wow, what a great project. I learned a ton doing this and feel pretty good about the results. Its been a long time since I've been obsessed with a software project. If you do home lab stuff and are even a little interested I highly recommend doing something similar.

Even if you don't really want a personal website - I find having your own domain and subdomains to be pretty useful. I have subdomains to access and DSM and Plex servers without having to rely on Synology or Plex to reroute me. I really want to setup my own open source LLM chat interface with a subdomain. Several more ideas that I don't want to spoil just yet.

There are many more features I want to generate which I intend to work on sporadically. Its a very empowering experience to manage the site (almost) completely end to end.

Thanks for reading!
