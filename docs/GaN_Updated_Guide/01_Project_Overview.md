# 01 — Project Overview
## Adaptive Current Threshold for Rapid Short-Circuit Protection of GaN HEMTs

**Paper Reference:** Liu et al., "Adaptive Current Threshold for Rapid SC Protection of GaN HEMTs,"  
*IEEE Transactions on Power Electronics*, Vol. 41, No. 4, April 2026, pp. 4472–4485.

---

## ⏱️ Time Budget for This File
**Estimated reading time: 1 hour**  
Read this entire file before touching MATLAB.

---

## 1. What Is This Project? (Plain English)

Imagine you have a very powerful electronic switch — called a **GaN HEMT** — inside a motor drive or solar inverter. This switch can carry **31 Amperes** of current safely.

But what if something goes wrong — a wire gets shorted, or two switches turn ON at the same time by mistake? Suddenly, instead of 31 A, the current spikes to **55–82 Amperes** in nanoseconds (billionths of a second). If nothing stops this, the HEMT explodes.

This paper proposes a smarter **protection system** that:
1. Watches the current every switching cycle
2. Learns what the "normal" current level is right now
3. Sets a custom alarm threshold just above that normal level
4. Triggers an emergency shutdown in **69–103 nanoseconds** when the current exceeds the threshold

The key word is **"Adaptive"** — the threshold changes with the load, unlike older fixed-threshold methods.

---

## 2. Glossary — Every Term You Will Encounter

| Term | What It Means (Plain English) |
|------|-------------------------------|
| **GaN HEMT** | Silicon Carbide Metal-Oxide-Semiconductor Field-Effect Transistor. A high-power switch made from a special material (Silicon Carbide) that can handle very high voltages and temperatures. Think of it as a super-powerful light switch controlled by a small voltage signal. |
| **Short-Circuit (SC)** | An unintended low-resistance connection that allows dangerously high current to flow. Like touching both terminals of a battery with a copper wire. |
| **HSF** | Hard-Switching Fault (SC Type 1). The HEMT turns ON directly into an existing short circuit. |
| **FUL** | Fault Under Load (SC Type 2). A short circuit happens while the HEMT is already conducting normal load current. |
| **CSC** | Commutation Short Circuit (SC Type 3). Happens when the HEMT in the freewheeling path accidentally becomes a fault path. |
| **Half-Bridge** | Two HEMTs (S1 on top, S2 on bottom) connected in series between DC+ and DC−. They take turns switching to create AC output. |
| **PWM** | Pulse Width Modulation. A technique of rapidly switching ON and OFF to control average power. Like blinking a light very fast — the percentage of time it's ON controls brightness. |
| **Rogowski Coil** | A coil of wire wound around a conductor. When current changes in the conductor, a voltage appears in the coil. It measures current without touching the conductor. |
| **Integrator** | A circuit that accumulates (integrates) a signal over time. The Rogowski coil output is the derivative of current, so integrating it gives back the current. |
| **Threshold** | The alarm level. If current goes above this, a fault is declared. |
| **Adaptive Threshold** | A threshold that is not fixed — it adjusts based on current operating conditions. |
| **I_ref,a** | The adaptive detection threshold (the key variable of this paper). |
| **I_s** | Sampled value of drain current at the moment the HEMT turns ON (steady-state value). |
| **ΔI** | A fixed safety margin added to I_s to give I_ref,a. Value: 31 A (device rated current). |
| **V_clamp** | Voltage proportional to the drain current I_d (output of the Rogowski+integrator system). |
| **V_ref,a** | Voltage version of I_ref,a (used by the comparator circuit). |
| **V_hold** | A "held" voltage sampled from V_clamp — represents V at the moment of turn-ON. |
| **V_bias** | A fixed DC bias voltage added to V_hold to create V_ref,a. |
| **V_FLT** | Fault signal. Goes HIGH when SC is detected. |
| **CMP** | Comparator — compares V_clamp against V_ref,a and triggers V_FLT if V_clamp > V_ref,a. |
| **RS Latch** | A digital circuit that "latches" — once SET, stays HIGH until reset. Holds the fault signal. |
| **Gate Driver** | A circuit that amplifies small control signals to drive the HEMT gate. |
| **Soft Turn-Off (STO)** | A controlled, gradual way to turn OFF the HEMT during a fault to avoid voltage spikes. |
| **V_gs** | Gate-to-Source voltage — the control signal for the HEMT. |
| **V_ds** | Drain-to-Source voltage — the voltage the HEMT sees when it's OFF. |
| **I_d** | Drain current — the current flowing through the HEMT when it's ON. |
| **V_dc** | DC Bus Voltage = 450 V (the supply voltage). |
| **DESAT** | Desaturation detection — an older SC protection method that measures V_ds. |
| **Sample-and-Hold** | A circuit that captures (samples) a voltage value and freezes it (holds) for later use. |
| **AMP1–AMP4** | Operational amplifier stages in the protection circuit. |
| **One-Shot** | A timing circuit that produces a pulse of fixed duration when triggered. |
| **V_en** | Enable signal that activates the sample-and-hold at the right moment. |
| **Op-Amp** | Operational Amplifier — a high-gain amplifier used for signal conditioning. |

