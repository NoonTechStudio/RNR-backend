import nodemailer from 'nodemailer';

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Helper: format date with weekday, day month year (UTC to prevent timezone date shift)
const formatLongDate = (date) => {
  return new Date(date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC', // FIX: prevents date shifting due to local timezone offset
  });
};

// Helper: format currency with two decimal places
const formatCurrency = (amount) => {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

// Helper: get checkout time based on same-day flag
const getCheckoutTime = (booking) => {
  return booking.sameDayCheckout ? '10:00 PM' : '10:00 AM';
};

// Helper: build food description (single package or daily list)
const buildFoodDescription = (booking) => {
  if (!booking.withFood) return null;
  let html = '';
  if (booking.dailyFoodPackages && booking.dailyFoodPackages.length > 0) {
    html += '<ul style="margin:5px 0 0 20px; color:#6b7280;">';
    booking.dailyFoodPackages.forEach(daily => {
      html += `<li>${formatLongDate(daily.date)}: ${daily.name} (₹${daily.pricePerAdult}/adult, ₹${daily.pricePerKid}/kid)</li>`;
    });
    html += '</ul>';
  } else if (booking.foodPackage) {
    html = `<p style="margin:5px 0 0 0; color:#6b7280;">Package: ${booking.foodPackage.name} – ₹${booking.foodPackage.pricePerAdult}/adult, ₹${booking.foodPackage.pricePerKid}/kid</p>`;
  } else if (booking.pricing?.selectedFoodPackage) {
    html = `<p style="margin:5px 0 0 0; color:#6b7280;">Package: ${booking.pricing.selectedFoodPackage.name}</p>`;
  }
  return html;
};

// ==================== REGULAR BOOKING – USER EMAIL ====================
export const sendBookingConfirmationEmail = async (booking, location, pdfBuffer, userEmail) => {
  try {
    const transporter = createTransporter();

    const isTokenPayment = booking.paymentType === 'token';
    const paymentStatusText = isTokenPayment ? 'Partially Paid (Token)' : 'Fully Paid';
    const nights = booking.pricing?.nights || 0;
    const days = booking.pricing?.days || 0;

    // FIX: Compute totalPrice from actual payment fields (same logic as PDF)
    const amountPaid = booking.amountPaid || 0;
    const remainingAmount = booking.remainingAmount || 0;
    const totalPrice = amountPaid + remainingAmount;
    const foodPrice = booking.pricing?.foodPackagePrice || 0;
    const accommodationPrice = totalPrice - foodPrice;

    const mailOptions = {
      from: `"Rest & Relax" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: `🎉 Booking Confirmed - ${location.name} | Rest & Relax`,
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Confirmation - Rest & Relax</title>
    <style>
        body { margin:0; padding:0; font-family:'Segoe UI',Arial,sans-serif; background:#f8fafc; }
        .container { max-width:600px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.1); }
        .header { background:linear-gradient(135deg,#2E8B57 0%,#3CB371 100%); padding:40px 30px; text-align:center; color:white; }
        .content { padding:40px 30px; }
        .overview { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:25px; margin-bottom:25px; }
        .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
        .card { background:white; border:1px solid #e5e7eb; border-radius:10px; padding:30px; margin-bottom:25px; box-shadow:0 2px 4px rgba(0,0,0,0.05); }
        .card h3 { color:#1f2937; margin:0 0 20px 0; font-size:20px; border-bottom:2px solid #2E8B57; padding-bottom:10px; }
        .label { color:#374151; font-weight:600; display:block; margin-bottom:5px; }
        .value { color:#6b7280; }
        .payment-grid { display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px; }
        .token-note { background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:20px; margin-top:15px; }
        .footer { background:#1f2937; color:white; padding:30px; text-align:center; }
        hr { border:0; border-top:1px solid #e5e7eb; margin:20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin:0; font-size:36px;">Rest & Relax</h1>
            <p style="margin:8px 0 0 0; opacity:0.9;">Luxury Resort & Spa</p>
            <div style="margin-top:25px; padding:15px; background:rgba(255,255,255,0.15); border-radius:8px; display:inline-block;">
                <h2 style="margin:0; font-size:24px;">Booking Confirmed! 🎉</h2>
            </div>
        </div>
        <div class="content">
            <!-- Booking Overview -->
            <div class="overview">
                <div class="grid-2">
                    <div>
                        <strong style="color:#166534;">Booking ID</strong><br>
                        <span style="color:#4b5563; font-family:monospace;">#${booking._id}</span>
                    </div>
                    <div>
                        <strong style="color:#166534;">Resort</strong><br>
                        <span style="color:#4b5563;">${location.name}</span>
                    </div>
                </div>
            </div>

            <!-- Booking Details -->
            <div class="card">
                <h3>📅 Booking Details</h3>
                <div class="grid-2">
                    <div>
                        <span class="label">Check-in</span>
                        <span class="value">${formatLongDate(booking.checkInDate)}<br>${booking.checkInTime || '10:00 AM'}</span>
                    </div>
                    <div>
                        <span class="label">Check-out</span>
                        <span class="value">${formatLongDate(booking.checkOutDate)}<br>${getCheckoutTime(booking)}</span>
                    </div>
                </div>
                <div class="grid-2" style="margin-top:15px;">
                    <div>
                        <span class="label">Booking Type</span>
                        <span class="value">${booking.sameDayCheckout ? 'Day Picnic' : 'Night Stay'}</span>
                    </div>
                    <div>
                        <span class="label">Duration</span>
                        <span class="value">${booking.sameDayCheckout ? '1 Day' : `${nights} Night${nights!==1?'s':''} / ${days} Day${days!==1?'s':''}`}</span>
                    </div>
                </div>
                <div style="margin-top:15px;">
                    <span class="label">Guests</span>
                    <span class="value">${booking.adults} Adult${booking.adults!==1?'s':''}${booking.kids ? `, ${booking.kids} Kid${booking.kids!==1?'s':''}` : ''}</span>
                </div>
                <div style="margin-top:15px;">
                    <span class="label">Food Service</span>
                    <span style="color:${booking.withFood?'#059669':'#6b7280'}; font-weight:500;">
                        ${booking.withFood ? '✅ Included' : '❌ Not Included'}
                    </span>
                    ${booking.withFood ? buildFoodDescription(booking) : ''}
                </div>
            </div>

            <!-- Payment Summary -->
            <div class="card">
                <h3>💰 Payment Summary</h3>
                <div class="payment-grid">
                    <div><span class="label">Accommodation:</span></div>
                    <div style="text-align:right; color:#1f2937;">${formatCurrency(accommodationPrice)}</div>

                    ${foodPrice > 0 ? `
                    <div><span class="label">Food Package:</span></div>
                    <div style="text-align:right; color:#1f2937;">${formatCurrency(foodPrice)}</div>
                    ` : ''}

                    <div><span class="label">Total Amount:</span></div>
                    <div style="text-align:right; font-weight:600; color:#1f2937;">${formatCurrency(totalPrice)}</div>

                    <div><span class="label">Amount Paid:</span></div>
                    <div style="text-align:right; color:#059669; font-weight:700;">${formatCurrency(amountPaid)}</div>

                    <div><span class="label">Remaining Amount:</span></div>
                    <div style="text-align:right; font-weight:600; color:${remainingAmount>0?'#D97706':'#059669'};">${formatCurrency(remainingAmount)}</div>

                    <div><span class="label">Payment Type:</span></div>
                    <div style="text-align:right; color:#6b7280;">${isTokenPayment ? 'Token Payment' : 'Full Payment'}</div>
                </div>

                ${isTokenPayment && remainingAmount > 0 ? `
                <div class="token-note">
                    <div style="display:flex; gap:12px;">
                        <div style="font-size:20px;">📝</div>
                        <div>
                            <h4 style="margin:0 0 8px 0; color:#92400e;">Important Note for Token Payment</h4>
                            <p style="margin:0; color:#92400e;">Please pay the remaining amount of <strong>${formatCurrency(remainingAmount)}</strong> at the property during check-in.</p>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- Important Information -->
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:25px; text-align:center;">
                <h4 style="margin:0 0 15px 0; color:#2E8B57;">📍 Important Information</h4>
                <p style="margin:0; color:#6b7280;">Please carry a valid government ID proof for verification at check-in.</p>
                <p style="margin:15px 0 0 0; color:#6b7280;"><strong>Resort Address:</strong> ${location.address.line1}, ${location.address.city}, ${location.address.state} - ${location.address.pincode}</p>
            </div>
        </div>

        <div class="footer">
            <h3 style="margin:0 0 15px 0; color:#2E8B57;">Rest & Relax</h3>
            <p style="margin:0 0 10px 0; color:#d1d5db;">Luxury Resort Experience</p>
            <p style="margin:0 0 15px 0; color:#9ca3af;">
                📍 ${location.address.line1}, ${location.address.city}<br>
                📞 +91 90990 48961 | ✉️ info@restandrelax.in
            </p>
            <p style="margin:0; color:#6b7280; font-size:12px;">
                Thank you for choosing Rest & Relax. We look forward to serving you!<br>
                <em>This is an automated email. Please do not reply.</em>
            </p>
        </div>
    </div>
</body>
</html>
      `,
      attachments: [
        {
          filename: `booking-confirmation-${booking._id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Confirmation email sent to user:', userEmail);
  } catch (error) {
    console.error('❌ User email failed:', error);
    throw error;
  }
};

// ==================== REGULAR BOOKING – ADMIN NOTIFICATION ====================
export const sendAdminNotification = async (booking, location) => {
  try {
    const transporter = createTransporter();

    const isTokenPayment = booking.paymentType === 'token';
    const nights = booking.pricing?.nights || 0;
    const days = booking.pricing?.days || 0;

    // FIX: Compute totalPrice from actual payment fields (same logic as PDF)
    const amountPaid = booking.amountPaid || 0;
    const remainingAmount = booking.remainingAmount || 0;
    const totalPrice = amountPaid + remainingAmount;
    const foodPrice = booking.pricing?.foodPackagePrice || 0;
    const accommodationPrice = totalPrice - foodPrice;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `📅 New Booking - ${location.name} | Rest & Relax`,
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Booking - Rest & Relax</title>
    <style>
        body { margin:0; padding:0; font-family:'Segoe UI',Arial,sans-serif; background:#f8fafc; }
        .container { max-width:600px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.1); }
        .header { background:linear-gradient(135deg,#2E8B57 0%,#3CB371 100%); padding:30px; text-align:center; color:white; }
        .content { padding:30px; }
        .card { background:white; border:1px solid #e5e7eb; border-radius:10px; padding:25px; margin-bottom:20px; }
        .card h3 { color:#1f2937; margin:0 0 15px 0; font-size:18px; border-bottom:2px solid #2E8B57; padding-bottom:8px; }
        table { width:100%; border-collapse:collapse; }
        td { padding:8px 0; border-bottom:1px solid #e5e7eb; }
        .label { color:#374151; font-weight:600; }
        .value { color:#6b7280; }
        .amount { font-weight:600; color:#1f2937; }
        .paid { color:#059669; font-weight:700; }
        .remaining { color:${remainingAmount>0?'#D97706':'#059669'}; font-weight:600; }
        .footer { background:#1f2937; color:white; padding:20px; text-align:center; font-size:12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin:0; font-size:24px;">Rest & Relax - New Booking</h2>
            <p style="margin:8px 0 0 0; opacity:0.9;">New booking received at ${location.name}</p>
        </div>
        <div class="content">
            <div class="card">
                <h3>📋 Booking Details</h3>
                <table>
                    <tr><td class="label">Booking ID</td><td class="value">${booking._id}</td></tr>
                    <tr><td class="label">Guest Name</td><td class="value">${booking.name}</td></tr>
                    <tr><td class="label">Phone</td><td class="value">${booking.phone}</td></tr>
                    <tr><td class="label">Email</td><td class="value">${booking.email || 'N/A'}</td></tr>
                    <tr><td class="label">Address</td><td class="value">${booking.address || 'N/A'}</td></tr>
                    <tr><td class="label">Resort</td><td class="value">${location.name}</td></tr>
                    <tr><td class="label">Check-in</td><td class="value">${formatLongDate(booking.checkInDate)} at ${booking.checkInTime || '10:00 AM'}</td></tr>
                    <tr><td class="label">Check-out</td><td class="value">${formatLongDate(booking.checkOutDate)} at ${getCheckoutTime(booking)}</td></tr>
                    <tr><td class="label">Booking Type</td><td class="value">${booking.sameDayCheckout ? 'Day Picnic' : 'Night Stay'}</td></tr>
                    <tr><td class="label">Duration</td><td class="value">${booking.sameDayCheckout ? '1 Day' : `${nights} nights / ${days} days`}</td></tr>
                    <tr><td class="label">Guests</td><td class="value">${booking.adults} Adults, ${booking.kids} Kids</td></tr>
                    <tr><td class="label">Food Service</td><td class="value" style="color:${booking.withFood?'#059669':'#6b7280'};">${booking.withFood ? '✅ Included' : '❌ Not Included'}</td></tr>
                </table>
                ${booking.withFood ? `
                <div style="margin-top:15px; background:#f0fdf4; padding:15px; border-radius:8px;">
                    <strong style="color:#166534;">Food Details</strong>
                    ${buildFoodDescription(booking)}
                </div>
                ` : ''}
            </div>

            <div class="card">
                <h3>💰 Payment Summary</h3>
                <table>
                    <tr><td class="label">Accommodation</td><td class="amount" style="text-align:right;">${formatCurrency(accommodationPrice)}</td></tr>
                    ${foodPrice > 0 ? `<tr><td class="label">Food Package</td><td class="amount" style="text-align:right;">${formatCurrency(foodPrice)}</td></tr>` : ''}
                    <tr><td class="label">Total Amount</td><td class="amount" style="text-align:right;">${formatCurrency(totalPrice)}</td></tr>
                    <tr><td class="label">Amount Paid</td><td class="paid" style="text-align:right;">${formatCurrency(amountPaid)}</td></tr>
                    <tr><td class="label">Remaining</td><td class="remaining" style="text-align:right;">${formatCurrency(remainingAmount)}</td></tr>
                    <tr><td class="label">Payment Type</td><td style="text-align:right; color:#6b7280;">${isTokenPayment ? 'Token Payment' : 'Full Payment'}</td></tr>
                </table>
                ${isTokenPayment && remainingAmount > 0 ? `
                <div style="background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:15px; margin-top:20px;">
                    <p style="margin:0; color:#92400e;"><strong>⚠️ Token Payment:</strong> Remaining ${formatCurrency(remainingAmount)} to be collected at check-in.</p>
                </div>
                ` : ''}
            </div>

            <p style="color:#6b7280; text-align:center; font-size:14px;">
                This is an automated notification from Rest & Relax booking system.
            </p>
        </div>
        <div class="footer">
            <p style="margin:0; color:#9ca3af;">Rest & Relax · Luxury Resort</p>
        </div>
    </div>
</body>
</html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Admin notification sent');
  } catch (error) {
    console.error('❌ Admin email failed:', error);
  }
};

// ==================== POOL PARTY – USER EMAIL ====================
export const sendPoolPartyConfirmationEmail = async (booking, poolParty, pdfBuffer, userEmail) => {
  try {
    const transporter = createTransporter();

    const sessionTiming = poolParty.timings?.find(t => t.session === booking.session);
    const timeRange = sessionTiming ? `${sessionTiming.startTime} - ${sessionTiming.endTime}` : '';

    // FIX: Compute totalPrice from actual payment fields (same logic as PDF)
    const amountPaid = booking.amountPaid || 0;
    const remainingAmount = booking.remainingAmount || 0;
    const totalPrice = amountPaid + remainingAmount;
    const foodPrice = booking.pricing?.foodPackagePrice || 0;
    const entryPrice = totalPrice - foodPrice;

    const statusDisplay = {
      paid: '✅ Fully Paid',
      partially_paid: '⚠️ Partially Paid',
      pending: '⏳ Pending'
    }[booking.paymentStatus] || booking.paymentStatus;

    const mailOptions = {
      from: `"Rest & Relax" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: `🎉 Pool Party Booking Confirmed - ${poolParty.locationName} | Rest & Relax`,
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pool Party Booking Confirmation - Rest & Relax</title>
    <style>
        body { margin:0; padding:0; font-family:'Segoe UI',Arial,sans-serif; background:#f8fafc; }
        .container { max-width:600px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.1); }
        .header { background:linear-gradient(135deg,#2E8B57 0%,#3CB371 100%); padding:40px 30px; text-align:center; color:white; }
        .content { padding:40px 30px; }
        .overview { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:25px; margin-bottom:25px; }
        .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
        .card { background:white; border:1px solid #e5e7eb; border-radius:10px; padding:30px; margin-bottom:25px; box-shadow:0 2px 4px rgba(0,0,0,0.05); }
        .card h3 { color:#1f2937; margin:0 0 20px 0; font-size:20px; border-bottom:2px solid #2E8B57; padding-bottom:10px; }
        .label { color:#374151; font-weight:600; display:block; margin-bottom:5px; }
        .value { color:#6b7280; }
        .payment-grid { display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px; }
        .token-note { background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:20px; margin-top:15px; }
        .footer { background:#1f2937; color:white; padding:30px; text-align:center; }
        hr { border:0; border-top:1px solid #e5e7eb; margin:20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin:0; font-size:36px;">Rest & Relax</h1>
            <p style="margin:8px 0 0 0; opacity:0.9;">Pool Party Booking</p>
            <div style="margin-top:25px; padding:15px; background:rgba(255,255,255,0.15); border-radius:8px; display:inline-block;">
                <h2 style="margin:0; font-size:24px;">Pool Party Booked! 🎉</h2>
            </div>
        </div>
        <div class="content">
            <div class="overview">
                <div class="grid-2">
                    <div>
                        <strong style="color:#166534;">Booking ID</strong><br>
                        <span style="color:#4b5563; font-family:monospace;">#${booking._id}</span>
                    </div>
                    <div>
                        <strong style="color:#166534;">Location</strong><br>
                        <span style="color:#4b5563;">${poolParty.locationName}</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h3>📅 Event Details</h3>
                <div class="grid-2">
                    <div>
                        <span class="label">Date</span>
                        <span class="value">${formatLongDate(booking.bookingDate)}</span>
                    </div>
                    <div>
                        <span class="label">Session</span>
                        <span class="value">${booking.session}</span>
                    </div>
                </div>
                <div class="grid-2" style="margin-top:15px;">
                    <div>
                        <span class="label">Time</span>
                        <span class="value">${timeRange}</span>
                    </div>
                    <div>
                        <span class="label">Guests</span>
                        <span class="value">${booking.adults} Adults, ${booking.kids} Kids</span>
                    </div>
                </div>
                ${booking.withFood && booking.foodPackage ? `
                <div style="margin-top:15px;">
                    <span class="label">Food Package</span>
                    <span class="value">${booking.foodPackage.name} (₹${booking.foodPackage.pricePerAdult}/adult, ₹${booking.foodPackage.pricePerKid}/kid)</span>
                </div>
                ` : ''}
            </div>

            <div class="card">
                <h3>💰 Payment Summary</h3>
                <div class="payment-grid">
                    <div><span class="label">Entry Fee:</span></div>
                    <div style="text-align:right; color:#1f2937;">${formatCurrency(entryPrice)}</div>

                    ${foodPrice > 0 ? `
                    <div><span class="label">Food Package:</span></div>
                    <div style="text-align:right; color:#1f2937;">${formatCurrency(foodPrice)}</div>
                    ` : ''}

                    <div><span class="label">Total Amount:</span></div>
                    <div style="text-align:right; font-weight:600; color:#1f2937;">${formatCurrency(totalPrice)}</div>

                    <div><span class="label">Amount Paid:</span></div>
                    <div style="text-align:right; color:#059669; font-weight:700;">${formatCurrency(amountPaid)}</div>

                    <div><span class="label">Payment Status:</span></div>
                    <div style="text-align:right; font-weight:600; color:${remainingAmount>0?'#D97706':'#059669'};">${statusDisplay}</div>

                    <div><span class="label">Payment Type:</span></div>
                    <div style="text-align:right; color:#6b7280;">${booking.paymentType === 'full' ? 'Full Payment' : 'Token Payment'}</div>
                </div>

                ${booking.paymentType === 'token' && remainingAmount > 0 ? `
                <div class="token-note">
                    <p style="margin:0; color:#92400e;"><strong>📝 Token Payment:</strong> Remaining amount of ${formatCurrency(remainingAmount)} to be paid at the venue.</p>
                </div>
                ` : ''}
            </div>

            <div style="background:#fef3c7; border:1px solid #fcd34d; border-radius:10px; padding:25px;">
                <h4 style="margin:0 0 15px 0; color:#92400e;">📝 Important Information</h4>
                <ul style="margin:0; padding-left:20px; color:#92400e;">
                    <li>Please arrive 15 minutes before your session starts.</li>
                    <li>Children must be accompanied by adults at all times.</li>
                    <li>Outside food and drinks are not allowed.</li>
                    <li>Carry valid ID proof for verification.</li>
                </ul>
            </div>
        </div>

        <div class="footer">
            <h3 style="margin:0 0 15px 0; color:#2E8B57;">Rest & Relax</h3>
            <p style="margin:0 0 10px 0; color:#d1d5db;">Luxury Resort & Pool Party Experience</p>
            <p style="margin:0 0 15px 0; color:#9ca3af;">
                📞 +91 90990 48961 | ✉️ info@restandrelax.in
            </p>
            <p style="margin:0; color:#6b7280; font-size:12px;">
                Thank you for choosing Rest & Relax.<br>
                <em>This is an automated email. Please do not reply.</em>
            </p>
        </div>
    </div>
</body>
</html>
      `,
      attachments: [
        {
          filename: `poolparty-booking-${booking._id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Pool party confirmation email sent to:', userEmail);
  } catch (error) {
    console.error('❌ Pool party email failed:', error);
    throw error;
  }
};

// ==================== POOL PARTY – ADMIN NOTIFICATION ====================
export const sendAdminPoolPartyConfirmation = async (booking, poolParty, adminEmail) => {
  try {
    const transporter = createTransporter();

    const sessionTiming = poolParty.timings?.find(t => t.session === booking.session);
    const timeRange = sessionTiming ? `${sessionTiming.startTime} - ${sessionTiming.endTime}` : '';

    // FIX: Compute totalPrice from actual payment fields (same logic as PDF)
    const amountPaid = booking.amountPaid || 0;
    const remainingAmount = booking.remainingAmount || 0;
    const totalPrice = amountPaid + remainingAmount;
    const foodPrice = booking.pricing?.foodPackagePrice || 0;
    const entryPrice = totalPrice - foodPrice;

    const statusDisplay = {
      paid: '✅ Fully Paid',
      partially_paid: '⚠️ Partially Paid',
      pending: '⏳ Pending'
    }[booking.paymentStatus] || booking.paymentStatus;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminEmail || process.env.ADMIN_EMAIL,
      subject: `🎉 New Pool Party Booking - ${poolParty.locationName} | Rest & Relax`,
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Pool Party Booking - Rest & Relax</title>
    <style>
        body { margin:0; padding:0; font-family:'Segoe UI',Arial,sans-serif; background:#f8fafc; }
        .container { max-width:600px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.1); }
        .header { background:linear-gradient(135deg,#2E8B57 0%,#3CB371 100%); padding:30px; text-align:center; color:white; }
        .content { padding:30px; }
        .card { background:white; border:1px solid #e5e7eb; border-radius:10px; padding:25px; margin-bottom:20px; }
        .card h3 { color:#1f2937; margin:0 0 15px 0; font-size:18px; border-bottom:2px solid #2E8B57; padding-bottom:8px; }
        table { width:100%; border-collapse:collapse; }
        td { padding:8px 0; border-bottom:1px solid #e5e7eb; }
        .label { color:#374151; font-weight:600; }
        .value { color:#6b7280; }
        .amount { font-weight:600; color:#1f2937; }
        .paid { color:#059669; font-weight:700; }
        .remaining { color:${remainingAmount>0?'#D97706':'#059669'}; font-weight:600; }
        .alert { background:#fffbeb; border:2px solid #f59e0b; border-radius:10px; padding:15px; margin-bottom:20px; display:flex; align-items:center; gap:15px; }
        .footer { background:#1f2937; color:white; padding:20px; text-align:center; font-size:12px; }
        .quick-actions { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:20px; text-align:center; }
        .btn { display:inline-block; background:#3b82f6; color:white; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:500; margin:0 5px; }
        .btn-email { background:#10b981; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin:0; font-size:24px;">Rest & Relax - New Pool Party Booking</h2>
            <p style="margin:8px 0 0 0; opacity:0.9;">New booking at ${poolParty.locationName}</p>
        </div>
        <div class="content">
            <div class="alert">
                <div style="font-size:28px; color:#d97706;">⚠️</div>
                <div>
                    <h4 style="margin:0 0 5px 0; color:#92400e;">Action Required</h4>
                    <p style="margin:0; color:#92400e;">Prepare for guests.</p>
                </div>
            </div>

            <div class="card">
                <h3>📋 Guest Details</h3>
                <table>
                    <tr><td class="label">Booking ID</td><td class="value">${booking._id}</td></tr>
                    <tr><td class="label">Name</td><td class="value">${booking.guestName}</td></tr>
                    <tr><td class="label">Phone</td><td class="value">${booking.phone}</td></tr>
                    <tr><td class="label">Email</td><td class="value">${booking.email}</td></tr>
                    <tr><td class="label">Address</td><td class="value">${booking.address || 'N/A'}</td></tr>
                </table>
            </div>

            <div class="card">
                <h3>📅 Event Details</h3>
                <table>
                    <tr><td class="label">Location</td><td class="value">${poolParty.locationName}</td></tr>
                    <tr><td class="label">Date</td><td class="value">${formatLongDate(booking.bookingDate)}</td></tr>
                    <tr><td class="label">Session</td><td class="value">${booking.session}</td></tr>
                    <tr><td class="label">Time</td><td class="value">${timeRange}</td></tr>
                    <tr><td class="label">Guests</td><td class="value">${booking.adults} Adults, ${booking.kids} Kids</td></tr>
                </table>
                ${booking.withFood && booking.foodPackage ? `
                <div style="margin-top:15px; background:#f0fdf4; padding:15px; border-radius:8px;">
                    <strong style="color:#166534;">Food Package:</strong> ${booking.foodPackage.name}<br>
                    <span style="color:#6b7280;">₹${booking.foodPackage.pricePerAdult}/adult, ₹${booking.foodPackage.pricePerKid}/kid</span>
                </div>
                ` : ''}
            </div>

            <div class="card">
                <h3>💰 Payment Summary</h3>
                <table>
                    <tr><td class="label">Entry Fee</td><td class="amount" style="text-align:right;">${formatCurrency(entryPrice)}</td></tr>
                    ${foodPrice > 0 ? `<tr><td class="label">Food Package</td><td class="amount" style="text-align:right;">${formatCurrency(foodPrice)}</td></tr>` : ''}
                    <tr><td class="label">Total Amount</td><td class="amount" style="text-align:right;">${formatCurrency(totalPrice)}</td></tr>
                    <tr><td class="label">Amount Paid</td><td class="paid" style="text-align:right;">${formatCurrency(amountPaid)}</td></tr>
                    <tr><td class="label">Remaining</td><td class="remaining" style="text-align:right;">${formatCurrency(remainingAmount)}</td></tr>
                    <tr><td class="label">Payment Status</td><td style="text-align:right; color:#6b7280;">${statusDisplay}</td></tr>
                    <tr><td class="label">Payment Type</td><td style="text-align:right; color:#6b7280;">${booking.paymentType === 'full' ? 'Full Payment' : 'Token Payment'}</td></tr>
                </table>
                ${booking.paymentType === 'token' && remainingAmount > 0 ? `
                <div style="background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:15px; margin-top:20px;">
                    <p style="margin:0; color:#92400e;"><strong>⚠️ Token Payment:</strong> Remaining ${formatCurrency(remainingAmount)} to be collected.</p>
                </div>
                ` : ''}
            </div>

            <div class="quick-actions">
                <h4 style="margin:0 0 15px 0; color:#2E8B57;">Quick Actions</h4>
                <p style="margin:0 0 15px 0; color:#6b7280;">Booking ID: <code style="background:#e5e7eb; padding:2px 6px; border-radius:4px;">${booking._id}</code></p>
                <a href="tel:${booking.phone}" class="btn">📞 Call Guest</a>
                <a href="mailto:${booking.email}" class="btn btn-email">✉️ Email Guest</a>
            </div>

            <p style="color:#6b7280; text-align:center; font-size:14px; margin-top:20px;">
                This is an automated notification from Rest & Relax.
            </p>
        </div>
        <div class="footer">
            <p style="margin:0; color:#9ca3af;">Rest & Relax · Pool Party Management</p>
        </div>
    </div>
</body>
</html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Pool party admin notification sent');
    return true;
  } catch (error) {
    console.error('❌ Pool party admin email failed:', error);
    return false;
  }
};