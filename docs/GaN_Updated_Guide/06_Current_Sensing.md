# 06 — Current Sensing (Rogowski Coil Simulation Model)

**⏱️ Time Budget: 2 hours**  
**Goal: Build a simulation model of the Rogowski coil + integrator circuit that converts drain current I_d into a proportional voltage V_clamp = G × I_d = 20 mV/A × I_d.**

---

## 1. Theory — What Is a Rogowski Coil? (For CS Students)

### The Analogy
Think of a microphone. A microphone converts sound waves (which are pressure changes) into electrical voltage. A **Rogowski coil** converts **changes in current** (dI/dt) into an electrical voltage.

### The Physics (Very Simple Version)
When current flows through a conductor (like the drain of our HEMT), it creates a magnetic field around it. If the current changes, the magnetic field changes. A coil of wire placed around the conductor detects this change and produces a voltage:

```
V_coil = M × (dI_d/dt)
```

Where:
- **V_coil** = the voltage produced by the Rogowski coil (in Volts)
- **M** = mutual inductance of the coil = **7.66 nH** (from paper Table II)
- **dI_d/dt** = how fast the current is changing (Amperes per second)

### The Problem
V_coil gives us the **rate of change** of current — not the current itself. 

If current is a smooth sine wave:
```
I_d(t) = sin(t)
dI_d/dt = cos(t)   ← This is what the coil sees
```

To get back to I_d, we need to **integrate** (undo the derivative):

```
V_int = (M / R_i×C_i) × I_d
```

This is the job of the **integrator circuit** (using R_i = 116 Ω and C_i = 3.3 nF from paper Table II).

### Why the Paper Uses Rogowski Coil
From Section III-A of the paper:
- The Rogowski coil provides **high bandwidth** sensing (the PCB version has 106.5 MHz bandwidth)
- It is non-contact — no insertion loss in the power circuit
- It provides the information needed for **both SC detection AND load current sampling** (I_s)

### The PCB Rogowski Coil (Paper Hardware vs Our Simulation)
The paper uses a physical PCB Rogowski coil (Fig. 14) wound around the source pin of S2. The coil parameters from Table II:
- Mutual inductance M = 7.66 nH
- Self-inductance L_s = 459.35 nH
- Resonant frequency f_r = 106.5 MHz
- Sensor Gain G = 20 mV/A

> ⚠️ **SIMULATION EQUIVALENT NOTICE:**  
> We CANNOT model a real PCB Rogowski coil in standard Simulink. Instead, we model its MATHEMATICAL FUNCTION:
> 1. We take the derivative of I_d (dI_d/dt) — this is what the coil produces
> 2. We integrate it back with gain M/(R_i×C_i) — this is what the integrator does
> 3. The net result is a voltage V_clamp = G × I_d
>
> This is a **behavioral simulation model** — it gives the same input-output relationship but does not model coil resonance, damping, or PCB parasitic effects.

---

## 2. The Complete Sensing Chain

From the paper's circuit (Fig. 4):

```
I_d ──→ [Rogowski Coil] ──→ V_coil = M × dI_d/dt
                                         │
                                         ↓
                                    [Integrator (R_i, C_i)]
                                         │
                                         ↓
                                    V_int = (M/R_i×C_i) × I_d
                                         │
                                    [AMP2 Buffer (gain = R_c/R_f)]
                                         │
                                         ↓
                                    V_clamp ≈ G × I_d = 0.02 × I_d
```

From paper Table II: Sensor gain G = 20 mV/A. So:
- At I_d = 31 A (rated): V_clamp = 0.62 V
- At I_d = 62 A (fault): V_clamp = 1.24 V

---

## 3. Mathematical Simplification for Simulation

Since we already have I_d as a Simulink signal from our **Current Measurement block** in the half-bridge, we can simplify:

**Simulation approach:**

```
I_d (from Current Measurement) ──→ [Gain: G = 0.02] ──→ V_clamp
```

This gives us V_clamp = 0.02 × I_d directly.

However, to be faithful to the paper's circuit (and to show the derivative-integrate chain), we will model the full chain:

