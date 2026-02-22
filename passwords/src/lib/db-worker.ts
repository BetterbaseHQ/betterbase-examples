import { initOpfsWorker } from "@betterbase/sdk/db/worker";
import { entries } from "./collections.js";

initOpfsWorker([entries]);
