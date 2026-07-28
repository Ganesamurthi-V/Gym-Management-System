# 05 — PWM Generator with Dead Time

**⏱️ Time Budget: 2 hours**  
**Goal: Replace the placeholder pulse generators with a proper PWM subsystem that generates complementary gate signals with dead time for S1 and S2.**

---

## 1. Theory — What Is PWM? (For CS Students)

### The Concept
**PWM = Pulse Width Modulation**

Imagine you want to control the brightness of an LED, but your switch can only be fully ON or fully OFF — there is no dimmer. 

You could blink it very fast: ON for 80% of each blink cycle → appears 80% bright. ON for 20% of each blink cycle → appears 20% bright.

That percentage is the **Duty Cycle**.

PWM does exactly this with power electronics — instead of a continuously variable voltage, we switch ON and OFF very rapidly (at 5 kHz = 5000 times per second). The ratio of ON time to total cycle time determines how much average power is delivered.

### For Our Half-Bridge
- **Switching frequency:** f_sw = 5 kHz → Period T = 1/5000 = 200 μs
- **S2 (DUT) Duty Cycle:** Varies. For our SC test, we use a moderate duty cycle (~62.5% → T_ON = 125 μs, T_OFF = 75 μs)
- **S1:** Complementary to S2 (ON when S2 is OFF, with a dead time gap)
- **Dead time:** A gap where BOTH HEMTs are OFF briefly, to prevent both being ON simultaneously (which would cause a short circuit)

### From the Paper
The paper (Table III) states:
- T_ON = 5 μs, T_OFF = 3 μs for the PSPICE simulation  
- Total period = 8 μs → f_sw = 125 kHz

> ⚠️ **Important discrepancy note:** The PSPICE simulation uses 125 kHz (Table III: T_ON=5 μs, T_OFF=3 μs), while the inverter experiment (Fig. 10) uses 5 kHz. We will build our Simulink model with **5 kHz** for stability and to match the inverter experiment. We note this as a deviation in the final report. If your computer is fast enough, you can switch to 125 kHz by adjusting timing parameters.

---

## 2. What Is Dead Time?

**Dead time** is a mandatory gap inserted between turning OFF one HEMT and turning ON the other.

Why? Because real HEMTs take a few nanoseconds to turn OFF completely. If you try to turn the other one ON before this, both are momentarily ON → instant short circuit.

For our simulation:
- Dead time = 100 ns (we choose this as a reasonable value — the paper does not specify the exact dead time used in simulation)

Timeline for one cycle (5 kHz, 200 μs period):
```
S2: |← 125 μs ON →|← dead 0.1μs →|← 74.9 μs OFF →|
S1: |← 75 μs OFF →|← dead 0.1μs →|← 124.9 μs ON  →|
```

---

## 3. Create the PWM Subsystem

We will build the PWM generator as a **subsystem** to keep the main canvas clean.

### Step 1 — Create the Subsystem Container

**Step 1**
Your Simulink model is open. 

Find an empty area on the canvas (away from the half-bridge blocks).

**Step 2**
Double-click on the empty canvas.

A small text cursor appears. Type:
```
PWM_Generator
```
Press Escape.

Wait — that creates a text label, not a subsystem. Let's do it the proper way:

**Step 3** 
From the Library Browser, search:
```
Subsystem
```

Find **"Subsystem"** under **Simulink → Ports & Subsystems**.

**Step 4**
Drag it to the canvas. Place it to the LEFT of your half-bridge circuit.

**Step 5**
A block called "Subsystem" appears with one input (In1) and one output (Out1) by default.

**Step 6**
Double-click the text "Subsystem" below the block.

Type: `PWM_Generator`

Press Enter.

**Step 7**
Double-click the **PWM_Generator block** (on the block area, not the label) to open it.

A new canvas opens — this is the INSIDE of the subsystem.

You see:
- An **"In1"** block on the left (the input port)
- An **"Out1"** block on the right (the output port)

