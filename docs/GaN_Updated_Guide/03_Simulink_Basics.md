# 03 — Simulink Basics (Complete Beginner Guide)

**⏱️ Time Budget: 2 hours**  
**Goal: You can open Simulink, add blocks, connect them with wires, and run a simulation.**

---

## 1. What Is Simulink?

Think of Simulink as a **visual programming language** where instead of writing code, you drag boxes onto a canvas and connect them with wires.

Each box (called a **block**) does something:
- A "Sine Wave" block generates a sine wave signal
- A "Gain" block multiplies a signal by a number
- A "Scope" block shows you a graph of the signal

When you click "Run", Simulink sends signals through all the wires from left to right, calculates everything at tiny time steps, and shows you the results.

---

## 2. Open Simulink and Create Your Model File

### Step 1
MATLAB is open. The Command Window shows `>>`.

### Step 2
Look at the top ribbon. Find the **"Simulink"** button (it has a block-diagram icon).

Click **"Simulink"**.

### Step 3
The **Simulink Start Page** window opens. It is separate from the main MATLAB window.

You see:
- A search box at the top
- "New" section showing templates
- "Recent" section (empty for now)

### Step 4
Click **"Blank Model"**.

(It is usually the first option under "New". It shows a white empty canvas icon.)

### Step 5
A new window opens. This is your **Simulink model canvas**. It is completely empty — a white grid.

### Step 6
Press **Ctrl + S** on your keyboard (Save).

A dialog box appears asking for a filename.

### Step 7
In the filename box, type exactly:
```
Adaptive_Current_Protection
```

Make sure the folder shown in the dialog is your `AdaptiveThreshold` folder.

Click **Save**.

### Step 8
Look at the top of the Simulink window. The title bar now shows:
```
Adaptive_Current_Protection - Simulink
```

The file `Adaptive_Current_Protection.slx` has been created in your folder.

---

## 3. Understanding the Simulink Window

Look at your empty Simulink model window. Let's identify every part:

### The Canvas (Center Area)
- The large white/grey grid area
- This is where you place blocks
- You can scroll using the mouse wheel
- You can zoom in using **Ctrl + scroll wheel**
- You can zoom to fit using **Ctrl + Shift + H**

### The Ribbon (Top)
- Tabs: **Simulation**, **Debug**, **Modeling**, **Format**, **Apps**
- The **Simulation** tab has the most important buttons
- You will use the **Run** button (green triangle ▶) frequently

### The "Simulation" Tab Buttons
| Button | What It Does |
|--------|-------------|
| ▶ Run | Starts the simulation |
| ⏹ Stop | Stops the simulation |
| ⏸ Pause | Pauses the simulation |
| Step Forward | Runs one time step |
| Stop Time box | Sets when the simulation ends (e.g., "0.001") |

### The Library Browser
This is where all the blocks live. We need to open it.

---

## 4. Open the Library Browser

### Step 1
Look at the ribbon. Find the **"Library Browser"** button.

Alternatively, press **Ctrl + Shift + L** on your keyboard.

### Step 2
The **Library Browser** window opens.

You see a tree structure on the left:
- Simulink (basic blocks)
  - Commonly Used Blocks
  - Continuous
  - Discrete
  - Logic and Bit Operations
  - Math Operations
  - Signal Routing
  - Sinks (Scopes, outputs)
  - Sources (signal generators)
  - ...more
- Simscape
  - Electrical (if installed)
    - Specialized Power Systems
      - Power Electronics
      - ...

### Step 3
The search box is at the top of the Library Browser.

**This search box is your best friend.** Instead of navigating the tree, you can just type what you want.

---

## 5. Add Your First Block — A Sine Wave Source

Let's practice adding blocks. We will add a Sine Wave source and a Scope.

### Step 1
In the Library Browser search box, type:
```
Sine Wave
```

### Step 2
A list of results appears. Look for one named **"Sine Wave"** that says it is from **"Simulink / Sources"**.

**Do NOT** pick the one from Simscape — that is a different type.

### Step 3
Click and hold the left mouse button on the "Sine Wave" block in the search results.

### Step 4
While holding the mouse button, drag the block to the center of your canvas.

### Step 5
Release the mouse button.

A block appears on the canvas. It looks like a yellow-orange block with a sine wave drawn on it.

### Step 6
The block is selected (you see blue handles around it). Click somewhere else on the canvas to deselect it.

---

## 6. Add a Scope Block

### Step 1
In the Library Browser search box, clear the previous text and type:
```
Scope
```

### Step 2
Look for **"Scope"** from **"Simulink / Sinks"**.

### Step 3
Drag it to the canvas, placing it to the **RIGHT** of the Sine Wave block.

(Convention: signals flow left to right in Simulink)

