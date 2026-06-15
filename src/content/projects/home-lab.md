---
title: "Home Lab Server"
description: "Self-hosted services on a Synology NAS with Docker and Tailscale networking."
status: "ongoing"
tags: ["hardware", "networking"]
thumbnail: "/images/projects/home-lab.svg"
date: 2026-05-15
---

## Overview

A home server setup running various self-hosted services in Docker containers, connected via Tailscale for secure remote access.

## Hardware

- Synology DS923+ NAS (4-bay)
- 32 GB RAM upgrade
- Connected via 1GbE to home network

## Services Running

| Service | Purpose |
|---------|---------|
| Nginx | Reverse proxy for web services |
| Portainer | Docker container management |
| Tailscale | Mesh VPN for remote access |
| Syncthing | File synchronization |

## Network Topology

Traffic flows through Cloudflare → home router (port forwarding) → Synology → Docker container. Tailscale provides a parallel overlay network for direct access from any device.

## Next Steps

- Add monitoring (Prometheus + Grafana)
- Set up automated backups to offsite storage
- Explore running a local LLM
