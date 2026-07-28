# 08 — Adaptive Threshold Circuit (Sample-and-Hold)

**⏱️ Time Budget: 3 hours**  
**Goal: Build the Sample-and-Hold circuit that captures V_hold (= G × I_s) during V_en window, then adds V_bias to create V_ref,a (the adaptive threshold).**

---

## 1. Theory — The Core Innovation of the Paper

This chapter implements the most important part of the paper — the adaptive threshold circuit.

### Recap: What We Are Building

From paper Equation (2): `I_ref,a = I_s + ΔI`

In voltage domain (everything is converted to voltages for the analog circuit):
```
V_ref,a = V_hold + V_bias
```
Where:
- **V_hold** = G × I_s = 0.02 × (sampled drain current at turn-ON)
- **V_bias** = G × ΔI = 0.02 × 31 = 0.62 V (fixed DC offset)

### What a Sample-and-Hold Does (CS Analogy)
Think of Sample-and-Hold like saving a variable in programming:

```python
# Normal operation (sampling phase):
V_hold = V_clamp   # Sample: capture the current value

# Between samples (holding phase):
V_hold = V_hold    # Hold: keep the value frozen
```

The timing is controlled by V_en:
- When V_en = 1 (HIGH): Sample mode — V_hold follows V_clamp
- When V_en = 0 (LOW): Hold mode — V_hold stays frozen at its last value

### Why This Gives Us I_s

The V_en window (300 ns to 600 ns after S2 turn-ON) is designed to capture I_d during steady-state conduction, AFTER the turn-ON ringing has died down. At this moment:
- I_d ≈ I_L (the load current flowing through the inductor)
- V_clamp ≈ G × I_L = the load current in voltage form
- V_hold captures this value = G × I_s

Then every new switching cycle, V_hold is updated. This is how the threshold adapts!

---

## 2. The Full Threshold Adjustment Circuit (From Paper Fig. 4)

From the paper's schematic:

```
V_clamp ──→ [Analog Switch S] ──→ [AMP3] ──→ V_hold
                    ↑                               │
               V_en controls                        │
                    │                               ↓
               [C_hold to GND]              [AMP4: V_hold + V_bias]
                                                    │
                                                    ↓
                                               V_ref,a
```

**Analog Switch S (TS5A9411 from Table IV):**  
When V_en HIGH → switch closed → V_clamp passes through → C_hold charges to V_clamp  
When V_en LOW → switch open → C_hold retains its charge → V_hold frozen

**C_hold = 4.7 pF:** Stores the sampled voltage.

**AMP3:** Buffer amplifier — prevents C_hold from discharging through the next stage.

**AMP4:** Adding V_bias:  
The paper uses an op-amp adder circuit (summing amplifier) with peripheral resistors of 1 kΩ (Table IV) and a V_bias source = 0.35 V.

For simulation: V_ref,a = V_hold + V_bias (simple addition).

---

## 3. Build the Adaptive Threshold Subsystem

### Step 1 — Create Subsystem

**Step 1**
On main canvas, drag a **Subsystem** block.

**Step 2**
Rename it: `Adaptive_Threshold`

**Step 3**
Double-click to open.

**Step 4**
We need:
- **2 inputs:** V_clamp (from Rogowski sensor), V_en (from Timing circuit)
- **1 output:** V_ref_a (the adaptive threshold)

Delete the default In1→Out1 wire.

Rename In1 to `Vclamp_in`.

Add a second input port:
- From Library Browser search `In1` under Simulink → Ports & Subsystems
- Drag to canvas, rename to `Ven_in`

Rename Out1 to `Vref_a_out`.

---

### Step B — Clamping Circuit for Synchronous Mode

The paper (Section II-C, synchronous switch mode) says: When S2 is in synchronous switch mode (freewheeling), V_clamp goes negative. The circuit must clamp the sampled value to zero/near-zero to avoid false triggering.

**Simulation equivalent: MAX(V_clamp, 0) during sampling**

**Step 1**
Add a **MATLAB Function** block for the clamped sample:
- Label it `Clamp_Zero`

