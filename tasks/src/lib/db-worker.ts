import { initWorker } from "betterbase/db/worker";
import { lists } from "./collections.js";

initWorker([lists]);
