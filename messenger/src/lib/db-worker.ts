import { initWorker } from "betterbase/db/worker";
import { conversations, messages } from "./collections.js";

initWorker([conversations, messages]);
