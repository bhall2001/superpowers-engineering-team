---
marp: true
theme: default
paginate: true
size: 16:9
title: Meet SET
description: What the Superpowers Engineering Team is, why it exists, and what it does for Claude Code users
style: |
  /* ---- palette: dark slate ground, desaturated teal accent ---- */
  :root {
    --ground:   #0E1116;
    --panel:    #171C24;
    --ink:      #EEF0F3;
    --ink-2:    #B2BAC5;
    --ink-3:    #78828F;
    --rule:     #2A313B;
    --accent:   #5FB8A3;
    --accent-d: #5fb8a318;
    --amber:    #D9A05B;
    --amber-d:  #d9a05b14;
    --f-display: "Newsreader", "Charter", "Iowan Old Style", Georgia, serif;
    --f-body:    "IBM Plex Sans", "Helvetica Neue", -apple-system, "Segoe UI", sans-serif;
    --f-mono:    "IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace;
  }

  section {
    background: var(--ground);
    color: var(--ink);
    font-family: var(--f-body);
    font-size: 23px;
    line-height: 1.5;
    padding: 64px 76px 72px;
    justify-content: flex-start;
  }

  h1 {
    font-family: var(--f-display);
    font-weight: 500;
    font-size: 2.7em;
    line-height: 1.04;
    letter-spacing: -0.022em;
    margin: 0 0 0.35em;
  }
  h2 {
    font-family: var(--f-display);
    font-weight: 500;
    font-size: 1.95em;
    line-height: 1.1;
    letter-spacing: -0.018em;
    margin: 0 0 0.55em;
  }
  h3 {
    font-family: var(--f-mono);
    font-size: 0.6em;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--accent);
    margin: 0 0 1em;
    padding-bottom: 0.7em;
    border-bottom: 1px solid #5fb8a344;
  }
  h4 {
    font-family: var(--f-body);
    font-size: 0.9em;
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 0.35em;
  }

  p { color: var(--ink-2); margin: 0 0 0.7em; }
  p:last-child { margin-bottom: 0; }
  strong, b { color: var(--ink); font-weight: 600; }
  i, em { color: var(--ink-2); font-style: italic; }

  ul { color: var(--ink-2); margin: 0.2em 0 0; padding-left: 1.1em; }
  li { margin-bottom: 0.5em; }
  li::marker { color: var(--ink-3); }

  code {
    font-family: var(--f-mono);
    font-size: 0.85em;
    background: var(--accent-d);
    color: var(--accent);
    padding: 0.08em 0.34em;
    border-radius: 3px;
  }

  section::after {
    color: var(--ink-3);
    font-family: var(--f-mono);
    font-size: 0.5em;
    letter-spacing: 0.1em;
  }

  /* ---- title ---- */
  section.title { justify-content: center; }
  section.title h1 { font-size: 3.2em; color: var(--ink); }
  section.title h1 em {
    color: var(--accent);
    font-style: italic;
  }
  section.title h3 { border-bottom: none; padding-bottom: 0; }

  /* ---- statement slide: one big idea ---- */
  section.statement { justify-content: center; }
  section.statement h2 {
    font-size: 2.5em;
    max-width: 18em;
  }
  section.statement p { font-size: 1.1em; max-width: 30em; }

  .lede { font-size: 1.02em; color: var(--ink-2); max-width: 40em; }

  /* ---- columns ---- */
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 0.3em; }
  .cols3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 0.3em; }

  .panel {
    background: var(--panel);
    border: 1px solid var(--rule);
    border-radius: 4px;
    padding: 20px 22px;
  }
  .panel p { font-size: 0.85em; margin-bottom: 0; }
  .panel .tag {
    font-family: var(--f-mono);
    font-size: 0.58em;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    display: block;
    margin-bottom: 0.7em;
  }

  /* ---- before / after ---- */
  .before, .after { border-radius: 4px; padding: 20px 22px; }
  .before { background: var(--amber-d); border: 1px solid var(--amber); }
  .after  { background: var(--accent-d); border: 1px solid #5fb8a366; }
  .before p, .after p { font-size: 0.88em; margin-bottom: 0.7em; }
  .before p:last-child, .after p:last-child { margin-bottom: 0; }
  .stamp {
    font-family: var(--f-mono);
    font-size: 0.58em;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    display: inline-block;
    padding: 2px 8px;
    border-radius: 2px;
    margin-bottom: 0.8em;
  }
  .before .stamp { color: var(--amber); border: 1px solid var(--amber); }
  .after .stamp { color: var(--accent); border: 1px solid var(--accent); }

  /* ---- chain diagram ---- */
  .chain {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    border: 1px solid var(--rule);
    border-radius: 4px;
    overflow: hidden;
    background: var(--panel);
    margin: 0.3em 0;
  }
  .link { padding: 18px 14px; border-right: 1px solid #1F252E; }
  .link:last-child { border-right: 0; }
  .link .cmd {
    font-family: var(--f-mono);
    font-size: 0.72em;
    color: var(--accent);
    display: block;
    margin-bottom: 0.45em;
  }
  .link .m { font-size: 0.68em; color: var(--ink-3); line-height: 1.4; display: block; }

  /* ---- big numbered steps ---- */
  .step {
    display: grid;
    grid-template-columns: 2.2em 1fr;
    gap: 0 16px;
    padding: 14px 0;
    border-bottom: 1px solid #1F252E;
    align-items: baseline;
  }
  .step .k { font-family: var(--f-mono); font-size: 0.72em; color: var(--accent); }
  .step b { font-size: 0.98em; color: var(--ink); display: block; margin-bottom: 0.1em; }
  .step span.d { font-size: 0.85em; color: var(--ink-2); line-height: 1.45; display: block; }

  /* ---- era rows ---- */
  .era {
    display: grid;
    grid-template-columns: 5.5em 1fr;
    gap: 0 24px;
    padding: 16px 0;
    border-bottom: 1px solid #1F252E;
    align-items: baseline;
  }
  .era .v {
    font-family: var(--f-mono);
    font-size: 0.8em;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .era b { font-size: 1em; color: var(--ink); display: block; margin-bottom: 0.1em; }
  .era span.d { font-size: 0.86em; color: var(--ink-2); line-height: 1.45; display: block; }

  /* ---- boundary list ---- */
  .bound {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid #1F252E;
  }
  .bound .x { font-family: var(--f-mono); color: var(--amber); font-size: 0.85em; }
  .bound p { font-size: 0.98em; color: var(--ink); margin: 0; }
  .panel .bound { padding: 7px 0; gap: 10px; }
  .panel .bound p { font-size: 0.85em; }
  .panel .bound:last-of-type { border-bottom: 0; }

  .footnote { font-size: 0.76em; color: var(--ink-3); margin-top: 0.9em; line-height: 1.45; }

  .caveat {
    border-left: 2px solid var(--amber);
    background: var(--amber-d);
    padding: 14px 18px;
    border-radius: 0 3px 3px 0;
    margin-top: 0.7em;
  }
  .caveat p { font-size: 0.82em; margin-bottom: 0; }
---

<!-- _class: title -->
<!-- _paginate: false -->

### Superpowers Engineering Team

# Meet <em>SET</em>

<p class="lede">You already have Claude Code. SET turns it into a coordinated engineering team — spec-first design, parallel builders under TDD, independent review, and learnings that carry forward into every cycle that follows.</p>

---

<!-- _class: statement -->

### The starting point

## Claude Code gives you the pieces. The process is up to you.

<p>Subagents, teams, CLAUDE.md, review commands — the capabilities are all there. What's left to you is the discipline: spec before code, tests before implementation, someone other than the author checking the work, and writing down what you learned. Every session, by hand, or not at all.</p>

---

### Where SET came from

## An opinion about two good tools — and what came next

<p class="lede">Superpowers and Compound Teams are both <i>complete</i> processes — design through build. Having used both, I thought each was strongest at a different end.</p>

<div class="cols">
<div class="panel">
<span class="tag">Superpowers</span>
<h4>The design half won me over</h4>
<p>Structured brainstorming into a real spec, with a human approving as it goes.</p>
<p style="margin-top:0.5em">Its build stage — the way it drove subagents — I liked less.</p>
</div>
<div class="panel">
<span class="tag">Compound Teams</span>
<h4>The build half won me over</h4>
<p>TDD loops, QA review passes, and a team that learned from its own mistakes.</p>
<p style="margin-top:0.5em">I wanted more design rigor feeding into it.</p>
</div>
</div>

<div class="caveat">
<p><b>Superpowers is still in SET today</b> — <code>/set-design</code> runs its brainstorming skill directly, and it installs alongside SET. <b>Compound Teams is the piece that's gone.</b> Anthropic since shipped the coordination primitives natively — subagents, Agent Teams, dynamic workflows — so SET kept the build/review/learn <i>process</i> it learned there and now runs it on native Claude Code.</p>
</div>

---

### What it is

## Six commands, one cycle

<div class="chain">
<div class="link"><span class="cmd">/set-design</span><span class="m">Brainstorm to an approved spec</span></div>
<div class="link"><span class="cmd">/set-plan</span><span class="m">Spec into parallel tasks</span></div>
<div class="link"><span class="cmd">/set-build</span><span class="m">Agent team writes it, TDD</span></div>
<div class="link"><span class="cmd">/set-review</span><span class="m">Four independent lenses</span></div>
<div class="link"><span class="cmd">/set-learn</span><span class="m">Capture what was learned</span></div>
</div>

<p class="lede" style="margin-top:0.6em"><code>/set-init</code> runs once per project: it detects your stack and scaffolds a starting set of specialist agents — a database expert, a UI expert, whatever your codebase suggests. <b>They're yours to edit.</b> Rewrite them, add your own, drop the ones you don't want — and after a few cycles you'll have a much better sense of which specialists your project actually needs.</p>

<p class="footnote">Every phase writes a real artifact — a spec, a plan, commits, learnings — so you can stop, inspect, and pick up later. Nothing lives only in a chat transcript.</p>

---

### The build

## A team, not one agent doing everything

<div class="cols3">
<div class="panel">
<span class="tag">Parallel</span>
<h4>One specialist per task</h4>
<p>The plan is decomposed for parallelism, and each task is routed to the agent whose domain it falls in — the database work to the database specialist, not to whoever is free.</p>
</div>
<div class="panel">
<span class="tag">Test-first</span>
<h4>TDD is enforced, not suggested</h4>
<p>Every builder writes failing tests first, makes them pass, then refactors — looping until tests, lint and typecheck are all green.</p>
</div>
<div class="panel">
<span class="tag">Gated</span>
<h4>A fresh verifier per task</h4>
<p>An agent that did <i>not</i> write the code audits it against the spec. Fail the audit and the builder revises and resubmits — the task doesn't move on until it clears the bar.</p>
</div>
</div>

<p class="footnote">An agent reviewing its own work tends to pass it. One handed the spec, and none of the reasoning that produced the code, is a much harder audience.</p>

---

### The review

## Four reviewers who didn't write the code

<div class="cols">
<div class="panel">
<span class="tag">Independent lenses</span>
<h4>Each looks for something different</h4>
<p><b>Spec compliance</b> — is this what was asked for, nothing missing, nothing extra?<br/>
<b>Security</b> — what could be exploited?<br/>
<b>Architecture</b> — does it fit the codebase?<br/>
<b>Correctness</b> — does it actually work?</p>
</div>
<div class="panel">
<span class="tag">A real verdict</span>
<h4>Ship, iterate, or block</h4>
<p>Findings across all four lenses are rated by severity and synthesized into one verdict. <b>Iterate is the common one</b> — findings get routed back to the owning specialist, fixed, and re-reviewed before the work counts as done.</p>
<p style="margin-top:0.5em">The build's own report is treated as claims to audit — not as evidence.</p>
</div>
</div>

<p class="footnote">Why four instead of one: in practice, agents given a single narrow job turn up more than one agent asked to look at everything. Observation from real cycles rather than a benchmark — but consistent enough to build on.</p>

---

### The part that compounds

## LEARN — stop explaining the same thing every session

<p class="lede">You know the pattern: you explain that one ORM quirk, Claude fixes the bug, and next session it's forgotten. SET ends every cycle by writing down what it learned.</p>

<div class="cols">
<div class="panel">
<span class="tag">What it writes</span>
<h4>Plain markdown, filed by domain</h4>
<p><code>.claude/set/learnings/db.md</code></p>
<p style="margin-top:0.4em; font-size:0.78em"><b>What Failed</b><br/>
<span style="color:var(--ink-3)">[2026-04-15]</span> Large queries without LIMIT cause timeouts — always paginate</p>
<p style="margin-top:0.5em">Each task gets only the shards that matter to it — a builder sees the lessons for <i>its</i> work, not everyone else's.</p>
</div>
<div class="panel">
<span class="tag">Two levels</span>
<h4>The specialists improve too</h4>
<p>An agent that keeps making the same mistake gets it written into its own definition file. Next time it spawns, it already knows.</p>
<p style="margin-top:0.5em"><b>It's all just files.</b> Commit them and your teammates start with everything prior cycles learned. No hosted memory, nothing to lock into.</p>
</div>
</div>

<p class="footnote">Cycle ten on a codebase is meaningfully better than cycle one, and nobody hand-tuned a prompt to get there.</p>

---

### Running it unattended

## Start the cycle and walk away

<div class="cols">
<div class="panel">
<span class="tag">Optional</span>
<h4>One flag chains the whole cycle</h4>
<p>Add <code>--autonomous</code> and a phase runs itself <i>and every remaining phase</i> without stopping at the human gates — design straight through to learn.</p>
</div>
<div class="panel">
<span class="tag">Durable</span>
<h4>It survives being interrupted</h4>
<p>Progress is checkpointed to disk. If the session stops — crash, closed laptop, context exhausted — <code>--resume</code> picks it up and re-runs only what never landed.</p>
</div>
</div>

<div class="caveat">
<p><b>It never ships for you.</b> An autonomous run never pushes, never opens a PR, never merges, and never claims the work is verified. It ends by handing you the acceptance check and the decision.</p>
</div>

---

### What you get

## Why it's worth the extra tokens

<div class="cols">
<div class="panel">
<span class="tag">Fidelity</span>
<h4>It builds what you agreed to</h4>
<p>A written spec exists before any code — normally human-approved, and always the thing compliance is checked against three times: by the builder, the verifier, and the review.</p>
</div>
<div class="panel">
<span class="tag">Confidence</span>
<h4>Nothing self-certifies</h4>
<p>Every piece of work is checked by an agent that didn't produce it — at the task level by the verifier, and again at the diff level by the review.</p>
</div>
<div class="panel">
<span class="tag">Leverage</span>
<h4>Actual specialists, in parallel</h4>
<p>Not one generalist working down a list — each task goes to an agent carrying real domain knowledge of your stack, and they work at the same time.</p>
</div>
<div class="panel">
<span class="tag">Compounding</span>
<h4>It doesn't start over</h4>
<p>Learnings persist in your repo. The process gets sharper on your codebase specifically, cycle after cycle.</p>
</div>
</div>

<p class="footnote">The honest trade: parallel builders under TDD cost more tokens than one agent writing code. You're buying discipline, and rework you don't have to do.</p>

---

### Try it

## One command, then <code>/set-init</code>

<p class="lede">SET installs into Claude Code as a set of slash commands. Nothing in the pipeline assumes a language or framework, and <code>/set-init</code> scaffolds specialists to match whatever stack it finds.</p>

<div class="cols3">
<div class="panel">
<span class="tag">Start small</span>
<h4>One real feature</h4>
<p>Run a full cycle on something genuine but contained. The pipeline makes more sense from the inside than from a diagram.</p>
</div>
<div class="panel">
<span class="tag">Fair warning</span>
<h4>Agnostic by design, biased in practice</h4>
<p>So far it's run almost entirely on React, TypeScript, Python and AWS — so expect some bias baked in. Hit a rough edge on your stack and I'd like to hear about it; we'll work it out together.</p>
</div>
<div class="panel">
<span class="tag">Or just take the ideas</span>
<h4>They work without SET</h4>
<p>Spec before code. Let nothing verify its own work. Write down what you learned. Those hold however you work with Claude.</p>
</div>
</div>

<p class="footnote" style="margin-top:1.1em"><code>bash install.sh</code> &nbsp;·&nbsp; github.com/bhall2001/superpowers-engineering-team &nbsp;·&nbsp; needs Claude Code + the Superpowers plugin</p>