**Step 8**
Delete the wire between In1 and Out1 (click the wire, press Delete).

**Step 9**
We need to add 2 outputs (PWM for S1 and PWM for S2). Right now there is only Out1.

To add Out2:
- From Library Browser (while inside the subsystem), search for `Out1`
- Find **"Out1"** under **Simulink → Ports & Subsystems**  
- Drag it below the existing Out1
- Double-click the text "Out1" on this new block, rename it `Out2`
- Also rename the original Out1 to `Out1`

**Step 10**
Also delete the "In1" block — our PWM generator does not need an external input (it generates its own timing from internal blocks). 

Click In1, press Delete.

---

### Step B — Add Blocks Inside PWM_Generator Subsystem

Make sure you are INSIDE the PWM_Generator subsystem (the title bar should show: `Adaptive_Current_Protection/PWM_Generator`).

#### Add a Pulse Generator for Base PWM

**Step 1**
In Library Browser, search: `Pulse Generator`

**Step 2**
Drag a **Pulse Generator** to the inside of the subsystem canvas.

**Step 3**
Double-click it. Set:

| Parameter | Value | Why |
|-----------|-------|-----|
| Pulse type | `Time based` | Uses simulation time |
| Amplitude | `1` | Binary signal: 0 or 1 |
| Period (secs) | `0.0002` | 1/5000 = 200 μs period |
| Pulse Width (% of period) | `62.5` | ON time = 62.5% × 200 μs = 125 μs |
| Phase delay (secs) | `0` | No delay |

Click **OK**.

This generates the base PWM signal for S2.

---

#### Add NOT Gate (for S1 — Complement of S2)

S1 must be ON when S2 is OFF. In logic terms, S1 = NOT(S2) [ignoring dead time for now].

**Step 1**
In Library Browser, search:
```
Logical Operator
```

Find **"Logical Operator"** under **Simulink → Logic and Bit Operations**.

**Step 2**
Drag it to the canvas.

**Step 3**
Double-click it. Set:
- **Operator:** `NOT`
- **Number of input ports:** `1`

Click **OK**.

---

#### Add Dead Time Using Transport Delay Blocks

We want both signals to be 0 during the dead time. We achieve this by:
1. Delaying the rising edge of each signal slightly
2. The overlap where both are 0 becomes the dead time

We will use a simpler approach with a **Pulse Width Limiter** logic:

**Approach:** Generate S2_PWM normally. Then:
- S2_gate = S2_PWM AND (NOT delayed_S2_PWM) complement
- Actually, the simplest Simulink approach is to use two Pulse Generators with a phase offset equal to dead time.

Let's use **two Pulse Generators** (simpler and more direct):

**Delete** the NOT block we just added (click, press Delete).

**Step 4** — Reconfigure for Two Pulse Generators:

The first Pulse Generator is for **S2** (already added above).

Add a **second Pulse Generator** for S1:

- In Library Browser, drag another Pulse Generator
- Double-click, set:

| Parameter | Value | Why |
|-----------|-------|-----|
| Amplitude | `1` | |
| Period | `0.0002` | Same 200 μs period |
| Pulse Width | `37.4` | S1 on-time ≈ 37.4% (slightly less than 100%-62.5%=37.5% to create dead time) |
| Phase delay | `0.0001251` | 125.1 μs offset — S1 turns ON just after S2 turns OFF |

> 📝 **Dead time created:** S2 turns OFF at 62.5% × 200μs = 125 μs. S1 turns ON at phase delay = 125.1 μs. Gap = 0.1 μs = 100 ns = dead time. ✅

---

#### Add Gain Blocks to Scale to 15V Gate Drive

The Pulse Generators output 0 or 1. We need 0 or 15 V for the gate.

**Step 1**
Search Library Browser: `Gain`

**Step 2**
Drag **two Gain blocks** to the canvas.

**Step 3**
Double-click each Gain block. Set value to `15`.

