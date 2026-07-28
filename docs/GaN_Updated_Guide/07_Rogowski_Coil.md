# 07 — Rogowski Coil Deep Dive & Timing Circuit

**⏱️ Time Budget: 2 hours**  
**Goal: Understand the timing circuit (t_a, t_b, V_en) from the paper and build it in Simulink. This controls WHEN I_s is sampled.**

---

## 1. Why We Need a Timing Circuit

Think of the problem like this:

You want to take a photograph of a runner mid-race. If you press the shutter at the wrong moment (at the start, when they're accelerating, or right after a stumble), you get a blurry or misleading picture. You need to press it during steady-state running.

Similarly, we cannot sample I_s (the "snapshot" of drain current I_d) at just any time during the ON period. We must sample it:
- **Not too early:** Right after turn-ON, current is ringing (oscillating due to parasitic inductance). This is noise, not the true load current.
- **Not too late:** If we sample too late, the current has already changed.

The paper solves this with a timing circuit that creates a sampling window from **t_a to t_b** after each turn-ON event of S2.

From paper Table IV:
- **t_a = 300 ns** — Blanking time (wait after turn-ON for ringing to die down)
- **t_b = 600 ns** — End of sampling window

So the sampling window is: **300 ns to 600 ns after S2 turns ON**.

During this window (V_en = HIGH), the Sample-and-Hold captures V_clamp (= G × I_s).

---

## 2. How the Paper's Timing Circuit Works

From Fig. 4 of the paper, the timing circuit has:

```
PWM (S2) signal
    │
    ├──→ R1, R2, R3 (resistor divider to set threshold) ──→ [One-Shot 1] ──→ V2
    │                                                              │
    │                                                              ↓
    └──────────────────────────────────────────────────────→ [One-Shot 2] ──→ V3
                                                                   │
                                                              [AND gate] ──→ V_en
```

**One-Shot 1** (triggered by PWM rising edge):
- Produces a pulse of duration **t_b = 600 ns**
- Output: V_2 goes HIGH for 600 ns after PWM rises

**One-Shot 2** (triggered by Q-bar output of One-Shot 1):
- Produces a pulse of duration **t_b - t_a = 300 ns**  
- Output: V_3 goes HIGH for 300 ns

**AND gate:**
- V_en = V_2 AND (NOT V_3) — creates the window from t_a to t_b

> ⚠️ **Simulation Note:** One-Shot ICs (like SN74LVC1G123 used in the paper, Table IV) are analog/digital hardware components. In Simulink, we model them using **Pulse Delay blocks** and logic gates. This is clearly a simulation equivalent.

---

## 3. Build the Timing Subsystem

### Step 1 — Create the Timing Subsystem

**Step 1**
On the main Simulink canvas, drag a new **Subsystem** block.

**Step 2**
Rename it: `Timing_Circuit`

**Step 3**
Double-click to open the inside.

**Step 4**
Delete the wire between In1 and Out1 (click wire, press Delete).

**Step 5**
We need:
- 1 input: PWM_S2 (the S2 gate signal)
- 1 output: V_en (the enable/sampling signal)

Rename In1 to `PWM_in`, Out1 to `Ven_out`.

---

### Step B — Detect the Rising Edge of PWM

When S2 turns ON (PWM goes from 0 to 1), we need to detect this rising edge to start the timing.

**Step 1**
First, convert PWM signal (0 to 15 V) to logical (0 or 1):
- Drag a **Compare to Constant** block
- Set: Operator = `>`, Constant = `7.5`
- Label: `PWM_Logic`
- Connect: PWM_in → PWM_Logic

**Step 2**
Detect rising edge using **Unit Delay** and logic:

Rising edge = Current value is 1 AND Previous value was 0

- Drag a **Unit Delay** block (Simulink → Discrete → Unit Delay)
  - Set Sample time: `1e-7` (100 ns — matches our solver step)
  - Label: `Prev_PWM`
- Drag a **Logical Operator (NOT)** 
  - Label: `NOT_prev`
- Drag a **Logical Operator (AND)**
  - Label: `Rising_Edge`

Connect:
```
PWM_Logic ──────────────────────────────→ [AND: Rising_Edge] → trigger signal
PWM_Logic → [Unit Delay] → [NOT] ──────→ [AND: Rising_Edge]
```

When PWM goes 0→1:
- PWM_Logic = 1 (current)
- Unit Delay output = 0 (previous was 0)
- NOT(0) = 1
- AND(1,1) = 1 → Rising edge detected ✅

---

### Step C — Model One-Shot 1 (Duration: t_b = 600 ns)

A One-Shot (monostable multivibrator) produces a fixed-width pulse when triggered. In Simulink, we approximate with a logic circuit:

**Method:** Use a **counter approach** with a flip-flop and counter:

**Simpler Method (recommended):** Use a MATLAB Function block:

**Step 1**
Drag a **MATLAB Function** block:
- Library: Simulink → User-Defined Functions → MATLAB Function

**Step 2**
Double-click it. The editor opens.

**Step 3**
Delete the default code and type this exactly:
```matlab
function V2 = one_shot_1(trigger, reset_signal)
% One-Shot 1: Produces HIGH output for t_b = 600 ns after trigger
% This is a simulation model of the SN74LVC1G123 One-Shot IC

persistent timer_active timer_count;

% Initialize on first call
if isempty(timer_active)
    timer_active = false;
    timer_count = 0;
end

% Count duration in timesteps
% At 100 ns step size: 600 ns = 6 steps
tb_steps = 6;  % t_b / dt = 600e-9 / 1e-7 = 6 steps

if trigger > 0.5  % Rising edge detected
    timer_active = true;
    timer_count = 0;
end

if timer_active
    timer_count = timer_count + 1;
    V2 = 1;
    if timer_count >= tb_steps
        timer_active = false;
        V2 = 0;
    end
else
    V2 = 0;
end
end
```

**Step 4**
Close the editor (Ctrl+S inside the editor).

**Step 5**
The block now has 2 inputs (trigger, reset_signal) and 1 output (V2).

Connect:
- Input 1 (trigger): from Rising_Edge AND gate output
- Input 2 (reset_signal): connect a Constant block with value 0 (we don't use reset here)
- Output V2: to next stage

> ⚠️ **About the 6 steps:** At our solver step size of 1e-7 seconds (100 ns), t_b = 600 ns = 6 timesteps. If you change the solver step size, change this number accordingly: tb_steps = round(t_b / dt) = round(600e-9 / 1e-7) = 6.

---

### Step D — Model One-Shot 2 (Duration: t_a = 300 ns)

**Step 1**
Drag another **MATLAB Function** block.

**Step 2**
Double-click, replace code with:
```matlab
function V3 = one_shot_2(trigger)
% One-Shot 2: Produces HIGH output for t_a = 300 ns after V2 goes LOW
% Triggered by falling edge of V2 (Q-bar = NOT Q in paper)
% This models the blanking period

persistent timer_active timer_count;

if isempty(timer_active)
    timer_active = false;
    timer_count = 0;
end

% 300 ns / 100 ns step = 3 steps
ta_steps = 3;  % t_a / dt = 300e-9 / 1e-7 = 3 steps

if trigger > 0.5
    timer_active = true;
    timer_count = 0;
end

if timer_active
    timer_count = timer_count + 1;
    V3 = 1;
    if timer_count >= ta_steps
        timer_active = false;
        V3 = 0;
    end
else
    V3 = 0;
end
end
```

**Step 3**
This One-Shot 2 is triggered by the **falling edge of V2 (NOT Q in the paper = Q-bar)**.

To detect falling edge of V2:
- Duplicate the rising edge detector but apply NOT to V2 first
- Or: trigger One-Shot 2 on the complement of V2's trigger (at the same PWM edge, with different timing)

**Simplified approach:**
- V3 is triggered by the SAME rising edge as V1 but represents the BLANKING period ONLY
- V3 should be HIGH from 0 to t_a (300 ns), then go LOW
- V2 should be HIGH from 0 to t_b (600 ns), then go LOW
- V_en = V2 AND (NOT V3) = HIGH from t_a to t_b only

So just trigger both One-Shots from the same rising edge signal.

Connect the Rising_Edge output to both One-Shot 1 trigger and One-Shot 2 trigger.

---

### Step E — AND Gate for V_en

**Step 1**
Drag a **Logical Operator (AND)** block.
- Set Number of inputs: 2
- Label: `Ven_AND`

**Step 2**
Drag a **Logical Operator (NOT)** block.
- Label: `NOT_V3`

**Step 3**
Connect:
```
V2 ──────────────────────→ [AND: Ven_AND] → Ven_out
V3 → [NOT: NOT_V3] ──────→ [AND: Ven_AND]
```

**V_en logic:**
- From t=0 to t_a (0 to 300 ns after PWM rise): V2=1, V3=1 → NOT(V3)=0 → V_en = 0 (blanking, noise ignored)
- From t_a to t_b (300 ns to 600 ns after PWM rise): V2=1, V3=0 → NOT(V3)=1 → V_en = 1 (sampling window ACTIVE!)
- After t_b (after 600 ns): V2=0 → V_en = 0

This creates exactly the sampling window described in the paper! ✅

---

## 4. Verify the Timing

**Step 1**
Connect Ven_out to a Scope channel.

Also connect V2 and V3 to scope channels for debugging.

**Step 2**
Add a temporary Scope with 4 inputs:
- Channel 1: PWM_S2 (raw)
- Channel 2: V2 (One-Shot 1 output)
- Channel 3: V3 (One-Shot 2 output)  
- Channel 4: V_en (enable signal)

**Step 3**
Run simulation.

**Step 4**
Expected waveform (zoomed in on one turn-ON event):

```
t=0        t_a=300ns    t_b=600ns

PWM:  ┌─────────────────────────────────────
      │ 
──────┘ (turn-ON)

V2:   ┌──────────────────────┐
      │                      │
──────┘                      └─────── (600ns wide)

V3:   ┌─────────┐
      │         │
──────┘         └───────────────────── (300ns wide)

V_en: ──────────┌────────────┐
                │            │
                └────────────┘─────── (300ns to 600ns window)
```

If you see this pattern: **Timing circuit is working!** ✅

---

## 5. Connect Timing Circuit to Main Canvas

**Step 1**
Return to main canvas.

**Step 2**
The Timing_Circuit subsystem has:
- 1 input: PWM_in
- 1 output: Ven_out

**Step 3**
Connect:
- `PWM_Generator Out1 (S2 signal)` → `Timing_Circuit: PWM_in`

**Step 4**
The `Ven_out` will be needed in the next chapter (Adaptive Threshold). Leave it unconnected for now — add a temporary Scope to Ven_out for verification.

---

## 6. Alternative: Simpler Timing Model

If the MATLAB Function blocks cause errors or instability, use this pure Simulink approach:

**Delete** the MATLAB Function blocks.

**Use Transport Delay blocks instead:**

**Step 1**
Search Library Browser: `Transport Delay`
Find under: Simulink → Continuous

**Step 2**
For V2 (t_b window signal):
- Drag Transport Delay
- Set Time delay: `600e-9`
- This delays the PWM signal by 600 ns

**V2 logic:**
```
PWM_Logic → [AND] → V2
NOT(delayed PWM) ──→ [AND]
```
This is HIGH from turn-ON to 600 ns after turn-ON.

**Step 3**
For V3 (t_a blanking signal):
- Another Transport Delay with Time delay: `300e-9`
- Same logic gives V3 = HIGH for 300 ns

**Step 4**
V_en = V2 AND NOT(V3) — same as before.

> ⚠️ **Note:** Transport Delay in Simulink uses interpolation and may not be perfectly sharp at 100 ns resolution. This is acceptable for our demonstration — we note timing accuracy as a simulation limitation in the final report.

---

## 7. Common Problems

### Problem: V_en never goes HIGH
**Cause:** Rising edge detector is not triggering, OR One-Shot durations are zero.  
**Fix:** 
1. Check that PWM_Logic block correctly identifies HIGH/LOW (threshold = 7.5, not 0)
2. Check that ta_steps and tb_steps are non-zero (at least 1)
3. Verify solver step size matches what you used in the MATLAB Function

### Problem: V_en is always HIGH
**Cause:** NOT block is missing or OR logic error.  
**Fix:** Trace the signal from PWM_Logic through the chain. Add a Scope at each node to see where it goes wrong.

### Problem: "Persistent variable" error in MATLAB Function
**Cause:** MATLAB Functions with persistent variables need a fixed sample time.  
**Fix:** In the MATLAB Function block settings, set Sample Time to `1e-7` (matching solver step).

### Problem: Timing window appears at wrong time
**Cause:** ta_steps or tb_steps values are incorrect for your solver step size.  
**Fix:** Recalculate: ta_steps = round(ta / solver_step_size). With ta=300e-9 and step=1e-7: ta_steps = 3.

---

## Timing Circuit Checklist

- [ ] Timing_Circuit subsystem created
- [ ] PWM_in input port, Ven_out output port configured
- [ ] Rising edge detector built (current AND NOT previous)
- [ ] One-Shot 1 models 600 ns duration (t_b)
- [ ] One-Shot 2 models 300 ns duration (t_a)  
- [ ] AND gate with NOT creates V_en window (300–600 ns after turn-ON)
- [ ] Timing verification scope shows correct V2, V3, V_en waveforms
- [ ] V_en is HIGH only during 300–600 ns window after S2 turn-ON
- [ ] Timing_Circuit connected to PWM_Generator output in main canvas
- [ ] Model saved

**→ When ALL boxes are checked, proceed to 08_Adaptive_Threshold.md**
