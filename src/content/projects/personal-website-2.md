---
title: The Self-Hosters Guide to Vibe Coding a Website (Part 2)
description: Article on creating a self-host website with agentic engineering
status: draft
tags:
  - software
  - website
thumbnail: /images/projects/personal-website.svg
date: 2026-06-22
repo: https://github.com/meserwinowski/website
---
---

Welcome to Part 2 of my Self-Hosters Guide to Vibe Coding a Website. Part 1 is here.

> [!warning]- *Disclaimer*
> Views, statements, and opinions expressed here are solely my own and do not reflect any positions or policies of Microsoft.
> 
> All of the written material here is my own. The website styling and infrastructure was co-designed with AI tools.

---

# Overview

This project post is Part 2 of the series. In this post I want to take a more reflective and philosophical approach to the project. If you haven't read it, Part 1 deals with the technical aspects of the website.

# Learnings

#### A Worthy Challenge(r) Appears
Building a website has been a worthy challenge. My bread and butter is low level systems development; Web development has always been this whole other domain that I felt I could probably understand, but didn't have the patience to really deal with.

AI transform this situation. What was once tedious and frustrating becomes difficult and engaging. I don't have to pick up a textbook or work my way through another tutorial. I can jump right into the thing I *want* to work on. This, in combination with the oracle-like nature of an LLM, reshapes the entire dynamic.

For me this shift puts learning web development squarely into the [zone of proximal development](https://en.wikipedia.org/wiki/Zone_of_proximal_development).

#### Is Web Development Just Easy?

No, I don't think so

What I do think is easier, for people and LLMs, is operating in a **visual** space instead of an **abstract** one. Identifying problems and evaluating behavior / performance of visual software is significantly easier than doing so for a system you can't really see in the same way. When a webpage is broken, its pretty obvious. When a kernel driver is broken? Not so obvious (or it takes down the whole system and trying to figure out why is a pain).

#### Deal with the Devil
[I'd be remiss ](https://www.hubermanlab.com/)if I didn't mention that there are genuine issues around AI tool usage. Issues beyond just [hallucinations](https://en.wikipedia.org/wiki/Hallucination_(artificial_intelligence)) or [producing slop](https://en.wikipedia.org/wiki/AI_slop). Some I find more concerning:

1) **Deskilling** - your skills and cognitive strength will atrophy. It's very similar to how if we don't use our bodies, our muscles become weak and physical stamina decreases. You can't build callouses without friction. The frustration and resistance of using your brain to do something *is the signal that stimulates growth*.

2) **Drift** - As you get further and further into a project using AI, its very common for the model to conceptually drift and start making mistakes or nonsensical design decisions. The issue here compounds with deskilling and fatigue - when you're mentally drained its hard to catch problems or poor design decisions as they arrive.

There are techniques to deal with both of these, but at the end of the day I feel like like the [No Free Lunch](https://en.wikipedia.org/wiki/No_free_lunch_theorem) principle applies here: AI tools can give you super powers at the cost of degrading your own innate and acquired abilities.

But let's assume you can leverage AI to great effectiveness while also mitigating the side effects. Now the bar has been raised. Expectations are higher. Building a website? Impressive a decade ago. Building one now? Significantly easier.

I've noticed a similar sentiment across blogs and social media.

#### Stay Frosty
- Probabilistic Shift - The shift from programming being a primary deterministic art is going to be very hard for a lot of people. I think if you want to succeed you're going to need to know when and where determinism is *required* versus nice to have. It will also pay to know how to **constrain** AI models in a similar way to how the guard rail on a stair constrains you as an agentic individual. Railings on stairs are very nice. I think they are ADA required too? Well regardless they can't stop you from jumping over them and plummeting to the ground.
- Stop Conditions - This is one of the most helpful techniques I've found. Being explicit about where you want the model to stop. With hybrid programming you really want the model to slow down to the speed of *you*. This allows you to keep track of whats going on and catch problems before they spiral. My guess is that because LLMs have a STOP token inherent to their training they respond well to prompting that increases the likelihood of that token appearing.
- Be a Good Student - A good student is curious. Ask the model questions about what it does or recommends. Configure the model's instructions, skills, and prompts to explain things. Be explicit in your requests and designs that the model leaves comments about purpose as well as function.
- Read the Residual - Read the outputs that model delivers, don't just hit accept or move on to the next thing. `(Recommended)` makes you feel more confident, but without critical thinking you're just a monkey on a type writer. Even reading the residual to see what the model is "thinking" can be really helpful for understanding where it might be going wrong, or where you need to adjust context.
- The real bottle neck is your mental model
- [Code is no longer the primitive, its the specification.](https://aicoding.leaflet.pub/3mjfruwwuck2d)
- Mind your Token Burn - This is an open problem for me - in large part because I am shielded from consequences of using a lot of tokens. However, I also believe that [premature optimization is a net bad,](https://en.wikipedia.org/wiki/Program_optimization#When_to_optimize) and I'm better off learning how to use the tools without limitation. At time of writing we are currently in a supply crunch for compute, but I don't know how long that will last.

---

# Final Thoughts

Most things I've written about here may be irrelevant in the next year. Better models, better harnesses, or even [exponential token throughput](https://www.etched.com/) will likely solve a lot of AI issues with brute force.

Exciting times.
