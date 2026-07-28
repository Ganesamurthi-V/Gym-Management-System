# 09 — Fault Detection: Comparator, RS Latch & Soft Turn-Off

**⏱️ Time Budget: 2 hours**  
**Goal: Build the comparator that triggers V_FLT when V_clamp > V_ref,a, the RS Latch that holds the fault, and the Soft Turn-Off that safely shuts down S2.**

---

## 1. Theory — The Final Protection Stage

### What Happens When a Fault Occurs?

Up to now we have built:
1. ✅ Half-bridge (power circuit)
2. ✅ PWM (gate control)
3. ✅ Rogowski sensor → V_clamp (current measurement)
4. ✅ Timing → V_en (when to sample)
5. ✅ Adaptive Threshold → V_ref,a (the alarm level)

Now we need the **alarm system** itself:

```
V_clamp ──┐
           ├──→ [COMPARATOR] ──→ V_FLT goes HIGH ──→ [RS LATCH] ──→ FAULT signal
V_ref,a ──┘                                               │
                                                           └──→ [Soft Turn-Off] ──→ S2 gate OFF
```

### The Comparator

A **comparator** is the simplest decision circuit:
- If V_clamp > V_ref,a → output = HIGH (fault!)
- If V_clamp ≤ V_ref,a → output = LOW (normal)

In the paper (Fig. 4), component **CMP** (TLV3601, Table IV) performs this comparison. The TLV3601 is an ultra-fast comparator with ~4 ns propagation delay.

In Simulink, we model this with a **Compare** block or MATLAB function.

### The RS Latch (Set-Reset Latch)

A latch is a memory circuit. Once the comparator fires (Set=1), the latch output stays HIGH even if the comparator output later goes LOW. This ensures the protection is held until manually reset.

In hardware: NOR-gate RS Latch (SN74LVC2G02 from Table IV).

Truth table:
| S (Set) | R (Reset) | Q (Output) |
|---------|-----------|------------|
| 0 | 0 | Previous Q (holds) |
| 1 | 0 | 1 (fault latched) |
| 0 | 1 | 0 (reset) |
| 1 | 1 | Undefined (avoid) |

In the paper, the latch is reset (R=1) when:
- PWM signal resets it each cycle (S_rst in Fig. 4)
- Or: manual reset after fault clearance

### The Soft Turn-Off (STO) Circuit

When V_FLT goes HIGH, we cannot simply cut the gate signal instantly. Why?

The inductor in the load is carrying current I_d. If we suddenly force I_d = 0, the inductor "fights back" with an enormous voltage spike (V = L × dI/dt, and if dI/dt is huge, V is huge).

This voltage spike can exceed the HEMT's breakdown voltage (650 V for our GaN HEMT) and destroy it.

**Soft Turn-Off** gradually reduces V_gs over a controlled time period (~120 ns as seen in Fig. 9 of the paper), allowing I_d to fall smoothly.

In the paper's hardware (Fig. 4), the STO uses:
- T1, T2 transistors
- R_sc1, R_sc2 resistors (27 Ω and 240 Ω from Table IV)
- C_sc capacitor (820 pF from Table IV)

The STO circuit clamps the gate voltage to a lower value (not zero — about 3–5 V) and allows the HEMT to enter linear (non-saturated) operation, which gradually reduces current.

In Simulink, we model this as: a ramp from V_gs (15 V) down to 0 V over 120 ns.

---

## 2. Build the Fault Detection Subsystem

### Step 1 — Create the Subsystem

**Step 1**
On main canvas, drag a **Subsystem** block.

**Step 2**
Rename it: `Fault_Detection`

**Step 3**
Double-click to open inside.

**Step 4**
We need:
- **2 inputs:** Vclamp_in, Vref_a_in
- **2 outputs:** VFLT_out (fault signal), Gate_override_out (to modify S2 gate)

Delete the default wire. Rename In1 to `Vclamp_in`, add In2 renamed to `Vref_a_in`.
Rename Out1 to `VFLT_out`, add Out2 renamed to `Gate_override_out`.

---

### Step B — The Comparator

**What it does:** Compares V_clamp vs V_ref,a every timestep.

**Method 1: Using Compare to Constant block (recommended)**

Since we need to compare two signals (not one signal vs a constant), we use a **Relational Operator** block:

**Step 1**
In Library Browser, search:
```
Relational Operator
```