**Step 2**
Code:
```matlab
function out = clamp_zero(x)
% Clamp to zero if negative (handles synchronous switch mode)
% Paper Section II-C: "sampled I_s is overridden to be set to zero"
out = max(x, 0);
end
```

Connect: `Vclamp_in → Clamp_Zero → (next stage)`

---

### Step C — Sample-and-Hold Using Zero-Order Hold

**What Zero-Order Hold does:** It samples a signal at a specified rate and holds the value between samples — exactly what we need!

But we need a **triggered** ZOH — it samples only when V_en is HIGH.

**Simulation Approach:**

We use a **MATLAB Function block** to implement the triggered sample-and-hold:

**Step 1**
Drag a **MATLAB Function** block.

**Step 2**
Double-click it. Enter this code:
```matlab
function V_hold = sample_and_hold(V_clamp_clamped, V_en)
% Triggered Sample-and-Hold
% Captures V_clamp when V_en is HIGH (sampling window)
% Holds the last captured value when V_en is LOW
%
% V_clamp_clamped: voltage proportional to I_d (clamped to ≥ 0)
% V_en: enable signal (1 = sample, 0 = hold)
% V_hold: held voltage = G × I_s (adaptive threshold basis)
%
% Paper: "I_s is sampled once per cycle during the V_en window"
% Paper ref: Equation (2): I_ref,a = I_s + ΔI

persistent held_value;

% Initialize
if isempty(held_value)
    held_value = 0;
end

if V_en > 0.5
    % SAMPLING MODE: capture current V_clamp
    held_value = V_clamp_clamped;
end

% HOLDING MODE (always output the held value)
V_hold = held_value;
end
```

**Step 3**
Close editor (Ctrl+S).

**Step 4**
The block has 2 inputs (V_clamp_clamped, V_en) and 1 output (V_hold).

**Step 5**
Connect:
- Input 1: from Clamp_Zero output
- Input 2: from Ven_in

**Step 6**
Set the MATLAB Function's sample time:
- Right-click the block → Properties (or double-click → click the function name at top → look at bottom of code window for "Properties")
- Set Sample Time to `-1` (inherited) or `1e-7` (100 ns — matching solver)

---

### Step D — Add V_bias (The Fixed Margin ΔI)

**Step 1**
Add a **Constant** block:
- Library: Simulink → Sources → Constant
- Value: `Vbias` (which = 0.62 from setup_parameters.m, or type `0.62` directly)
- Label: `Vbias_source`

**Step 2**
Add a **Sum** block:
- Library: Simulink → Math Operations → Sum
- Signs: `++` (two positive inputs)
- Label: `Threshold_Adder`

**What this represents:**
This Sum block implements: V_ref,a = V_hold + V_bias

In the paper's hardware (Fig. 4), AMP4 is an op-amp summing circuit that adds V_hold and V_bias. In simulation, a Sum block does the same mathematically.

**Step 3**
Connect:
- V_hold (from Sample-and-Hold) → Sum input 1
- Vbias_source → Sum input 2
- Sum output → Vref_a_out

---

### Step E — Add Buffer (AMP3 Model)

In the paper, AMP3 buffers V_hold so the capacitor C_hold doesn't discharge. In simulation, our signals don't have loading effects, so a buffer is optional. But for completeness:

**Step 1**
Add a **Gain** block between Sample-and-Hold output and Sum input 1.

**Step 2**
Set Gain value to `1` (unity gain buffer — like AMP3 which is a voltage follower).

**Step 3**
Label: `AMP3_buffer`

---

### Step F — Internal Wiring Summary

Inside the Adaptive_Threshold subsystem, the complete signal path is:

```
Vclamp_in → [Clamp_Zero] → [Sample_and_Hold(Ven_in)] → [AMP3_buffer] → [Threshold_Adder] → Vref_a_out
                                                                                     ↑
                                                                              [Vbias_source: 0.62V]
```

---

## 4. Handle the Synchronous Mode Clamping

The paper says (Section II-C):
> "The sampled I_s is overridden to be set to zero [in synchronous switch mode]."

This is achieved in hardware by the circuit's design — the clamping diode D (shown in Fig. 4) prevents V_hold from going negative.

