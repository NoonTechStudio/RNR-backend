import Location from "../models/Location.js"; 
import LocationImage from "../models/LocationImage.js";
import PoolParty from "../models/poolParty.js";

// Create Location Adding Logic
export const createLocation = async (req, res) => {
  try {
    const {
      poolPartyType,
      sharedPoolPartyId,
      createNewSharedPool,
      createNewPrivatePool,
      newPrivatePoolData,
      newSharedPoolData,
      locationFoodPackagePrices,
      selectedFoodPackagesForPoolParty, // Extract from request body
      ...locationData
    } = req.body;

    console.log('=== CREATE LOCATION DEBUG ===');
    console.log('Request body keys:', Object.keys(req.body));
    console.log('poolPartyType:', poolPartyType);
    console.log('createNewSharedPool:', createNewSharedPool);
    console.log('newSharedPoolData exists:', !!newSharedPoolData);
    console.log('newSharedPoolData.selectedFoodPackages:', newSharedPoolData?.selectedFoodPackages);
    console.log('selectedFoodPackagesForPoolParty:', selectedFoodPackagesForPoolParty);
    console.log('Location name:', locationData.name);
    console.log('Location food packages count:', locationData.pricing?.foodPackages?.length || 0);
    console.log('=== END DEBUG ===');

    // Process food packages if provided
    if (locationData.pricing?.foodPackages && Array.isArray(locationData.pricing.foodPackages)) {
      locationData.pricing.foodPackages = locationData.pricing.foodPackages.map((pkg, index) => ({
        name: pkg.name || "Food Package",
        description: pkg.description || "",
        pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
        pricePerKid: parseFloat(pkg.pricePerKid) || 0,
        isActive: pkg.isActive !== false,
        // Add unique identifier for referencing in pool party
        packageId: pkg.packageId || `pkg_${Date.now()}_${index}`
      }));
    } else {
      // Initialize empty food packages array if not provided
      locationData.pricing = {
        ...locationData.pricing,
        foodPackages: []
      };
    }

    // Create location first
    const location = new Location(locationData);
    await location.save();

    // Handle pool party configuration
    if (poolPartyType && poolPartyType !== 'none') {
      let updateData = {
        'poolPartyConfig.hasPoolParty': true,
        'poolPartyConfig.poolPartyType': poolPartyType,
        'poolPartyConfig.isConfirmedForPoolPartyBooking': true
      };

      // ========== FIX: Handle SHARED pool parties ==========
      if (poolPartyType === 'shared') {
        if (createNewSharedPool && newSharedPoolData) {
          // Process timings from newSharedPoolData
          const timings = (newSharedPoolData.timings || []).map(timing => ({
            session: timing.session,
            startTime: timing.startTime,
            endTime: timing.endTime,
            capacity: parseInt(timing.capacity) || 0,
            pricing: {
              perAdult: parseFloat(timing.pricing?.perAdult) || 0,
              perKid: parseFloat(timing.pricing?.perKid) || 0
            }
          }));
          
          // ✅ CRITICAL FIX: Get selectedFoodPackages from multiple sources
          let selectedFoodPackages = [];
          
          // First priority: selectedFoodPackagesForPoolParty from request body
          if (selectedFoodPackagesForPoolParty && Array.isArray(selectedFoodPackagesForPoolParty)) {
            selectedFoodPackages = selectedFoodPackagesForPoolParty
              .filter(pkg => pkg.selected === true || pkg.selected === undefined)
              .map(pkg => ({
                foodPackageId: pkg.foodPackageId || pkg.packageId || pkg._id || pkg.name,
                name: pkg.name || "Food Package",
                pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
                pricePerKid: parseFloat(pkg.pricePerKid) || 0
              }));
            console.log('Using selectedFoodPackagesForPoolParty:', selectedFoodPackages.length);
          }
          // Second priority: newSharedPoolData.selectedFoodPackages
          else if (newSharedPoolData.selectedFoodPackages && Array.isArray(newSharedPoolData.selectedFoodPackages)) {
            selectedFoodPackages = newSharedPoolData.selectedFoodPackages
              .filter(pkg => pkg.selected === true || pkg.selected === undefined)
              .map(pkg => ({
                foodPackageId: pkg.foodPackageId || pkg.packageId || pkg._id || pkg.name,
                name: pkg.name || "Food Package",
                pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
                pricePerKid: parseFloat(pkg.pricePerKid) || 0
              }));
            console.log('Using newSharedPoolData.selectedFoodPackages:', selectedFoodPackages.length);
          }
          // Third priority: Use all location's active food packages
          else if (locationData.pricing?.foodPackages && locationData.pricing.foodPackages.length > 0) {
            selectedFoodPackages = locationData.pricing.foodPackages
              .filter(pkg => pkg.isActive !== false)
              .map(pkg => ({
                foodPackageId: pkg.packageId || pkg.name,
                name: pkg.name,
                pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
                pricePerKid: parseFloat(pkg.pricePerKid) || 0
              }));
            console.log('Using location food packages as default:', selectedFoodPackages.length);
          }
          
          console.log('Final selectedFoodPackages for new pool party:', {
            count: selectedFoodPackages.length,
            packages: selectedFoodPackages.map(p => ({
              name: p.name,
              pricePerAdult: p.pricePerAdult,
              pricePerKid: p.pricePerKid
            }))
          });

          const newPoolParty = new PoolParty({
            name: newSharedPoolData.name || `${location.name} Shared Pool`,
            type: 'shared',
            description: newSharedPoolData.description || '',
            locationName: newSharedPoolData.locationName || location.name,
            sharedLocations: [location._id],
            timings: timings,
            selectedFoodPackages: selectedFoodPackages, // ✅ Now properly saved
            isActive: true
          });

          await newPoolParty.save();

          console.log('✅ New shared pool party created:', {
            name: newPoolParty.name,
            timingsCount: newPoolParty.timings.length,
            selectedFoodPackagesCount: newPoolParty.selectedFoodPackages.length,
            selectedFoodPackages: newPoolParty.selectedFoodPackages
          });

          updateData['poolPartyConfig.sharedPoolPartyId'] = newPoolParty._id;
          updateData['poolPartyConfig.privatePoolPartyId'] = null;
          updateData['poolPartyConfig.isSharedPoolCreatedFromHere'] = true;
          updateData['poolPartyConfig.isConfirmedForPoolPartyBooking'] = true;
        }
        else if (sharedPoolPartyId) {
          // CASE 2: Use existing shared pool party
          const existingPool = await PoolParty.findById(sharedPoolPartyId);
          if (!existingPool || existingPool.type !== 'shared') {
            return res.status(400).json({ error: "Invalid shared pool party" });
          }
          
          // Add location to shared pool's locations
          if (!existingPool.sharedLocations.includes(location._id)) {
            existingPool.sharedLocations.push(location._id);
            await existingPool.save();
          }
          
          updateData['poolPartyConfig.sharedPoolPartyId'] = sharedPoolPartyId;
          updateData['poolPartyConfig.privatePoolPartyId'] = null;
          updateData['poolPartyConfig.isSharedPoolCreatedFromHere'] = false;
          updateData['poolPartyConfig.isConfirmedForPoolPartyBooking'] = true;
        } else {
          // No shared pool selected and not creating new one
          updateData['poolPartyConfig.sharedPoolPartyId'] = null;
          updateData['poolPartyConfig.privatePoolPartyId'] = null;
          updateData['poolPartyConfig.isSharedPoolCreatedFromHere'] = false;
          updateData['poolPartyConfig.isConfirmedForPoolPartyBooking'] = false;
        }
      } 
      else if (poolPartyType === 'private' && createNewPrivatePool) {
  // Create new private pool party WITH timings and food packages
  const timings = (newPrivatePoolData?.timings || []).map(timing => ({
    session: timing.session,
    startTime: timing.startTime,
    endTime: timing.endTime,
    capacity: parseInt(timing.capacity) || 0,
    pricing: {
      perAdult: parseFloat(timing.pricing?.perAdult) || 0,
      perKid: parseFloat(timing.pricing?.perKid) || 0
    }
  }));
  
  // Get selected food packages for private pool
  let selectedFoodPackages = [];
  if (newPrivatePoolData?.selectedFoodPackages && Array.isArray(newPrivatePoolData.selectedFoodPackages)) {
    selectedFoodPackages = newPrivatePoolData.selectedFoodPackages
      .filter(pkg => pkg.selected === true || pkg.selected === undefined)
      .map(pkg => ({
        foodPackageId: pkg.foodPackageId || pkg.packageId || pkg._id || pkg.name,
        name: pkg.name || "Food Package",
        pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
        pricePerKid: parseFloat(pkg.pricePerKid) || 0
      }));
  } else if (locationData.pricing?.foodPackages && locationData.pricing.foodPackages.length > 0) {
    // Use all active location food packages as default
    selectedFoodPackages = locationData.pricing.foodPackages
      .filter(pkg => pkg.isActive !== false)
      .map(pkg => ({
        foodPackageId: pkg.packageId || pkg.name,
        name: pkg.name,
        pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
        pricePerKid: parseFloat(pkg.pricePerKid) || 0
      }));
  }
  
  const newPoolParty = new PoolParty({
    name: newPrivatePoolData?.name || `${location.name} Private Pool`,
    type: 'private',
    description: newPrivatePoolData?.description || '',
    locationId: location._id,
    locationName: location.name,
    timings: timings,
    selectedFoodPackages: selectedFoodPackages,
    isActive: true
  });
  
  await newPoolParty.save();
  
  updateData['poolPartyConfig.privatePoolPartyId'] = newPoolParty._id;
  updateData['poolPartyConfig.isPrivatePoolCreatedFromHere'] = true;
  updateData['poolPartyConfig.sharedPoolPartyId'] = null;
  updateData['poolPartyConfig.isConfirmedForPoolPartyBooking'] = true;
      }

      // Update location with pool party config
      await Location.findByIdAndUpdate(location._id, updateData);
      
      // Reload location with updated config
      const updatedLocation = await Location.findById(location._id);
      return res.status(201).json(updatedLocation);
    }

    // If no pool party, set default config
    if (poolPartyType === 'none' || !poolPartyType) {
      await Location.findByIdAndUpdate(location._id, {
        'poolPartyConfig.hasPoolParty': false,
        'poolPartyConfig.poolPartyType': 'none',
        'poolPartyConfig.sharedPoolPartyId': null,
        'poolPartyConfig.privatePoolPartyId': null,
        'poolPartyConfig.isConfirmedForPoolPartyBooking': false
      });
      
      const updatedLocation = await Location.findById(location._id);
      return res.status(201).json(updatedLocation);
    }

    res.status(201).json(location);
  } catch (err) {
    console.error('Create location error:', err);
    res.status(400).json({ error: err.message });
  }
};

