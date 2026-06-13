import nodemailer from "nodemailer";

// Create reusable transporter
const createTransporter = () => {
  // For development: Use Ethereal (fake SMTP that captures emails)
  // For production: Replace with real SMTP credentials (Gmail, SendGrid, etc.)
  if (process.env.NODE_ENV === "production") {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Development: Use Ethereal for testing
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: process.env.ETHEREAL_USER || "cristobal.blick@ethereal.email",
      pass: process.env.ETHEREAL_PASS || "your_ethereal_password"
    }
  });
};

// ✅ Send Welcome Email
export async function sendWelcomeEmail(user) {
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: '"RescueNet" <noreply@rescuenet.com>',
      to: user.email,
      subject: `Welcome to RescueNet, ${user.firstName}! 🐾`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
          <div style="background: linear-gradient(135deg, #0066cc, #0052a3); padding: 30px; border-radius: 15px 15px 0 0; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 32px;">🐾 Welcome to RescueNet!</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 15px 15px;">
            <h2 style="color: #1d1d1f;">Hi ${user.firstName} ${user.lastName},</h2>
            <p style="color: #6e6e73; line-height: 1.6;">Thank you for joining our community as a <strong style="color: #0066cc;">${user.role}</strong>! Together, we're making a difference in the lives of animals in need.</p>
            <div style="background: #f0fdf4; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #34c759;">
              <h3 style="color: #166534; margin-top: 0;">What you can do:</h3>
              <ul style="color: #6e6e73; line-height: 1.8;">
                ${user.role === "REPORTER" ? "<li>Report animals in need of rescue</li><li>Track the status of your reports</li>" : ""}
                ${user.role === "VOLUNTEER" ? "<li>Accept rescue cases</li><li>Update animal status</li><li>Coordinate adoptions</li>" : ""}
                ${user.role === "DONOR" ? "<li>Donate to rescue cases</li><li>Track your impact</li><li>Receive tax receipts</li>" : ""}
                ${user.role === "ADOPTER" ? "<li>Browse animals ready for adoption</li><li>Submit adoption applications</li><li>Give an animal a forever home</li>" : ""}
              </ul>
            </div>
            <p style="color: #6e6e73;">Every action you take brings us closer to a world where no animal is left behind.</p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="http://localhost:5173" style="background: #0066cc; color: white; padding: 12px 30px; border-radius: 25px; text-decoration: none; font-weight: bold; display: inline-block;">Get Started</a>
            </div>
          </div>
          <p style="text-align: center; color: #a1a1a6; font-size: 12px; margin-top: 20px;">RescueNet • Saving lives, one paw at a time 🐾</p>
        </div>
      `
    });
    console.log(`📧 Welcome email sent to ${user.email}: ${nodemailer.getTestMessageUrl(info)}`);
    return info;
  } catch (err) {
    console.error("Failed to send welcome email:", err.message);
  }
}

// ✅ Send Adoption Confirmation Email
export async function sendAdoptionEmail(user, animal) {
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: '"RescueNet" <noreply@rescuenet.com>',
      to: user.email,
      subject: `🎉 Congratulations! ${animal.name || "Your new friend"} is yours!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
          <div style="background: linear-gradient(135deg, #34c759, #28a745); padding: 30px; border-radius: 15px 15px 0 0; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 32px;">🎉 Adoption Approved!</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 15px 15px;">
            <h2 style="color: #1d1d1f;">Dear ${user.firstName},</h2>
            <p style="color: #6e6e73; line-height: 1.6; font-size: 18px;">Congratulations! Your adoption application for <strong style="color: #34c759;">${animal.name || "this adorable animal"}</strong> has been approved!</p>
            <div style="background: #f0fdf4; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
              <p style="font-size: 48px; margin: 0;">🐾❤️🏠</p>
              <p style="color: #166534; font-weight: bold; font-size: 18px;">Welcome to the family!</p>
            </div>
            <h3 style="color: #1d1d1f;">Next Steps:</h3>
            <ol style="color: #6e6e73; line-height: 1.8;">
              <li>Contact the volunteer to arrange the handoff</li>
              <li>Prepare your home for your new family member</li>
              <li>Schedule a vet visit within the first week</li>
              <li>Share your success story with us!</li>
            </ol>
            <p style="color: #6e6e73;">Thank you for giving this animal a second chance at life. You're a hero! 🦸</p>
          </div>
          <p style="text-align: center; color: #a1a1a6; font-size: 12px; margin-top: 20px;">RescueNet • Making happy endings possible 🐾</p>
        </div>
      `
    });
    console.log(`📧 Adoption email sent to ${user.email}: ${nodemailer.getTestMessageUrl(info)}`);
    return info;
  } catch (err) {
    console.error("Failed to send adoption email:", err.message);
  }
}

// ✅ Send Donation Receipt Email
export async function sendDonationReceiptEmail(user, animal, amount) {
  try {
    const transporter = createTransporter();
    const receiptNumber = `RN-${Date.now()}`;
    const info = await transporter.sendMail({
      from: '"RescueNet" <noreply@rescuenet.com>',
      to: user.email,
      subject: `💰 Thank you for your ₹${amount} donation!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
          <div style="background: linear-gradient(135deg, #0066cc, #0052a3); padding: 30px; border-radius: 15px 15px 0 0; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 32px;">💰 Thank You!</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 15px 15px;">
            <h2 style="color: #1d1d1f;">Dear ${user.firstName},</h2>
            <p style="color: #6e6e73; line-height: 1.6;">Your generous donation of <strong style="color: #34c759; font-size: 24px;">₹${amount}</strong> has been received. Thank you for helping animals in need!</p>
            <div style="background: #f5f5f7; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="color: #1d1d1f; margin-top: 0;">Donation Receipt</h3>
              <table style="width: 100%; color: #6e6e73;">
                <tr><td style="padding: 8px 0;"><strong>Receipt #:</strong></td><td style="padding: 8px 0;">${receiptNumber}</td></tr>
                <tr><td style="padding: 8px 0;"><strong>Amount:</strong></td><td style="padding: 8px 0;">₹${amount}</td></tr>
                <tr><td style="padding: 8px 0;"><strong>For:</strong></td><td style="padding: 8px 0;">${animal.name || "Animal Rescue"}</td></tr>
                <tr><td style="padding: 8px 0;"><strong>Date:</strong></td><td style="padding: 8px 0;">${new Date().toLocaleDateString('en-IN')}</td></tr>
                <tr><td style="padding: 8px 0;"><strong>Donor:</strong></td><td style="padding: 8px 0;">${user.firstName} ${user.lastName}</td></tr>
              </table>
            </div>
            <p style="color: #6e6e73; line-height: 1.6;">Your contribution directly helps provide food, medical care, and shelter to animals waiting for rescue. You're making a real difference! 🐾</p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="http://localhost:5173/donor" style="background: #0066cc; color: white; padding: 12px 30px; border-radius: 25px; text-decoration: none; font-weight: bold; display: inline-block;">View My Donations</a>
            </div>
          </div>
          <p style="text-align: center; color: #a1a1a6; font-size: 12px; margin-top: 20px;">RescueNet • Every rupee saves a life 🐾</p>
        </div>
      `
    });
    console.log(`📧 Donation receipt sent to ${user.email}: ${nodemailer.getTestMessageUrl(info)}`);
    return info;
  } catch (err) {
    console.error("Failed to send donation email:", err.message);
  }
}