**Step 4**
Connect:
- Pulse Generator 1 (S2) → Gain1 → Out1
- Pulse Generator 2 (S1) → Gain2 → Out2

---

#### Connect to Subsystem Outputs

**Step 1**
The canvas should now show:
```
[Pulse Gen S2] → [Gain 15] → [Out1]
[Pulse Gen S1] → [Gain 15] → [Out2]
```

**Step 2**
Press **Ctrl + S** to save.

---

### Step C — Return to Main Canvas and Replace Old Pulse Generators

**Step 1**
Click the **back arrow** (◀) at the top-left of the inside-subsystem canvas, or press **Alt + Left Arrow**.

You return to the main canvas.

**Step 2**
Look at the PWM_Generator subsystem block. It now shows:
- 0 inputs (we deleted In1)
- 2 outputs (Out1 = S2 signal, Out2 = S1 signal)

**Step 3**
Now delete the old Pulse Generator blocks and their associated Gain + Controlled Voltage Source for S1 and S2 that you added in Chapter 04 as placeholders.

Click each old Pulse Generator block → Press Delete.

Also delete old Gain blocks (value 15) connected to them.

Keep the Controlled Voltage Sources (we will reconnect them).

**Step 4**
Reconnect:
- **Out1** of PWM_Generator → Controlled Voltage Source (S2 gate)
- **Out2** of PWM_Generator → Controlled Voltage Source (S1 gate)

(Connect using thin Simulink signal wires — Out1 is a signal port.)

---

## 4. Add a Fault Injection Block (For SC Testing)

The paper tests SC faults by forcing both S1 and S2 ON simultaneously. We need a way to force this condition at a specific time.

### How to Inject a Short-Circuit Fault

We will create a **fault injection block** that overrides S2's gate signal to stay HIGH even when the PWM says it should be LOW.

**Step 1**
Inside the PWM_Generator subsystem (or create a new subsystem called `Fault_Injection`):

**Step 2**
Add a **Step** block:
- Library: **Simulink → Sources → Step**
- Double-click, set:
  - Step time: `0.001` (1 ms — fault occurs at t = 1 ms)
  - Initial value: `0`
  - Final value: `1` (activates fault)

**Step 3**
Add a **Logical Operator (OR)**:
- Library: **Simulink → Logic and Bit Operations → Logical Operator**
- Set Operator: `OR`
- Inputs: 2

**Step 4**
Connect:
```
S2 PWM signal ──→ [OR] ──→ S2 gate output
Fault Step    ──→ [OR]
```

When the Step goes to 1 (at t=1ms), OR forces S2 HIGH regardless of PWM. Since S1 is also HIGH at some points, we get our short-circuit condition.

**Step 5**
For a cleaner fault: Connect the Fault Step to a separate **Gain block** (value=1) and then into the S1 gate path also. This forces both S1 and S2 ON simultaneously.

**Step 6**
Label this Step block clearly: `SC_Fault_Trigger`.

---

## 5. Verify PWM Operation

### Step 1
Press **Ctrl + D** to update the model.

### Step 2
If no errors, press **Ctrl + T** to run.

### Step 3
Open the Scope. You should see:

**Row 2 (V_gs of S2):** 
- Square wave 0 to 15 V
- Frequency: 5 kHz (period = 200 μs)
- Duty cycle ≈ 62.5%

**At t = 1 ms (when SC_Fault_Trigger activates):**
- V_gs stays HIGH (15 V) even during the OFF period
- Current (Row 1) shoots up dramatically — this is the SC fault ✅

---

## 6. Add a Multi-Channel Scope for Better Viewing

At this point, add a better scope to see all signals clearly.

**Step 1**
Add another Scope (from Simulink → Sinks).

**Step 2**
Double-click it. In settings, set **Number of input ports = 4**.

**Step 3**
Label the scope `Main_Scope`.

**Step 4**
Connect:
- Port 1: I_d (current measurement output)
- Port 2: V_gs of S2
- Port 3: V_gs of S1
- Port 4: SC_Fault_Trigger output

