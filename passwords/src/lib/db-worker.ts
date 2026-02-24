import { initWorker } from "betterbase/db/worker";
import { entries } from "./collections.js";

initWorker([entries]);
