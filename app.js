// Import required modules
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs');
const twilio = require('twilio');

// Initialize the app
const app = express();
app.use(bodyParser.json()); // Middleware to parse JSON requests

// Google Sheets Setup
const credentials = JSON.parse(fs.readFileSync('ringed-bond-444113-h5-1e0beb0e9e9e.json')); // Replace with your service account JSON file
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Google Sheets details
const SPREADSHEET_ID = '1ZuZ-xwDs46OquzJtN9985d5Jwdv48FYKmM_9agEfwTs'; // Replace with your Google Sheet ID
const DONOR_SHEET_RANGE = 'Sheet1!A:C'; // Adjust based on your sheet's range

// Twilio Setup
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Serve the frontend HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html')); // Serve index.html file
});

// Route to register donors
app.post('/registerDonor', async (req, res) => {
  const { name, contact, bloodGroup } = req.body;

  try {
    // Add donor data to Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: DONOR_SHEET_RANGE,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[name, contact, bloodGroup]],
      },
    });

    res.json({ message: 'Donor registered successfully!' });
  } catch (error) {
    console.error('Error saving donor to Google Sheets:', error);
    res.status(500).json({ message: 'Failed to register donor.', error: error.message });
  }
});

// Route to post blood requirements and notify donors
app.post('/postRequirement', async (req, res) => {
  const { bloodType, quantity } = req.body;

  try {
    // Fetch donor data from Google Sheets
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: DONOR_SHEET_RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'No donors found.' });
    }

    // Filter donors by the required blood group
    const matchingDonors = rows.slice(1).filter((row) => row[2] === bloodType);

    if (matchingDonors.length === 0) {
      return res.status(404).json({ message: 'No donors found for the specified blood group.' });
    }

    // Send WhatsApp messages to matching donors
    const promises = matchingDonors.map(([name, phoneNumber]) =>
      client.messages.create({
        body: `Urgent Blood Requirement:\nBlood Group: ${bloodType}\nQuantity: ${quantity} units\nPlease contact immediately if you can donate.`,
        from: 'whatsapp:+14155238886', // Twilio Sandbox Number
        to: `whatsapp:${phoneNumber}`,
      })
    );

    await Promise.all(promises);

    res.json({ message: `Notifications sent to ${matchingDonors.length} donors!` });
  } catch (error) {
    console.error('Error posting requirement:', error);
    res.status(500).json({ message: 'Failed to post requirement.', error: error.message });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
