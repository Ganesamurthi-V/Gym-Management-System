# 02 — MATLAB Installation & Setup

**⏱️ Time Budget: 2 hours**  
**Goal: MATLAB opens, Simulink opens, Simscape toolbox is available.**

---

## 1. What You Need to Install

You need **MATLAB** with these specific toolboxes:

| Toolbox | Why We Need It |
|---------|----------------|
| **MATLAB** (base) | The environment itself |
| **Simulink** | The visual block-diagram simulator |
| **Simscape** | Physical modeling (electrical components) |
| **Simscape Electrical** | Specifically: HEMTs, voltage sources, inductors |
| **Signal Processing Toolbox** | For some filter and analysis blocks |
| **Control System Toolbox** | For transfer function blocks |

> ⚠️ **IMPORTANT:** If your college already has MATLAB installed on lab computers or provides a student license, use that first. Do NOT spend your 2-day deadline waiting for downloads.

---

## 2. Check If MATLAB Is Already Installed

### Step 1
Look at your desktop or Start menu (Windows) / Applications (Mac) / search your computer for "MATLAB".

### Step 2
If you find MATLAB: **double-click to open it.**

### Step 3
Wait. MATLAB takes 30–120 seconds to load. You will see a loading screen with the MathWorks logo.

### Step 4
When MATLAB finishes loading, you will see a window with three panels:
- **Left panel:** "Current Folder" — shows your files
- **Center panel:** "Command Window" — where you type commands. You see `>>` prompt.
- **Right panel:** "Workspace" — shows your variables

If you see this: **MATLAB is installed. Skip to Section 4.**

If you do NOT see this: **Continue to Section 3.**

---

## 3. If MATLAB Is NOT Installed — Install It

### Option A: Use Your College License (RECOMMENDED)

1. Contact your college IT department or check your college portal.
2. Many Indian engineering colleges have MATLAB Total Academic Headcount (TAH) licenses.
3. Ask: "How do I install MATLAB on my personal computer using the college license?"
4. They will give you a license key or a link.

### Option B: MathWorks Free Trial

1. Open your web browser.
2. Go to: **https://www.mathworks.com/campaigns/products/trials.html**
3. Click "MATLAB" trial.
4. Create a free MathWorks account with your college email.
5. Download the installer.

### Option C: Online MATLAB (No Installation Required)

1. Go to: **https://matlab.mathworks.com**
2. Sign in with your MathWorks account.
3. This runs MATLAB in your browser.
4. **Limitation:** Simulink and Simscape may have limited functionality online.
5. Use this ONLY if you cannot install locally.

### Step-by-Step Installation (If You Downloaded the Installer)

**Step 1:** Find the downloaded file. It will be named something like `matlab_R2024a_win64.exe` (Windows) or `matlab_R2024a_maci64.dmg` (Mac).

**Step 2:** Double-click the installer file.

**Step 3:** A window appears saying "MathWorks Product Installer". Click "Sign in" and enter your MathWorks account email and password.

**Step 4:** A list of products appears. You MUST check these boxes:
- ☑ MATLAB
- ☑ Simulink
- ☑ Simscape
- ☑ Simscape Electrical
- ☑ Signal Processing Toolbox
- ☑ Control System Toolbox

**Step 5:** Choose installation folder. Accept the default (usually `C:\Program Files\MATLAB\R2024a` on Windows).

**Step 6:** Click "Begin Install". Wait. This can take 30–90 minutes depending on your internet speed.

**Step 7:** When installation completes, click "Close". Find MATLAB in your Start Menu or Desktop and open it.

---

## 4. Verify Simscape Is Installed

This is the most critical check. Our entire simulation needs Simscape.

### Step 1
MATLAB is open. You see the `>>` prompt in the Command Window.

### Step 2
Click once inside the Command Window (the center panel) so your cursor is there.

### Step 3
Type this exact command and press Enter:
```
ver
```

### Step 4
A list appears. Scroll through it looking for:
- `Simscape` — MUST be present
- `Simscape Electrical` — MUST be present

### Step 5
If you do NOT see Simscape in the list:

Click on the **Home tab** (top ribbon).

Look for **"Add-Ons"** button (it shows a puzzle piece icon).

Click **"Add-Ons" → "Get Add-Ons"**.

A window opens. In the search box, type **"Simscape"**.

Click on "Simscape" in the results.

Click **"Add"** or **"Install"**.

Wait for installation to complete.

Repeat for "Simscape Electrical".

### Step 6
After installing, type `ver` again in Command Window to confirm both appear.

---

## 5. Verify Simulink Is Installed

### Step 1
Look at the top ribbon in MATLAB. You should see a row of buttons.

### Step 2
Look for a button that says **"Simulink"** with a circuit-like icon. It is in the HOME tab ribbon.

### Step 3
Click the **"Simulink"** button.

### Step 4
A new window opens called the **"Simulink Start Page"**.

You see:
- "Recent" — your recent Simulink models (empty for now)
- "New" — options to create a new model
- Templates like "Blank Model", "Blank Library", etc.

If you see this window: **Simulink is working correctly.**

### Step 5
Close this Simulink Start Page window for now (click the X). We will come back to it later.

---

## 6. Set Up Your Working Folder

This is important — all your files should be in one place.

