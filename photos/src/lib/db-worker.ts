import { initWorker } from "betterbase/db/worker";
import { albums, photos } from "./collections.js";

initWorker([albums, photos]);
