import { sendContactInquiryEmail } from "../services/emailService.js";

// Handle Contact Us inquiry form submission
export const handleContactInquiry = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "Name, email, and message are required fields."
      });
    }

    // Send email notifications
    await sendContactInquiryEmail({ name, email, phone, subject, message });

    return res.status(200).json({
      success: true,
      message: "Inquiry received successfully! Our team will contact you shortly."
    });
  } catch (error) {
    console.error("Error handling contact inquiry:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to submit inquiry. Please try again later."
    });
  }
};
