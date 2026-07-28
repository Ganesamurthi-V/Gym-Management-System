# 10 — Testing & Validation

**⏱️ Time Budget: 4 hours**  
**Goal: Run all three SC fault types (HSF, FUL, CSC), capture waveforms, and validate against paper results.**

---

## 1. Testing Strategy

The paper validates the adaptive threshold against three fault types and two load current conditions:
- I_L = 7 A (low load)
- I_L = 24 A (high load)

For each, the paper shows detection times (Table from Fig. 13a):
| Fault | Load | Adaptive | Fixed |
|-------|------|----------|-------|
| HSF | 7A | 84 ns | 148 ns |
| FUL | 7A | 66 ns | 76 ns |
| CSC | 7A | 76 ns | 89 ns |
| HSF | 24A | 121 ns | 155 ns |
| FUL | 24A | 155 ns | 151 ns |

We will run our simulation for each case and record results.

> ⚠️ **Simulation Accuracy Note:** Our simulation is a behavioral model. Due to:
> - Simplified power circuit (no stray inductance effects on transients)
> - 100 ns time step (limits resolution)
> - Simplified Rogowski coil model
> 
> Our detection times will be **approximate**. They should show the same TREND as the paper (adaptive faster than fixed), which is the important demonstration.

---

## 2. Test 1: Hard-Switching Fault (HSF)

### What Is HSF?
S2 turns ON into an existing short circuit. I_d starts from zero (or from a small freewheeling current) and rises sharply.

### Setup
**Step 1**
Run `setup_parameters.m` in MATLAB.

**Step 2**
In your Simulink model, go to the `SC_Fault_Trigger` Step block (in PWM_Generator or Fault_Injection subsystem).

**Step 3**
Configure for HSF:
- Step time: `0.001` (fault at t=1ms)
- The fault forces BOTH S1 and S2 ON simultaneously at t=1ms
- Since S2 was OFF when fault occurs (assume it happens at a turn-ON instant), I_d starts from ~0

**Step 4**
Set Stop time: `0.0015` (1.5 ms — see 5 cycles before fault and the fault event)

**Step 5**
Set solver step: `1e-8` (10 ns for better resolution)

**Step 6**
Press **Ctrl + T** to run.

**Step 7**
Open Final_Scope. Zoom in to the fault region (t = 0.995 ms to 1.010 ms).

**Step 8**
Record:
- I_d peak before protection fires: ________ A
- V_FLT rise time (t_detect): ________ ns
- V_FLT_fixed rise time: ________ ns (for comparison)

### Expected HSF Waveform
```
I_d (Drain current):
Normal: 0 ─→ ramp ─→ ~10A ─→ fall (normal switching)
Fault:  0 ─→ sharply rises to 40-60A ─→ (detected!) ─→ STO kicks in ─→ falls

V_FLT:
Before fault: ─────────────────────────────────────────
At fault:                                    ┌──────────
                                             │ (V_FLT=1)
```

---

## 3. Test 2: Fault Under Load (FUL)

### What Is FUL?
S2 is conducting normal load current (I_L > 0). A short circuit occurs externally. I_d rises FROM the existing load level.

### Setup
**Step 1**
The key difference from HSF: The fault occurs DURING the S2 ON period, not at the beginning.

**Step 2**
Modify the `SC_Fault_Trigger` Step block:
- Step time: `0.001075` (1.0750 ms — fault occurs 75 μs INTO an ON period, when I_d is at load level)
- This ensures I_d has already ramped to load level before the fault

**Step 3**
Keep all other settings the same.

**Step 4**
Run simulation, observe scope.

**Step 5**
Record:
- I_d at fault start (steady-state load current): ________ A
- I_d peak at detection: ________ A  
- t_detect: ________ ns

### Expected FUL Waveform
```
I_d:
Load current: ─────── 10 A (steady) ─────────→ rises to 50A → (detected!)

V_clamp:
         ─── 0.20 V (= G×10A) ────────────→ spikes to 1.0V → (V_FLT!)

V_ref,a: ─── 0.82 V ────────────────────────── (still 0.82V, holds)
```

Why FUL is different from HSF:
- HSF: I_d starts from 0, must reach V_ref,a/G = 41A before detection
- FUL: I_d starts from 10A (load level), only needs to rise by 31A (= ΔI) before detection
- Result: FUL detection is FASTER for the adaptive method ✅

---

## 4. Test 3: Commutation Short Circuit (CSC)

### What Is CSC?
This is the most complex fault type. The current commutates (flows through the freewheeling path) and a fault develops.