In our simulation, the `Clamp_Zero` MATLAB function already does this (max(x, 0)).

We need to also handle the V_clamp negative values properly. In synchronous switch mode, V_clamp goes negative (I_d is negative). Our clamp ensures V_hold never goes below 0.

**Additional: V_clamp Clamping for Negative Values**

Add a second clamp that limits V_clamp from going too negative (modeling the diode D in Fig. 4):

**Step 1**
Between Vclamp_in and Clamp_Zero, add a **Saturation** block:
- Library: Simulink → Discontinuities → Saturation
- Upper limit: `10` (large positive — no upper clamping needed here)
- Lower limit: `-0.1` (slight negative allowed — models the clamping diode forward voltage)
- Label: `Diode_Clamp`

This prevents V_clamp from going very negative, modeling the clamping effect of diode D in the paper.

---

## 5. Return to Main Canvas and Connect

**Step 1**
Return to main canvas (◀ back arrow).

**Step 2**
Adaptive_Threshold block shows:
- 2 inputs: Vclamp_in, Ven_in
- 1 output: Vref_a_out

**Step 3**
Connect:
- `Rogowski_Integrator: Vclamp_out` → `Adaptive_Threshold: Vclamp_in`
- `Timing_Circuit: Ven_out` → `Adaptive_Threshold: Ven_in`

**Step 4**
Leave `Vref_a_out` unconnected for now. Add a temporary Scope.

**Step 5**
Add a Multi-channel Scope with 3 inputs:
- Channel 1: V_clamp (from Rogowski output)
- Channel 2: V_hold (add an output port inside subsystem to expose this too)
- Channel 3: V_ref,a (from Vref_a_out)

**To add V_hold as an additional output:**
- Go inside the subsystem
- Add another Out2 port (rename to `Vhold_out`)
- Connect the Sample-and-Hold output to both AMP3_buffer AND this Vhold_out
- Return to main canvas
- Connect Vhold_out to Scope channel 2

---

## 6. Run and Verify

**Step 1**
Run `setup_parameters.m` in MATLAB Command Window.

**Step 2**
Press **Ctrl + D** to update model.

**Step 3**
Press **Ctrl + T** to run simulation.

**Step 4**
Open the Adaptive Threshold Scope.

**Expected waveforms:**

```
Channel 1 — V_clamp (proportional to I_d):
        ______        ______
       /      \      /      \
______/        \____/        \______
(ramps up when S2 ON, resets when OFF)

Channel 2 — V_hold (sampled I_s × G):
Each cycle: steps to new value capturing the current I_d level
It should be roughly constant (stable load) or slowly changing
Example: if I_d at sampling moment ≈ 10 A → V_hold ≈ 0.20 V

Channel 3 — V_ref,a = V_hold + V_bias:
Same shape as V_hold but raised by V_bias = 0.62 V
Example: 0.20 V + 0.62 V = 0.82 V
```

**At t = 1ms (SC fault):**
```
Channel 1 — V_clamp spikes to 1.0–1.5 V (I_d spike to 50–75 A)
Channel 3 — V_ref,a is still at normal level (~0.82 V)
             → V_clamp > V_ref,a → FAULT!
```

If you see this behavior: **Adaptive Threshold is working!** ✅

---

## 7. Numerical Validation

Open MATLAB Command Window and run:
```matlab
% Validation of threshold values
% Based on paper parameters

Sensor_Gain = 0.02;  % 20 mV/A
delta_I = 31;        % A
Vbias = delta_I * Sensor_Gain;  % = 0.62 V

% At load current I_L = 10 A:
I_s = 10;  % sampled drain current
V_hold = I_s * Sensor_Gain;  % = 0.20 V
V_ref_a = V_hold + Vbias;    % = 0.82 V
fprintf('At I_L = %d A: V_hold = %.2f V, V_ref,a = %.2f V\n', I_s, V_hold, V_ref_a);

% This means: fault detected when I_d > V_ref_a/Sensor_Gain = 0.82/0.02 = 41 A
fprintf('Fault threshold: I_d > %.1f A\n', V_ref_a/Sensor_Gain);

% Compare to fixed threshold:
I_ref_fixed = 2 * 31;  % = 62 A (2 × rated current, traditional method)
V_ref_fixed = I_ref_fixed * Sensor_Gain;  % = 1.24 V
fprintf('\nFixed threshold: I_d > %.1f A (V = %.2f V)\n', I_ref_fixed, V_ref_fixed);

fprintf('\nAdaptive threshold saves: %.1f A before detection\n', I_ref_fixed - V_ref_a/Sensor_Gain);
```