Find under **Simulink → Logic and Bit Operations → Relational Operator**

**Step 2**
Drag it to the inside of the Fault_Detection subsystem.

**Step 3**
Double-click it. Set:
- **Relational operator:** `>` (greater than)

This outputs 1 when the first input > second input.

**Step 4**
Connect:
- First input (top): `Vclamp_in`
- Second input (bottom): `Vref_a_in`
- Output: to next stage

**Step 5**
Label the block: `CMP_Comparator`

---

### Step C — The RS Latch (Set-Reset Flip-Flop)

**Step 1**
In Library Browser, search:
```
S-R Flip-Flop
```

Find under **Simulink → Logic and Bit Operations → S-R Flip-Flop**

OR search for:
```
SR Flip Flop
```

**Step 2**
Drag it to the canvas.

**Step 3**
Double-click it. Parameters:
- **Initial condition:** `0` (no fault at start)

**Step 4**
The block has:
- **S (Set) input:** Connect from Comparator output
- **R (Reset) input:** Connect from a reset signal
- **Q output:** This is V_FLT (HIGH when fault is latched)
- **!Q output:** Not needed (can leave unconnected)

**Step 5**
For the **Reset signal (R):**

The paper uses the complementary PWM signal (S_rst) to reset the latch each cycle. In our simulation, we reset it manually after a brief delay post-fault (so the waveform shows the latch behavior clearly):

Add a **Constant** block with value `0` (no reset):
- For initial testing: always 0 (fault stays latched once triggered)
- For full testing: you'll manually reset by stopping and restarting simulation

Connect this Constant → R input.

**Step 6**
Connect Comparator output → S input.

**Step 7**
Connect Q output → VFLT_out.

---

### Step D — Soft Turn-Off Model

**What it does:** When V_FLT goes HIGH, gradually reduces the S2 gate signal to 0 over 120 ns.

**Simulation Equivalent:**

We will use a **MATLAB Function** to model the STO behavior:

**Step 1**
Drag a **MATLAB Function** block.

**Step 2**
Code:
```matlab
function gate_out = soft_turn_off(VFLT, normal_gate)
% Soft Turn-Off Model
% When VFLT=1 (fault detected), ramps V_gs from 15V to 0V over 120 ns
% When VFLT=0 (normal), passes normal_gate through unchanged
%
% This is a SIMULATION MODEL of the STO circuit (T1, T2, Rsc1, Rsc2, Csc in paper)
% Paper: V_gs is clamped to ~11V then gradually falls to 0 over ~120ns (Fig. 9)
%
% normal_gate: The normal PWM gate signal (0 to 15 V)
% VFLT: Fault signal (0 = normal, 1 = fault detected)
% gate_out: Modified gate signal to HEMT

persistent fault_active ramp_value;

if isempty(fault_active)
    fault_active = false;
    ramp_value = 15.0;  % Start at 15 V (fully ON)
end

if VFLT > 0.5 && ~fault_active
    % Fault just detected: start soft turn-off
    fault_active = true;
    ramp_value = 15.0;  % Start ramp from current gate voltage
end

if fault_active
    % Ramp down: 15V to 0V over 120 ns
    % At 100 ns step: 120 ns = 1.2 steps → ramp step = 15/1.2 = 12.5 V/step
    % More realistic: use smaller steps
    % 15V / (120ns / 100ns per step) = 15 / 1.2 = 12.5 V per step
    % Let's use 10 steps for a smoother ramp: 15/10 = 1.5 V per step
    % 10 steps × 100ns = 1000 ns = 1 μs (extended for visibility)
    
    ramp_step = 1.5;  % V per timestep (100 ns each)
    ramp_value = ramp_value - ramp_step;
    
    if ramp_value < 0
        ramp_value = 0;
    end
    
    gate_out = ramp_value;
else
    % Normal operation: pass through PWM signal
    gate_out = normal_gate;
end
end
```

**Step 3**
The block has:
- Input 1: VFLT (fault signal from RS Latch Q output)
- Input 2: normal_gate (S2 PWM signal — the normal gate drive)
- Output: gate_out (the modified gate signal sent to S2)

**Step 4**
Connect:
- `VFLT_out` (from RS Latch Q) → `VFLT` input of STO
- `PWM_S2` signal (we need to bring this in via a 3rd input port) → `normal_gate` input

