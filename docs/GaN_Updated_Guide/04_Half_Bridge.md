# 04 — Half-Bridge Power Circuit

**⏱️ Time Budget: 3 hours**  
**Goal: A working half-bridge with S1 (upper) and S2 (lower) HEMTs, DC source, and RL load, simulating and showing current waveform.**

---

## 1. Theory — What Is a Half-Bridge? (For CS Students)

### The Analogy
Think of two light switches on a staircase. Switch A at the bottom, Switch B at the top. They are connected so that toggling either switch changes the light state. A half-bridge works similarly — two HEMTs alternate ON and OFF to deliver power.

### The Electrical Reality
A **half-bridge** is two HEMTs (S1 and S2) connected in series between the positive DC rail (+Vdc) and the negative DC rail (ground).

```
+450V ──┬── S1 (upper HEMT) ──┬── OUTPUT NODE (midpoint)
        │                        │
        │   S2 (lower HEMT)  ──┘
        │                        
GND  ───┴───────────────────────── GND
```

- When **S1 is ON and S2 is OFF**: Current flows from +450V through S1 to the load
- When **S1 is OFF and S2 is ON**: Current flows from the load through S2 to ground
- They must NEVER both be ON at the same time — that is a **short circuit**

### Why Does Our Project Use a Half-Bridge?
The paper (Fig. 8 and Fig. 10) uses a half-bridge inverter as the test platform. S2 is the "Device Under Test" (DUT) — the HEMT we are protecting. The SC faults are created by forcing S1 and S2 ON simultaneously.

### The Load
Between the midpoint and the DC source (via a return path), there is a **series RL load**:
- **L = 7 mH** (inductor — resists sudden current changes — from the inverter test in the paper Fig. 10)
- **R = 1 Ω** (resistor — represents losses)

For the PSPICE simulation in the paper (Table III), L = 600 μH. We will use **L = 600 μH** for our main SC test simulation.

---

## 2. What Is a HEMT? (For CS Students)

A **HEMT** is a voltage-controlled switch:
- It has three terminals: **Gate (G)**, **Drain (D)**, **Source (S)**
- When voltage at Gate is HIGH (> threshold, typically 10–20 V): Switch is **ON** (current flows from Drain to Source)
- When Gate voltage is LOW (0 V or negative): Switch is **OFF**

Think of it like a transistor where the Gate is the enable pin, Drain is input, Source is output.

**GaN HEMT** specifically uses Silicon Carbide material, which allows:
- Higher voltage (650 V vs 600 V for regular silicon)
- Faster switching (nanoseconds vs microseconds)
- Higher temperature operation

In Simulink, we use the **HEMT block** from Simscape Electrical which models this behavior mathematically.

---

## 3. Blocks You Will Add in This Chapter

| Block Name | Library Path | Purpose |
|------------|-------------|---------|
| HEMT | Simscape → Electrical → Specialized Power Systems → Power Electronics | S1 and S2 switches |
| DC Voltage Source | Simscape → Electrical → Specialized Power Systems → Electrical Sources | V_dc = 450 V |
| Series RLC Branch | Simscape → Electrical → Specialized Power Systems → Elements | Load (R + L) |
| Current Measurement | Simscape → Electrical → Specialized Power Systems → Measurements | Measure I_d of S2 |
| Voltage Measurement | Simscape → Electrical → Specialized Power Systems → Measurements | Measure V_gs |
| Ground | Simscape → Electrical → Specialized Power Systems → Elements | Circuit ground |
| Scope | Simulink → Sinks | View waveforms |
| powergui | Simscape → Electrical → Specialized Power Systems | Required engine |

---

## 4. Step-by-Step: Build the Half-Bridge

### PREPARATION — Open Your Model

**Step 1**
Open MATLAB. Wait for it to load.

**Step 2**
In the Command Window, type:
```matlab
open_system('Adaptive_Current_Protection')
```
Press Enter. Your Simulink model opens.

**Step 3**
Make sure the powergui block is on the canvas (from previous chapter). If not, add it now (see Chapter 03, Section 13).

