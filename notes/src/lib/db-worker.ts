import { initOpfsWorker } from "@betterbase/sdk/db/worker";
import { notebooks, notes } from "./collections.js";

initOpfsWorker([notebooks, notes]);
