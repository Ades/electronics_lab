# Electronics Lab

A graphical electronics simulator that runs in the browser with no build step and no dependencies.

**Start:** open `index.html` in Chrome, Edge, Firefox or Safari.

## Features

- **Schematic editor.** Drag parts from the palette and drag from a pin to draw a wire. You get undo/redo, copy/paste, rotate/flip, box select, pan and zoom. You can choose IEC (European) or ANSI (American) symbols.
- **Components.**
  - Sources: ground, supply rail, DC source, battery, signal generator (sine/square/triangle/sawtooth), current source.
  - Passive: R, C, electrolytic C, L, potentiometer, lamp.
  - Semiconductors: diode, Zener, LED, NPN/PNP, N/P-MOSFET, op-amp.
  - Switches: toggle switch, push button, changeover switch.
  - Logic: gates with 2–4 inputs, logic input/output, clock, 7-segment display.
- **Standard ICs** (48) with their real pinouts and pin numbers. Each IC needs its supply pins connected to work.
  - Analog, timer & power: NE555, LM358, LM741, LM393 comparator, LM7805 regulator.
  - 74xx gates: 00, 02, 04, 08, 10, 11, 14 (Schmitt), 20, 27, 32, 86, 125 (tri-state).
  - 74xx flip-flops, counters & registers: 74, 112 (JK), 174, 175, 160, 161, 192, 193 (up/down), 90, 93 (ripple), 164, 165, 595 (shift registers).
  - 74xx decoders, mux & arithmetic: 138, 139, 42, 47 (7-segment, active low), 151, 153, 157, 85 (comparator), 283 (adder).
  - 4000 CMOS: 4001, 4011, 4069, 4070, 4071, 4081, 4013, 4017, 4511.
  - Unconnected active-low control pins (~CLR, ~LOAD, ~LT, …) are held inactive by weak internal pull-ups.
- **Custom ICs**
  - *Logic expressions*, for example `S = A ^ B ^ CIN`. Use `Q = D @ CLK` to make a register on the rising edge (`@ !CLK` for the falling edge). Internal signals are allowed.
  - *Sub-circuit*: build a circuit, mark its external pins with **IC port** parts, then choose **New IC → From circuit**.
  - Custom ICs are saved in the browser. A saved circuit file includes the custom ICs it uses. You can export and import IC definitions.
- **Measurement**
  - Hover over a wire or part to see live V, I and P. The inspector panel shows the same values for the selected part.
  - Voltmeters and ammeters show their readings on the schematic.
  - Wires are coloured by voltage.
- **Oscilloscope**
  - Shows voltages and currents on several channels. Add a channel with a scope probe, or right-click a part or wire and choose **Plot …**.
  - Roll or trigger mode, automatic or fixed V/div, a cursor read-out, and p-p, average and frequency for each channel.
- **Data table**
  - Record voltages, currents, power, node voltages and component values as table columns: by hand (**Record** / `M`), automatically at a simulation-time interval, or with a **parameter sweep** that steps a component value and records one row per step (e.g. diode I–U curves).
  - Plot any column against any other (two Y-axes when the units differ) and export to CSV. The table is saved with the circuit.
- **Digital oscilloscope mode** shows logic-analyser lanes with an adjustable threshold and an optional bus lane that decodes the channels as a binary number.
- **CircuiTikZ export.** Produces a complete standalone `.tex` document or just the `circuitikz` environment, in European or American style.

## Simulation engine

The engine uses Modified Nodal Analysis with trapezoidal or backward-Euler integration and Newton–Raphson for nonlinear parts. Diodes and BJTs use pn-junction limiting. MOSFETs use the level-1 model, and op-amps saturate smoothly at the rails. Digital ICs are behavioural blocks with push-pull outputs.

## Files

| File | Purpose |
| --- | --- |
| `js/sim.js` | MNA engine and device models |
| `js/components.js` | Component symbols, models and measurements |
| `js/ics.js` | Standard ICs, custom-IC registry, logic-expression compiler |
| `js/circuit.js` | Connectivity, netlist building (incl. sub-circuits), save/load |
| `js/editor.js`, `js/render.js` | Canvas editor and drawing |
| `js/scope.js` | Oscilloscope (analog and digital modes) |
| `js/datatable.js` | Data table, plot, parameter sweep, CSV export |
| `js/tikz.js` | CircuiTikZ exporter |
| `js/ui.js`, `js/main.js` | Panels, dialogs, application controller |

## Tests

```sh
node test/simtest.js                # simulator checks (RC, rectifier, BJT, op-amp, 555, logic, ICs, …)
node test/ictest.js                 # functional checks of the standard IC library
node test/tikzexport.js /tmp/out    # writes .tex files for the examples and every component
```
