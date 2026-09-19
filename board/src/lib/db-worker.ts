import { initWorker } from "betterbase/db/worker";
import { boards, columns, cards } from "./collections.js";

initWorker([boards, columns, cards]);