```
I_d ──→ [Derivative block] ──→ dI_d/dt ──→ [Gain: M = 7.66e-9] ──→ V_coil
                                                                        │
                                                                        ↓
                                                              [Integrator: 1/(R_i×C_i×s)]
                                                                        │
                                                                        ↓
                                                                      V_clamp
```

Mathematically:
- V_coil = M × dI_d/dt
- V_int = ∫V_coil dt / (R_i × C_i) = M × I_d / (R_i × C_i)
- Gain = M / (R_i × C_i) = 7.66e-9 / (116 × 3.3e-9) = 7.66e-9 / 382.8e-9 = 0.02 ✅

This confirms: the full chain gives the same gain as G = 20 mV/A. ✅

---

## 4. Build the Current Sensing Subsystem

### Step 1 — Create the Subsystem

**Step 1**
Open your Simulink model. Go to the main canvas.

**Step 2**
From Library Browser, search for and drag a **Subsystem** block to the canvas.

**Step 3**
Place it to the RIGHT of the half-bridge, below the Scope.

**Step 4**
Rename it: double-click the label, type `Rogowski_Integrator`, press Enter.

**Step 5**
Double-click the Rogowski_Integrator block to open its inside canvas.

---

### Step B — Inside the Subsystem: Add Input Port

**Step 1**
You see In1 (input port) and Out1 (output port) already there.

**Step 2**
Double-click the "In1" label. Change it to `Id_in`. Press Enter.

**Step 3**
Double-click the "Out1" label. Change it to `Vclamp_out`. Press Enter.

---

### Step C — Add the Derivative Block (Rogowski Coil Model)

**What it does:** Computes dI_d/dt. This represents what the Rogowski coil sees (the rate of change of current).

**Step 1**
In Library Browser, search:
```
Derivative
```

**Step 2**
Find **"Derivative"** under **Simulink → Continuous**.

**Step 3**
Drag it to the inside canvas, place it to the right of Id_in.

**Step 4**
**Important:** The Derivative block in Simulink is sensitive to noise. If the input has any sharp edges (which our switching current does!), the derivative will spike. We need to handle this.

Double-click the Derivative block.

You see a parameter: **"Linearization time constant"** or **"Filter coefficient"** (depending on MATLAB version).

Set this to: `1e6` (this is a large number meaning very little filtering — we want fast response since the Rogowski coil is very fast in reality).

Click **OK**.

---

### Step D — Add Gain Block for Mutual Inductance M

**What it does:** Multiplies dI_d/dt by M = 7.66 nH to get V_coil.

**Step 1**
Search Library Browser: `Gain`

**Step 2**
Drag a **Gain** block to the right of the Derivative block.

**Step 3**
Double-click it. Set:
- **Gain:** `7.66e-9`

This is the mutual inductance M = 7.66 nH from paper Table II.

**Step 4**
Change the label: double-click text below block, type `M_coil`, press Enter.

---

### Step E — Add the Integrator Block (RC Integrator Model)

**What it does:** Integrates V_coil over time. This undoes the derivative, giving back a signal proportional to I_d.

The transfer function of the integrator is:
```
H(s) = 1 / (R_i × C_i × s)
```
Where s is the Laplace variable (represents integration in frequency domain).

**Step 1**
In Library Browser, search:
```
Transfer Fcn
```

**Step 2**
Find **"Transfer Fcn"** under **Simulink → Continuous**.

**Step 3**
Drag it to the right of the Gain block.

**Step 4**
Double-click it.

**Step 5**
Set parameters:

- **Numerator coefficients:** `[1]` (just 1 in the numerator)
- **Denominator coefficients:** `[Ri*Ci, 0]`

> 📝 **What does this mean?**
> A transfer function H(s) = Numerator / Denominator.
> We want H(s) = 1 / (R_i × C_i × s)
> In polynomial form: denominator = R_i×C_i × s + 0 × 1 = [R_i×C_i, 0]
> Numerator = [1]

If MATLAB variable names don't work here (Ri, Ci might not be recognized):
- Type the numerical value instead: `[116*3.3e-9, 0]` = `[3.828e-7, 0]`
- Or type `[Ri*Ci, 0]` — MATLAB will evaluate it if you ran setup_parameters.m first