**Step 4**
Press **Ctrl + Shift + H** to fit the entire canvas in view.

**Step 5**
Open the Library Browser: Press **Ctrl + Shift + L**.

---

### STEP A — Add the DC Voltage Source

**What it is:** A battery. Provides constant 450 V between its + and − terminals.  
**Why we need it:** It is the power supply for the half-bridge (V_dc = 450 V from the paper).

**Step 1**
In the Library Browser search box, type:
```
DC Voltage Source
```

**Step 2**
Look for **"DC Voltage Source"** under the path:
**Simscape → Electrical → Specialized Power Systems → Electrical Sources**

**Step 3**
Drag it to the LEFT side of the canvas. Place it roughly in the center-left area.

**Step 4**
It appears as a circle with + on top and − on bottom, with two terminals sticking out.

**Step 5**
Double-click the DC Voltage Source block.

A parameters dialog opens.

**Step 6**
Change the following:
- **Amplitude (V):** Type `450`

**What this means:** This source will provide 450 Volts DC. That is the V_dc value from the paper (Table III).

**Step 7**
Click **OK**.

**Step 8**
The block now shows "450" or "Vdc" on it. That is correct.

---

### STEP B — Add the Upper HEMT (S1)

**What it is:** The upper switch in the half-bridge.  
**Why we need it:** S1 carries current to the load during the positive half-cycle. In SC faults, turning S1 ON while S2 is also ON creates the fault.

**Step 1**
In the Library Browser search box, type:
```
HEMT
```

**Step 2**
Look for **"HEMT"** under the path:
**Simscape → Electrical → Specialized Power Systems → Power Electronics**

**Step 3**
Drag it to the canvas. Place it **ABOVE CENTER** — this will be S1.

**Step 4**
Double-click the HEMT block.

**Step 5**
Parameters dialog opens. Set:

| Parameter | Value | Why |
|-----------|-------|-----|
| FET resistance Ron (Ohms) | `0.080` | 80 mΩ — approximate on-resistance for GaN HEMT at rated current. Paper uses GS66508B (80 mΩ typ). |
| Snubber resistance Rs (Ohms) | `1e5` | 100 kΩ — snubber prevents simulation artifacts. Set very high so it doesn't affect the circuit. |
| Snubber capacitance Cs (F) | `inf` | Infinity = no snubber capacitor. Effectively disables the capacitive snubber. |

> ⚠️ **What is a Snubber?** A snubber is a small RC circuit placed across the HEMT to absorb voltage spikes. In simulation, we don't need it, so we set Rs very high (acts like open circuit) and Cs=inf (acts like open circuit in DC). This is standard practice for Simulink HEMT models.

**Step 6**
Click **OK**.

**Step 7**
The HEMT block has these ports:
- **D (Drain):** Top terminal — connects to +Vdc rail
- **S (Source):** Bottom terminal — connects to midpoint (output node)
- **g (gate):** Left small terminal — receives PWM signal

**Step 8**
**Right-click** the HEMT block.

Go to **Format → Flip Block**.

This flips it so the Drain faces UP and Source faces DOWN (standard orientation for upper HEMT).

**Step 9**
Label it: **Double-click on the text "HEMT"** below the block.

Change it to `S1`. Press Enter.

---

### STEP C — Add the Lower HEMT (S2 — The DUT)

**What it is:** The lower switch. This is the **Device Under Test (DUT)** — the HEMT being protected.  
**Why we need it:** S2 is where the SC current flows through. Our protection circuit monitors S2's current.

**Step 1**
In the Library Browser, search for `HEMT` again.

**Step 2**
Drag another HEMT block below S1.

**Step 3**
Double-click it. Set the **same parameters** as S1:
- Ron = `0.080`
- Rs = `1e5`
- Cs = `inf`

Click **OK**.

**Step 4**
This time, do NOT flip it. S2's Drain faces UP (connects to midpoint) and Source faces DOWN (connects to ground).