---

## 3. The Paper's Core Idea — The Equation

The paper's entire contribution rests on one equation (Equation 2 in the paper):

```
I_ref,a = I_s + ΔI
```

**What each part means:**

- **I_ref,a** = The adaptive threshold we compute each switching cycle
- **I_s** = The sampled drain current at the moment the HEMT turns ON. This represents the current load level right now.
- **ΔI** = A fixed margin = 31 A (equal to the device rated current in the paper)

**Why this is clever:**  
Traditional systems set I_ref = 62 A (fixed, = 2 × 31 A rated current).

If the load current is only 7 A, the HEMT current must rise from 7 A to 62 A before a fault is detected — that takes a long time and allows huge current spikes.

With the adaptive method: I_ref,a = 7 + 31 = 38 A. The threshold is 38 A instead of 62 A. Fault is detected much sooner — 44 ns sooner — and peak SC current is 15 A lower.

---

## 4. The Three Types of Short-Circuit Faults (From Fig. 1 of the Paper)

### Type 1: Hard-Switching Fault (HSF)
- The lower HEMT (S2) turns ON, but an existing short circuit is already present
- Current rises from **zero** (or very low) to a huge value
- Detection time from paper: **103 ns** (adaptive) vs 148–600 ns (traditional)

### Type 2: Fault Under Load (FUL)
- Normal operation is happening, then suddenly a short circuit appears
- Current rises from the **existing load current** (e.g., 7 A or 24 A)
- Detection time from paper: **69 ns** (adaptive) vs 76–590 ns (traditional)

### Type 3: Commutation Short Circuit (CSC)
- During the freewheeling phase, the current commutates back and causes a fault
- The drain current starts from a **negative** value
- Detection time from paper: **85 ns** (adaptive) vs 89–354 ns (traditional)

---

## 5. The Full System Architecture (From Fig. 4 of the Paper)

The complete circuit has **four main blocks**. In our Simulink simulation, we will model each one:

```
┌─────────────────────────────────────────────────────────────┐
│                    FULL SYSTEM                              │
│                                                             │
│  [PWM Controller] ──→ [Gate Driver] ──→ [Half-Bridge]      │
│                              │               │              │
│                              │           [Rogowski Coil]    │
│                              │               │              │
│                    [Soft Turn-Off] ←──── [Integrator]      │
│                              │               │              │
│                         [RS Latch] ←─── [Comparator]       │
│                              │               ↑              │
│                         [V_FLT]      [Threshold Adj.]       │
│                                       (Sample & Hold)       │
└─────────────────────────────────────────────────────────────┘
```

