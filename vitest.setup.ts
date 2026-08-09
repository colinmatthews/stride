// Server-side tests import modules that read process.env.DB_URL etc. at
// import time (see server/db.ts), so .env must be loaded before any test
// file runs. Client-side tests don't need this but it's a no-op for them.
import "dotenv/config";
