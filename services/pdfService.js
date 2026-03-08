// services/pdfService.js
import PDFDocument from 'pdfkit';

// ==============================================================================
// CONFIGURATION & HELPERS
// ==============================================================================

const COLORS = {
  primary: '#008DDA',    // Brand Blue (Matches your Frontend)
  secondary: '#005c8f',  // Darker Blue
  accent: '#F59E0B',     // Gold/Amber for warnings/highlights
  textMain: '#1F2937',   // Dark Gray/Black
  textLight: '#6B7280',  // Medium Gray
  border: '#E5E7EB',     // Light Gray
  bgLight: '#F8FAFC',    // Very Light Gray for table rows
  success: '#10B981',    // Green
  warning: '#F59E0B',    // Orange
  danger: '#EF4444'      // Red
};

const FONTS = {
  bold: 'Helvetica-Bold',
  regular: 'Helvetica',
  italic: 'Helvetica-Oblique'
};

const formatCurrency = (amount) => {
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  })}`;
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  // Map month index to short name
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdayNames[date.getUTCDay()];
  return `${weekday}, ${day} ${monthNames[month]}, ${year}`;
};

const drawLine = (doc, y) => {
  doc.strokeColor(COLORS.border)
     .lineWidth(1)
     .moveTo(50, y)
     .lineTo(550, y)
     .stroke();
};

// Helper to draw striped pricing tables
const drawTableMap = (doc, startY, items) => {
  let currentY = startY;
  const col1X = 50;
  const col2X = 400; // Amount column alignment

  // Header
  doc.rect(50, currentY, 500, 25).fill(COLORS.primary);
  doc.fillColor('#FFFFFF').fontSize(9).font(FONTS.bold);
  doc.text('DESCRIPTION', col1X + 10, currentY + 8);
  doc.text('AMOUNT', col2X, currentY + 8, { align: 'right', width: 140 });
  
  currentY += 25;

  // Rows
  items.forEach((item, index) => {
    if (index % 2 === 0) {
      doc.rect(50, currentY, 500, 20).fill(COLORS.bgLight);
    }
    
    doc.fillColor(COLORS.textMain).fontSize(9).font(item.isBold ? FONTS.bold : FONTS.regular);
    doc.text(item.label, col1X + 10, currentY + 6);
    doc.text(item.value, col2X, currentY + 6, { align: 'right', width: 140 });
    
    currentY += 20;
  });

  // Bottom Border
  doc.moveTo(50, currentY).lineTo(550, currentY).strokeColor(COLORS.primary).lineWidth(1).stroke();

  return currentY;
};

// ==============================================================================
// 1. LOCATION BOOKING PDF GENERATOR
// ==============================================================================

export const generateBookingPDF = (booking, location) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // --- HEADER ---
      // Placeholder for logo if you have one
      // doc.image('public/logo.png', 50, 45, { width: 50 }).catch(() => {}); 
      
      doc.fillColor(COLORS.primary)
         .fontSize(22)
         .font(FONTS.bold)
         .text('REST & RELAX', 50, 50);
         
      doc.fillColor(COLORS.textLight)
         .fontSize(10)
         .font(FONTS.regular)
         .text('Luxury Resort Booking Confirmation', 50, 75);

      // Status Badge (Right aligned)
      const isFullyPaid = booking.remainingAmount <= 0;
      const statusColor = isFullyPaid ? COLORS.success : COLORS.warning;
      const statusText = isFullyPaid ? 'FULLY PAID' : 'PARTIALLY PAID';
      
      doc.roundedRect(430, 50, 120, 25, 4).fill(statusColor);
      doc.fillColor('#FFFFFF').fontSize(10).font(FONTS.bold)
         .text(statusText, 430, 57, { width: 120, align: 'center' });

      doc.fillColor(COLORS.textLight).fontSize(9).font(FONTS.regular)
         .text(`Booking ID: ${booking.id}`, 430, 80, { width: 120, align: 'center' });

      let y = 120;
      drawLine(doc, y);
      y += 20;

      // --- 1. PROPERTY & GUEST DETAILS ---
      const leftColX = 50;
      const rightColX = 300;

      // Left: Property
      doc.fillColor(COLORS.textLight).fontSize(8).font(FONTS.bold).text('PROPERTY DETAILS', leftColX, y);
      y += 15;
      doc.fillColor(COLORS.textMain).fontSize(14).font(FONTS.bold).text(location.name || 'Location Name', leftColX, y);
      y += 20;
      doc.fillColor(COLORS.textLight).fontSize(9).font(FONTS.regular);
      const address = `${location.address?.line1 || ''}, ${location.address?.city || ''}, ${location.address?.state || ''}`;
      doc.text(address, leftColX, y, { width: 230 });

      // Right: Guest (Aligned with Property top)
      y -= 35; 
      doc.fillColor(COLORS.textLight).fontSize(8).font(FONTS.bold).text('GUEST DETAILS', rightColX, y);
      y += 15;
      doc.fillColor(COLORS.textMain).fontSize(12).font(FONTS.bold).text(booking.name, rightColX, y);
      y += 18;
      doc.fillColor(COLORS.textMain).fontSize(10).font(FONTS.regular).text(`Phone: ${booking.phone}`, rightColX, y);
      y += 15;
      if(booking.email) doc.text(`Email: ${booking.email}`, rightColX, y);
      
      y += 40;

      // --- 2. BOOKING SUMMARY GRID ---
      // Box Background
      doc.roundedRect(50, y, 500, 70, 6).fill('#F0F9FF').stroke(COLORS.primary);
      
      const colWidth = 125;
      let gridY = y + 15;

      // Col 1: Check-in
      doc.fillColor(COLORS.secondary).fontSize(8).font(FONTS.bold).text('CHECK-IN', 65, gridY);
      doc.fillColor(COLORS.textMain).fontSize(10).font(FONTS.bold).text(formatDate(booking.checkInDate), 65, gridY + 12);
      doc.fillColor(COLORS.textLight).fontSize(9).font(FONTS.regular).text(booking.checkInTime || '10:00 AM', 65, gridY + 25);

      // Col 2: Check-out
      doc.fillColor(COLORS.secondary).fontSize(8).font(FONTS.bold).text('CHECK-OUT', 65 + colWidth, gridY);
      doc.fillColor(COLORS.textMain).fontSize(10).font(FONTS.bold).text(formatDate(booking.checkOutDate), 65 + colWidth, gridY + 12);
      const checkoutTime = booking.sameDayCheckout ? '10:00 PM' : '10:00 AM';
      doc.fillColor(COLORS.textLight).fontSize(9).font(FONTS.regular).text(checkoutTime, 65 + colWidth, gridY + 25);

      // Col 3: Guests
      doc.fillColor(COLORS.secondary).fontSize(8).font(FONTS.bold).text('GUESTS', 65 + (colWidth * 2), gridY);
      doc.fillColor(COLORS.textMain).fontSize(10).font(FONTS.regular).text(`${booking.adults} Adults`, 65 + (colWidth * 2), gridY + 12);
      if (booking.kids > 0) {
        doc.text(`${booking.kids} Kids`, 65 + (colWidth * 2), gridY + 25);
      }

      // Col 4: Type
const durationLabel = booking.sameDayCheckout ? 'Day Picnic' : 'Night Stay';
let durationVal = '';
if (booking.sameDayCheckout) {
  durationVal = '1 Day';
} else {
  const nights = booking.pricing?.nights || 0;
  const days = booking.pricing?.days || 0;
  durationVal = `${nights} Night${nights !== 1 ? 's' : ''} / ${days} Day${days !== 1 ? 's' : ''}`;
}

doc.fillColor(COLORS.secondary).fontSize(8).font(FONTS.bold).text('TYPE', 65 + (colWidth * 3), gridY);
doc.fillColor(COLORS.primary).fontSize(10).font(FONTS.bold).text(durationLabel, 65 + (colWidth * 3), gridY + 12);
doc.fillColor(COLORS.textMain).fontSize(9).font(FONTS.regular).text(durationVal, 65 + (colWidth * 3), gridY + 25);

      y += 90;

      // --- 3. FOOD PACKAGE DETAILS ---
      if (booking.withFood) {
        doc.fillColor(COLORS.textMain).fontSize(12).font(FONTS.bold).text('Food Package Details', 50, y);
        y += 20;
        
        // Logic to display daily breakdown or single package
        let foodDesc = '';
        if (booking.dailyFoodPackages && booking.dailyFoodPackages.length > 0) {
           booking.dailyFoodPackages.forEach(daily => {
             foodDesc += `• ${formatDate(daily.date)}: ${daily.name}\n`;
           });
        } else if (booking.foodPackage) {
           foodDesc = `Package: ${booking.foodPackage.name}\nDescription: ${booking.foodPackage.description || 'Standard Menu'}`;
        } else if (booking.pricing.selectedFoodPackage) {
           foodDesc = `Package: ${booking.pricing.selectedFoodPackage.name}`;
        }

        // Food Box
        const boxHeight = booking.dailyFoodPackages?.length > 0 ? 30 + (booking.dailyFoodPackages.length * 15) : 50;
        doc.roundedRect(50, y, 500, boxHeight, 4).fill(COLORS.bgLight).stroke(COLORS.border);
        
        doc.fillColor(COLORS.textMain).fontSize(10).font(FONTS.regular)
           .text(foodDesc, 60, y + 10, { width: 480, lineGap: 5 });
        
        y += boxHeight + 20;
      }

      // --- 4. FINANCIAL BREAKDOWN ---
doc.fillColor(COLORS.textMain).fontSize(12).font(FONTS.bold).text('Payment Breakdown', 50, y);
y += 15;

const AmountPaid = booking?.amountPaid || 0;
const RemainingAmount = booking?.remainingAmount || 0;
const totalPrice = AmountPaid + RemainingAmount;
const calfoodPrice = booking.pricing?.foodPackagePrice || 0;
const AccomodationPrice = totalPrice - calfoodPrice; 

const pricingItems = [
  { 
    label: booking.sameDayCheckout ? 'Day Picnic Venue Charges' : 'Accommodation Charges', 
    value: formatCurrency(AccomodationPrice) 
  }
];

if (booking.pricing?.foodPackagePrice > 0) {
  pricingItems.push({ 
    label: 'Food Package Charges', 
    value: formatCurrency(booking.pricing.foodPackagePrice) 
  });
}

// Total Line (use totalPrice from booking)
pricingItems.push({ 
  label: 'Total Booking Amount', 
  value: formatCurrency(totalPrice), 
  isBold: true 
});

// Paid Line
const paymentLabel = booking.paymentType === 'token' ? 'Amount Paid (Token)' : 'Amount Paid (Full)';
pricingItems.push({ 
  label: paymentLabel, 
  value: `-${formatCurrency(booking.amountPaid || 0)}`, 
  isBold: false 
});

y = drawTableMap(doc, y, pricingItems);

      // --- 5. BALANCE DUE BOX ---
      if (booking.remainingAmount > 0) {
        y += 20;
        doc.roundedRect(250, y, 300, 40, 4).fill('#FFFBEB').stroke(COLORS.warning);
        
        doc.fillColor(COLORS.warning).fontSize(10).font(FONTS.bold).text('BALANCE DUE AT PROPERTY', 270, y + 15);
        doc.fillColor(COLORS.textMain).fontSize(14).font(FONTS.bold).text(formatCurrency(booking.remainingAmount), 250, y + 13, { align: 'right', width: 280 });
      }

      // --- 6. FOOTER & T&C ---
      const footerY = 720;
      doc.moveTo(50, footerY).lineTo(550, footerY).strokeColor(COLORS.border).stroke();
      
      doc.fontSize(8).fillColor(COLORS.textLight).font(FONTS.regular);
      doc.text('Terms & Conditions:', 50, footerY + 10);
      doc.text('1. Token amount is non-refundable.', 50, footerY + 22);
      doc.text('2. Please carry a valid Govt ID proof during check-in.', 50, footerY + 34);
      doc.text('3. Remaining balance must be cleared upon arrival via Cash or UPI.', 50, footerY + 46);

      doc.fontSize(8).fillColor(COLORS.primary).text('Generated by Rest & Relax', 50, footerY + 65, { align: 'center', width: 500 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// ==============================================================================
// 2. POOL PARTY BOOKING PDF GENERATOR
// ==============================================================================

export const generatePoolPartyBookingPDF = (booking, poolParty) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // --- HEADER ---
      doc.fillColor(COLORS.primary).fontSize(22).font(FONTS.bold).text('REST & RELAX', 50, 50);
      doc.fillColor(COLORS.secondary).fontSize(10).font(FONTS.bold).text('OFFICIAL EVENT PASS', 50, 75);

      // Status Badge
      const isPaid = booking.remainingAmount <= 0;
      doc.roundedRect(430, 50, 120, 25, 4).fill(isPaid ? COLORS.success : COLORS.warning);
      doc.fillColor('#FFFFFF').fontSize(10).font(FONTS.bold)
         .text(isPaid ? 'CONFIRMED' : 'PARTIAL PAID', 430, 57, { width: 120, align: 'center' });
      
      doc.fillColor(COLORS.textLight).fontSize(9).font(FONTS.regular)
         .text(`Pass ID: ${booking.id}`, 430, 80, { width: 120, align: 'center' });

      let y = 120;
      drawLine(doc, y);
      y += 20;

      // --- 1. EVENT DETAILS (Center Stage) ---
      doc.fillColor(COLORS.textMain).fontSize(16).font(FONTS.bold).text('POOL PARTY ACCESS', 50, y, { align: 'center' });
      y += 25;
      
      doc.fillColor(COLORS.textMain).fontSize(12).font(FONTS.bold).text(poolParty.locationName || 'Pool Venue', 50, y, { align: 'center' });
      y += 20;

      // Info Grid for Event
      const gridY = y;
      doc.roundedRect(100, gridY, 400, 60, 4).fill(COLORS.bgLight).stroke(COLORS.border);
      
      // Date
      doc.fillColor(COLORS.textLight).fontSize(9).font(FONTS.bold).text('DATE', 120, gridY + 15);
      doc.fillColor(COLORS.textMain).fontSize(11).font(FONTS.bold).text(formatDate(booking.bookingDate), 120, gridY + 30);
      
      // Session
      doc.fillColor(COLORS.textLight).fontSize(9).font(FONTS.bold).text('SESSION', 270, gridY + 15);
      doc.fillColor(COLORS.textMain).fontSize(11).font(FONTS.bold).text(booking.session, 270, gridY + 30);
      
      // Time
      const sessionInfo = poolParty.timings?.find(t => t.session === booking.session);
      const timeString = sessionInfo ? `${sessionInfo.startTime} - ${sessionInfo.endTime}` : 'TBD';
      doc.fillColor(COLORS.textLight).fontSize(9).font(FONTS.bold).text('TIMING', 400, gridY + 15);
      doc.fillColor(COLORS.textMain).fontSize(11).font(FONTS.bold).text(timeString, 400, gridY + 30);

      y += 90;

      // --- 2. GUEST & TICKET INFO ---
      doc.fillColor(COLORS.textMain).fontSize(12).font(FONTS.bold).text('Guest Information', 50, y);
      y += 15;
      
      // Name & Contact
      doc.fillColor(COLORS.textMain).fontSize(11).font(FONTS.regular).text(`Name: ${booking.guestName}`, 50, y);
      doc.text(`Contact: ${booking.phone}`, 300, y);
      y += 20;
      if(booking.email) doc.text(`Email: ${booking.email}`, 50, y);
      
      y += 30;

      // --- 3. TICKET BREAKDOWN (Blue Box) ---
      doc.roundedRect(50, y, 500, 60, 4).fill('#EFF6FF').stroke(COLORS.primary);
      
      // Guests
      doc.fillColor(COLORS.primary).fontSize(9).font(FONTS.bold).text('ADMIT', 70, y + 15);
      doc.fillColor(COLORS.textMain).fontSize(12).text(`${booking.adults} Adults, ${booking.kids} Kids`, 70, y + 30);
      
      // Food
      doc.fillColor(COLORS.primary).fontSize(9).font(FONTS.bold).text('MEAL PLAN', 300, y + 15);
      const foodText = booking.withFood && booking.foodPackage 
        ? (booking.foodPackage.name || 'Selected Package')
        : 'Entry Only (No Food)';
      doc.fillColor(COLORS.textMain).fontSize(12).text(foodText, 300, y + 30);

      y += 80;

      // --- 4. FINANCIAL SUMMARY ---
      doc.fillColor(COLORS.textMain).fontSize(12).font(FONTS.bold).text('Payment Summary', 50, y);
      y += 15;

      // Calculate logic based on provided schema
      const foodPrice = booking.pricing?.foodPackagePrice || 0;
      const totalAmount = booking.pricing?.totalPrice || 0;
      const entryPrice = totalAmount - foodPrice;

      const pricingItems = [
        { label: 'Pool Entry Charges', value: formatCurrency(entryPrice) }
      ];

      if (foodPrice > 0) {
        pricingItems.push({ label: 'Food Package Charges', value: formatCurrency(foodPrice) });
      }

      pricingItems.push({ label: 'Total Amount', value: formatCurrency(totalAmount), isBold: true });
      pricingItems.push({ label: 'Amount Paid', value: `-${formatCurrency(booking.amountPaid)}` });

      y = drawTableMap(doc, y, pricingItems);

      // Balance Due Highlight
      if (booking.remainingAmount > 0) {
        y += 20;
        doc.roundedRect(250, y, 300, 40, 4).fill('#FFFBEB').stroke(COLORS.warning);
        doc.fillColor(COLORS.warning).fontSize(10).font(FONTS.bold).text('REMAINING BALANCE', 270, y + 15);
        doc.fillColor(COLORS.textMain).fontSize(14).font(FONTS.bold).text(formatCurrency(booking.remainingAmount), 250, y + 13, { align: 'right', width: 280 });
      }

      // --- 5. IMPORTANT NOTES ---
      y += 60;
      doc.fillColor(COLORS.danger).fontSize(10).font(FONTS.bold).text('IMPORTANT RULES:', 50, y);
      y += 15;
      
      const notes = [
        '• Arrival: Please arrive 15 minutes before your session starts.',
        '• Safety: Children must be accompanied by adults at all times in the pool.',
        '• Attire: Proper nylon/synthetic swimwear is mandatory.',
        '• Prohibited: Outside food and drinks are strictly not allowed.'
      ];
      
      notes.forEach(note => {
        doc.fillColor(COLORS.textMain).fontSize(9).font(FONTS.regular).text(note, 50, y);
        y += 14;
      });

      // --- 6. FOOTER ---
      const footerY = 720;
      doc.moveTo(50, footerY).lineTo(550, footerY).strokeColor(COLORS.border).stroke();
      doc.fillColor(COLORS.primary).fontSize(8).text('Generated by Rest & Relax', 50, footerY + 15, { align: 'center', width: 500 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};