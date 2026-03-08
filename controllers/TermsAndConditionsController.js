// controllers/TermsAndConditionsController.js
import TermsAndConditions from "../models/TermsAndConditions.js";
import Location from "../models/Location.js";
import PoolParty from "../models/poolParty.js";

// Create Terms and Conditions
export const createTerms = async (req, res) => {
  try {
    const {
      type,
      title,
      description,
      terms,
      appliedLocations,
      appliedPoolParties,
      applyToAll,
      status,
      effectiveFrom,
      effectiveUntil
    } = req.body;

    // Validate required fields
    if (!type || !title || !terms || !Array.isArray(terms)) {
      return res.status(400).json({
        success: false,
        error: "Type, title, and terms (array) are required"
      });
    }

    // Validate type
    if (!["location", "poolParty"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Type must be either 'location' or 'poolParty'"
      });
    }

    // Validate terms array
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      if (!term.pointNumber || !term.title || !term.description) {
        return res.status(400).json({
          success: false,
          error: `Term at index ${i} is missing required fields (pointNumber, title, description)`
        });
      }
    }

    // Validate applied items
    if (type === "location" && appliedLocations && appliedLocations.length > 0) {
      // Check if locations exist
      const locations = await Location.find({ _id: { $in: appliedLocations } });
      if (locations.length !== appliedLocations.length) {
        return res.status(400).json({
          success: false,
          error: "One or more locations not found"
        });
      }
    }

    if (type === "poolParty" && appliedPoolParties && appliedPoolParties.length > 0) {
      // Check if pool parties exist
      const poolParties = await PoolParty.find({ _id: { $in: appliedPoolParties } });
      if (poolParties.length !== appliedPoolParties.length) {
        return res.status(400).json({
          success: false,
          error: "One or more pool parties not found"
        });
      }
    }

    // Create terms and conditions
    const termsAndConditions = new TermsAndConditions({
      type,
      title,
      description,
      terms,
      appliedLocations: type === "location" ? appliedLocations || [] : [],
      appliedPoolParties: type === "poolParty" ? appliedPoolParties || [] : [],
      applyToAll: applyToAll || false,
      status: status || "draft",
      createdBy: req.user?._id,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveUntil: effectiveUntil ? new Date(effectiveUntil) : null
    });

    await termsAndConditions.save();

    res.status(201).json({
      success: true,
      message: "Terms and conditions created successfully",
      data: termsAndConditions
    });

  } catch (err) {
    console.error("Create terms error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Get all Terms and Conditions with filters
export const getAllTerms = async (req, res) => {
  try {
    const {
      type,
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    // Build query
    const query = {};

    if (type) query.type = type;
    if (status) query.status = status;
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "terms.title": { $regex: search, $options: "i" } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Execute query
    const terms = await TermsAndConditions.find(query)
      .populate("appliedLocations", "name address.city")
      .populate("appliedPoolParties", "name locationName")
      .populate("createdBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await TermsAndConditions.countDocuments(query);

    // Format response
    const formattedTerms = terms.map(term => ({
      ...term.toObject(),
      appliedToCount: term.type === "location" 
        ? term.appliedLocations.length
        : term.appliedPoolParties.length
    }));

    res.json({
      success: true,
      data: formattedTerms,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (err) {
    console.error("Get all terms error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Get single Terms and Conditions by ID
export const getTermsById = async (req, res) => {
  try {
    const { id } = req.params;

    const terms = await TermsAndConditions.findById(id)
      .populate("appliedLocations", "name address.city address.state")
      .populate("appliedPoolParties", "name locationName type")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!terms) {
      return res.status(404).json({
        success: false,
        error: "Terms and conditions not found"
      });
    }

    res.json({
      success: true,
      data: terms
    });

  } catch (err) {
    console.error("Get terms by ID error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Update Terms and Conditions
export const updateTerms = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Find existing terms
    const existingTerms = await TermsAndConditions.findById(id);
    if (!existingTerms) {
      return res.status(404).json({
        success: false,
        error: "Terms and conditions not found"
      });
    }

    // Validate applied items if being updated
    if (updateData.appliedLocations && existingTerms.type === "location") {
      const locations = await Location.find({ _id: { $in: updateData.appliedLocations } });
      if (locations.length !== updateData.appliedLocations.length) {
        return res.status(400).json({
          success: false,
          error: "One or more locations not found"
        });
      }
    }

    if (updateData.appliedPoolParties && existingTerms.type === "poolParty") {
      const poolParties = await PoolParty.find({ _id: { $in: updateData.appliedPoolParties } });
      if (poolParties.length !== updateData.appliedPoolParties.length) {
        return res.status(400).json({
          success: false,
          error: "One or more pool parties not found"
        });
      }
    }

    // Update terms
    updateData.updatedBy = req.user?._id;
    const updatedTerms = await TermsAndConditions.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("appliedLocations", "name address.city")
      .populate("appliedPoolParties", "name locationName")
      .populate("updatedBy", "name email");

    res.json({
      success: true,
      message: "Terms and conditions updated successfully",
      data: updatedTerms
    });

  } catch (err) {
    console.error("Update terms error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Delete Terms and Conditions
export const deleteTerms = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedTerms = await TermsAndConditions.findByIdAndDelete(id);

    if (!deletedTerms) {
      return res.status(404).json({
        success: false,
        error: "Terms and conditions not found"
      });
    }

    res.json({
      success: true,
      message: "Terms and conditions deleted successfully"
    });

  } catch (err) {
    console.error("Delete terms error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Get active Terms and Conditions for a specific location or pool party
export const getActiveTermsForItem = async (req, res) => {
  try {
    const { type, itemId } = req.params;

    if (!["location", "poolParty"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid type. Must be 'location' or 'poolParty'"
      });
    }

    // Check if item exists
    if (type === "location") {
      const location = await Location.findById(itemId);
      if (!location) {
        return res.status(404).json({
          success: false,
          error: "Location not found"
        });
      }
    } else {
      const poolParty = await PoolParty.findById(itemId);
      if (!poolParty) {
        return res.status(404).json({
          success: false,
          error: "Pool party not found"
        });
      }
    }

    // Query for terms that apply to this item
   const query = {
  type,
  status: "active",
  effectiveFrom: { $lte: new Date() },
  $and: [
    {
      $or: [
        { applyToAll: true },
        type === "location" 
          ? { appliedLocations: itemId }
          : { appliedPoolParties: itemId }
      ]
    },
    {
      $or: [
        { effectiveUntil: null },
        { effectiveUntil: { $gte: new Date() } }
      ]
    }
  ]
};

    const terms = await TermsAndConditions.find(query)
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .limit(1);

    if (terms.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: "No active terms and conditions found for this item"
      });
    }

    res.json({
      success: true,
      data: terms[0]
    });

  } catch (err) {
    console.error("Get active terms error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Get all available items for applying terms
export const getAvailableItems = async (req, res) => {
  try {
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: "Type parameter is required"
      });
    }

    if (type === "location") {
      const locations = await Location.find({ isActive: true })
        .select("name address.city address.state capacityOfPersons")
        .sort({ name: 1 });

      res.json({
        success: true,
        data: locations
      });
    } else if (type === "poolParty") {
      const poolParties = await PoolParty.find({ isActive: true })
        .select("name locationName type")
        .populate("locationId", "name")
        .sort({ name: 1 });

      res.json({
        success: true,
        data: poolParties
      });
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid type. Must be 'location' or 'poolParty'"
      });
    }

  } catch (err) {
    console.error("Get available items error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Add/Remove items from terms
export const updateAppliedItems = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, itemIds } = req.body; // action: "add" or "remove"

    if (!action || !itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({
        success: false,
        error: "Action and itemIds array are required"
      });
    }

    const terms = await TermsAndConditions.findById(id);
    if (!terms) {
      return res.status(404).json({
        success: false,
        error: "Terms and conditions not found"
      });
    }

    // Determine which field to update based on type
    const field = terms.type === "location" ? "appliedLocations" : "appliedPoolParties";

    // Update based on action
    if (action === "add") {
      // Check if items exist
      const model = terms.type === "location" ? Location : PoolParty;
      const existingItems = await model.find({ _id: { $in: itemIds } });
      
      if (existingItems.length !== itemIds.length) {
        return res.status(400).json({
          success: false,
          error: "One or more items not found"
        });
      }

      // Add items (avoid duplicates)
      terms[field] = [...new Set([...terms[field], ...itemIds])];
    } else if (action === "remove") {
      // Remove items
      terms[field] = terms[field].filter(
        itemId => !itemIds.includes(itemId.toString())
      );
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid action. Must be 'add' or 'remove'"
      });
    }

    terms.updatedBy = req.user?._id;
    await terms.save();

    // Populate and return
    const populatedTerms = await TermsAndConditions.findById(id)
      .populate(field, terms.type === "location" ? "name address.city" : "name locationName");

    res.json({
      success: true,
      message: `Items ${action}ed successfully`,
      data: populatedTerms
    });

  } catch (err) {
    console.error("Update applied items error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// Change Terms status
export const changeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["draft", "active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Valid status is required (draft, active, inactive)"
      });
    }

    const terms = await TermsAndConditions.findByIdAndUpdate(
      id,
      {
        status,
        updatedBy: req.user?._id
      },
      { new: true }
    );

    if (!terms) {
      return res.status(404).json({
        success: false,
        error: "Terms and conditions not found"
      });
    }

    res.json({
      success: true,
      message: `Terms status changed to ${status}`,
      data: terms
    });

  } catch (err) {
    console.error("Change status error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};