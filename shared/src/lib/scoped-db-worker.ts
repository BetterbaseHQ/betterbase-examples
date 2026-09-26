// Test-fixture worker for scoped-app-db.test.ts — must register the same
// collection (name + shape) as the test's `raceItems` definition.
import { collection, t } from "betterbase/db";
import { initWorker } from "betterbase/db/worker";

initWorker([collection("race_items").v(1, { name: t.string() }).build()]);