Expected output:
```
At I_L = 10 A: V_hold = 0.20 V, V_ref,a = 0.82 V
Fault threshold: I_d > 41.0 A
Fixed threshold: I_d > 62.0 A (V = 1.24 V)
Adaptive threshold saves: 21.0 A before detection
```

This shows the adaptive threshold detects the fault at 41 A instead of 62 A — much earlier! ✅

---

## 8. Common Errors

### Problem: V_hold never changes (stays at 0)
**Cause:** V_en is never going HIGH, so the sample never triggers.  
**Fix:** Add a Scope to V_en at the Adaptive_Threshold input. If it's always 0, the Timing_Circuit is not generating V_en correctly. Return to Chapter 07 and fix the timing circuit.

### Problem: V_hold is noise/oscillating
**Cause:** V_en is transitioning too fast, causing multiple samples per cycle.  
**Fix:** Ensure V_en is a clean pulse (no glitches). Check the timing logic in Chapter 07.

### Problem: V_ref,a = V_bias only (V_hold = 0 always)
**Cause:** The sample-and-hold is clamping everything to zero.  
**Fix:** Check the Clamp_Zero function — if V_clamp is already negative, it gets clamped to 0 before sampling. Verify V_clamp is positive during the sampling window.

### Problem: "Undefined function persistent" error
**Cause:** MATLAB Function block has incorrect settings.  
**Fix:** Ensure the MATLAB Function block's Sample Time is set to `1e-7`. Persistent variables require a fixed sample time.

### Problem: V_ref,a doesn't change between cycles
**Cause:** The persistent variable in the MATLAB Function might not be updating correctly.  
**Fix:** Add a `disp` statement inside the function temporarily to debug, or use a Zero-Order Hold block instead.

---

## 9. Alternative: Using Zero-Order Hold Block

If the MATLAB Function approach causes problems, use this pure block approach:

**Step 1**
Delete the MATLAB Function Sample-and-Hold block.

**Step 2**
Add a **Zero-Order Hold** block:
- Library: Simulink → Discrete → Zero-Order Hold
- Set Sample time: `Tperiod` (= 0.0002 s — samples once per switching cycle)

**Step 3**
Connect: `Vclamp_in → Clamp_Zero → Zero-Order Hold → AMP3 → Sum → Vref_a_out`

**Step 4**
The ZOH samples at exactly the switching period — not at the V_en window. This is slightly less accurate than the triggered S&H (because we don't wait for t_a blanking), but demonstrates the adaptive concept.

> ⚠️ **Label in report:** "Simplified simulation of sample-and-hold using Zero-Order Hold at switching frequency. The exact V_en timing window (t_a to t_b) is modeled conceptually; the ZOH captures the steady-state current value at each cycle."

---

## Adaptive Threshold Checklist

- [ ] Adaptive_Threshold subsystem created
- [ ] Vclamp_in and Ven_in input ports configured
- [ ] Vref_a_out (and optionally Vhold_out) output ports configured
- [ ] Clamp_Zero block (or Saturation) prevents negative sampling
- [ ] Sample-and-Hold implemented (MATLAB Function or ZOH)
- [ ] V_bias source = 0.62 V (or `Vbias` variable)
- [ ] Sum block adds V_hold + V_bias to produce V_ref,a
- [ ] AMP3 unity-gain buffer block present
- [ ] Subsystem connected: Vclamp from Rogowski, Ven from Timing
- [ ] Simulation runs, V_hold shows stepped values each cycle
- [ ] V_ref,a = V_hold + 0.62 V verified
- [ ] Numerical check confirms threshold values match paper
- [ ] At SC fault, V_clamp > V_ref,a visible on scope

**→ When ALL boxes are checked, proceed to 09_Fault_Detection.md**