### Block 1: Half-Bridge Power Circuit
- **S1** (upper HEMT) + **S2** (lower HEMT, the Device Under Test = DUT)
- DC Bus: V_dc = 450 V
- Load: L = 7 mH, R = 1 Ω (from paper's inverter test, Fig. 10)
- Switching frequency: 5 kHz (T_ON = 5 μs, T_OFF = 3 μs for the PSPICE simulation case)

### Block 2: Rogowski Coil + Integrator
- Rogowski coil senses the derivative of I_d (dI_d/dt)
- Integrator converts this to V_int ∝ I_d
- Mutual inductance M = 7.66 nH (from Table II of the paper)
- Integrator: R_i = 116 Ω, C_i = 3.3 nF (from Table II of the paper)
- Sensor gain G = 20 mV/A (from Table II, range: ±250 A → ±5 V)

### Block 3: Timing Circuit
- Three resistors R1, R2, R3 + two One-Shot circuits + AND gate
- Creates two timing windows:
  - t_a = 300 ns (blanking window after turn-ON, to avoid noise)
  - t_b = 600 ns (sampling window — when to sample I_s)
- V_en goes HIGH during the sampling window

### Block 4: Adaptive Threshold (Sample-and-Hold)
- Analog switch S samples V_clamp when V_en is HIGH
- C_hold stores the sampled voltage V_hold = 4.7 pF (Table IV of paper)
- AMP3 buffers the held voltage
- AMP4 adds V_bias = 0.35 V (from Table IV of paper)
- V_ref,a = V_hold + V_bias

### Block 5: Comparator + RS Latch
- CMP compares V_clamp vs V_ref,a
- If V_clamp > V_ref,a: V_FLT goes HIGH
- RS Latch holds the fault signal
- Fault signal triggers Soft Turn-Off circuit

---

## 6. Key Parameters From the Paper

From **Table III** (Simulation Case Study):

| Parameter | Value | Meaning |
|-----------|-------|---------|
| V_dc | 450 V | DC bus voltage |
| L_stray | 30 nH | Parasitic inductance in power loop |
| T_ON | 5 μs | HEMT on-time per cycle |
| T_OFF | 3 μs | HEMT off-time per cycle |
| L (load) | 600 μH | Load inductor |
| HEMT | GS66508B | 650 V / 31 A GaN HEMT from ROHM |
| R_g | 10 Ω | Gate resistance |

From **Table IV** (Protection Board Components):

| Parameter | Value | Meaning |
|-----------|-------|---------|
| R_c | 20 Ω | Feedback resistor of AMP2 (sets integrator gain) |
| V_bias | 0.35 V | Fixed bias = ΔI × sensor gain = 31A × 20mV/A ≈ 0.62V... paper uses 0.35V which corresponds to ΔI ≈ 17.5A |
| C_hold | 4.7 pF | Hold capacitor |
| t_a | 300 ns | Blanking time (noise avoidance after turn-ON) |
| t_b | 600 ns | Sampling window end time |
| ΔI | 31 A | Fixed margin (from paper equation and simulation setup) |

> ⚠️ **NOTE ON V_bias vs ΔI:** The paper uses V_bias = 0.35 V and states ΔI = 17.5 A in the margin configuration analysis (Appendix B). In the PSPICE simulation (Table III context), ΔI is set to 31 A (rated current). We will use ΔI = 31 A in our Simulink model for the main simulation, and V_bias as a tunable parameter.

---

## 7. What Our Simulink Model Will Do

Since we are doing **simulation only** (not hardware), we make the following adaptations:

| Paper Hardware | Simulink Equivalent | Notes |
|----------------|---------------------|-------|
| PCB Rogowski Coil (physical) | Derivative block + Gain block | Simulation equivalent. Clearly labelled as "Simulation Model" |
| RC Integrator (analog op-amp circuit) | Transfer Function block (1/R_i*C_i*s) | Simulation equivalent |
| Analog Sample-and-Hold | Zero-Order Hold (ZOH) block triggered by V_en | Simulation equivalent |
| One-Shot timing circuits | Pulse Generator + Logic gates | Simulation equivalent |
| Comparator (analog) | MATLAB Function or Compare to Constant block | Simulation equivalent |
| RS Latch (NOR gates) | SR Flip-Flop from Simulink Logic library | Simulation equivalent |
| Soft Turn-Off circuit | Ramp function applied to gate signal | Simplified simulation equivalent |
| GS66508B HEMT | HEMT block (Simscape) with simplified parameters | Simulation approximation |

---

## 8. 48-Hour Schedule

| Time Block | Activity | File |
|------------|----------|------|
| Hour 0–1 | Read this file completely | 01 |
| Hour 1–3 | Install/verify MATLAB, install Simscape | 02 |
| Hour 3–5 | Learn Simulink basics, canvas, blocks, wires | 03 |
| Hour 5–8 | Build Half-Bridge power circuit | 04 |
| Hour 8–10 | Build PWM generator | 05 |
| Hour 10–13 | Build Rogowski Coil + Integrator | 06–07 |
| Hour 13–17 | Build Adaptive Threshold circuit | 08 |
| Hour 17–20 | Build Fault Detection (Comparator + Latch) | 09 |
| Hour 20–24 | Connect everything, run first simulation | 10 |
| Hour 24–30 | Test all three SC fault types | 10 |
| Hour 30–36 | Debug, fix errors | 11 |
| Hour 36–42 | Validate results vs paper figures | 10 |
| Hour 42–48 | Write final report | 12 |

---

## 9. What "Success" Looks Like

Your simulation is successful if you can show:

1. ✅ Normal operation — PWM switching, current waveform, adaptive threshold tracking
2. ✅ HSF fault — current detected before reaching fixed threshold
3. ✅ FUL fault — faster detection compared to fixed threshold
4. ✅ V_FLT signal goes HIGH when fault occurs
5. ✅ Gate signal (V_gs) goes LOW after fault is detected (HEMT turns OFF)
6. ✅ Adaptive threshold V_ref,a tracks the load current

---

## 10. Before You Move On — Checklist

- [ ] I understand what a HEMT is (electronic switch)
- [ ] I understand what a short-circuit fault is
- [ ] I understand what I_s, ΔI, and I_ref,a mean
- [ ] I understand the equation I_ref,a = I_s + ΔI
- [ ] I understand what V_clamp, V_hold, V_bias, V_ref,a are
- [ ] I understand there are three fault types (HSF, FUL, CSC)
- [ ] I know the key circuit parameters from Tables II, III, IV
- [ ] I have read the 48-hour schedule

**→ When ALL boxes are checked, proceed to 02_MATLAB_Installation.md**