**Step 5**
Label it `S2`.

---

### STEP D — Add the Series RLC Load Branch

**What it is:** The load — an inductor (L) and resistor (R) in series.  
**Why we need it:** The inductor stores energy and keeps current continuous. The resistor represents winding resistance. Values from paper Table III for PSPICE simulation: L = 600 μH, R = 1 Ω. We use these.

**Step 1**
In Library Browser, search:
```
Series RLC Branch
```

**Step 2**
Find **"Series RLC Branch"** under:
**Simscape → Electrical → Specialized Power Systems → Elements**

**Step 3**
Drag it to the canvas, placing it to the **RIGHT** of the midpoint between S1 and S2.

**Step 4**
Double-click it.

**Step 5**
Parameters:

| Parameter | Value | Why |
|-----------|-------|-----|
| Branch type | `RL` | We want Resistance + Inductance only (no capacitor) |
| Resistance R (Ohms) | `1` | 1 Ω from paper (Table III appendix, inverter test) |
| Inductance L (H) | `600e-6` | 600 × 10⁻⁶ H = 600 μH from paper Table III |
| Capacitance C (F) | (grayed out) | Not applicable since branch type is RL |

**Step 6**
Click **OK**.

**Step 7**
Rotate the block so current flows from left (midpoint) to right (back to DC source):
Right-click → **Format → Rotate Block** (press until horizontal, left-to-right orientation).

---

### STEP E — Add a Current Measurement Block

**What it is:** A meter that measures current flowing through a wire.  
**Why we need it:** We need to measure I_d (the drain current of S2) to feed into our Rogowski coil simulation. This block gives us a Simulink signal (a number) representing the current.

**Step 1**
In Library Browser, search:
```
Current Measurement
```

**Step 2**
Find it under:
**Simscape → Electrical → Specialized Power Systems → Measurements**

**Step 3**
Drag it and place it in **series** with S2 — between the Source of S2 and the ground.

(In series means: the current must flow THROUGH this block to continue its path.)

**Step 4**
Double-click it. No parameters to change. Click **OK**.

**Step 5**
This block has:
- **+ terminal:** Current enters here (from S2 Source)
- **− terminal:** Current exits here (to Ground)
- **m output port (right side):** A Simulink signal (regular thin wire) giving the current value in Amperes

---

### STEP F — Add Ground

**What it is:** The electrical reference point (0 V).  
**Why we need it:** Every electrical circuit needs a ground. All voltages are measured relative to ground.

**Step 1**
In Library Browser, search:
```
Ground
```

**Step 2**
Find **"Ground"** under:
**Simscape → Electrical → Specialized Power Systems → Elements**

**Step 3**
Drag it below the Current Measurement block.

**Step 4**
No parameters needed.

---

### STEP G — Add Voltage Measurement (for V_gs monitoring)

**What it is:** Measures voltage across two points.  
**Why we need it:** We want to observe V_gs (the gate control signal applied to S2) on our scope.

**Step 1**
Search Library Browser for:
```
Voltage Measurement
```

**Step 2**
Find it under:
**Simscape → Electrical → Specialized Power Systems → Measurements**

**Step 3**
Drag one to your canvas. Place it across the Gate-Source terminals of S2 (we will connect this during wiring).

**Step 4**
This block has:
- **+ terminal:** Connects to Gate of S2
- **− terminal:** Connects to Source of S2
- **m output port:** Simulink signal = V_gs voltage in Volts

---

### STEP H — Add a Scope

**What it is:** An oscilloscope. Shows you graphs of signals over time.

**Step 1**
Search for `Scope` in Library Browser.

**Step 2**
Find **"Scope"** under **Simulink → Sinks**.

**Step 3**
Drag it to the far RIGHT of your canvas.

**Step 4**
Double-click the Scope.

**Step 5**
Click the **gear icon** (settings) inside the scope window.

**Step 6**
Change **"Number of input ports"** to `3`.

This gives us 3 rows to display:
- Row 1: I_d (drain current)
- Row 2: V_gs (gate signal)
- Row 3: (reserved for threshold voltage later)

