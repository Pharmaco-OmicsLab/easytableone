// Phase 51 R1 / D105(c): Zod 4 probes `new Function("")` to decide whether it may JIT-compile
// object parsers. Under our Content-Security-Policy (no 'unsafe-eval') that probe is caught by
// Zod, but the browser still raises a `securitypolicyviolation` event. Declaring jitless mode up
// front skips the probe, so the page produces zero CSP violations. Parsing behaviour is unchanged
// (the non-JIT path is the one Zod already falls back to). Import this module FIRST in main.tsx so
// it runs before any schema is constructed.
import { z } from "zod";

z.config({ jitless: true });