**Step 5**
Run simulation. You can now see all 4 signals simultaneously.

---

## 7. MATLAB Script to Automate Parameters

Create a MATLAB script to set all parameters. This is important — if you change a parameter, just change it in the script and run it instead of hunting through blocks.

### Step 1
In MATLAB, click **Home → New Script** (or press Ctrl+N).

### Step 2
Type exactly:
```matlab
%% Adaptive Current Threshold Project — Parameter Setup Script
% Run this script BEFORE starting the Simulink simulation
% Based on: Liu et al., IEEE Trans. Power Electron., Vol 41, No 4, Apr 2026

clear; clc;

%% ===== POWER CIRCUIT PARAMETERS (Table III of paper) =====
Vdc = 450;              % DC bus voltage (V)
L_stray = 30e-9;        % Power loop stray inductance (H) = 30 nH
Ton = 125e-6;           % S2 ON time (s) = 125 μs → 62.5% duty at 5 kHz
Toff = 75e-6;           % S2 OFF time (s) = 75 μs
L_load = 600e-6;        % Load inductance (H) = 600 μH
R_load = 1;             % Load resistance (Ω)
Ron_mosfet = 0.080;     % HEMT on-resistance (Ω) = 80 mΩ (GS66508B)
Rg = 10;                % Gate resistance (Ω)

%% ===== SWITCHING FREQUENCY =====
fsw = 5e3;              % Switching frequency (Hz) = 5 kHz
Tperiod = 1/fsw;        % Period (s) = 200 μs
DutyCycle_S2 = Ton/Tperiod * 100;  % = 62.5%

fprintf('Switching period: %.1f μs\n', Tperiod*1e6);
fprintf('S2 duty cycle: %.1f%%\n', DutyCycle_S2);

%% ===== DEAD TIME =====
t_dead = 100e-9;        % Dead time (s) = 100 ns

%% ===== ROGOWSKI COIL + INTEGRATOR PARAMETERS (Table II of paper) =====
M_coil = 7.66e-9;       % Mutual inductance (H) = 7.66 nH
Ri = 116;               % Integration resistance (Ω)
Ci = 3.3e-9;            % Integration capacitance (F) = 3.3 nF
Rf = 1e6;               % Feedback resistance (Ω) = 1 MΩ
Sensor_Gain = 0.02;     % Sensor gain G = 20 mV/A

%% ===== TIMING CIRCUIT PARAMETERS (Table IV of paper) =====
ta = 300e-9;            % Blanking time (s) = 300 ns (t_a in paper)
tb = 600e-9;            % Sampling end time (s) = 600 ns (t_b in paper)
% Sampling window = from ta to tb after S2 turn-ON

%% ===== ADAPTIVE THRESHOLD PARAMETERS =====
delta_I = 31;           % Fixed margin (A) = device rated current
Vbias = delta_I * Sensor_Gain;   % = 0.62 V
% Paper Table IV states Vbias = 0.35 V (for ΔI = 17.5 A in inverter test)
% We use 0.62 V for the PSPICE-equivalent simulation case

fprintf('ΔI margin: %d A\n', delta_I);
fprintf('V_bias: %.3f V\n', Vbias);

%% ===== SAMPLE AND HOLD PARAMETERS (Table IV of paper) =====
C_hold = 4.7e-12;       % Hold capacitor (F) = 4.7 pF
Rc = 20;                % AMP2 feedback resistor (Ω)

%% ===== FAULT INJECTION TIMING =====
t_fault = 0.001;        % SC fault injection time (s) = 1 ms

%% ===== SIMULATION PARAMETERS =====
t_sim = 0.002;          % Total simulation time (s) = 2 ms (10 cycles at 5 kHz)
t_step = 1e-7;          % Solver step size (s) = 100 ns
                        % Fine enough to capture 103 ns SC detection

%% ===== DISPLAY SUMMARY =====
fprintf('\n========= PROJECT PARAMETER SUMMARY =========\n');
fprintf('DC Bus Voltage:       %d V\n', Vdc);
fprintf('Switching Frequency:  %d Hz (%.1f kHz)\n', fsw, fsw/1000);
fprintf('Load: R=%dΩ, L=%dμH\n', R_load, L_load*1e6);
fprintf('HEMT Ron:           %d mΩ\n', Ron_mosfet*1000);
fprintf('Sensor Gain:          %d mV/A\n', Sensor_Gain*1000);
fprintf('Adaptive Margin ΔI:   %d A\n', delta_I);
fprintf('V_bias:               %.2f V\n', Vbias);
fprintf('Blanking time t_a:    %d ns\n', ta*1e9);
fprintf('Sampling time t_b:    %d ns\n', tb*1e9);
fprintf('Fault injected at:    %d ms\n', t_fault*1000);
fprintf('Simulation duration:  %d ms\n', t_sim*1000);
fprintf('==============================================\n');

%% Save to workspace so Simulink blocks can reference these variables
% In Simulink blocks, use variable names directly (e.g., type "Vdc" in the
% Amplitude field of the DC Voltage Source instead of 450)
save('project_params.mat');
disp('Parameters saved to project_params.mat');
disp('You can now reference variable names in Simulink block parameters.');
```

