import { initOpfsWorker } from "@betterbase/sdk/db/worker";
import { albums, photos } from "./collections.js";

initOpfsWorker([albums, photos]);
