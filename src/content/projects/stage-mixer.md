---
title: Is a Stage Mixer Punk Rock?
description: Building and using a mixer rig for live music performance.
status: ongoing
tags:
  - hardware
  - music
  - website
thumbnail:
date: 2026-06-15
---

> [!example]- *Is a Stage Mixer Punk Rock?*
> I ask myself stuff like this on occasion. I thought this would be a fun and silly hook to use for this project. I do think there's an argument to be made for either side.

---
If you've ever wondered what's in the black boxes that musicians tour around with, it is usually one of the following:
- Instruments
- Microphones / Amplifiers
- Mixers / Consoles
- All the wires and other miscellaneous items to pull everything together

Of all the audio engineering topics I have read about I think **stage mixers** have been discussed the least.

---
# What is a stage mixer?
The stage mixer is just that - a mixer that lives on the stage alongside the performers. Its primary job is to get audio signals from each performer and mix them together with settings that *the performer controls*. This is in contrast to the Front of House (FOH) which has settings for the venue's audio equipment that the FOH engineer controls.

The absolute simplest stage mixer setup is a single piece of hardware (a mixer). The mixer would sit on the stage with a power cable and a bunch of Input / Output (I/O) cables.

However, most performers (especially musicians) are assembling much more advanced systems to fit the needs of their project. Like most hardware systems in music, they are often referred to as **rigs**.
## Why a stage mixer?
Part of being a performer is you are going to be performing in a lot of different locations. Every venue is a little different - different acoustics, different lighting, different power options, different stage monitors.

A stage mixer gives you more control over your sound, and a central interface for connecting your equipment to the venue's sound system. As an additional (and arguably crucial) bonus, you can set up your own In-Ear Monitoring (IEM) mix. An IEM mix allows you to:
1) Actually hear what you are playing on stage and
2) Protect your hearing at the same time!
## What goes into a stage mixer rig?
Most of the modern rigs I've seen have some or all of these components (in order of what I would consider necessary):
- A mixer unit
- A power conditioner / supply
- A router
- Patch bays / splitters
- Effects / modelers
- In ear monitoring
- MIDI controller
- Rack drawers / storage

All crammed into rack cases designed for portability. I've written more about each one below.
## How do I build my own rig?
The original inspiration for this article was to write about the rig I built!

I won't be able to tell you exactly how to build your own. Hopefully walking through my decisions and learnings can be helpful reference. The audience I had in mind would be other musicians, but anyone doing live sound should be able to glean some insights.

It is a bit of a project, and if you'd prefer not to undertake it there are people who do design and build stage rigs / audio systems for musicians. It’s more fun if you do it yourself, and you’ll save some money!

---
# My Rig

About two years ago I built an 8U rolling stage mixer around a Midas MR18, so a five-piece band could run wired stereo IEMs, send signals to FOH, and automatically set up my digital guitar rig. All while making setup and teardown a breeze.

Here are some diagrams of my rig! The rest of this post is all about explaining the decisions and details that led up to the design.

## Visuals

Everyone loves a good visual, so I'll start with a bunch you can use as a reference.

### Graph Diagram

![[Excalidraw/stage-mixer-diagram.excalidraw|stage-mixer-diagram.excalidraw|800x600]]

### Front Diagram

![[stage-mixer-view-front.excalidraw|600x400]]

### Back Diagram

![[stage-mixer-view-back.excalidraw|600x400]]

### Original Whiteboard

![[whiteboard.HEIC]]

### Front View

![[mixer-front.HEIC]]

### Back View

![[mixer-back.HEIC]]

> [!note]- The current pictures look a bit different than the diagram views.
> At time of writing it’s been over a year since I last used my stage mixer - I decided a better use of the power conditioner would be for my desk. I also got a Quad Cortex Mini as a gift, which is also on my desk, so the AF3 is still currently racked in the rig.

## Getting Started