**Step 6**
Click **OK**.

**Step 7**
Label it: `RC_Integrator`

---

### Step F — Add Reset Logic (Integrator Reset During OFF State)

The paper (Section III-A) states: "An analog switch S_rst is connected in parallel with C_i to reset the integrator output during the OFF-state of each switching cycle."

This is critical — without reset, the integrator would drift and accumulate error over many cycles.

**Simulation Equivalent:**
We will use a **Resettable Integrator** block instead of the Transfer Function, which allows us to reset it each cycle.

**Step 1**
Delete the Transfer Fcn block we just added (click it, press Delete).

**Step 2**
In Library Browser, search:
```
Integrator
```

**Step 3**
Find **"Integrator"** under **Simulink → Continuous**.

**Step 4**
Drag it to the canvas.

**Step 5**
Double-click it.

**Step 6**
Set parameters:
| Parameter | Value | Why |
|-----------|-------|-----|
| External reset | `rising` | Reset on rising edge of reset signal |
| Initial condition source | `internal` | Start at 0 |
| Initial condition | `0` | Start at 0 V |

**Step 7**
Now the Integrator block has an extra input port at the bottom labeled **"R"** — this is the reset input.

**Step 8**
The Integrator computes ∫(input)dt, so its output = (1/s) × input.

We need the gain 1/(R_i×C_i) applied to the input BEFORE the integrator.

**Add a Gain block before the Integrator:**
- Drag a Gain block between M_coil Gain and the Integrator
- Set value: `1/(116 * 3.3e-9)` = `1/3.828e-7` = approximately `2,612,960`
- Label it: `Inv_RiCi`

**Step 9**
The signal chain is now:
```
Id_in → [Derivative] → [Gain M] → [Gain 1/RiCi] → [Integrator] → Vclamp_out
                                                            ↑
                                                       [Reset signal R]
```

---

### Step G — Add the Reset Signal

The integrator resets during the S2 OFF period. The reset signal = complement of PWM signal for S2.

**Step 1**
We need to bring the S2 PWM signal INTO this subsystem.

Add a new **input port** (In2) to the subsystem:
- From Library Browser, search `In1` under Simulink → Ports & Subsystems
- Drag it to the inside of Rogowski_Integrator subsystem
- Label it `PWM_S2_in`

**Step 2**
The reset signal = HIGH when S2 is OFF = NOT(PWM_S2).

Add a **Logical Operator** block (NOT):
- Search: `Logical Operator`
- Set Operator: `NOT`

Connect: `PWM_S2_in` → `NOT` → `Integrator R port`

**Step 3**
But wait — the PWM signal is 0 to 15 (volts). We need to convert to Boolean (0 or 1).

Add a **Compare to Constant** block between PWM_S2_in and NOT:
- Search: `Compare to Constant`
- Find under **Simulink → Logic and Bit Operations**
- Set: Operator = `>`, Constant = `7.5`
- This outputs 1 if PWM > 7.5 (i.e., PWM is HIGH), 0 otherwise

Chain: `PWM_S2_in` → `Compare to Constant` → `NOT` → `Integrator R port`

When S2 PWM = 15 V (HIGH/ON): Compare gives 1 → NOT gives 0 → Integrator runs normally  
When S2 PWM = 0 V (LOW/OFF): Compare gives 0 → NOT gives 1 → Integrator RESETS ✅

---

### Step H — Add Output Scaling and Buffer (AMP2)

The paper uses AMP2 to buffer the integrator output. We simply apply the net gain.

The integrator output is already V_clamp = G × I_d = 0.02 × I_d.

Let us verify: The chain so far gives:
- Derivative: dI_d/dt
- × M = 7.66e-9: V_coil = M × dI_d/dt
- × 1/(R_i × C_i): before integrator
- ∫ dt: integrator
- Result: M/(R_i×C_i) × I_d = 7.66e-9 / 3.828e-7 × I_d = 0.02 × I_d ✅

No additional gain needed. Connect the Integrator output to **Vclamp_out**.

---

### Step I — Alternative: Simplified Direct Gain Model

> 📌 If the derivative-integrator chain causes simulation instability (which can happen with the Derivative block and switching waveforms), use this simpler alternative:

