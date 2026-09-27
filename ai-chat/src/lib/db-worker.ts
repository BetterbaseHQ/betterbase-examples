import { initWorker } from "betterbase/db/worker";
import { threads, messages } from "./collections.js";

initWorker([threads, messages]);
