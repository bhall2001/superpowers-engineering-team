---
marp: true
theme: default
paginate: true
size: 16:9
title: Autonomous and Durable
description: How SET went from a supervised pipeline to an agent team that runs itself and survives being interrupted
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

# Autonomous <em>and</em> durable

<p class="lede">One destination: a full engineering cycle — design, plan, build, review, learn — that runs unattended on Claude Code's native agent teams, survives being interrupted, and still knows where to stop.</p>

---

### The shift

## From supervised pipeline to autonomous chain

<div class="cols">
<div class="before">
<span class="stamp">Before</span>
<p><b>Six commands, six stops.</b></p>
<p>SET had the team — parallel builders, TDD, four-lens review, a learning loop. But every phase ended by printing "run the next command" and waiting for someone to type it.</p>
<p>Good for trust. Expensive in attention.</p>
</div>
<div class="after">
<span class="stamp">Now</span>
<p><b>One flag, one cycle — and it survives.</b></p>
<p><code>--autonomous</code> runs a phase <i>and every remaining phase</i> in the same session. If it stops partway, <code>--resume</code> picks it up from the last checkpoint.</p>
<p>Attention spent only where it changes the outcome.</p>
</div>
</div>

---

### How the chain works

## A phase doesn't tell you what's next. It goes there.

<div class="chain">
<div class="link"><span class="cmd">/set-design</span><span class="m">Spec written</span></div>
<div class="link"><span class="cmd">/set-plan</span><span class="m">Tasks decomposed</span></div>
<div class="link"><span class="cmd">/set-build</span><span class="m">Agent team builds</span></div>
<div class="link"><span class="cmd">/set-review</span><span class="m">Four lenses audit</span></div>
<div class="link"><span class="cmd">/set-learn</span><span class="m">Learnings persisted</span></div>
</div>

<div class="step"><span class="k">01</span><span><b>Enter anywhere</b><span class="d"><code>--autonomous</code> is valid on all five phases. Type <code>/set-plan --autonomous</code> from an approved spec and SET runs the remaining four without stopping.</span></span></div>

<div class="step"><span class="k">02</span><span><b>Each phase hands the next a growing report</b><span class="d">Spec path, task verdicts, diff stat, review outcome — accumulated forward, so the final summary describes the whole run, not just the last step.</span></span></div>

<div class="step"><span class="k">03</span><span><b>Gates suppress, work doesn't</b><span class="d">Artifacts, TDD, and independent verification are unchanged. Only the "press enter to continue" moments are removed.</span></span></div>

---

### The build phase

## Autonomy needs a team that can be trusted alone

<p class="lede">Unattended only works if the work verifies itself. That is what the native agent team provides.</p>

<div class="cols3">
<div class="panel">
<span class="tag">Parallel</span>
<h4>Builders, one per task</h4>
<p>Routed by specialist, working from a shared task list the harness enforces — real dependencies, not prompt-simulated ones.</p>
</div>
<div class="panel">
<span class="tag">Independent</span>
<h4>A verifier per task</h4>
<p>A fresh agent that did not write the code checks it against the spec. It writes nothing itself.</p>
</div>
<div class="panel">
<span class="tag">Machine-checkable</span>
<h4>Verdicts as data</h4>
<p>Each verifier returns a structured object, so "did this meet the bar?" is a field check — not a human re-reading prose.</p>
</div>
</div>

<p class="footnote">That last one is the hinge. A cycle can only run unattended if its quality gate is something software can evaluate.</p>

---

### Why native agent teams

## SET got out of the orchestration business

<div class="cols">
<div class="before">
<span class="stamp">Before</span>
<p>Parallel execution came from a third-party plugin, with SET's own retry and escalation logic layered on top.</p>
<p>It worked — and it got the project here — but it was infrastructure SET had to maintain to do a job the platform hadn't yet taken on.</p>
</div>
<div class="after">
<span class="stamp">Now</span>
<p>Claude Code ships <b>native agent teams</b> and <b>dynamic workflows</b>. SET moved onto both and deleted its own layer.</p>
<p>Coordination, retries and shared state became the harness's job. SET keeps the engineering judgment: which specialist takes a task, what "done" has to clear, and what the team carries into the next cycle.</p>
</div>
</div>

<p class="footnote">Less code to own, one-command install, and — the reason it mattered for autonomy — a coordination layer nobody has to prove correct before trusting a run to proceed alone.</p>

---

<!-- _class: statement -->

### The other half

## Unattended is worthless if it can't survive being interrupted.

<p>The real failure mode of a long autonomous run isn't a bad decision. It's stopping three hours in — a crash, a closed laptop, a session that ran out — and starting over.</p>

