# VHDL Sim for macOS — Design

## Intent
Desktop alternative to ModelSim-Altera 18.1 for macOS Apple Silicon: edit, compile and
simulate VHDL, then inspect waveforms — without a VM or Rosetta.

## Goals
- Project = a folder; list `.vhd`/`.vhdl`, tag design vs testbench (entity without ports or `*_tb`).
- Monaco editor with VHDL highlighting, line numbers, Cmd+S save, inline error markers.
- Compile (GHDL `-a`, dependency-ordered) with a Transcript console showing `file:line:col` errors, clickable.
- Simulate: choose top entity, `run <time>` or `run all`; ModelSim-like command line in the Transcript.
- Waveform viewer (Canvas): signals incl. internal ones, zoom/fit, two cursors with delta, radix per bus
  (bin, hex, unsigned, signed), add/remove signals, `.vcd` loading (also arbitrary external files).

## Non-goals (v1)
- `.ghw` parsing (VCD covers it; GHW may come later), Verilog, mixed-language, code signing/DMG.

## Approaches
1. **Electron + React/TS + Vite (chosen)** — Node already installed; full control over a Canvas waveform; trivial process spawning.
2. Tauri + React — smaller binary, but requires installing Rust (~1 GB) for no real gain here.
3. PyQt6 — workable, but custom waveform rendering is slower to iterate and less fluid.

## Architecture
- `electron/main.ts`: window, IPC handlers: open folder, list/read/write files, compile, elaborate+run, read VCD.
- `electron/ghdl.ts`: locate ghdl (PATH, /opt/homebrew/bin), work dir `<project>/.vhdlsim/work`, `--std=08`,
  dependency ordering by scanning `entity`/`package` declarations and uses, diagnostics parsing.
- `src/lib/vcd.ts`: VCD parser → signals with scope path, width, change lists.
- `src/components`: ProjectPanel, Editor (Monaco + VHDL Monarch grammar), Transcript, Waveform.

## Builder calls
- VHDL-2008 default with fallback option to 93c in settings dropdown.
- Ordering: iterative analysis (retry failed files until no progress) — robust without a full parser.
