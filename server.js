require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
// const twilio = require('twilio'); // Uncomment if using Twilio

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 10
});

// Email Sending Function
async function sendEmailNotification(recipient, subject, body) {
    try {
        const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: recipient,
            subject: subject,
            html: body
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

// SMS Sending Function (Placeholder - requires Twilio or another SMS service)
async function sendSmsNotification(recipient, body) {
    console.log(`Sending SMS to: ${recipient}\nBody: ${body}`);
    // Example using Twilio (uncomment and configure):
    // try {
    //     const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    //     const message = await client.messages.create({
    //         body: body,
    //         to: recipient,
    //         from: process.env.TWILIO_PHONE_NUMBER
    //     });
    //     console.log('SMS sent:', message.sid);
    // } catch (error) {
    //     console.error('Error sending SMS:', error);
    // }
}


// Serve the nurse submission form
app.get('/nurse', (req, res) => {
    res.sendFile(path.join(__dirname, 'nurse.html'));
});

// Serve the nurse submission form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the driver dashboard
app.get('/driver', (req, res) => {
    res.sendFile(path.join(__dirname, 'driver_dashboard.html'));
});


// API endpoint for nurses to submit a ride request
app.post('/api/requests', (req, res) => {
    const { patient_name, patient_phone, pickup_hospital, dropoff_hospital, pickup_datetime } = req.body;
    const dropoff_datetime = req.body.dropoff_datetime || null;

    pool.query('INSERT INTO requests (patient_name, patient_phone, pickup_hospital, dropoff_hospital, pickup_datetime, dropoff_datetime) VALUES (?, ?, ?, ?, ?, ?)',
        [patient_name, patient_phone, pickup_hospital, dropoff_hospital, pickup_datetime, dropoff_datetime],
        (error, results) => {
            if (error) {
                console.error('Error creating request:', error);
                return res.status(500).json({ error: 'Failed to create request' });
            }
            const requestId = results.insertId;
            sendEmailNotification(
                'subrock@gmail.com', // Replace with actual nurse email retrieval logic
                `New Ride Request Submitted (ID: ${requestId})`,
                `A new ride request has been submitted for patient ${patient_name} from ${pickup_hospital} to ${dropoff_hospital} at ${pickup_datetime}. Request ID: ${requestId}.`
            );
            sendSmsNotification(
                '1234567890', // Replace with actual nurse phone retrieval logic
                `New ride request submitted (ID: ${requestId}).`
            );
            res.status(201).json({ message: 'Ride request submitted successfully', requestId: requestId });
        }
    );
});

// API endpoint for drivers to get pending ride requests
app.get('/api/requests/pending', (req, res) => {
    pool.query('SELECT * FROM requests WHERE status = ?', ['pending'], (error, results) => {
        if (error) {
            console.error('Error fetching pending requests:', error);
            return res.status(500).json({ error: 'Failed to fetch pending requests' });
        }
        res.json(results);
    });
});

// API endpoint for drivers to claim a ride request
app.post('/api/requests/:id/claim', (req, res) => {
    const requestId = req.params.id;
    const driverId = 1; // Replace with actual driver identification

    pool.query('UPDATE requests SET status = ?, driver_id = ? WHERE id = ? AND status = ?',
        ['claimed', driverId, requestId, 'pending'],
        (error, results) => {
            if (error) {
                console.error('Error claiming request:', error);
                return res.status(500).json({ error: 'Failed to claim request' });
            }
            if (results.affectedRows === 0) {
                return res.status(404).json({ error: 'Request not found or already claimed' });
            }
            pool.query('SELECT * FROM requests WHERE id = ?', [requestId], (err, requestDetails) => {
                if (err || requestDetails.length === 0) {
                    return console.error('Error fetching request details for notification:', err);
                }
                const request = requestDetails[0];
                sendEmailNotification(
                    'subrock@gmail.com', // Replace with actual driver email retrieval
                    `Ride Request Claimed (ID: ${requestId})`,
                    `You have claimed ride request ID: ${requestId} for patient ${request.patient_name} from ${request.pickup_hospital} to ${request.dropoff_hospital} at ${request.pickup_datetime}.`
                );
                sendSmsNotification(
                    '9876543210', // Replace with actual driver phone retrieval
                    `Ride request (ID: ${requestId}) claimed.`
                );
                sendEmailNotification(
                    'subrock@gmail.com', // Replace with actual nurse email retrieval
                    `Ride Request Claimed (ID: ${requestId})`,
                    `Ride request ID: ${requestId} for patient ${request.patient_name} has been claimed by a driver.`
                );
                sendSmsNotification(
                    '1234567890', // Replace with actual nurse phone retrieval
                    `Ride request (ID: ${requestId}) claimed.`
                );
                res.json({ message: 'Ride request claimed successfully' });
            });
        }
    );
});

// API endpoint for nurses to view claimed rides for the day
app.get('/api/requests/nurse-view', (req, res) => {
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Start and end dates are required.' });
    }

    pool.query('SELECT id, patient_name, pickup_datetime, dropoff_datetime, status FROM requests WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC',
        [startDate, endDate],
        (error, results) => {
            if (error) {
                console.error('Error fetching nurse view requests:', error);
                return res.status(500).json({ error: 'Failed to fetch ride status.' });
            }
            res.json(results);
        }
    );
});

// API endpoint for ride completion confirmation link using request ID
app.get('/api/requests/:id/complete', (req, res) => {
    const requestId = req.params.id;
    pool.query('UPDATE requests SET status = ?, dropoff_datetime = NOW() WHERE id = ? AND status = ?',
        ['completed', parseInt(requestId), 'claimed'],
        (error, results) => {
            if (error) {
                console.error('Error completing request:', error);
                return res.status(500).send('Failed to complete request.');
            }
            if (results.affectedRows === 0) {
                return res.status(404).send('Invalid request ID or ride not claimed.');
            }
            pool.query('SELECT * FROM requests WHERE id = ?', [requestId], (err, requestDetails) => {
                if (err || requestDetails.length === 0) {
                    return console.error('Error fetching request details for completion notification:', err);
                }
                const request = requestDetails[0];
                sendEmailNotification(
                    'subrock@gmail.com',
                    `Ride Request Completed (ID: ${request.id})`,
                    `Ride request ID: ${request.id} for patient ${request.patient_name} from ${request.pickup_hospital} to ${request.dropoff_hospital} is now complete.`
                );
                sendSmsNotification(
                    '1234567890',
                    `Ride request (ID: ${request.id}) completed.`
                );
                res.send('Ride completed successfully!');
            });
        }
    );
});

// Modified API endpoint for ride completion confirmation link using request ID
app.get('/api/requests/:id/complete', (req, res) => {
    const requestId = req.params.id;
    pool.query('UPDATE requests SET status = ?, dropoff_datetime = NOW() WHERE id = ? AND status = ?',
        ['completed', requestId, 'claimed'], // <--- Potential issue here
        (error, results) => {
            if (error) {
                console.error('Error completing request:', error);
                return res.status(500).send('Failed to complete request.');
            }
            if (results.affectedRows === 0) {
                return res.status(404).send('Invalid request ID or ride not claimed.');
            }
            pool.query('SELECT * FROM requests WHERE id = ?', [requestId], (err, requestDetails) => {
                if (err || requestDetails.length === 0) {
                    return console.error('Error fetching request details for completion notification:', err);
                }
                const request = requestDetails[0];
                sendEmailNotification(
                    'nurse@example.com',
                    `Ride Request Completed (ID: ${request.id})`,
                    `Ride request ID: ${request.id} for patient ${request.patient_name} from ${request.pickup_hospital} to ${request.dropoff_hospital} is now complete.`
                );
                sendSmsNotification(
                    '1234567890',
                    `Ride request (ID: ${request.id}) completed.`
                );
                res.send('Ride completed successfully!');
            });
        }
    );
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});


