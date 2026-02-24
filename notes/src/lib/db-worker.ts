import { initWorker } from "betterbase/db/worker";
import { notebooks, notes } from "./collections.js";

initWorker([notebooks, notes]);