**Step 7**
Click **OK**. Close the scope window.

---

## 5. Wiring the Half-Bridge — Every Connection

Now we connect everything. Follow this exactly.

> 📌 **Convention:** In Simscape Electrical, the thick lines are **electrical connections** (power). The thin lines are **Simulink signal wires** (data).

### Wire 1 — DC Source (+) to S1 Drain

**Step 1**
Hover over the **+ terminal** of the DC Voltage Source (top terminal).

**Step 2**
When cursor becomes a crosshair (+), click and hold.

**Step 3**
Drag to the **D (Drain)** terminal of S1 (top of S1).

**Step 4**
Release. A thick line appears. ✅

If nothing happens or it's thin: You are connecting the wrong terminals. The Simscape electrical terminals are the square/round connectors, not the triangular arrow ports.

### Wire 2 — S1 Source to S2 Drain (The Midpoint Node)

**Step 1**
Hover over the **S (Source)** terminal at the bottom of S1.

**Step 2**
Click and drag to the **D (Drain)** terminal at the top of S2.

**Step 3**
Release. You now have the midpoint node where S1's source meets S2's drain.

### Wire 3 — Midpoint to Series RLC Load (Left terminal)

**Step 1**
Click on the midpoint wire (the line between S1 Source and S2 Drain). A dot appears where you click — this is a **junction/branch point**.

**Step 2**
Drag from this junction to the **left terminal** of the Series RLC Branch.

### Wire 4 — Series RLC Load Right terminal to DC Source (+) — Return Path

The load current needs a return path. In a real half-bridge, this goes through a DC link capacitor. For simplicity in our simulation, we connect the right terminal of the RLC back to the DC source + terminal.

**Step 1**
Click on the right terminal of the Series RLC Branch.

**Step 2**
Drag up and to the left, connecting back to the top DC rail (the line between DC Source + and S1 Drain).

> ⚠️ **Note:** In a real half-bridge, DC capacitors (C_dc) are placed here. The paper shows two C_dc capacitors (Fig. 10). For our initial simulation, we simplify by connecting the return path directly. We will note this as a simplification in the final report.

### Wire 5 — S2 Source to Current Measurement (+)

**Step 1**
Hover over the **S (Source)** terminal at the bottom of S2.

**Step 2**
Drag to the **+** terminal of the Current Measurement block.

### Wire 6 — Current Measurement (−) to Ground

**Step 1**
Hover over the **−** terminal of the Current Measurement block.

**Step 2**
Drag to the single terminal of the Ground block.

### Wire 7 — DC Source (−) to Ground

**Step 1**
Click on the **−** terminal (bottom) of the DC Voltage Source.

**Step 2**
Drag to connect to the same ground wire or ground block.

(You may need to branch from the existing Ground by clicking on the ground wire and dragging a new branch.)

### Wire 8 — Current Measurement (m) to Scope

**Step 1**
This is a **Simulink signal wire** (thin, not thick).

Hover over the **m** port (right side of Current Measurement block). It is a small triangle, not a square terminal.

**Step 2**
Drag to the **first input** of the Scope block (top input port).

**Step 3**
This wire should be THIN (black). ✅

If it is thick: You accidentally connected to a Simscape terminal. Undo (Ctrl+Z) and try again.

### Wire 9 — V_gs Measurement (m) to Scope (second input)

**Step 1**
Connect the **+** terminal of the Voltage Measurement block to the Gate (g) terminal of S2.

**Step 2**
Connect the **−** terminal of the Voltage Measurement block to the Source (S) terminal of S2.

**Step 3**
Connect the **m** output of the Voltage Measurement block to the **second input** of the Scope.

---

## 6. Add Temporary Gate Signals (Placeholder PWM)

We have not built the PWM generator yet (that is Chapter 05). But we need SOMETHING connected to the gate terminals so the simulation can run.

We will use **Pulse Generator** blocks as temporary placeholders.

### For S1 Gate:

**Step 1**
Search Library Browser: `Pulse Generator`

**Step 2**
Find **"Pulse Generator"** under **Simulink → Sources**.

**Step 3**
Drag it to the left of S1.

**Step 4**
Double-click it. Set:
| Parameter | Value | Why |
|-----------|-------|-----|
| Amplitude | `1` | Gate signal magnitude (will be scaled by Controlled Voltage Source later) |
| Period (secs) | `0.0002` | 1/5000 Hz = 200 μs period |
| Pulse Width (% of period) | `62.5` | T_ON/T_period × 100 = 125μs/200μs × 100 = 62.5% |
| Phase delay (secs) | `0.000125` | Half period delay — S1 and S2 are complementary |

Click **OK**.

### Convert to Voltage Source for Gate:

The HEMT gate needs an electrical voltage signal, but Pulse Generator produces a Simulink signal. We need a **Controlled Voltage Source** to convert.

**Step 1**
Search Library Browser: `Controlled Voltage Source`

Find it under **Simscape → Electrical → Specialized Power Systems → Electrical Sources**.

**Step 2**
Drag one near S1's gate area.

**Step 3**
Connect the **input** (Simulink signal port, the "v+" label side) from the Pulse Generator output.

**Step 4**
Scale the voltage: Between the Pulse Generator and Controlled Voltage Source, add a **Gain block**:
- Search Library Browser: `Gain`
- Find under **Simulink → Math Operations**
- Set Gain value to `15` (15 V gate drive — above HEMT threshold voltage)

**Step 5**
Connect Pulse Generator → Gain → Controlled Voltage Source input.

**Step 6**
Connect the **+ terminal** of the Controlled Voltage Source to the **g (gate)** of S1.

**Step 7**
Connect the **− terminal** of the Controlled Voltage Source to the **S (source)** of S1. (Gate drive voltage is measured gate-to-source.)

### For S2 Gate (Similar process):

**Step 1**
Add another Pulse Generator. Set:
| Parameter | Value |
|-----------|-------|
| Amplitude | `1` |
| Period | `0.0002` |
| Pulse Width | `37.5` | (complementary — ON when S1 is OFF, approximately) |
| Phase delay | `0` |

> ⚠️ **Dead Time Note:** In real half-bridges, S1 and S2 are never ON at the same time — there is a "dead time" between them. For this placeholder, we are simplifying. The proper PWM with dead time comes in Chapter 05.

**Step 2**
Add Gain block (value = `15`) and Controlled Voltage Source, same as S1.

**Step 3**
Connect: Pulse Generator → Gain → Controlled Voltage Source → S2 gate.

**Step 4**
Connect Controlled Voltage Source − terminal to Source of S2.

---

## 7. Configure the Solver for Power Electronics

This is critical. Power electronics simulations require specific solver settings.

### Step 1
In Simulink, click the **Modeling** tab.

### Step 2
Click **Model Settings** (gear icon).

### Step 3
Click **Solver** on the left side.

### Step 4
Set:
| Setting | Value | Why |
|---------|-------|-----|
| Start time | `0` | Start at time zero |
| Stop time | `0.002` | 2 ms = 10 switching cycles at 5 kHz |
| Type | `Fixed-step` | Required for real-time-compatible simulation |
| Solver | `ode3` | Bogacki-Shampine — suitable for stiff electrical circuits |
| Fixed-step size (H) | `1e-7` | 100 nanoseconds — fine enough to capture 103 ns SC detection |

### Step 5
Click **OK**.

### Step 6
Press **Ctrl + S** to save.

---

## 8. Run the First Test Simulation

### Step 1
Press **Ctrl + D** to update the model diagram (checks for errors without running).

### Step 2
Look at the bottom of the Simulink window. If you see error messages in red, read them carefully. The most common errors at this stage:

**Error: "Block requires a Ground block"**
→ You are missing the Ground block. Add it.

**Error: "Algebraic loop detected"**
→ This is a math problem in the circuit equations. Add a tiny resistance (1e-6 Ω) in series somewhere in the loop.