// Update Location
export const updateLocation = async (req, res) => {
  try {
    const {
      poolPartyType,
      sharedPoolPartyId,
      createNewSharedPool,
      createNewPrivatePool,
      newPrivatePoolData,
      newSharedPoolData,
      isSharedPoolCreatedFromHere,
      ...locationData
    } = req.body;

    let location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    // Process food packages if provided
    if (locationData.pricing?.foodPackages !== undefined) {
      if (Array.isArray(locationData.pricing.foodPackages)) {
        locationData.pricing.foodPackages = locationData.pricing.foodPackages.map((pkg, index) => ({
          name: pkg.name || `Food Package ${index + 1}`,
          description: pkg.description || "",
          pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
          pricePerKid: parseFloat(pkg.pricePerKid) || 0,
          isActive: pkg.isActive !== false,
          packageId: pkg.packageId || `pkg_${Date.now()}_${index}`
        }));
      } else {
        locationData.pricing.foodPackages = [];
      }
    }

    Object.assign(location, locationData);

    // Store old pool party IDs to detect changes
    const oldPrivateId = location.poolPartyConfig?.privatePoolPartyId;
    const oldSharedId = location.poolPartyConfig?.sharedPoolPartyId;

    // Handle pool party configuration if provided
    if (poolPartyType !== undefined) {
      let updateData = {};

      if (poolPartyType === 'none') {
        updateData = {
          'poolPartyConfig.hasPoolParty': false,
          'poolPartyConfig.poolPartyType': 'none',
          'poolPartyConfig.sharedPoolPartyId': null,
          'poolPartyConfig.privatePoolPartyId': null,
          'poolPartyConfig.isSharedPoolCreatedFromHere': false,
          'poolPartyConfig.isPrivatePoolCreatedFromHere': false,
          'poolPartyConfig.isConfirmedForPoolPartyBooking': false
        };

        // Directly update the location object
        location.poolPartyConfig = {
          hasPoolParty: false,
          poolPartyType: 'none',
          sharedPoolPartyId: null,
          privatePoolPartyId: null,
          isSharedPoolCreatedFromHere: false,
          isPrivatePoolCreatedFromHere: false,
          isConfirmedForPoolPartyBooking: false
        };

        // Remove location from any shared pool parties
        if (oldSharedId) {
          await PoolParty.findByIdAndUpdate(
            oldSharedId,
            { $pull: { sharedLocations: location._id } }
          );
        }
        // Delete old private pool party if it exists and was created by this location
        if (oldPrivateId && location.poolPartyConfig?.isPrivatePoolCreatedFromHere) {
          await PoolParty.findByIdAndDelete(oldPrivateId);
        }
      } 
      else if (poolPartyType === 'shared') {
        // --- SHARED POOL HANDLING (including private to shared conversion) ---
        
        // First, handle the case where we're coming from a private pool
        if (oldPrivateId && !oldSharedId) {
          // We're switching from private to shared
          console.log('Switching from private to shared');
          
          // Delete the old private pool if this location created it
          if (location.poolPartyConfig?.isPrivatePoolCreatedFromHere) {
            await PoolParty.findByIdAndDelete(oldPrivateId);
            console.log('Deleted private pool:', oldPrivateId);
          }
        }

        if (sharedPoolPartyId) {
          // Use existing shared pool (assigned from another location)
          const sharedPool = await PoolParty.findById(sharedPoolPartyId);
          if (!sharedPool || sharedPool.type !== 'shared') {
            return res.status(400).json({ error: "Invalid shared pool party" });
          }
          
          // Add this location to the shared pool's sharedLocations
          if (!sharedPool.sharedLocations.includes(location._id)) {
            sharedPool.sharedLocations.push(location._id);
            await sharedPool.save();
          }
          
          // Remove from old shared pool if different
          if (oldSharedId && oldSharedId.toString() !== sharedPoolPartyId.toString()) {
            await PoolParty.findByIdAndUpdate(
              oldSharedId,
              { $pull: { sharedLocations: location._id } }
            );
          }

          updateData = {
            'poolPartyConfig.hasPoolParty': true,
            'poolPartyConfig.poolPartyType': 'shared',
            'poolPartyConfig.sharedPoolPartyId': sharedPoolPartyId,
            'poolPartyConfig.privatePoolPartyId': null,
            'poolPartyConfig.isSharedPoolCreatedFromHere': false,
            'poolPartyConfig.isPrivatePoolCreatedFromHere': false,
            'poolPartyConfig.isConfirmedForPoolPartyBooking': true
          };

          // Directly update the location object
          location.poolPartyConfig = {
            hasPoolParty: true,
            poolPartyType: 'shared',
            sharedPoolPartyId: sharedPoolPartyId,
            privatePoolPartyId: null,
            isSharedPoolCreatedFromHere: false,
            isPrivatePoolCreatedFromHere: false,
            isConfirmedForPoolPartyBooking: true
          };
        } 
        else if (createNewSharedPool && newSharedPoolData) {
          // Create new shared pool party
          const timings = (newSharedPoolData.timings || []).map(timing => ({
            session: timing.session,
            startTime: timing.startTime,
            endTime: timing.endTime,
            capacity: parseInt(timing.capacity) || 0,
            pricing: {
              perAdult: parseFloat(timing.pricing?.perAdult) || 0,
              perKid: parseFloat(timing.pricing?.perKid) || 0
            }
          }));

          // Get selected food packages
          let selectedFoodPackages = [];
          if (newSharedPoolData.selectedFoodPackages && Array.isArray(newSharedPoolData.selectedFoodPackages)) {
            selectedFoodPackages = newSharedPoolData.selectedFoodPackages
              .filter(pkg => pkg.selected === true || pkg.selected === undefined)
              .map(pkg => ({
                foodPackageId: pkg.foodPackageId || pkg.packageId || pkg._id || pkg.name,
                name: pkg.name || "Food Package",
                pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
                pricePerKid: parseFloat(pkg.pricePerKid) || 0
              }));
          } else if (location.pricing?.foodPackages && location.pricing.foodPackages.length > 0) {
            selectedFoodPackages = location.pricing.foodPackages
              .filter(pkg => pkg.isActive !== false)
              .map(pkg => ({
                foodPackageId: pkg.packageId || pkg.name,
                name: pkg.name,
                pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
                pricePerKid: parseFloat(pkg.pricePerKid) || 0
              }));
          }

          // Check if we already have an existing shared pool party for this location
          if (oldSharedId) {
            // UPDATE the existing shared pool party
            await PoolParty.findByIdAndUpdate(oldSharedId, {
              name: newSharedPoolData.name || `${location.name} Shared Pool`,
              description: newSharedPoolData.description || '',
              locationName: newSharedPoolData.locationName || location.name,
              timings: timings,
              selectedFoodPackages: selectedFoodPackages,
              updatedAt: new Date()
            });

            updateData = {
              'poolPartyConfig.hasPoolParty': true,
              'poolPartyConfig.poolPartyType': 'shared',
              'poolPartyConfig.sharedPoolPartyId': oldSharedId,
              'poolPartyConfig.privatePoolPartyId': null,
              'poolPartyConfig.isSharedPoolCreatedFromHere': true,
              'poolPartyConfig.isPrivatePoolCreatedFromHere': false,
              'poolPartyConfig.isConfirmedForPoolPartyBooking': true
            };

            // Directly update the location object
            location.poolPartyConfig = {
              hasPoolParty: true,
              poolPartyType: 'shared',
              sharedPoolPartyId: oldSharedId,
              privatePoolPartyId: null,
              isSharedPoolCreatedFromHere: true,
              isPrivatePoolCreatedFromHere: false,
              isConfirmedForPoolPartyBooking: true
            };
          } else {
            // No existing shared pool – create a new one
            const newPoolParty = new PoolParty({
              name: newSharedPoolData.name || `${location.name} Shared Pool`,
              type: 'shared',
              description: newSharedPoolData.description || '',
              locationName: newSharedPoolData.locationName || location.name,
              sharedLocations: [location._id],
              timings: timings,
              selectedFoodPackages: selectedFoodPackages,
              isActive: true
            });
            
            await newPoolParty.save();

            updateData = {
              'poolPartyConfig.hasPoolParty': true,
              'poolPartyConfig.poolPartyType': 'shared',
              'poolPartyConfig.sharedPoolPartyId': newPoolParty._id,
              'poolPartyConfig.privatePoolPartyId': null,
              'poolPartyConfig.isSharedPoolCreatedFromHere': true,
              'poolPartyConfig.isPrivatePoolCreatedFromHere': false,
              'poolPartyConfig.isConfirmedForPoolPartyBooking': true
            };

            // Directly update the location object
            location.poolPartyConfig = {
              hasPoolParty: true,
              poolPartyType: 'shared',
              sharedPoolPartyId: newPoolParty._id,
              privatePoolPartyId: null,
              isSharedPoolCreatedFromHere: true,
              isPrivatePoolCreatedFromHere: false,
              isConfirmedForPoolPartyBooking: true
            };
          }
        } else {
          // No shared pool selected and not creating new one → treat as none
          updateData = {
            'poolPartyConfig.hasPoolParty': false,
            'poolPartyConfig.poolPartyType': 'none',
            'poolPartyConfig.sharedPoolPartyId': null,
            'poolPartyConfig.privatePoolPartyId': null,
            'poolPartyConfig.isSharedPoolCreatedFromHere': false,
            'poolPartyConfig.isPrivatePoolCreatedFromHere': false,
            'poolPartyConfig.isConfirmedForPoolPartyBooking': false
          };

          // Directly update the location object
          location.poolPartyConfig = {
            hasPoolParty: false,
            poolPartyType: 'none',
            sharedPoolPartyId: null,
            privatePoolPartyId: null,
            isSharedPoolCreatedFromHere: false,
            isPrivatePoolCreatedFromHere: false,
            isConfirmedForPoolPartyBooking: false
          };

          // Remove from existing shared pool if any
          if (oldSharedId) {
            await PoolParty.findByIdAndUpdate(
              oldSharedId,
              { $pull: { sharedLocations: location._id } }
            );
          }
          // Delete old private pool if it existed
          if (oldPrivateId && location.poolPartyConfig?.isPrivatePoolCreatedFromHere) {
            await PoolParty.findByIdAndDelete(oldPrivateId);
          }
        }
      } 
      else if (poolPartyType === 'private' && createNewPrivatePool) {
        // --- PRIVATE POOL HANDLING (shared to private conversion) ---

        // Prepare timings and food packages from frontend
        const timings = (newPrivatePoolData?.timings || []).map(timing => ({
          session: timing.session,
          startTime: timing.startTime,
          endTime: timing.endTime,
          capacity: parseInt(timing.capacity) || 0,
          pricing: {
            perAdult: parseFloat(timing.pricing?.perAdult) || 0,
            perKid: parseFloat(timing.pricing?.perKid) || 0
          }
        }));

        let selectedFoodPackages = [];
        if (newPrivatePoolData?.selectedFoodPackages && Array.isArray(newPrivatePoolData.selectedFoodPackages)) {
          selectedFoodPackages = newPrivatePoolData.selectedFoodPackages
            .filter(pkg => pkg.selected === true || pkg.selected === undefined)
            .map(pkg => ({
              foodPackageId: pkg.foodPackageId || pkg.packageId || pkg._id || pkg.name,
              name: pkg.name || "Food Package",
              pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
              pricePerKid: parseFloat(pkg.pricePerKid) || 0
            }));
        } else if (location.pricing?.foodPackages && location.pricing.foodPackages.length > 0) {
          selectedFoodPackages = location.pricing.foodPackages
            .filter(pkg => pkg.isActive !== false)
            .map(pkg => ({
              foodPackageId: pkg.packageId || pkg.name,
              name: pkg.name,
              pricePerAdult: parseFloat(pkg.pricePerAdult) || 0,
              pricePerKid: parseFloat(pkg.pricePerKid) || 0
            }));
        }

        // --- LOGIC: Handle shared to private conversion ---
        let privatePoolId = oldPrivateId;
        let isPrivatePoolCreatedFromHere = true;

        // If we are switching from shared to private
        if (oldSharedId && !oldPrivateId) {
          const sharedPool = await PoolParty.findById(oldSharedId);
          if (sharedPool && sharedPool.type === 'shared') {
            
            // Get all locations currently using this shared pool
            const otherLocations = sharedPool.sharedLocations.filter(
              locId => locId.toString() !== location._id.toString()
            );
            
            console.log(`Found ${otherLocations.length} other locations using this shared pool:`, otherLocations);
            
            // Update all other locations to remove pool party
            if (otherLocations.length > 0) {
              await Location.updateMany(
                { _id: { $in: otherLocations } },
                { 
                  $set: {
                    'poolPartyConfig.hasPoolParty': false,
                    'poolPartyConfig.poolPartyType': 'none',
                    'poolPartyConfig.sharedPoolPartyId': null,
                    'poolPartyConfig.privatePoolPartyId': null,
                    'poolPartyConfig.isSharedPoolCreatedFromHere': false,
                    'poolPartyConfig.isPrivatePoolCreatedFromHere': false,
                    'poolPartyConfig.isConfirmedForPoolPartyBooking': false
                  }
                }
              );
              console.log(`Updated ${otherLocations.length} locations to remove pool party`);
            }

            // Check if this location is the creator or just a user
            if (location.poolPartyConfig?.isSharedPoolCreatedFromHere) {
              // This location CREATED the shared pool
              if (sharedPool.sharedLocations.length === 1 || otherLocations.length === 0) {
                // Reuse the shared pool document – turn it into a private pool
                sharedPool.type = 'private';
                sharedPool.locationId = location._id;
                sharedPool.locationName = location.name;
                sharedPool.sharedLocations = [];
                sharedPool.timings = timings;
                sharedPool.selectedFoodPackages = selectedFoodPackages;
                sharedPool.updatedAt = new Date();
                await sharedPool.save();

                privatePoolId = sharedPool._id;
                isPrivatePoolCreatedFromHere = true;
                
                console.log('Reused shared pool as private pool:', privatePoolId);
              } else {
                // Delete the old shared pool
                await PoolParty.findByIdAndDelete(oldSharedId);
                console.log('Deleted old shared pool:', oldSharedId);
              }
            } else {
              // This location was just using the shared pool
              await PoolParty.findByIdAndUpdate(
                oldSharedId,
                { $pull: { sharedLocations: location._id } }
              );
              console.log('Removed location from shared pool');
            }
          }
        }

        // If we don't have a private pool ID yet, create a new one
        if (!privatePoolId) {
          const newPoolParty = new PoolParty({
            name: newPrivatePoolData?.name || `${location.name} Private Pool`,
            type: 'private',
            description: newPrivatePoolData?.description || '',
            locationId: location._id,
            locationName: location.name,
            timings: timings,
            selectedFoodPackages: selectedFoodPackages,
            isActive: true
          });
          await newPoolParty.save();
          privatePoolId = newPoolParty._id;
          isPrivatePoolCreatedFromHere = true;
          console.log('Created new private pool:', privatePoolId);
        }

        // FINAL CLEANUP: Remove from any other shared pools (safety)
        await PoolParty.updateMany(
          { 
            type: 'shared', 
            sharedLocations: location._id,
            _id: { $ne: privatePoolId }
          },
          { $pull: { sharedLocations: location._id } }
        );

        // Delete any old private pool if it exists and is different
        if (oldPrivateId && oldPrivateId.toString() !== privatePoolId.toString()) {
          await PoolParty.findByIdAndDelete(oldPrivateId);
          console.log('Deleted old private pool:', oldPrivateId);
        }

        // Update the current location's pool party config
        updateData = {
          'poolPartyConfig.hasPoolParty': true,
          'poolPartyConfig.poolPartyType': 'private',
          'poolPartyConfig.privatePoolPartyId': privatePoolId,
          'poolPartyConfig.sharedPoolPartyId': null,
          'poolPartyConfig.isSharedPoolCreatedFromHere': false,
          'poolPartyConfig.isPrivatePoolCreatedFromHere': isPrivatePoolCreatedFromHere,
          'poolPartyConfig.isConfirmedForPoolPartyBooking': true
        };

        // Directly update the location object
        location.poolPartyConfig = {
          hasPoolParty: true,
          poolPartyType: 'private',
          privatePoolPartyId: privatePoolId,
          sharedPoolPartyId: null,
          isSharedPoolCreatedFromHere: false,
          isPrivatePoolCreatedFromHere: isPrivatePoolCreatedFromHere,
          isConfirmedForPoolPartyBooking: true
        };
        
        console.log('Updated location pool party config to private');
      }

      // Apply updates to location (only if updateData is not empty)
      if (Object.keys(updateData).length > 0) {
        Object.assign(location, updateData);
      }
    }

    await location.save();

    // Return populated location
    let populatedLocation = location.toObject();

    // Populate pool party details based on the current config
    if (location.poolPartyConfig?.hasPoolParty) {
      let poolPartyId = null;
      if (location.poolPartyConfig.poolPartyType === 'shared') {
        poolPartyId = location.poolPartyConfig.sharedPoolPartyId;
      } else if (location.poolPartyConfig.poolPartyType === 'private') {
        poolPartyId = location.poolPartyConfig.privatePoolPartyId;
      }
      
      if (poolPartyId) {
        const poolParty = await PoolParty.findById(poolPartyId)
          .select('name description selectedFoodPackages timings totalCapacity type locationId sharedLocations');
        populatedLocation.poolPartyDetails = poolParty;
      }
    }

    res.json(populatedLocation);
  } catch (err) {
    console.error('Update location error:', err);
    res.status(400).json({ error: err.message });
  }
};

