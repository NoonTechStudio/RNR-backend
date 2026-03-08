import express from "express";
import {
  createLocation,
  updateLocation,
  getLocations,
  deleteLocation,
  getLocationById,
  getSharedPoolParties,
  assignPoolPartyToLocation,
  getLocationPoolParty,
  addLocationToPoolParty
} from "../controllers/LocationController.js";

const router = express.Router();

// IMPORTANT: Define fixed routes BEFORE parameterised :id routes
router.get("/shared-pool-parties", getSharedPoolParties);

router.post("/", createLocation);
router.put("/:id", updateLocation);
router.get("/", getLocations);
router.get("/:id", getLocationById);
router.delete("/:id", deleteLocation);

router.put("/:id/pool-party", assignPoolPartyToLocation);
router.get("/:id/pool-party", getLocationPoolParty);

router.post('/:id/add-to-poolparty', addLocationToPoolParty);

export default router;