### Background
During the S2 OFF period, current flows through S1 (or through S1's body diode). If a CSC occurs, the current in S2 starts from a NEGATIVE value (because S2's body diode was conducting).

### Simulation Approach
CSC is harder to simulate directly with our model. We approximate it by:
1. Setting S2's initial current to a negative value
2. Then triggering the fault

**Step 1**
Modify the Fault Trigger for CSC: Set fault at the moment S2 turns ON after freewheeling.

**Step 2**
In the load current setup, ensure the current is at load level and going negative (freewheeling direction) before the fault.

**Step 3**
Because CSC starts from a NEGATIVE current in S2, the current overshoot at turn-ON can falsely look like a fault. The paper handles this with the synchronous mode clamping (V_hold is set to 0 in sync mode).

Our Clamp_Zero block in the Adaptive_Threshold handles this: When I_d is negative, V_clamp is negative, clamped to 0, so V_hold = 0, and V_ref,a = V_bias = 0.62 V (minimum threshold, equal to ΔI margin).

**Step 4**
Run simulation. The CSC test will show:
- S2 starts with negative current (freewheeling through body diode)
- Current suddenly spikes positive (CSC event)
- Since V_ref,a = V_bias only (V_hold was clamped to 0), detection is fast

**Step 5**
Record CSC detection time.

---

## 5. Parameter Study: Low Load vs High Load

Run the HSF test at two load current levels:

### Low Load Test (I_L ≈ 7 A)
- R_load = 1 Ω
- L_load = 600 μH  
- With 15V gate drive and 450V bus, the load current at 5 kHz, 62.5% duty is approximately 10–15 A (depends on exact circuit). To get ~7 A, increase R_load to 3 Ω.

**Step 1** — In MATLAB Command Window:
```matlab
R_load = 3;  % Increase resistance to reduce load current
save('project_params.mat');
```

**Step 2** — In the Series RLC block, update R to `R_load`.

**Step 3** — Run simulation. Observe that the adaptive threshold V_ref,a is now LOWER (because I_s is smaller). This means the adaptive method provides faster detection at low load.

### High Load Test (I_L ≈ 24 A)
- R_load = 0.5 Ω (reduce resistance to increase current)

**Step 1** — In MATLAB:
```matlab
R_load = 0.5;
save('project_params.mat');
```

**Step 2** — Update block, run simulation.

**Step 3** — At high load, V_ref,a is HIGHER (because I_s is larger). Fixed threshold doesn't change. Adaptive is still closer to actual operating point.

---

## 6. MATLAB Script to Record and Plot Results

Run this script AFTER completing your simulations. This plots a comparison bar chart like Fig. 13 of the paper.

**Step 1**
Create a new MATLAB script called `plot_results.m`:

```matlab
%% Plot Results — Adaptive vs Fixed Threshold Comparison
% Fill in your measured simulation values below

clear; clc; close all;

%% ===== FILL IN YOUR MEASURED VALUES HERE =====
% Detection time in nanoseconds
t_detect_adaptive  = [200,  150,  180];  % [HSF, FUL, CSC] - YOUR VALUES
t_detect_fixed     = [350,  280,  310];  % [HSF, FUL, CSC] - YOUR VALUES

% Peak current in Amperes
I_peak_adaptive    = [55,   68,   58];   % [HSF, FUL, CSC] - paper values (for reference)
I_peak_fixed       = [75,   82,   74];   % [HSF, FUL, CSC] - paper values (for reference)

%% ===== PAPER REFERENCE VALUES (from Fig. 13) =====
t_paper_adaptive   = [84,   66,   76];   % Paper reported values (ns)
t_paper_fixed      = [148,  76,   89];   % Paper reported values (ns)

%% ===== PLOT 1: Detection Time Comparison =====
figure('Name', 'SC Detection Time Comparison', 'Position', [100, 100, 900, 500]);

fault_types = {'HSF', 'FUL', 'CSC'};
x = 1:3;
width = 0.25;

% Plot simulation results
bar(x - width/2, t_detect_adaptive, width, 'FaceColor', [0.2 0.4 0.8], 'DisplayName', 'Adaptive (Simulated)');
hold on;
bar(x + width/2, t_detect_fixed, width, 'FaceColor', [0.9 0.5 0.1], 'DisplayName', 'Fixed (Simulated)');

% Overlay paper reference values (as markers)
plot(x - width/2, t_paper_adaptive, 'b*', 'MarkerSize', 10, 'DisplayName', 'Adaptive (Paper Ref.)');
plot(x + width/2, t_paper_fixed, 'r*', 'MarkerSize', 10, 'DisplayName', 'Fixed (Paper Ref.)');

xlabel('Short-Circuit Fault Type');
ylabel('Detection Time (ns)');
title({'SC Detection Time: Adaptive vs Fixed Threshold';
       'Simulation Results vs Paper Reference'});
legend('Location', 'northwest');
xticks(x);
xticklabels(fault_types);
grid on;
ylim([0 max([t_detect_fixed, t_paper_fixed]) * 1.3]);

% Add value labels on bars
for i = 1:3
    text(i - width/2, t_detect_adaptive(i) + 5, ...
         sprintf('%d ns', t_detect_adaptive(i)), ...
         'HorizontalAlignment', 'center', 'FontSize', 9);
    text(i + width/2, t_detect_fixed(i) + 5, ...
         sprintf('%d ns', t_detect_fixed(i)), ...
         'HorizontalAlignment', 'center', 'FontSize', 9);
end

hold off;

%% ===== PLOT 2: Adaptive Threshold Tracking =====
figure('Name', 'Adaptive Threshold Tracking', 'Position', [100, 650, 900, 400]);

% Generate example threshold tracking data (replace with your simulation data)
t = 0:200e-6:2e-3;  % 0 to 2ms, 200us steps = 10 cycles
I_L_example = 10 + 5*sin(2*pi*60*t);  % Example: 60Hz sinusoidal load current
V_hold_example = I_L_example * 0.02;  % 20 mV/A
V_ref_a_example = V_hold_example + 0.62;  % + V_bias
V_ref_fixed = ones(size(t)) * 1.24;  % Fixed at 62A × 20mV/A = 1.24V

plot(t*1000, V_ref_a_example, 'b-', 'LineWidth', 2, 'DisplayName', 'V_{ref,a} (Adaptive)');
hold on;
plot(t*1000, V_ref_fixed, 'r--', 'LineWidth', 2, 'DisplayName', 'V_{ref} (Fixed)');
plot(t*1000, V_hold_example, 'g:', 'LineWidth', 1.5, 'DisplayName', 'V_{hold} = G × I_s');

xlabel('Time (ms)');
ylabel('Voltage (V)');
title('Adaptive Threshold vs Fixed Threshold Over Load Current Variation');
legend('Location', 'best');
grid on;
ylim([0, 1.5]);

%% ===== PLOT 3: Improvement Summary =====
figure('Name', 'Detection Time Improvement', 'Position', [100, 150, 600, 400]);

improvement_sim = ((t_detect_fixed - t_detect_adaptive) ./ t_detect_fixed) * 100;
improvement_paper = ((t_paper_fixed - t_paper_adaptive) ./ t_paper_fixed) * 100;

bar_data = [improvement_sim; improvement_paper]';
b = bar(bar_data, 'grouped');
b(1).FaceColor = [0.2 0.4 0.8];
b(2).FaceColor = [0.8 0.6 0.2];

xlabel('Fault Type');
ylabel('Detection Time Reduction (%)');
title('Adaptive Threshold: Detection Time Improvement over Fixed');
legend({'Simulation Result', 'Paper Reference'}, 'Location', 'northwest');
xticks(1:3);
xticklabels(fault_types);
grid on;
ylim([0, 100]);

for i = 1:3
    text(i-0.15, improvement_sim(i)+2, sprintf('%.1f%%', improvement_sim(i)), ...
         'FontSize', 9, 'HorizontalAlignment', 'center');
    text(i+0.15, improvement_paper(i)+2, sprintf('%.1f%%', improvement_paper(i)), ...
         'FontSize', 9, 'HorizontalAlignment', 'center');
end

%% ===== CONSOLE SUMMARY =====
fprintf('\n========== RESULTS SUMMARY ==========\n');
fprintf('%-6s | %-20s | %-20s\n', 'Fault', 'Adaptive (sim/paper)', 'Fixed (sim/paper)');
fprintf('%-6s | %-20s | %-20s\n', '------', '--------------------', '--------------------');
for i = 1:3
    fprintf('%-6s | %6d ns / %4d ns   | %6d ns / %4d ns\n', ...
        fault_types{i}, t_detect_adaptive(i), t_paper_adaptive(i), ...
        t_detect_fixed(i), t_paper_fixed(i));
end
fprintf('\n');
fprintf('Average simulation improvement: %.1f%%\n', mean(improvement_sim));
fprintf('Average paper improvement:      %.1f%%\n', mean(improvement_paper));
fprintf('======================================\n');

%% Save figures
saveas(figure(1), 'SC_Detection_Time_Comparison.png');
saveas(figure(2), 'Adaptive_Threshold_Tracking.png');
saveas(figure(3), 'Detection_Improvement.png');
disp('Figures saved as PNG files.');
```