Like any good project the first things to identify are your **requirements** and your **constraints**. Mine roughly looked like this:
##### **Requirements**
- *Wheeled Case* - I've learned from hauling my Axe-Fx 3 and other guitar stuff that audio equipment is *heavy* even when you're going digital.
- *Support a 5-piece band + monitoring* - the rig I wanted to build had to support the band I was in at the time ([Violent Beauregarde](https://www.instagram.com/violent_beauregarde_?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==) - check em out).
- *Can fit my Axe-Fx 3* - that was the equipment I was rocking at the time and I wanted my setup to be integrated with the mixer. Overall a common thing I saw from other builds.
##### **Constraints**
- *Wheeled Case* - this also limits case options, and forced me into a single case setup.
- *Budget* - I didn't want to go over $1500 - any equipment I already had not included.
- *Wired monitoring* - wireless monitoring was going to be too expensive and overkill, so I figured I could design a wired monitoring scheme.

> [!tip] *Takeaway*
> Figure out what your band/performance needs and pick a budget. You can always expand / downsize later, and audio equipment tends to hold its value.

## Take inventory. Pick a mixer.

### Inventory
I mentioned I already had a **Fractal Axe-Fx 3 (3U)** - a lovely graduation gift from my parents. Not a cheap piece of hardware, and would have blown the budget by itself. 

> [!info]- For the uninitiated
> An AF3 is an all-in-one guitar rig built by Fractal Audio. It simulates a whole ton of guitar pedals, amplifiers, and speaker cabinets, and has a really versatile parameterization and routing system.

**Power** - Due to playing with the Axe-Fx 3 (AF3) I had already racked it in a smaller 6U case with a **Furman PL-PLUS DMC power conditioner (1U)**. 15 amps, surge protection, and AC filtering this power conditioner was already perfect for what I needed.

![[power-conditioner.HEIC]]

>[!info]- Voltage and Current
>You don’t need an engineering degree to understand that your equipment needs power. A good power conditioner can protect your equipment from faulty venue power, and filter out noise.
>
>Conditioners are not strictly the same as supplies - the real important bits are that you get the right output voltage (120V for America), and you have enough Amps (current) to power all of your equipment.

**One of the first problems I ran into:** I had set up the rig during practice, and when I started playing the volume was really low and the AF3 was glitching out.

The problem ended up being that the output plugs on my power conditioner had a max current for each power bank. I had haphazardly plugged in my mixer, AF3, and **Line 6 PowerCab 112 PLUS** (The PowerCab (L6PC) is an FRFR active guitar speaker), and together they were drawing too much current from a single bank.

Practically speaking this means that I shouldn't just *randomly plug in the power for each device*. I had to make sure they were drawing power from specific plugs so that they were not hitting the current limit.

### **Star of the Show**
For the mixer my main goal was this:
1) I wanted to be able to connect every instrument/microphone in the band, except for drums.
2) I wanted everyone to have their own IEM mix, so we could hear ourselves. A wireless IEM setup with stereo transmission is incredibly expensive for one person, for five forget it. Decided to go for a wired approach.

For the mixer there were a couple of attributes that stood out to me as important:
- How much audio I/O does the mixer have, and what connector types
- What digital I/O does the mixer have
- How do I configure and route the mixer
- What kind of preamps does the mixer have

#### **I/O**
After some research and browsing I purchased a **Midas MR18 (3U)**. The MR18 actually had a little more I/O than I needed, but just the right amount for expandability which I'll discuss with more detail in the patch bay section.

![[mixer.HEIC]]

**Inputs** - I ended up using 8 of the 16 inputs. The connectors are balanced mono XLR 1/4" combo inputs.