**Step 5**
Add a 3rd input port to the subsystem:
- Add In3, rename to `PWM_S2_in`
- Connect to `normal_gate` input of STO function

**Step 6**
Connect STO output (`gate_out`) → `Gate_override_out` output port.

---

### Step E — Connect Everything Inside Fault_Detection

Complete internal wiring:

```
Vclamp_in ──→ [Relational: >] ──→ [SR Flip-Flop S] ──→ Q ──→ VFLT_out
Vref_a_in ──→ [Relational: >]                                    │
                                 [Constant 0] ──→ R              │
                                                                  ↓
PWM_S2_in ──→ [Soft_Turn_Off(VFLT)] ──────────────────→ Gate_override_out
                    ↑
               VFLT from Q ─────────────────────────────────────/
```

---

## 3. Connect Fault_Detection to Main Canvas

**Step 1**
Return to main canvas.

**Step 2**
The Fault_Detection subsystem has:
- 3 inputs: Vclamp_in, Vref_a_in, PWM_S2_in
- 2 outputs: VFLT_out, Gate_override_out

**Step 3**
Connect:
- `Rogowski_Integrator Vclamp_out` → `Fault_Detection Vclamp_in`

  > Note: Vclamp is used by BOTH Adaptive_Threshold AND Fault_Detection. You can branch a wire in Simulink: click on a wire, hold Ctrl, and drag from the wire to create a branch to the second destination.

- `Adaptive_Threshold Vref_a_out` → `Fault_Detection Vref_a_in`
- `PWM_Generator Out1 (S2 signal)` → `Fault_Detection PWM_S2_in`

  > Again, this PWM signal is already connected elsewhere — branch it.

**Step 4**
Connect `Fault_Detection Gate_override_out` → `Controlled Voltage Source (S2 gate drive) input`

This REPLACES the direct connection from PWM_Generator to S2's Controlled Voltage Source. Now the fault detection can override the gate signal.

**Step 5**
Add a Scope with 4 channels:
- Channel 1: I_d (current measurement)
- Channel 2: V_clamp
- Channel 3: V_ref,a (adaptive threshold)
- Channel 4: V_FLT (fault signal)

Label it: `Final_Scope`

---

## 4. Run the Complete System

This is the **first full test** of the complete protection system.

### Step 1
Run `setup_parameters.m` in MATLAB.

### Step 2
Press **Ctrl + D** to check for errors.

### Step 3
Fix any errors (see Section 6 — Common Errors).

### Step 4
Press **Ctrl + T** to run.

### Step 5
Open `Final_Scope`. You should see:

**During normal operation (t = 0 to 1 ms):**
```
Channel 1 — I_d: Normal switching waveform (0–15 A ramp, 5 kHz)
Channel 2 — V_clamp: 0 to ~0.3 V, resets each cycle
Channel 3 — V_ref,a: Steady at ~0.82 V (0.2 V hold + 0.62 V bias)
Channel 4 — V_FLT: 0 (no fault)
```

**At t = 1 ms (SC fault injection):**
```
Channel 1 — I_d: Sharp spike to 40–80 A
Channel 2 — V_clamp: Spikes to 0.8–1.6 V (> V_ref,a)
Channel 3 — V_ref,a: Still at ~0.82 V (threshold doesn't change instantly)
Channel 4 — V_FLT: Goes to 1 (HIGH) — FAULT DETECTED! ✅
```

**After V_FLT:**
```
Channel 1 — I_d: Gradually falls (soft turn-off working)
Channel 4 — V_FLT: Stays at 1 (latch holds it)
```

**This is your key result!** 🎉

---

## 5. Measure the Detection Time

The paper reports detection times of 69–103 ns for different fault types.

### Step 1
Open Final_Scope.

### Step 2
In the scope toolbar, click the **Zoom In** button (magnifying glass). 

### Step 3
Click and drag over the region around t = 1 ms to zoom in.

### Step 4
Keep zooming until you can see individual 100 ns steps.

### Step 5
Find:
- **t1:** The moment I_d starts rising sharply (fault starts)
- **t2:** The moment V_FLT goes HIGH

### Step 6
Detection time = t2 - t1.

Note this value in your report.

> ⚠️ **Expected simulation detection time:** Due to our simplified simulation (especially the simplified sensor and 100 ns time step), you may see detection times in the range of **100–500 ns** rather than the paper's 103 ns. This is acceptable — note it as "simulation time step limited to 100 ns."