### Step 1
Decide where you want to save your project. For example: `C:\Users\YourName\Documents\AdaptiveThreshold\`

### Step 2
In MATLAB, look at the top of the screen. There is a bar showing the current folder path. It probably shows something like `C:\Users\YourName\Documents\MATLAB`.

### Step 3
Click the small folder icon to the left of that path bar (it looks like a yellow folder with an arrow).

### Step 4
A file browser window opens.

### Step 5
Navigate to where you want to create your project folder. Click "New Folder" and name it `AdaptiveThreshold`.

### Step 6
Double-click your new `AdaptiveThreshold` folder to open it.

### Step 7
Click "Select Folder" (or OK).

### Step 8
The MATLAB current folder panel (left panel) now shows your `AdaptiveThreshold` folder. It is empty — that is correct.

---

## 7. Test Your Setup With a Quick Command

### Step 1
Click in the Command Window.

### Step 2
Type this and press Enter:
```matlab
t = 0:0.001:1;
y = sin(2*pi*10*t);
plot(t, y);
title('Test Plot - MATLAB Works!');
```

**What this code does:**
- Line 1: Creates a time vector from 0 to 1 second, in steps of 0.001 seconds
- Line 2: Creates a sine wave at 10 Hz
- Line 3: Plots it
- Line 4: Adds a title

### Step 3
A figure window appears showing a sine wave.

If you see the sine wave: **MATLAB is working correctly.**

Close the figure window (click X on the figure, not on MATLAB).

---

## 8. Configure MATLAB for Our Project

### Step 1
In the Command Window, type this and press Enter:
```matlab
format long
```
This shows more decimal places. Good for engineering calculations.

### Step 2
Type this and press Enter:
```matlab
% Set simulation parameters
Vdc = 450;          % DC bus voltage in Volts
fsw = 5000;         % Switching frequency in Hz  
Ton = 200e-6;       % ON time (we'll adjust from paper later)
delta_I = 31;       % Fixed margin in Amperes
sensor_gain = 0.02; % 20 mV/A from paper Table II
Vbias = delta_I * sensor_gain  % Should print: 0.6200
```

**What this code means:**
- `Vdc = 450` — Sets variable Vdc to 450 (the DC bus voltage)
- `fsw = 5000` — Switching frequency = 5000 Hz = 5 kHz
- `Ton = 200e-6` — 200 × 10^(-6) = 0.000200 seconds = 200 microseconds
- `delta_I = 31` — The ΔI margin from the paper = 31 Amperes
- `sensor_gain = 0.02` — 20 millivolts per Ampere = 0.020 V/A
- `Vbias = delta_I * sensor_gain` — 31 × 0.02 = 0.62 V

### Step 3
You should see `Vbias = 0.6200` printed in the Command Window.

If you see a different number, you made a typo. Re-enter the lines.

> 📝 **Note:** The paper's Table IV states V_bias = 0.35 V, which corresponds to ΔI = 17.5 A. This is the margin used in the inverter experiment (Appendix B). For the PSPICE simulation (our model), ΔI = 31 A is used. We will use V_bias = 0.62 V (= 31 A × 20 mV/A) as our primary parameter and discuss the difference in the final report.

---

## 9. Common Installation Problems and Fixes

### Problem 1: "License not found"
**Symptom:** MATLAB opens but immediately shows a license error.  
**Fix:** Your license file is missing or expired. Contact your college IT or log in to MathWorks and download the license again.

### Problem 2: "Simscape not found in Add-Ons"
**Symptom:** You search for Simscape but it doesn't appear.  
**Fix:** Your license may not include Simscape. Check with your college IT. Alternatively, try the approach in Section 10 below (alternative simulation approach).

### Problem 3: MATLAB takes too long to open
**Symptom:** MATLAB shows loading screen for more than 5 minutes.  
**Fix:** Close other applications. MATLAB needs a lot of RAM. If your computer has less than 4 GB RAM, MATLAB will be slow but should still work.

### Problem 4: "Error: 'plot' is not a function"
**Symptom:** The test plot command gives an error.  
**Fix:** You are probably in the wrong window. Click in the Command Window (center panel) first, then type.

### Problem 5: The Simulink button is missing
**Symptom:** You cannot find the Simulink button in the ribbon.  
**Fix:** Click the "HOME" tab at the top. If Simulink is still missing, type `simulink` in the Command Window and press Enter.

---

## 10. Alternative If Simscape Electrical Is Unavailable

> ⚠️ Read this only if you cannot install Simscape Electrical.

If Simscape Electrical is not available, we can still simulate the **protection logic** using standard Simulink blocks:

- The HEMT and power circuit will be modeled as a simple current source + switch (mathematical model)
- The Rogowski coil will be a derivative gain
- All other blocks (integrator, comparator, sample-hold, latch) use standard Simulink

This is a **mathematical/behavioral simulation** — not a full electrical simulation. It still demonstrates the adaptive threshold concept. Label everything as "BEHAVIORAL MODEL" in your report.

Proceed with this alternative ONLY if Simscape Electrical fails to install.

---

## 11. Installation Checklist

Before moving to the next file, verify:

- [ ] MATLAB opens without errors
- [ ] Command Window shows `>>` prompt
- [ ] `ver` command shows Simscape and Simscape Electrical
- [ ] Simulink Start Page opens when you click Simulink button
- [ ] Test plot (sine wave) appears successfully
- [ ] Working folder `AdaptiveThreshold` is set as current folder
- [ ] Test parameters (Vdc, delta_I, etc.) compute correctly

**→ When ALL boxes are checked, proceed to 03_Simulink_Basics.md**
