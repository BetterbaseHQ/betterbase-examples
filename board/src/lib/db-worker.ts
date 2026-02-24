import { initWorker } from "betterbase/db/worker";
import { boards, cards } from "./collections.js";

initWorker([boards, cards]);
