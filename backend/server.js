import('node-fetch').then(({ default: fetch }) => global.fetch = fetch);
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { parse } = require('csv-parse');

const app = express();
const PORT = 3000;

const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoidGF0aGFnYXRhMzEiLCJhIjoiY203dGZpeG9qMHFhbzJqcjJkdHRydm8xeCJ9.B7l1dHUjVmPieh7VEBSd5w'
// Add JSON parser middleware
app.use(express.json()); // <-- THIS IS CRUCIAL
app.use(cors({ origin: "*" })); // Temporarily allow all origins

// Function to read and parse the Accidents CSV file
function readAccidentsData() {
  return new Promise((resolve, reject) => {
    const accidents = [];
    fs.createReadStream('Accidents Sample.csv')
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (row) => {
        console.log('Parsed row:', row);
        accidents.push({
          latitude: Number(row.Latitude),
          longitude: Number(row.Longitude),
          severity: Number(row['severity']),
          weather: row['Weather Condition'],
          roadSurface: row['Road Surface Condition']
        });
      })
      .on('end', () => {
        console.log('Final accidents data:', accidents);
        resolve(accidents);
      })
      .on('error', (error) => reject(error));
  });
}

// Function to read and parse the Hospitals CSV file
function readHospitalsData() {
  return new Promise((resolve, reject) => {
    const hospitals = [];
    fs.createReadStream('Hospitals.csv')
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (row) => {
        hospitals.push({
          name: row['Hospital Name'],
          latitude: Number(row.Latitude),
          longitude: Number(row.Longitude),
          defaultDistance: Number(row.Distance)
        });
      })
      .on('end', () => {
        console.log('Hospitals data loaded:', hospitals.length, 'records');
        resolve(hospitals);
      })
      .on('error', (error) => reject(error));
  });
}

// Store data globally
let accidents = [];
let hospitals = [];

// Initialize data and start server
Promise.all([readAccidentsData(), readHospitalsData()])
  .then(([accidentsData, hospitalsData]) => {
    accidents = accidentsData;
    hospitals = hospitalsData;

    // Enable CORS for all routes
    app.use(cors({ origin: "http://localhost:3000" }));

    // Serve map.html at the root URL
    const path = require('path');
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'map.html'));
    });

    // API endpoint to fetch accident data
    app.get("/api/accidents", (req, res) => {
      res.json(accidents);
    });

    // Emergency endpoint (now correctly placed)
    app.post('/api/emergency', (req, res) => {
      try {
        const { userLocation, hospital } = req.body;
        
        if (!userLocation || !hospital) {
          return res.status(400).json({ 
            success: false, 
            error: "User location and hospital information are required" 
          });
        }

        // Log the emergency alert details
        console.log('Emergency Alert Details:');
        console.log('User Location:', userLocation);
        console.log('Hospital:', hospital);

        // Send the emergency alert
        sendEmergencyAlert(hospital);
        
        res.status(200).json({ 
          success: true,
          message: `Alert successfully sent to ${hospital.name}`
        });
        
      } catch (error) {
        console.error('Emergency alert error:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message || "Failed to send emergency alert" 
        });
      }
    });

    // Hospitals endpoint
    app.get('/api/hospitals', (req, res) => {
      try {
        const { lat, lng } = req.query;
        
        if (!lat || !lng) {
          return res.status(400).json({ 
            success: false, 
            error: "Latitude and longitude are required" 
          });
        }

        // Calculate distances and filter hospitals within 20km
        const hospitalsWithDistance = hospitals.map(hospital => {
          const distance = calculateDistance(
            parseFloat(lat),
            parseFloat(lng),
            hospital.latitude,
            hospital.longitude
          );
          
          // Calculate distance from accident prone area
          const accidentDistance = calculateDistance(
            hospital.latitude,
            hospital.longitude,
            12.9716, // Bangalore coordinates (example accident prone area)
            77.5946
          );

          return {
            name: hospital.name,
            coordinates: [hospital.longitude, hospital.latitude],
            distance: distance,
            address: `${hospital.name} (${accidentDistance.toFixed(2)}km from accident prone area)`
          };
        })
        .filter(hospital => hospital.distance <= 20) // Only show hospitals within 20km
        .sort((a, b) => a.distance - b.distance); // Sort by distance

        res.json({ 
          success: true,
          hospitals: hospitalsWithDistance,
          userLocation: { lat: parseFloat(lat), lng: parseFloat(lng) }
        });
      } catch (error) {
        console.error('Error fetching hospitals:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message || "Failed to fetch hospitals"
        });
      }
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to load data:', error);
    process.exit(1);
  });

function sendEmergencyAlert(hospital) {
  const timestamp = new Date().toISOString();
  console.log('=== EMERGENCY ALERT ===');
  console.log(`Time: ${timestamp}`);
  console.log(`Hospital Name: ${hospital.name}`);
  console.log(`Location: [${hospital.coordinates.join(', ')}]`);
  console.log(`Distance: ${hospital.distance.toFixed(2)}km`);
  console.log('=====================');
}

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}