---

## 7. Connect the Two Blocks With a Wire

This is how signals travel from one block to another.

### Step 1
Look at the Sine Wave block. On its right side, you see a small triangle-shaped point. This is the **output port**. Hover over it — your cursor changes to a crosshair (+).

### Step 2
Click and hold your left mouse button on this output port.

### Step 3
While holding, drag your mouse to the LEFT side of the Scope block.

### Step 4
The Scope block has a small ">" symbol on its left — the **input port**.

Drag until your cursor is over this ">" symbol.

### Step 5
Release the mouse button.

A **wire** (thin black line) now connects the Sine Wave output to the Scope input.

**If the wire is BLACK:** Connection is valid. ✅

**If the wire is RED:** Something is wrong. The ports are incompatible. Delete the wire (click on it and press Delete) and try again.

**If nothing happened:** You did not click on the port precisely. Try again — hover over the port until you see the crosshair, then click.

---

## 8. Configure the Sine Wave Block

Double-click the Sine Wave block.

A dialog box opens. You see parameters:

| Parameter | Default | What It Means |
|-----------|---------|---------------|
| Sine type | Time-based | Uses simulation time as the variable |
| Amplitude | 1 | Height of the wave (peak value) |
| Bias | 0 | Vertical offset |
| Frequency | 1 | Frequency in radians/second |
| Phase | 0 | Starting phase in radians |
| Sample time | 0 | 0 means continuous time |

**Change Frequency to:** `2*pi*50`

This means 50 Hz (cycles per second). The formula is: frequency in rad/s = 2π × frequency in Hz.

Click **OK**.

---

## 9. Set the Simulation Time

### Step 1
Look at the top ribbon, "Simulation" tab.

Find the box that shows a number — it is the **Stop Time** box. It probably shows `10` (meaning 10 seconds).

### Step 2
Click on the Stop Time box.

### Step 3
Delete the current value and type:
```
0.1
```

This means the simulation will run for 0.1 seconds (100 milliseconds). At 50 Hz, you will see 5 complete sine wave cycles.

Press **Enter**.

---

## 10. Run the Simulation

### Step 1
Press the green **▶ Run** button in the ribbon.

OR press **Ctrl + T** on your keyboard.

### Step 2
Watch the bottom of the Simulink window. You see a progress bar and the current simulation time increasing.

### Step 3
When the simulation finishes (progress bar reaches the end), it stops automatically.

### Step 4
**Double-click the Scope block** on the canvas.

A scope window opens showing a sine wave from 0 to 0.1 seconds.

You should see approximately 5 complete cycles of a sine wave.

**If you see this:** Your Simulink is working perfectly! ✅

---

## 11. Understanding the Solver

This is crucial for our power electronics simulation.

### What is a Solver?

When Simulink simulates, it breaks time into tiny steps. At each step, it solves the equations of all the blocks. The **solver** is the algorithm that does this.

For power electronics (circuits with fast switching), we need a specific solver.

### Step 1
In the Simulink window, click the **"Modeling"** tab in the ribbon.

### Step 2
Click **"Model Settings"** (gear icon).

A dialog called **"Configuration Parameters"** opens.

### Step 3
On the LEFT side, click **"Solver"**.

### Step 4
You see solver options:

