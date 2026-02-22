import { initOpfsWorker } from "@betterbase/sdk/db/worker";
import { conversations, messages } from "./collections.js";

initOpfsWorker([conversations, messages]);
