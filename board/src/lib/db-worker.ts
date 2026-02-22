import { initOpfsWorker } from "@betterbase/sdk/db/worker";
import { boards, cards } from "./collections.js";

initOpfsWorker([boards, cards]);