// Get all Locations

export const getLocations = async (req, res) => {
  try {
    const locations = await Location.aggregate([
      {
        $lookup: {
          from: "locationimages",                 // MongoDB collection name (lowercase plural)
          let: { locId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$location", "$$locId"] } } },
            { $project: { images: 1, _id: 0 } }   // only take the images array
          ],
          as: "imageInfo"
        }
      },
      {
        $addFields: {
          images: {
            $cond: {
              if: { $gt: [{ $size: "$imageInfo" }, 0] },
              then: { $arrayElemAt: ["$imageInfo.images", 0] }, // extract the images array
              else: []                                            // fallback to empty array
            }
          }
        }
      },
      {
        $project: { imageInfo: 0 }                 // remove temporary field
      }
    ]);

    res.json(locations);
  } catch (err) {
    console.error('Error in getLocations:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get single Location with images
export const getLocationById = async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) return res.status(404).json({ error: "Location not found" });

    const images = await LocationImage.findOne({ location: req.params.id });

    let poolPartyDetails = null;
    if (location.poolPartyConfig?.hasPoolParty) {
      if (location.poolPartyConfig.poolPartyType === 'shared' && location.poolPartyConfig.sharedPoolPartyId) {
        poolPartyDetails = await PoolParty.findById(location.poolPartyConfig.sharedPoolPartyId)
          .select('name description selectedFoodPackages timings totalCapacity');
      } else if (location.poolPartyConfig.poolPartyType === 'private' && location.poolPartyConfig.privatePoolPartyId) {
        poolPartyDetails = await PoolParty.findById(location.poolPartyConfig.privatePoolPartyId)
          .select('name description selectedFoodPackages timings totalCapacity');
      }
    }

    res.json({
      ...location.toObject(),
      images: images ? images.images : [],
      poolPartyDetails
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;

    // First, find the location to check its pool party config
    const location = await Location.findById(id);
    
    if (!location) {
      return res.status(404).json({
        success: false,
        error: "Location not found",
      });
    }

    // Check if this location has a pool party and is the creator
    if (location.poolPartyConfig?.hasPoolParty) {
      const { poolPartyType, isSharedPoolCreatedFromHere, isPrivatePoolCreatedFromHere, sharedPoolPartyId, privatePoolPartyId } = location.poolPartyConfig;
      
      // For shared pool - only delete if this location created it
      if (poolPartyType === 'shared' && isSharedPoolCreatedFromHere && sharedPoolPartyId) {
        const sharedPool = await PoolParty.findById(sharedPoolPartyId);
        
        if (sharedPool) {
          // Get all other locations using this shared pool
          const otherLocations = sharedPool.sharedLocations.filter(
            locId => locId.toString() !== id.toString()
          );
          
          if (otherLocations.length > 0) {
            // Update other locations to remove pool party
            await Location.updateMany(
              { _id: { $in: otherLocations } },
              { 
                $set: {
                  'poolPartyConfig.hasPoolParty': false,
                  'poolPartyConfig.poolPartyType': 'none',
                  'poolPartyConfig.sharedPoolPartyId': null,
                  'poolPartyConfig.privatePoolPartyId': null,
                  'poolPartyConfig.isSharedPoolCreatedFromHere': false,
                  'poolPartyConfig.isPrivatePoolCreatedFromHere': false,
                  'poolPartyConfig.isConfirmedForPoolPartyBooking': false
                }
              }
            );
            console.log(`Updated ${otherLocations.length} locations to remove pool party`);
          }
          
          // Delete the shared pool
          await PoolParty.findByIdAndDelete(sharedPoolPartyId);
          console.log(`Deleted shared pool ${sharedPoolPartyId} created by location ${id}`);
        }
      }
      
      // For private pool - only delete if this location created it
      else if (poolPartyType === 'private' && isPrivatePoolCreatedFromHere && privatePoolPartyId) {
        await PoolParty.findByIdAndDelete(privatePoolPartyId);
        console.log(`Deleted private pool ${privatePoolPartyId} created by location ${id}`);
      }
      
      // If location is just using a shared pool (not creator), just remove it from sharedLocations
      else if (poolPartyType === 'shared' && !isSharedPoolCreatedFromHere && sharedPoolPartyId) {
        await PoolParty.findByIdAndUpdate(
          sharedPoolPartyId,
          { $pull: { sharedLocations: id } }
        );
        console.log(`Removed location ${id} from shared pool ${sharedPoolPartyId}`);
      }
    }

    // Now delete the location
    await Location.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Location deleted successfully",
    });
  } catch (err) {
    console.error("Delete location error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getSharedPoolParties = async (req, res) => {
  try {
    const poolParties = await PoolParty.find({ 
      type: 'shared',
      isActive: true 
    }).select('name locationName timings totalCapacity sharedLocations selectedFoodPackages');
    
    res.json({
      success: true,
      poolParties
    });
  } catch (error) {
    console.error('Get shared pool parties error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Assign pool party to location
export const assignPoolPartyToLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { poolPartyType, sharedPoolPartyId, createNewPrivatePool } = req.body;
    
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }
    
    let updateData = {
      'poolPartyConfig.hasPoolParty': poolPartyType !== 'none',
      'poolPartyConfig.poolPartyType': poolPartyType,
      'poolPartyConfig.isConfirmedForPoolPartyBooking': poolPartyType === 'shared' // Auto-confirm for shared pools
    };
    
    if (poolPartyType === 'shared' && sharedPoolPartyId) {
      const sharedPool = await PoolParty.findById(sharedPoolPartyId);
      if (!sharedPool || sharedPool.type !== 'shared') {
        return res.status(400).json({ error: "Invalid shared pool party" });
      }
      
      // FIX: Set all required fields
      updateData['poolPartyConfig.sharedPoolPartyId'] = sharedPoolPartyId;
      updateData['poolPartyConfig.privatePoolPartyId'] = null;
      updateData['poolPartyConfig.isSharedPoolCreatedFromHere'] = false;
      updateData['poolPartyConfig.isConfirmedForPoolPartyBooking'] = true;
      
      if (!sharedPool.sharedLocations.includes(location._id)) {
        sharedPool.sharedLocations.push(location._id);
        await sharedPool.save();
      }
    } 
    else if (poolPartyType === 'private') {
      if (createNewPrivatePool) {
        const newPoolParty = new PoolParty({
          name: `${location.name} Private Pool`,
          type: 'private',
          locationId: location._id,
          locationName: location.name,
          timings: []
        });
        await newPoolParty.save();
        
        updateData['poolPartyConfig.privatePoolPartyId'] = newPoolParty._id;
        updateData['poolPartyConfig.sharedPoolPartyId'] = null;
        updateData['poolPartyConfig.isConfirmedForPoolPartyBooking'] = true;
      }
    } 
    else if (poolPartyType === 'none') {
      updateData['poolPartyConfig.sharedPoolPartyId'] = null;
      updateData['poolPartyConfig.privatePoolPartyId'] = null;
      updateData['poolPartyConfig.isConfirmedForPoolPartyBooking'] = false;
      
      await PoolParty.updateMany(
        { type: 'shared', sharedLocations: location._id },
        { $pull: { sharedLocations: location._id } }
      );
    }
    
    const updatedLocation = await Location.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    res.json({
      success: true,
      message: "Pool party configuration updated",
      location: updatedLocation
    });
  } catch (error) {
    console.error('Assign pool party error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get pool party details for a location
export const getLocationPoolParty = async (req, res) => {
  try {
    const { id } = req.params;
    
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }
    
    let poolParty = null;
    if (location.poolPartyConfig?.hasPoolParty) {
      if (location.poolPartyConfig.poolPartyType === 'shared' && location.poolPartyConfig.sharedPoolPartyId) {
        poolParty = await PoolParty.findById(location.poolPartyConfig.sharedPoolPartyId)
          .populate('sharedLocations', 'name address')
          .select('name selectedFoodPackages timings totalCapacity locationName');
      } else if (location.poolPartyConfig.poolPartyType === 'private' && location.poolPartyConfig.privatePoolPartyId) {
        poolParty = await PoolParty.findById(location.poolPartyConfig.privatePoolPartyId);
      }
    }
    
    res.json({
      success: true,
      poolParty,
      config: location.poolPartyConfig
    });
  } catch (error) {
    console.error('Get location pool party error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const addLocationToPoolParty = async (req, res) => {
  try {
    const { id } = req.params;
    const { poolPartyId } = req.body;
    
    // Find location
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }
    
    // Find pool party
    const poolParty = await PoolParty.findById(poolPartyId);
    if (!poolParty || poolParty.type !== 'shared') {
      return res.status(400).json({ error: "Invalid shared pool party" });
    }
    
    // Add location to sharedLocations if not already there
    if (!poolParty.sharedLocations.includes(location._id)) {
      poolParty.sharedLocations.push(location._id);
      await poolParty.save();
    }
    
    // Update location's pool party config
    location.poolPartyConfig = {
      hasPoolParty: true,
      poolPartyType: 'shared',
      sharedPoolPartyId: poolParty._id,
      privatePoolPartyId: null,
      isSharedPoolCreatedFromHere: false,
      isConfirmedForPoolPartyBooking: true
    };
    
    await location.save();
    
    res.json({
      success: true,
      message: "Location added to shared pool party successfully",
      location,
      poolParty
    });
    
  } catch (error) {
    console.error('Add location to pool party error:', error);
    res.status(500).json({ error: error.message });
  }
};