**Simulation time:**
- Start time: `0`
- Stop time: `0.001` (we'll change this later)

**Solver selection:**
- Type: Change to **"Fixed-step"** (click the dropdown)
- Solver: Change to **"ode23tb"** or **"ode3"**

> ⚠️ **IMPORTANT for power electronics:** When we add the Simscape electrical circuit, we MUST use the correct solver. We will come back and set this properly in the Half-Bridge chapter. For now, leave the defaults.

### Step 5
Click **OK**.

---

## 12. Understanding Subsystems

A **subsystem** is a way to group multiple blocks into one box. Think of it like a function in programming — it hides the internal details and shows a clean interface.

In our project, we will create these subsystems:
- `Half_Bridge` — the power circuit
- `Rogowski_Integrator` — the current sensor
- `Adaptive_Threshold` — the sample-and-hold circuit
- `Fault_Detection` — the comparator and latch

### How to Create a Subsystem (Practice)

#### Step 1
Click on the Sine Wave block on your canvas to select it.

#### Step 2
Hold **Ctrl** and click the Scope block.

Now both blocks are selected (both have blue handles).

#### Step 3
Right-click on any selected block.

A context menu appears.

#### Step 4
Look for **"Create Subsystem from Selection"**.

Click it.

#### Step 5
Both blocks and the wire between them are now inside a new block labeled "Subsystem".

#### Step 6
To go INSIDE the subsystem and see the contents: **Double-click the Subsystem block**.

A new canvas opens showing the Sine Wave, Scope, and the ports.

#### Step 7
To go back to the main canvas: Click the back arrow (◀) at the top-left of the canvas, OR press **Alt + Left Arrow**.

#### Step 8
**Delete this practice subsystem** — we don't need it for our actual project.

Click on the Subsystem block to select it. Press **Delete** on your keyboard.

The canvas is now empty again.

---

## 13. The PowerGUI Block — Critical for Our Project

The **PowerGUI** block is required whenever you use Simscape Electrical (the power electronics library). Without it, the simulation will not run.

Think of it as the "engine control module" for the electrical simulation.

### Step 1
In the Library Browser, type:
```
powergui
```

### Step 2
Look for **"powergui"** from the path **"Simscape / Electrical / Specialized Power Systems / Fundamental Blocks"**.

### Step 3
Drag it to a corner of your canvas (bottom-left corner is traditional).

### Step 4
Double-click it.

A dialog opens. Key settings:
- **Simulation type:** "Continuous"
- **Solver type:** "Auto"

Leave defaults for now. Click **OK**.

### Step 5
Press **Ctrl + S** to save.

> ⚠️ **Note:** You MUST have exactly ONE powergui block in your model. Not zero (simulation fails), not two (error). One. Just one.

---

## 14. Signals and Data Types

In Simulink, the wires carry **signals**. There are two types relevant to us:

### Simulink Signals (Regular wires — thin black lines)
- Carry numerical values (voltages, currents as numbers)
- Used in the control/protection circuit part
- Example: The threshold voltage value 0.62 is a Simulink signal

### Simscape Electrical Connections (Physical connections — thick lines)
- Carry actual electrical power
- Must connect to actual electrical components
- Example: The wire between a HEMT drain and an inductor

> ⚠️ **Very Important:** You CANNOT connect a regular Simulink wire directly to a Simscape electrical port. You need special interface blocks (like "Voltage Measurement" or "Current Measurement") to bridge between them. We will see this in the next chapters.

---

## 15. Quick Reference — Most Used Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl + S | Save |
| Ctrl + Z | Undo |
| Ctrl + T | Run simulation |
| Ctrl + Shift + L | Open Library Browser |
| Ctrl + Shift + H | Zoom to fit entire model |
| Ctrl + scroll | Zoom in/out |
| Delete | Delete selected block/wire |
| Ctrl + D | Update model (check for errors) |
| Ctrl + A | Select all blocks |
| Escape | Deselect all |
| Space (while hovering) | Pan the canvas |

---

## 16. Common Mistakes for Beginners

### Mistake 1: Red wire
**Problem:** You connected blocks but the wire is red.  
**Cause:** The output of one block has a different data dimension than the input expects.  
**Fix:** Right-click the red wire → "Propagate Selected Signal" or check the block parameters for dimension mismatches.

### Mistake 2: "Unconnected input port" error when running
**Problem:** Simulation fails with "unconnected input port" error.  
**Cause:** A block has an input port that has no wire connected to it.  
**Fix:** Find the block with an empty input port (no wire going in). Connect something to it, or delete the block.

### Mistake 3: Simulation time too large
**Problem:** Simulation runs forever.  
**Cause:** Stop time is too large (e.g., 1000 seconds for a microsecond-level circuit).  
**Fix:** Set Stop Time to something small. For our project: 0.005 seconds (5 milliseconds) is good for normal operation tests.

### Mistake 4: Wrong block from wrong library
**Problem:** You find a block named "Integrator" but it doesn't work as expected.  
**Cause:** There are multiple blocks with similar names in different libraries.  
**Fix:** Always check the library path in the Library Browser. For control circuits: use "Simulink/Continuous/Integrator". For Simscape: use the Simscape version.

---

## 17. Save and Close Practice

### Step 1
Your canvas has only the powergui block.

Press **Ctrl + S** to save.

### Step 2
Close the Simulink model window (click X).

### Step 3
In MATLAB Command Window, type:
```matlab
open_system('Adaptive_Current_Protection')
```

Press Enter.

Your model opens again. This confirms the file is saved correctly.

---

## Simulink Basics Checklist

- [ ] I can open Simulink from MATLAB
- [ ] I can create a blank model
- [ ] I can save the model with Ctrl+S
- [ ] I can open the Library Browser
- [ ] I can search for blocks
- [ ] I can drag a block to the canvas
- [ ] I can connect two blocks with a wire
- [ ] I know what a black wire vs red wire means
- [ ] I ran a test simulation (sine wave into scope)
- [ ] I understand what powergui is and why it's needed
- [ ] I know the difference between Simulink signals and Simscape connections
- [ ] The powergui block is on my canvas

**→ When ALL boxes are checked, proceed to 04_Half_Bridge.md**