### Step 3
Press **Ctrl + S**. Save the file as:
```
setup_parameters.m
```
in your `AdaptiveThreshold` folder.

### Step 4
Press **F5** (or click the green Run button in MATLAB editor) to run the script.

### Step 5
You should see the parameter summary printed in the Command Window.

### Step 6
Now go back to your Simulink model. In any block's parameter dialog, instead of typing `450`, you can type `Vdc`. Instead of `600e-6`, type `L_load`. Simulink will look up the values from the MATLAB workspace.

**Example:** Double-click the DC Voltage Source. Change Amplitude from `450` to `Vdc`. Click OK. Now if you change Vdc in your script and re-run the script, the Simulink model uses the new value automatically.

---

## 8. Common PWM Problems and Fixes

### Problem: Both HEMTs ON at same time (without fault injection)
**Cause:** Dead time is zero or the phase delays are wrong.  
**Fix:** Check the Pulse Generator phase delay settings. Ensure S1's Phase delay puts it ON only after S2 is fully OFF.

### Problem: No current flows despite PWM signal
**Cause:** The Controlled Voltage Source gate drive voltage might not exceed the HEMT threshold.  
**Fix:** The HEMT block's default threshold voltage is 0 — any positive gate voltage turns it ON. Verify the Gain block is set to 15.

### Problem: PWM appears on scope but frequency looks wrong
**Cause:** The Period in Pulse Generator might be wrong.  
**Fix:** Set Period = `Tperiod` (or `0.0002` if not using variable names).

### Problem: Fault trigger activates but current does not spike
**Cause:** The OR gate in fault injection is not working correctly.  
**Fix:** Check that the OR block has exactly 2 inputs and the threshold of the Step block is correct (1 for ON).

---

## PWM Chapter Checklist

- [ ] PWM_Generator subsystem created
- [ ] Two Pulse Generators inside (S2 and S1 timing)
- [ ] Dead time of 100 ns created via phase offset
- [ ] Gain blocks set to 15 (V_gs amplitude)
- [ ] Old placeholder pulse generators removed from main canvas
- [ ] PWM_Generator outputs connected to HEMT gates via Controlled Voltage Sources
- [ ] SC_Fault_Trigger Step block added (fault at t=1ms)
- [ ] setup_parameters.m script created and runs without errors
- [ ] Simulink block parameters updated to use variable names (Vdc, L_load, etc.)
- [ ] Simulation runs and scope shows correct 5 kHz PWM
- [ ] At t=1ms, current spike is visible (SC fault injection works)

**→ When ALL boxes are checked, proceed to 06_Current_Sensing.md**