---

### Durability

## The run is a durable object, not a conversation

<div class="cols3">
<div class="panel">
<span class="tag">Recorded</span>
<h4>Progress lives on disk</h4>
<p>Each run has durable state and takes checkpoint commits as it goes — not a transcript someone has to read back.</p>
</div>
<div class="panel">
<span class="tag">Resumable</span>
<h4>Only the gap re-runs</h4>
<p><code>--resume</code> re-dispatches what never got committed. Finished tasks are skipped, and the working tree is left untouched.</p>
</div>
<div class="panel">
<span class="tag">Claimed</span>
<h4>Safe to pick up</h4>
<p>A worktree is claimed atomically, so a resumed run can't collide with one that's still alive somewhere else.</p>
</div>
</div>

<div class="caveat">
<p><b>Resuming a run never resumes autonomy.</b> <code>--resume</code> alone comes back <b>supervised</b>, stopping at every gate; continuing unattended means adding <code>--autonomous</code> again. Unattended is something you ask for each time — never something a run inherits from the session that stopped.</p>
<p style="margin-top:0.5em">Structural, not a rule to remember: the run is saved to disk, the <code>--autonomous</code> flag never is.</p>
</div>

---

### Trust

## Where an unattended team is made to stop — for now

<div class="cols">
<div class="panel">
<span class="tag">Structural, not advisory</span>
<h4>Rules it can't talk its way out of</h4>
<p>With no human at the gate, "don't push" in a prompt is just a suggestion. Enforcement hooks deny pushes and PRs while a build is active — for spawned agents only, so your own session works normally.</p>
<p>Anything ambiguous denies rather than allows.</p>
</div>
<div class="panel">
<span class="tag">The boundary, for now</span>
<h4>Today, autonomous stops short of shipping</h4>
<div class="bound"><span class="x">✕</span><p>Never pushes to a remote</p></div>
<div class="bound"><span class="x">✕</span><p>Never opens a PR or merges</p></div>
<div class="bound"><span class="x">✕</span><p>Never claims the work is verified</p></div>
<p style="margin-top:0.6em">Every run ends by handing you this project's acceptance check and the push decision.</p>
</div>
</div>

<p class="footnote">Automated tests don't count as the acceptance check — the builders ran those, so the run would be marking its own homework.</p>

---

### Where it stands

## In production, and honest about the edges

<div class="cols">
<div class="panel">
<span class="tag">In use today</span>
<h4>Shipping production code</h4>
<p>Running now on production work and side projects alike, across web, mobile and data stacks — TypeScript/React, React Native, Python, PostgreSQL, AWS.</p>
</div>
<div class="panel">
<span class="tag">By design</span>
<h4>Technology-agnostic</h4>
<p>Nothing in the pipeline assumes a language or framework. SET detects the stack and scaffolds specialists to match it.</p>
</div>
<div class="panel">
<span class="tag">Still early</span>
<h4>Not yet broadly proven</h4>
<p>Real day-to-day use, but not yet across many teams or every ecosystem. And agent teams remain an experimental Claude Code feature — it moves, and SET moves with it.</p>
</div>
<div class="panel">
<span class="tag">Deliberate</span>
<h4>Costs more</h4>
<p>Parallel builders each running a TDD loop use more tokens than one agent. That's the trade: discipline for cost.</p>
</div>
</div>

---

### Where it goes next

## A team you start — and keep teaching

<p class="lede">SET went from a team you supervise to a team you start: spec-first, test-driven, independently reviewed, resumable after any interruption. Where it stops today is a policy choice, not a ceiling.</p>

<div class="cols3">
<div class="panel">
<span class="tag">Built in</span>
<h4>Each cycle teaches the next</h4>
<p>Every run ends by writing down what worked and what didn't — into the project's learnings and into the specialists themselves. Shipping real work is what makes the team better at it.</p>
</div>
<div class="panel">
<span class="tag">On the drawing board</span>
<h4>Networked agent teams</h4>
<p>Durable autonomous teams across machines, and further into the delivery path — pushing a branch, deploying to a dev environment. The groundwork is already there.</p>
</div>
<div class="panel">
<span class="tag">Open question</span>
<h4>Where should it stop?</h4>
<p>Every boundary SET holds today is one it could move. Which ones are worth keeping is a conversation worth having.</p>
</div>
</div>

<p class="footnote" style="margin-top:1.1em">Ideas, pushback and war stories all welcome. &nbsp;·&nbsp; <code>bash install.sh</code> &nbsp;·&nbsp; github.com/bhall2001/superpowers-engineering-team</p>
