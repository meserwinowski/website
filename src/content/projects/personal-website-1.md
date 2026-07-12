---
title: The Self-Hosters Guide to Vibe Coding a Website
description: On the technical details of this website
status: draft
tags:
  - software
  - website
thumbnail: /assets/personal-website.svg
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

This article is the first of a pair. I realized the post was getting out of scope and decided to split it up. This one explores the technical design of the website, and what I did to get it off the digital ground and into your screen.

The second article is more of an opinion piece where I wax poetically about the implications of AI tooling and how I used them.

---
# Technical
The technical components of the site will be broken up into four sections:
1) Hosting
2) Development
3) Deployment
4) Design

## Token Spend
I neglected to actually track this, but I can definitely say its in the 10,000 to 50,000 AI Credits (AIC) range. AIC is the unit that Microsoft has for Copilot, and from what I've seen it's roughly $0.01 per credit. So all in all somewhere between $100 and $500 for the v1.0 website in compute costs.

That said, my preference for framing costs is in *time*. If I think about how much time I would have spent learning, searching resources / documentation, and writing code I would be massively over that $500.

## Hosting

### Web Servers 101
My Network Attached Storage (NAS) unit is the current host of the website - it's always running and provides basic native infrastructure for running containers, so it felt like the right home to me.

Over the years I've developed a basic familiarity with Docker, and I've learned that a web server is a pretty good application to containerize. It helps keep configuration and deployment simple.

For the web server I opted to go for [nginx](https://nginx.org/). I'm not a diehard open source software (OSS) guy (I've mained Windows my whole life), but small memory footprints and OSS are my preferences.

I'm using the `nginx:alpine` image provided via the Synology Container App, and then I have a `compose.yaml` I deploy from my OneDrive and use to spin up the container. The compose file is surprising straight forward: you configure a port, connect the paths for the website distribution files to the containers html, and the paths for the `.conf` configuration file.

> [!important] Resiliency
> In the situation that my NAS fails- I'll actually have a lot of issues to deal with. One of my plans is to create a worker that can redeploy my website onto a cloud instance, or another piece of hardware that I own.

### Networking Basics
Starting at the other end of the hosting process - how I got my domain and how your computer found my website to begin with.

#### Domain
NameCheap was used to register my domain (`mattserwinowski.com`). Easy process, can't complain.

#### CloudFlare
I've setup CloudFlare to resolve my Domain Name System (DNS) records. Configuring CloudFlare was more involved, but I learned a lot, and their free tier has been sufficient for my needs.
- The main thing I setup were the DNS records: I have a couple of A records for the apex domain and subdomains, and a CNAME for `www.` to the apex domain. All reverse proxied.
- CloudFlare provides some basic analytics, logs, AI crawler support, DDoS protection, and caching to help with server load.
- I got my first line of defense: A Geo-Block security rule. (Sorry Melissa >.<)
- I was enlightened to [DMARC](https://en.wikipedia.org/wiki/DMARC) and how to prevent email spoofing from my domain.

My server's IP address is dynamic - I setup a script on the NAS that pushes the latest IP to CloudFlare to make sure they stay mostly synchronized.

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

#### HTTP Strict Transport Security (HSTS)
I also configured CloudFlare to automatically try and route HTTP to an HTTPS connection. This was a nice mini mental mystery to resolve.

#### Firewall

A critical feature to get right when exposing your systems to the internet.

The DSM interface was a little confusing, but once I had a sense of the flow it was easy to only expose the ports and IP ranges that I needed to allow my website and my containers to function.

### Visual
Here is a fun graph of the route that should help mentally map the sections mentioned above:

TODO

> [!attention]- A minor misadventure
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

My entire deployment setup is pretty modern while also committing (pun intended) the cardinal sin of pushing directly to prod.

What I've done is scripted some automation that links the following pieces together:
1) Obsidian
2) My local `website` repository
3) My remote `website` repository + GitHub Actions
4) My NAS host container

### Obsidian



### Local Repo


### GitHub Actions


## Back to the Host

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