> [!info]- [Balanced audio](https://en.wikipedia.org/wiki/Balanced_audio) is actually a really cool electrical engineering concept.
> A balanced cable is one that leverages balanced lines and [differential signaling](https://en.wikipedia.org/wiki/Balanced_audio#Differential_signaling) to perfectly reject noise that the cable might pick up from the environment.

**Outputs** - Probably my favorite little bit of this whole project was my solution for getting *five **stereo*** IEM mixes out of the MR18.

The MR18 has 8 XLR connector outputs - but they are all mono. Two of those outputs are a pair: Main L and Main R. The rest are called AUX 1 through AUX 6. Essentially I could only do 4 stereo outputs or 8 mono outputs.

Luckily I had a little out-of-the-box idea (technically in the box…).

I knew that since the outputs were mono, I would need to pair them up, and pan outputs left and right in the mixer routing. Then I would need to get a cable that would take two mono XLR and combine them into a stereo XLR. However, I could not find such a cable, and realized I would have to make my own!

So I bought some XLR connectors + cable, and cut and soldered everything together to get 3 mono-to-stereo XLR cables. Why 3? Because I could just duplicate the stereo output for two of these custom cables I created. I would do this with a stereo splitter cable. Effectively I would now have 5 stereo outputs.

![[custom-cable.HEIC]]

Another upside was that I had the Main L and R outputs still free. I simply routed those out as a dedicated "band mix" that could be shared with the FOH if needed. The main benefit here was to be able to share not just a band mix, but also any audio from a laptop connected to the Digital I/O for the mixer over USB. More on that later.

The downside is that people would have to share an IEM mix. So obviously I got a dedicated mix for myself, and then I paired up the other members of the band to share.

> [!info]- Fun fact
> Midas and Behringer are both under the same parent company. They make some similar rack mixers (e.g. MR18 vs XR18), with the difference apparently being better preamps on the Midas line.

#### **Wi-Fi**
The MR18 has an integrated access point to connect a phone or tablet to over Wi-Fi. From there you can use an app to remotely configure the mixer and all of its routing.

Frankly, this is the most annoying part of the mixer:
1) The receiver is pretty garbage, especially in a case. It's basically not functional in a venue environment with cell signals flying everywhere.
2) The official M-AIR app is only available for iPad. SOL if you only have an iPhone like me. I had to use a 3rd party app (Mixing Station) with a less than clear interface.
3) The redeeming bit here is you can connect a better access point over Ethernet to improve connectivity.

---

Don't just buy a mixer (or any component) as soon as you decide what you want. I recommend waiting until you have your rig designed. You can watch resale/marketplace sites or wait for sales in case the hardware you are looking for comes up while you are designing.

> [!tip] *Takeaway*
> Use what you already have, don't buy too much mixer, hold off buying anything until you have the rig mapped out.

## Does it fit?

I should mention at this point that it's important to have a "measure a dozen times, cut once" mentality. Issues become apparent as you develop your rig plan. You'll likely need to double back and change or rearrange components.

With the core components in mind I now had to pick a case.

The case I chose was the **Pro Rolling Rack (8U) from Gator Cases**. I had purchased a 6U case prior for my AF3 and was satisfied with the build quality. The Pro cases are a molded plastic with handles integrated into the side. This 8U rack also has recessed wheels and an extendable handle. Makes it look like a very large and oddly shaped suitcase.

>[!info]- From what I saw cases do not have too much variety
>You're either getting wood or a hard plastic shell as that is what is light weight + durable, but still cost effective. The rack bracket itself is usually a harder metal since it needs to take the load of some pretty heavy hardware.

The case has a depth of 19" - this is apparently a standard depth with shallow being around 13".

Depth is important not just for fitting a single component, but also keeping in mind that for most portable cases *both sides of the case have rack mounting brackets*. So you have to imagine how different components can be sandwiched while still leaving room for any wires. Getting things in the right configuration took some trial and error for sure.

Use gravity to load your hardware into a case. That means put the case on its side and lower the hardware in vertically. I also recommend a power drill if you have access to one. Use the lowest torque settings - it makes adding and removing hardware so much faster.

Now at this point if you wire up all the power you essentially have everything you need for a stage rig. However, there are a lot of extras that make the rig cleaner and easier to use. So now I want to talk about **patch bays and splitters**.

>[!tip] *Takeaway*
> Assembling a stage rig has similarities to LEGOs and putting together custom computers. Do as much planning and measuring as you can. Use a power drill on a low torque setting if you have one.

## Setup and Teardown should be easy

Patch bays are essential. At least in my opinion.

