// Keep /admin-free-test as a compatibility alias for the maintained implementation.
// The actual handler lives in ../free-admin-test/index.ts.
// This avoids drift where one route is fixed but the other still uses old logic.
import "../free-admin-test/index.ts";