**Error: "powergui not found"**
→ You deleted or forgot the powergui block. Add it back.

### Step 3
If no errors after Ctrl+D:

Press **Ctrl + T** to Run the simulation.

### Step 4
Watch the status bar at the bottom. The simulation time counter increases from 0 to 0.002.

### Step 5
When simulation finishes, double-click the Scope block.

### Step 6
Expected waveforms:
- **Row 1 (I_d):** You should see a switching current waveform — rising when S2 is ON, falling when S2 is OFF. The current should reach approximately 5–20 A (depending on load).
- **Row 2 (V_gs):** A pulse wave switching between 0 V and 15 V, with frequency 5 kHz.

---

## 9. Common Errors and Fixes

### Problem: Simulation runs but current stays at 0
**Possible Reasons:**
1. DC Source is not connected correctly
2. Ground is missing or disconnected
3. Both HEMTs are OFF (gate signals not connected)

**Fix:**
- Press Ctrl+D to check connections
- Verify every terminal of every block is connected
- Click on a block and check its port connections in the block's highlight

### Problem: Current goes to thousands of Amperes (simulation blows up)
**Possible Reasons:**
1. Both S1 and S2 are ON simultaneously (short circuit condition — we haven't protected against this yet)
2. Solver step size is too large

**Fix:**
- Check that S1 and S2 pulse generators have complementary timing (when one is 1, other is 0)
- Reduce solver step size to 1e-8

### Problem: "Unable to find library block"
**Possible Reasons:**
Simscape Electrical is not installed.

**Fix:**
- Go back to Chapter 02 and install Simscape Electrical
- Or use the alternative behavioral model described in Chapter 02, Section 10

### Problem: Scope shows flat line
**Possible Reasons:**
The m output of Current Measurement is not connected to scope.

**Fix:**
Right-click the Scope → disconnect, reconnect to the m port.

### Problem: Wire appears but is dashed (not solid)
**Possible Reasons:**
The signal has not been updated. Press Ctrl+D to refresh.

---

## 10. Expected Output at This Stage

After a successful run, your Scope should show:

```
Row 1 — I_d (Drain Current of S2):
  ___         ___         ___
 |   |       |   |       |   |
_|   |_______|   |_______|   |___

Ramp up when S2 ON → plateau → fall when S2 OFF

Row 2 — V_gs (Gate Signal to S2):
  _____         _____         ___
 |     |       |     |       |
_|     |_______|     |_______|

Square wave, 0 to 15 V, 5 kHz
```

If your scope looks like this: **Half-Bridge is working!** ✅

---

## 11. Save Your Work

**Step 1**
Press **Ctrl + S**.

**Step 2**
In MATLAB Command Window, type:
```matlab
% Save key workspace variables
Vdc = 450;
fsw = 5e3;
Ton = 125e-6;
Tperiod = 1/fsw;
L_load = 600e-6;
R_load = 1;
L_stray = 30e-9;
Ron_mosfet = 0.080;
save('project_params.mat');
```

This saves all your parameters to a file. If MATLAB crashes, you can reload with `load('project_params.mat')`.

---

## Half-Bridge Checklist

- [ ] DC Voltage Source added and set to 450 V
- [ ] S1 HEMT added (upper) with Ron = 0.080 Ω
- [ ] S2 HEMT added (lower/DUT) with Ron = 0.080 Ω
- [ ] Series RLC branch added (R=1 Ω, L=600 μH)
- [ ] Current Measurement block in series with S2
- [ ] Ground block connected
- [ ] Voltage Measurement across S2 gate-source
- [ ] Temporary PWM signals on both gates (Pulse Generators + Gain + Controlled Voltage Source)
- [ ] Solver set to Fixed-step, ode3, step size 1e-7
- [ ] Simulation runs without errors
- [ ] Scope shows switching current and gate voltage waveforms
- [ ] Model saved as Adaptive_Current_Protection.slx

**→ When ALL boxes are checked, proceed to 05_PWM.md**