> [!example]- I actually went to a show featuring a line up of some relatively famous pop punk/heavy pop bands.
> One of the opening bands had to delay their set ~30 minutes because their stage rig was not working right. I know this because 1) I talked to the FOH engineer and 2) we could see them tinkering with it. Not going to pull any punches: that poor rig was a **rat's nest** of wires. This was a big show - couple hundred people in a warehouse. They probably would have benefited from having a properly organized rig.

### Patch Bays
Patch bays are a rack component that are interfaces between your rig and the outside world.

They are pretty much just connectors attached to a rack panel - they don't actually "do anything" to the audio.

What they really do is provide structure. They make the rig plug-and-play. Add in *labels* (+ maybe a list of what you plan to connect) and you should be able to hand your rig off to a competent operator, who can then independently wire up your rig to the venue.

The only real downside to patch bays is the extra costs around the bay itself and the extra internal wiring you need to buy.

I ended up having 3 different patch bays for my rig.

#### **Output Bay**
The first patch bay I chose was a **Hosa XLR Balanced Patchbay (1U)**. This patch bay was configured for a bunch of XLR outputs (and one "input"). This patch bay exposed the outputs my band needed during setup:
- Five XLRs for the wired IEMs
- One XLR for my FRFR speaker on stage
- One XLR for my AF3 foot controller (FC6)
- Two XLRs for the Main L/R output from the mixer.

![[output-bay.HEIC]]

Setting up this component is quite easy, but here are some extra tips:
1) You can unscrew the XLR ports and flip them around - this is why I put input in quote earlier: my FC6 uses an XLR for power and signal, and it technically had an input setup.
2) Use a label maker to mark the connectors! I bought a **Brother P-Touch Cube Smartphone Label Maker** to do this, and it worked really well to visually make it really clear which port was which. A cheaper option is to use pen/marker and a bit of masking tape.

#### **Input Bay (S8 Splitter)**
For the input bay I got the **ART S8 (1U)**. It’s a three-way mic splitter with 8 channels. More than enough for what I wanted to do.

![[s8.HEIC]]

What I really like about this unit is that you get a front facing output, and the build quality is really nice too. The front facing output is key to forwarding the band’s signals to the FOH. The way that was most recommended to do this is with a *cable snake*.

A cable snake is a bunch of individual cables all bound together except for the ends. Each small cable is color coded so you know which connectors match from each end. The cable snake combined with labels is a great way to set up your rig and hand off those signals to the FOH. In my case these would be raw signals from a DI or microphone because the front face of the S8 is just a duplicate.

Inside the rig, the S8 produces two more copies. I used a tiny internal cable snake to connect 8 internal outputs to the first 8 internal inputs of my mixer.

![[s8-and-mixer.HEIC]]

Finally, I also had to wire up my AF3. I used two internal XLRs for the Left and Right outputs, that then looped to the front of S8 using right-angled low-profile connectors. Those channels went to the mixer, but since I had a third copy I routed that directly to the *output bay*, which then made it easy to connect my Line 6 FRFR speaker.

#### **Control Bay**
One of my stretch goals with this rig was configuring it to work with my laptop.

Why?

1) My laptop could be running a DAW that has backing tracks + MIDI signals which can be piped into the rig over USB. The MR18's digital I/O could then route that to Main L/R which I could then easily plug in to the venue's FOH via XLR.
2) My laptop has all the extra software that allows me to directly configure things like my AF3, a router, a midi controller, etc.

I never did get a MIDI controller setup, but I did buy an extra *blank* 1U panel that you can put whatever connectors you want. I was a little surprised to learn there are actually all kinds of connectors sold in formats compatible with rack mounted equipment.

My final build had two USB 3.0 B connectors so that I could easily plug my laptop into my AF3 or the MR18.

>[!tip] *Takeaway*
> Patch bays keep you organized and will make your setup/teardown life a whole lot easier.

## Last Mile

Home stretch of the rig build - I just wanted to go over storage, the IEM setup, and testing.

### Storage
I bought a **NavePoint Server Cabinet (2U)** to give my rig some physical storage. It occupies the top of the case and holds cables, wires, batteries, P2 amps, picks - all the helpful stuff to have on hand.

