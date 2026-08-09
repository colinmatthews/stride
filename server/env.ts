import { config } from "dotenv";

// override:true so a locally-configured value in .env always wins over an
// ambient env var the surrounding dev tooling may already have set (e.g.
// some preview/proxy setups export PORT to match the frontend's port, which
// would otherwise collide with Vite here since both default to 5173).
// Must be imported (for its side effect) before any module that reads
// process.env at load time — ESM evaluates static imports in source order,
// so this has to be index.ts's first import.
config({ override: true });
