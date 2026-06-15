---
title: "Mechanical Keyboard Build"
description: "Custom split ergonomic keyboard with hand-wired switches and QMK firmware."
status: "done"
tags: ["hardware", "electronics"]
thumbnail: "/images/projects/mech-keyboard.svg"
date: 2026-03-20
repo: "https://github.com/meserwinowski/keyboard-firmware"
---

## Overview

A custom-built split mechanical keyboard designed for ergonomic daily use. Hand-wired with a custom PCB layout and running QMK firmware for full programmability.

## Specs

- **Layout:** Split 36-key (3x5 + 3 thumb keys per side)
- **Switches:** Gateron Milky Yellow (linear, 50g)
- **Keycaps:** MT3 profile PBT
- **Controller:** Pro Micro (ATmega32U4)
- **Firmware:** QMK with custom keymap

## Build Process

1. Designed plate layout in KiCad
2. 3D printed the case (PLA)
3. Hand-wired diode matrix
4. Flashed QMK firmware with custom layers

```c
// Home row mods for comfortable typing
#define HOME_A LGUI_T(KC_A)
#define HOME_S LALT_T(KC_S)
#define HOME_D LSFT_T(KC_D)
#define HOME_F LCTL_T(KC_F)
```

## Result

The split layout eliminated my wrist pain after a few weeks of adjustment. The programmable layers make it easy to access symbols and navigation without leaving the home row.

![Completed keyboard on desk](/images/projects/mech-keyboard.svg)