### Step 7
To get better time resolution: Change solver step to `1e-8` (10 ns):
- Open Model Settings (Modeling tab → Model Settings)
- Change Fixed-step size to `1e-8`
- Re-run simulation

With 10 ns resolution, you can measure detection time more accurately, and results should be closer to paper values.

---

## 6. Compare Adaptive vs Fixed Threshold

Now add a **Fixed Threshold** comparison to demonstrate the paper's improvement.

### Step 1
In the main canvas, add a **Constant** block:
- Value: `1.24` (= 62 A × 0.02 V/A = 1.24 V — fixed threshold at 2× rated current)
- Label: `Fixed_Threshold`

### Step 2
Add a **Relational Operator** block:
- Operator: `>`
- Input 1: V_clamp
- Input 2: Fixed_Threshold (1.24 V)
- Output: VFLT_fixed

### Step 3
Add this to the Final_Scope as Channel 5 (need to increase scope input count to 5):
- Label: VFLT_Fixed

### Step 4
Run simulation and compare:
- Channel 4 (V_FLT adaptive): Should go HIGH first
- Channel 5 (V_FLT fixed): Should go HIGH later (because 1.24 V threshold is higher than adaptive ~0.82 V)

**This is the paper's core demonstration!**

The adaptive threshold fires EARLIER because it is tuned closer to the load current, leaving less distance for the fault current to travel before detection.

---

## 7. Common Errors

### Problem: V_FLT never goes HIGH during fault
**Possible Reasons:**
1. V_clamp is too low — fault current not generating enough voltage
2. V_ref,a is too high — threshold too conservative
3. Comparator not connected correctly

**Fix:**
1. Check V_clamp value: Open scope at Rogowski output, verify spike is visible
2. Check V_ref,a: Should be ~0.62–1.0 V during normal operation
3. Verify Relational Operator connections: V_clamp to top input, V_ref,a to bottom

### Problem: V_FLT goes HIGH during normal operation (false triggering)
**Possible Reasons:**
1. V_bias is too small — threshold too close to operating current
2. Sampling happens during ringing (blanking time not working)
3. V_clamp spikes during switching transitions

**Fix:**
1. Increase V_bias: double it temporarily and observe
2. Verify timing circuit V_en is not active during first 300 ns after turn-ON
3. Add a small filter (1st order lowpass) to V_clamp before the comparator

### Problem: Soft Turn-Off not working (gate snaps to 0 instantly)
**Possible Reasons:**
Persistent variable in MATLAB Function not initialized properly.

**Fix:** Double-check the persistent variable initialization at the top of the function.

### Problem: RS Latch keeps resetting every cycle
**Possible Reasons:**
The Reset (R) signal is going HIGH each cycle.

**Fix:** Confirm the Constant block connected to R is set to 0.

### Problem: S-R Flip-Flop block not found
**Possible Reason:**
The block name varies by MATLAB version.

**Fix:** Search for `SR Latch` or `Set Reset`. Alternatively, use a MATLAB Function:
```matlab
function Q = rs_latch(S, R)
persistent Q_stored;
if isempty(Q_stored)
    Q_stored = 0;
end
if R > 0.5
    Q_stored = 0;
elseif S > 0.5
    Q_stored = 1;
end
Q = Q_stored;
end
```

---

## Fault Detection Checklist

- [ ] Fault_Detection subsystem created
- [ ] Vclamp_in, Vref_a_in, PWM_S2_in input ports added
- [ ] VFLT_out, Gate_override_out output ports added
- [ ] Relational Operator (>) comparator block added and connected
- [ ] SR Flip-Flop (RS Latch) added — S from comparator, R=0 (or reset signal)
- [ ] Soft Turn-Off MATLAB Function added and working
- [ ] All internal connections verified
- [ ] Subsystem connected to main canvas
- [ ] Simulation runs and V_FLT goes HIGH at SC fault
- [ ] Soft Turn-Off shows gradual gate voltage reduction
- [ ] Detection time measured from scope
- [ ] Fixed threshold comparison added for validation
- [ ] Adaptive fires before fixed threshold (paper's core claim verified)
- [ ] Model saved

**→ When ALL boxes are checked, proceed to 10_Testing.md**
