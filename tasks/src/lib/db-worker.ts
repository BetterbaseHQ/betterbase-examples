import { initOpfsWorker } from "@betterbase/sdk/db/worker";
import { lists } from "./collections.js";

initOpfsWorker([lists]);