**Delete** all blocks inside the subsystem.

**Add only:**
1. **Id_in** (input port)
2. **Gain block** — value: `0.02` (= 20 mV/A sensor gain)
3. **Vclamp_out** (output port)

Connect: `Id_in → Gain → Vclamp_out`

This directly gives V_clamp = 0.02 × I_d.

> ⚠️ **Label this in your report:** "Simplified behavioral model of Rogowski coil + integrator: V_clamp = G × I_d where G = 20 mV/A (from paper Table II). The derivative-integration chain is mathematically equivalent but consolidated into a single gain for simulation stability."

---

## 5. Connect the Subsystem to the Main Circuit

**Step 1**
Return to the main canvas (click back arrow ◀).

**Step 2**
The Rogowski_Integrator block should now show:
- 2 input ports (Id_in, PWM_S2_in)
- 1 output port (Vclamp_out)

**Step 3**
Connect:
- `Current Measurement (m) output` → `Rogowski_Integrator: Id_in`

**Step 4**
Connect:
- `PWM_Generator: Out1 (S2 signal)` → `Rogowski_Integrator: PWM_S2_in`

**Step 5**
The `Vclamp_out` will be connected to the Adaptive Threshold block (Chapter 08) and the Comparator (Chapter 09). Leave it unconnected for now — add a temporary Scope:

**Step 6**
Add a Scope block. Connect `Vclamp_out` to it.

Label this scope: `Vclamp_Scope`.

---

## 6. Run and Verify

**Step 1**
Run setup_parameters.m in MATLAB (if not already done).

**Step 2**
Press **Ctrl + D** to update the model.

**Step 3**
If no errors, press **Ctrl + T** to run.

**Step 4**
Open the Vclamp_Scope. You should see:

```
V_clamp waveform:
        ______        ______
       /      \      /      \
______/        \____/        \______

When S2 ON: V_clamp rises with I_d (ramp up due to inductor)
When S2 OFF: V_clamp resets to ~0 (integrator reset)
```

**Numerical check:**
- Peak I_d ≈ 15–20 A (for our RL load at 5 kHz)
- Expected V_clamp peak = 20 mV/A × 15 A = 0.30 V

If V_clamp looks reasonable: **Current sensing working!** ✅

**Step 5**
During SC fault (at t=1ms):
- I_d shoots to 50–80 A (depending on when fault occurs)
- V_clamp = 0.02 × 70 A = 1.40 V (much larger spike)

This large spike is what the comparator will detect. ✅

---

## 7. Common Errors

### Problem: V_clamp shows wild oscillations or extreme values
**Cause:** Derivative block amplifying noise from switching transitions.  
**Fix:** Use the simplified direct gain model (Section 4, Step I above).

### Problem: Integrator output drifts upward over time
**Cause:** Reset signal is not working.  
**Fix:** Check the Compare to Constant and NOT block connections to the integrator R port.

### Problem: V_clamp is always 0
**Cause:** Id_in port is not connected, or Gain value is wrong.  
**Fix:** Check connections from Current Measurement to Rogowski_Integrator.

### Problem: "Derivative of discontinuous signal" warning
**Cause:** The switching creates discontinuities that the Derivative block cannot handle cleanly.  
**Fix:** Use the simplified gain model instead. This is the recommended approach.

---

## Current Sensing Checklist

- [ ] Rogowski_Integrator subsystem created
- [ ] Id_in and PWM_S2_in input ports added
- [ ] Vclamp_out output port added
- [ ] (Either) Full derivative-integrator chain built with correct gains
- [ ] (Or) Simplified direct gain model (Gain = 0.02) used and labeled in report
- [ ] Integrator reset during S2 OFF state (if using full model)
- [ ] Subsystem connected to Current Measurement output in main canvas
- [ ] Vclamp_Scope added temporarily to verify output
- [ ] Simulation runs, V_clamp shows proportional voltage to I_d
- [ ] V_clamp shows spike during SC fault at t=1ms
- [ ] Numerical check: V_clamp ≈ 20 mV/A × I_d

**→ When ALL boxes are checked, proceed to 07_Rogowski_Coil.md**