**Step 2**
Press **F5** to run the script.

**Step 3**
Three figures appear. Update the `t_detect_adaptive` and `t_detect_fixed` arrays with your actual measured values from the scope.

---

## 7. Extract Data From Simulink Scope to MATLAB

To get precise timing data from the scope:

**Step 1**
Right-click the Final_Scope block → select **"Log signals"** (or similar option).

**Step 2**
Open the Scope. Click the **gear icon** (settings). Check **"Log data to workspace"**.

**Step 3**
Set Variable name: `scope_data`

**Step 4**
Run simulation.

**Step 5**
In MATLAB Command Window:
```matlab
% scope_data is now in your workspace
% It contains all scope channel data as a structure

% Access current channel (I_d):
t = scope_data.time;        % time vector
Id = scope_data.signals(1).values;   % Channel 1 = I_d
Vclamp = scope_data.signals(2).values;
Vrefa = scope_data.signals(3).values;
VFLT = scope_data.signals(4).values;

% Find fault time (when VFLT goes HIGH)
fault_idx = find(VFLT > 0.5, 1, 'first');
t_fault = t(fault_idx);
fprintf('Fault detected at t = %.3f ms\n', t_fault*1000);

% Find when I_d started rising (fault initiated)
% Find where I_d crosses 2x normal level
normal_Id = mean(Id(t < 0.0009));  % average before fault
fault_start_idx = find(Id > 2*normal_Id & t > 0.0009, 1, 'first');
t_fault_start = t(fault_start_idx);

% Detection time
t_detect = (t_fault - t_fault_start) * 1e9;  % convert to nanoseconds
fprintf('Detection time: %.1f ns\n', t_detect);
```

---

## 8. Validation Checklist

Before writing the report, verify these results from simulation:

### Core Results
- [ ] Normal operation shows correct 5 kHz switching, proper I_d waveform
- [ ] V_clamp is proportional to I_d (G = 20 mV/A relationship verified)
- [ ] V_hold updates each cycle (adaptive tracking works)
- [ ] V_ref,a = V_hold + V_bias (threshold adaptation verified)
- [ ] V_FLT goes HIGH when fault is injected
- [ ] Soft Turn-Off reduces V_gs gradually after fault
- [ ] HSF fault detected (time recorded)
- [ ] FUL fault detected (time recorded)
- [ ] CSC fault detected (time recorded)
- [ ] Adaptive threshold fires BEFORE fixed threshold (key result)

### Quantitative Results to Report
Fill in after running simulations:

| Metric | Simulated | Paper Reference | Match? |
|--------|-----------|-----------------|--------|
| HSF detection time (adaptive) | ___ ns | 84 ns | ✓/✗ |
| FUL detection time (adaptive) | ___ ns | 66 ns | ✓/✗ |
| CSC detection time (adaptive) | ___ ns | 76 ns | ✓/✗ |
| Adaptive faster than fixed? | Yes/No | Yes | ✓/✗ |
| V_ref,a = V_hold + V_bias? | ___V | 0.82 V at IL=10A | ✓/✗ |

---

## 9. Scope Configuration for Best Visualization

For your final screenshots (to include in report):

**Step 1**
Open Final_Scope.

**Step 2**
Click **Edit → Axes Properties**.

**Step 3**
For each channel, set:
- Channel 1 (I_d): Title = "Drain Current I_d (A)", Y range = [-20 100]
- Channel 2 (V_clamp): Title = "V_clamp = G×I_d (V)", Y range = [-0.5 2.0]
- Channel 3 (V_ref,a): Title = "V_ref,a Adaptive Threshold (V)", Y range = [0 1.5]
- Channel 4 (V_FLT): Title = "Fault Signal V_FLT", Y range = [-0.1 1.5]

**Step 4**
Press the **Zoom In** button and drag over the fault region for close-up view.

**Step 5**
Press **Print** (or use MATLAB `saveas` function) to save the scope image.

---

## Testing Checklist

- [ ] HSF test run and detection time recorded
- [ ] FUL test run and detection time recorded  
- [ ] CSC test approximated and detection time recorded
- [ ] Low load (7A) test run
- [ ] High load (24A) test run
- [ ] Fixed vs Adaptive comparison demonstrated on scope
- [ ] plot_results.m script run and figures generated
- [ ] Scope data logged to MATLAB workspace
- [ ] Detection times measured from scope
- [ ] All figures saved as PNG for report

**→ When ALL boxes are checked, proceed to 11_Debugging.md**