I had originally purchased a 1U drawer rack, but it was too small. Not enough clearance to really do much with, so I recommend at least 2U if you are committing to storage.

Some storage racks have openings in the back and side, so you can tuck away other hardware like a MIDI controller or even a laptop with some formed padding to keep it safe.

### Wired IEMs
I talked about the internal setup for the IEMs in the previous sections, but here I'll describe what happens once that signal leaves the rig.

Each member of the band had a **Behringer P2 Amplifier** clipped to their waist or instrument. The IEMs then plugged into that, and a long XLR cable would tether each person to their respective port on the output patch bay.

While this setup is a relatively cheap way to get stereo IEMs, it's quite clunky. Tripped over my cable more than a handful of times. It's a great setup for a drummer, and would likely be more reliable than wireless.

### Testing
With any good system you should be testing it as you go. Solving problems as they arise is a lot easier than debugging something that has been completely assembled.

![[testing.HEIC]]

Test that each component is working as you go through the assembly. Dial in your mixer's configuration over multiple practice sessions. The routing software for the mixers can be kind of a pain so get familiar with using it.

A multimeter can also be useful for checking continuity if you've mixed up some cables and are trying to figure out which is which.

> [!tip] *Takeaway*
> Storage is convenient, wired IEMs work but are a hassle + a tripping hazard, and test your rig because the last thing you want is to have a problem on stage.

---
# Final Thoughts

A stage mixer is pretty punk rock, especially if you make it a DIY project.

One thing I didn't talk about is that the stage mixer essentially doubles as a portable recording studio. The MR18's USB is bidirectional, so it can act as an audio interface. Throw in another S8 and you can have 16 XLRs recording a whole band for a demo.

I unfortunately failed to get a good picture of the rig in action. The closet I have is this nice photo a friend took at a show. The rig is barely visible behind me!

![[matt-vb-show.jpg]]

If you found this article helpful, or you end up building your own stage mixer, I'd love to hear about it.

Thanks for reading!

---
# Additional Notes

## Core Parts List

| **Part**                             | **Role**                                | **Notes**                                                            |
| ------------------------------------ | --------------------------------------- | -------------------------------------------------------------------- |
| Midas MR18 (3U)                      | Main mixer and routing brain            | More I/O than strictly needed, but useful room to grow               |
| Furman PL-PLUS DMC (1U)              | Power conditioning and surge protection | Reused from the Axe-Fx rack                                          |
| Gator Pro Rolling Rack (8U)          | Portable case                           | Wheels and handle drove the single-case design                       |
| ART S8 (1U)                          | Input splitter                          | Sends copies of signals to the mixer and FOH                         |
| Hosa XLR Balanced Patchbay (1U)      | Output bay                              | Keeps IEM, speaker, controller, and main outputs organized           |
| Blank 1U panel with USB-B connectors | Control bay                             | Makes laptop access to the MR18 and Axe-Fx easy                      |
| NavePoint Server Cabinet (2U)        | Rack storage                            | Holds cables, P2 amps, batteries, picks, and other small gear        |
| Behringer P2 amplifiers              | Wired IEM belt packs                    | Affordable, reliable, but physically clunky                          |
| Cable Snake                          | Make the FoH's job easier               | Add labels to each end so you know what needs to be plugged in where |
## Mixers
Mixers come in different types: **Analog, Digital, and Hybrid**. These map onto the common understandings of the terms.
- Analog devices process with analog hardware
- Digital devices convert analog signals to digital ones, and process with embedded hardware. I'll throw virtual mixers under the digital category too.
- Hybrid would be a mix of analog and digital processing channels.

Mixers also come in different form factors: **racks, consoles, and stage boxes.**
- Consoles are like something you would see in a recording studio or on a DJ's setup. They are usually operated by a stage or FOH engineer.
- Stage boxes are simple rugged mixers with minimal external controls. Nicer ones have digital controls that can be operated wirelessly or over a hardwired connection. Can be racked or standalone.
- Racked mixers are designed to be racked, and are built to the standard Rack Unit. Similar to server racks for computing, but not a surprise given digital computing and audio engineering have a shared history in electrical engineering.
